from __future__ import annotations

import csv
import io
import json
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from random import choice, randint, random

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import FAKE_TRANSACTION_PATH, MODEL_THRESHOLD
from .database import Base, engine, get_db
from .ml_pipeline import load_model_and_preprocessor, model_predict_probability, train_model
from .models import PredictionRecord, User
from .schemas import (
    AnalyticsResponse,
    AuthResponse,
    CsvPredictionResponse,
    CsvPredictionRow,
    HistoryItem,
    HistoryResponse,
    LoginRequest,
    MetricsResponse,
    PaymentSimulationRequest,
    PredictionInput,
    PredictionResponse,
    ProfileResponse,
    SignupRequest,
    ThresholdTuneResponse,
)
from .security import create_access_token, decode_access_token, hash_password, verify_password

app = FastAPI(title="Fraud Dashboard API", version="1.0.0")
security = HTTPBearer(auto_error=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r".*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)
MODEL, PREPROCESSOR, METRICS = load_model_and_preprocessor()
CURRENT_THRESHOLD = float(METRICS.get("threshold", MODEL_THRESHOLD))
DOWNLOAD_CACHE: dict[str, str] = {}
MAX_CSV_ROWS = 5000
SIM_ROWS: list[dict[str, str]] = []
SIM_CURSOR = 0
TX_PROFILES: dict[str, dict] = {}
TX_PREFIX_NUMBERS: dict[str, set[int]] = {}


def load_simulation_rows() -> list[dict[str, str]]:
    if not FAKE_TRANSACTION_PATH.exists():
        return []
    with FAKE_TRANSACTION_PATH.open("r", encoding="utf-8") as fp:
        reader = csv.DictReader(fp)
        return [row for row in reader if row]


SIM_ROWS = load_simulation_rows()


def build_transaction_profiles(rows: list[dict[str, str]]) -> tuple[dict[str, dict], dict[str, set[int]]]:
    aggregates: dict[str, dict] = {}
    prefix_numbers: dict[str, set[int]] = {}

    for row in rows:
        tx_id = str(row.get("transaction_id", "")).strip()
        if not tx_id:
            continue

        amount = parse_csv_amount(row.get("amount"))
        hour = parse_csv_time(row.get("time"))
        location = str(row.get("location", "Unknown")).strip().lower()
        device = str(row.get("device_type", row.get("device", "Unknown"))).strip().lower()

        agg = aggregates.setdefault(
            tx_id,
            {
                "amounts": [],
                "hours": [],
                "locations": set(),
                "devices": set(),
            },
        )
        agg["amounts"].append(amount)
        agg["hours"].append(hour)
        agg["locations"].add(location)
        agg["devices"].add(device)

        match = re.match(r"^([A-Za-z]+)(\d+)$", tx_id)
        if match:
            prefix, number = match.groups()
            prefix_numbers.setdefault(prefix, set()).add(int(number))

    profiles: dict[str, dict] = {}
    for tx_id, agg in aggregates.items():
        amounts = agg["amounts"]
        hours = agg["hours"]
        profiles[tx_id] = {
            "min_amount": min(amounts),
            "max_amount": max(amounts),
            "avg_hour": sum(hours) / max(1, len(hours)),
            "locations": agg["locations"],
            "devices": agg["devices"],
        }

    return profiles, prefix_numbers


def parse_csv_time(value: str | None) -> float:
    if value is None:
        return 0.0
    raw = str(value).strip()
    if not raw:
        return 0.0

    try:
        numeric = float(raw)
        if 0 <= numeric <= 23:
            return numeric
        if 23 < numeric <= 86400:
            return numeric / 3600.0
    except ValueError:
        pass

    # Common datetime/time formats from exported transaction logs.
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M",
        "%H:%M:%S",
        "%H:%M",
    ]
    for fmt in formats:
        try:
            parsed = datetime.strptime(raw, fmt)
            return float(parsed.hour + (parsed.minute / 60.0) + (parsed.second / 3600.0))
        except ValueError:
            continue

    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return float(parsed.hour + (parsed.minute / 60.0) + (parsed.second / 3600.0))
    except ValueError as err:
        raise ValueError(f"Unsupported time format: {raw}") from err


def parse_csv_amount(value: str | None) -> float:
    if value is None:
        return 0.0
    cleaned = str(value).strip().replace(",", "")
    cleaned = re.sub(r"^(rs\.?|inr|usd)\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace("$", "").replace("₹", "")
    return float(cleaned)


def parse_csv_bool(value: str | None) -> bool:
    return str(value or "false").strip().lower() in {"1", "true", "yes", "y"}


def get_csv_value(row: dict[str, str], aliases: list[str], default: str = "") -> str:
    for alias in aliases:
        if alias in row:
            value = row.get(alias)
            return "" if value is None else str(value)
    return default


TX_PROFILES, TX_PREFIX_NUMBERS = build_transaction_profiles(SIM_ROWS)


class ConnectionManager:
    def __init__(self):
        self.connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast_json(self, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws in self.connections:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_email = decode_access_token(credentials.credentials)
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    user_email = decode_access_token(credentials.credentials)
    if not user_email:
        return None
    return db.query(User).filter(User.email == user_email).first()


def calculate_transaction_identity_risk(payload: PredictionInput) -> tuple[float, list[str]]:
    score = 0.0
    reasons: list[str] = []

    tx_id = (payload.transaction_id or payload.receiver or "").strip()
    if not tx_id:
        return score, reasons

    profile = TX_PROFILES.get(tx_id)
    if not profile:
        score += 0.45
        reasons.append("unknown transaction id")

        match = re.match(r"^([A-Za-z]+)(\d+)$", tx_id)
        if match:
            prefix, number = match.groups()
            number_value = int(number)
            for known in TX_PREFIX_NUMBERS.get(prefix, set()):
                if abs(known - number_value) in {1, 2}:
                    score += 0.12
                    reasons.append("transaction id appears tampered (+/-1 or +/-2)")
                    break
        return min(score, 0.65), reasons

    if payload.amount < profile["min_amount"] * 0.5 or payload.amount > profile["max_amount"] * 1.5:
        score += 0.2
        reasons.append("amount deviates from known transaction id pattern")

    if payload.location.strip().lower() not in profile["locations"]:
        score += 0.15
        reasons.append("location mismatch for transaction id")

    if payload.device.strip().lower() not in profile["devices"]:
        score += 0.1
        reasons.append("device mismatch for transaction id")

    if abs(payload.time - profile["avg_hour"]) > 8:
        score += 0.1
        reasons.append("time mismatch for transaction id")

    return min(score, 0.45), reasons


def calculate_rule_score(db: Session, user_id: int | None, payload: PredictionInput) -> tuple[float, list[str]]:
    score = 0.0
    reasons: list[str] = []

    if payload.international:
        score += 0.08
        reasons.append("international transaction")

    if user_id is not None:
        now = datetime.utcnow()
        last_minute = now - timedelta(minutes=1)
        recent_count = (
            db.query(func.count(PredictionRecord.id))
            .filter(PredictionRecord.user_id == user_id)
            .filter(PredictionRecord.created_at >= last_minute)
            .scalar()
            or 0
        )
        if recent_count >= 3:
            score += 0.2
            reasons.append("high transaction velocity")

        last_tx = (
            db.query(PredictionRecord)
            .filter(PredictionRecord.user_id == user_id)
            .order_by(PredictionRecord.created_at.desc())
            .first()
        )
        if last_tx and last_tx.location and payload.location and last_tx.location != payload.location:
            if (now - last_tx.created_at).total_seconds() <= 600:
                score += 0.2
                reasons.append("rapid location change")

    tx_score, tx_reasons = calculate_transaction_identity_risk(payload)
    score += tx_score
    reasons.extend(tx_reasons)

    return min(score, 0.8), reasons


async def persist_prediction(db: Session, user: User | None, payload: PredictionInput, model_score: float, rule_score: float) -> PredictionRecord:
    probability = min(1.0, max(0.0, 0.8 * model_score + rule_score))
    is_fraud = probability >= CURRENT_THRESHOLD

    row = PredictionRecord(
        user_id=user.id if user else None,
        tx_id=f"TX-{uuid.uuid4().hex[:8].upper()}",
        receiver=payload.transaction_id or payload.receiver,
        merchant=payload.merchant,
        device=payload.device,
        location=payload.location,
        amount=payload.amount,
        time=payload.time,
        international=payload.international,
        probability=probability,
        is_fraud=is_fraud,
        model_score=model_score,
        rule_score=rule_score,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    if row.is_fraud:
        await manager.broadcast_json(
            {
                "type": "fraud_alert",
                "tx_id": row.tx_id,
                "amount": row.amount,
                "merchant": row.merchant,
                "probability": row.probability,
                "created_at": row.created_at.isoformat(),
            }
        )

    return row


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "model_loaded": True}


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(data: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()

    token = create_access_token(subject=data.email)
    return AuthResponse(access_token=token)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(subject=user.email)
    return AuthResponse(access_token=token)


@app.get("/api/profile", response_model=ProfileResponse)
def profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ProfileResponse:
    total = db.query(func.count(PredictionRecord.id)).filter(PredictionRecord.user_id == user.id).scalar() or 0
    fraud = (
        db.query(func.count(PredictionRecord.id))
        .filter(PredictionRecord.user_id == user.id)
        .filter(PredictionRecord.is_fraud.is_(True))
        .scalar()
        or 0
    )
    return ProfileResponse(name=user.name, email=user.email, total_predictions=total, fraud_detections=fraud)


@app.post("/api/train", response_model=MetricsResponse)
def trigger_training(force: bool = Query(default=False)) -> MetricsResponse:
    global MODEL, PREPROCESSOR, METRICS, CURRENT_THRESHOLD
    METRICS = train_model(force_retrain=force)
    MODEL, PREPROCESSOR, _ = load_model_and_preprocessor()
    CURRENT_THRESHOLD = float(METRICS.get("threshold", MODEL_THRESHOLD))
    return MetricsResponse(**METRICS)


@app.get("/api/metrics", response_model=MetricsResponse)
def get_metrics() -> MetricsResponse:
    return MetricsResponse(**METRICS)


@app.post("/api/threshold", response_model=ThresholdTuneResponse)
def set_threshold(value: float = Query(..., ge=0.05, le=0.95)) -> ThresholdTuneResponse:
    global CURRENT_THRESHOLD, METRICS
    CURRENT_THRESHOLD = float(round(value, 4))
    METRICS["threshold"] = CURRENT_THRESHOLD
    from .config import METRICS_PATH

    with METRICS_PATH.open("w", encoding="utf-8") as fp:
        json.dump(METRICS, fp, indent=2)

    return ThresholdTuneResponse(threshold=CURRENT_THRESHOLD, message="Threshold updated")


@app.post("/api/predict", response_model=PredictionResponse)
async def predict_one(
    payload: PredictionInput,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> PredictionResponse:
    model_score = model_predict_probability(
        model=MODEL,
        preprocessor=PREPROCESSOR,
        amount=payload.amount,
        time_hour=payload.time,
        location=payload.location,
        device=payload.device,
        merchant=payload.merchant,
        international=payload.international,
    )
    rule_score, risk_reasons = calculate_rule_score(db, user.id if user else None, payload)
    saved = await persist_prediction(db, user, payload, model_score, rule_score)

    return PredictionResponse(
        tx_id=saved.tx_id,
        amount=saved.amount,
        merchant=saved.merchant,
        location=saved.location,
        label="Fraud" if saved.is_fraud else "Legit",
        probability=saved.probability,
        confidence=max(saved.probability, 1.0 - saved.probability),
        model_score=saved.model_score,
        rule_score=saved.rule_score,
        risk_reasons=risk_reasons,
    )


@app.post("/api/predict/payment", response_model=PredictionResponse)
async def payment_simulation(
    payload: PaymentSimulationRequest,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> PredictionResponse:
    prediction_payload = PredictionInput(
        transaction_id="",
        receiver=payload.receiver,
        amount=payload.amount,
        time=float(datetime.now().hour),
        location=payload.location,
        device=payload.device,
        merchant=payload.merchant,
        international=payload.international,
    )
    return await predict_one(prediction_payload, db, user)


@app.post("/api/predict/csv", response_model=CsvPredictionResponse)
async def predict_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> CsvPredictionResponse:
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file")

    text = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV appears empty or has no header row")

    normalized_headers = {str(c).strip().lower() for c in (reader.fieldnames or []) if c is not None}
    required_aliases = {
        "transaction_id": ["transaction_id", "tx_id", "transactionid", "txn_id"],
        "amount": ["amount", "amt", "transaction_amount"],
        "time": ["time", "timestamp", "transaction_time", "datetime"],
        "location": ["location", "city"],
        "device": ["device", "device_type", "channel"],
        "merchant": ["merchant", "merchant_name"],
        "international": ["international", "is_international", "international_txn"],
    }
    missing_required = [
        field
        for field, aliases in required_aliases.items()
        if not any(alias in normalized_headers for alias in aliases)
    ]
    if missing_required:
        raise HTTPException(
            status_code=400,
            detail=(
                "CSV missing required columns. Required logical fields: "
                "transaction_id, amount, time, location, device, merchant, international. "
                f"Missing: {', '.join(missing_required)}"
            ),
        )

    rows: list[CsvPredictionRow] = []
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["row_id", "amount", "time", "location", "device", "merchant", "international", "probability", "label"])

    index = 0
    invalid_rows = 0
    processed_rows = 0
    invalid_reasons: list[str] = []
    for raw in reader:
        index += 1
        lower = {str(k).strip().lower(): v for k, v in raw.items() if k is not None}

        try:
            payload = PredictionInput(
                transaction_id=get_csv_value(lower, required_aliases["transaction_id"]).strip(),
                amount=parse_csv_amount(get_csv_value(lower, required_aliases["amount"])),
                time=parse_csv_time(get_csv_value(lower, required_aliases["time"])),
                location=get_csv_value(lower, required_aliases["location"], default="Unknown").strip(),
                device=get_csv_value(lower, required_aliases["device"], default="Unknown").strip(),
                merchant=get_csv_value(lower, required_aliases["merchant"], default="Unknown").strip(),
                international=parse_csv_bool(get_csv_value(lower, required_aliases["international"])),
            )
        except (ValueError, TypeError) as err:
            invalid_rows += 1
            if len(invalid_reasons) < 5:
                invalid_reasons.append(f"row {index}: {str(err)}")
            continue

        model_score = model_predict_probability(
            model=MODEL,
            preprocessor=PREPROCESSOR,
            amount=payload.amount,
            time_hour=payload.time,
            location=payload.location,
            device=payload.device,
            merchant=payload.merchant,
            international=payload.international,
        )
        identity_rule_score, _ = calculate_transaction_identity_risk(payload)
        # Lightweight rule influence for bulk mode without expensive per-row DB history writes.
        base_rule_score = 0.08 if payload.international else 0.0
        rule_score = min(0.8, base_rule_score + identity_rule_score)
        probability = min(1.0, max(0.0, 0.8 * model_score + rule_score))
        label = "Fraud" if probability >= CURRENT_THRESHOLD else "Legit"

        row = CsvPredictionRow(
            row_id=index,
            amount=payload.amount,
            time=payload.time,
            location=payload.location,
            device=payload.device,
            merchant=payload.merchant,
            international=payload.international,
            probability=probability,
            label=label,
        )
        rows.append(row)
        processed_rows += 1
        writer.writerow(
            [
                row.row_id,
                row.amount,
                row.time,
                row.location,
                row.device,
                row.merchant,
                row.international,
                round(row.probability, 6),
                row.label,
            ]
        )

        if processed_rows >= MAX_CSV_ROWS:
            break

    token = secrets.token_hex(12)
    DOWNLOAD_CACHE[token] = output.getvalue()

    if not rows:
        reason_text = ""
        if invalid_reasons:
            reason_text = " Sample validation errors: " + " | ".join(invalid_reasons)
        raise HTTPException(
            status_code=400,
            detail=(
                "No valid rows found in CSV. "
                "Ensure transaction_id, amount, time, location, device, merchant, international are present and formatted correctly. "
                f"Invalid rows: {invalid_rows}.{reason_text}"
            ),
        )

    fraud_count = sum(1 for row in rows if row.label == "Fraud")
    return CsvPredictionResponse(
        total=len(rows),
        fraud_count=fraud_count,
        legit_count=len(rows) - fraud_count,
        rows=rows,
        download_token=token,
    )


@app.get("/api/predict/csv/download/{token}")
def download_csv(token: str) -> PlainTextResponse:
    csv_text = DOWNLOAD_CACHE.get(token)
    if not csv_text:
        raise HTTPException(status_code=404, detail="Download token expired or invalid")
    return PlainTextResponse(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=prediction-results.csv"},
    )


@app.get("/api/history", response_model=HistoryResponse)
def history(
    q: str = Query(default=""),
    status: str = Query(default="all"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HistoryResponse:
    query = db.query(PredictionRecord).filter(PredictionRecord.user_id == user.id)

    if q:
        like = f"%{q}%"
        query = query.filter(
            (PredictionRecord.tx_id.ilike(like))
            | (PredictionRecord.merchant.ilike(like))
            | (PredictionRecord.receiver.ilike(like))
            | (PredictionRecord.location.ilike(like))
        )
    if status == "fraud":
        query = query.filter(PredictionRecord.is_fraud.is_(True))
    elif status == "legit":
        query = query.filter(PredictionRecord.is_fraud.is_(False))

    rows = query.order_by(PredictionRecord.created_at.desc()).limit(300).all()
    return HistoryResponse(
        rows=[
            HistoryItem(
                id=row.id,
                tx_id=row.tx_id,
                receiver=row.receiver,
                merchant=row.merchant,
                location=row.location,
                device=row.device,
                amount=row.amount,
                time=row.time,
                international=row.international,
                probability=row.probability,
                is_fraud=row.is_fraud,
                created_at=row.created_at,
            )
            for row in rows
        ],
        total=len(rows),
    )


@app.get("/api/analytics", response_model=AnalyticsResponse)
def analytics(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> AnalyticsResponse:
    rows = db.query(PredictionRecord).filter(PredictionRecord.user_id == user.id).all()
    total = len(rows)
    fraud = sum(1 for row in rows if row.is_fraud)

    day_buckets: dict[str, dict] = {}
    for row in rows:
        key = row.created_at.strftime("%Y-%m-%d")
        bucket = day_buckets.setdefault(key, {"day": key, "fraud": 0, "legit": 0})
        if row.is_fraud:
            bucket["fraud"] += 1
        else:
            bucket["legit"] += 1

    by_day = sorted(day_buckets.values(), key=lambda item: item["day"])[-14:]

    return AnalyticsResponse(
        total_transactions=total,
        fraud_count=fraud,
        legit_count=total - fraud,
        fraud_share=(fraud / total) if total else 0.0,
        by_day=by_day,
    )


@app.get("/api/simulation/next", response_model=PredictionResponse)
async def simulation_next(
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> PredictionResponse:
    global SIM_CURSOR
    if SIM_ROWS:
        row = SIM_ROWS[SIM_CURSOR % len(SIM_ROWS)]
        SIM_CURSOR += 1

        payload = PredictionInput(
            transaction_id=str(row.get("transaction_id", "")).strip(),
            receiver=str(row.get("transaction_id", f"User {randint(100, 999)}")),
            amount=parse_csv_amount(row.get("amount")),
            time=parse_csv_time(row.get("time")),
            merchant=str(row.get("merchant", "Unknown")),
            location=str(row.get("location", "Unknown")),
            device=str(row.get("device_type", row.get("device", "Unknown"))),
            international=parse_csv_bool(row.get("is_international", row.get("international"))),
        )
    else:
        merchants = ["MetroPay", "BlueCart", "NovaFuel", "UrbanMarket", "TravelLite"]
        locations = ["Mumbai", "Delhi", "Bengaluru", "Pune", "Chennai", "Dubai"]
        devices = ["Mobile", "Desktop", "POS", "Tablet"]

        payload = PredictionInput(
            receiver=f"User {randint(100, 999)}",
            amount=float(randint(40, 4200)),
            time=float(datetime.now().hour),
            merchant=choice(merchants),
            location=choice(locations),
            device=choice(devices),
            international=random() > 0.82,
        )
    return await predict_one(payload, db, user)


@app.websocket("/ws/alerts")
async def websocket_alerts(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
