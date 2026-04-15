from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from .config import ARTIFACT_DIR, DATASET_PATH, METRICS_PATH, MODEL_PATH, PREPROCESSOR_PATH

V_FEATURES = [f"V{i}" for i in range(1, 29)]
MODEL_FEATURES = ["Time", *V_FEATURES, "Amount"]


class FraudANN(nn.Module):
    def __init__(self, input_dim: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


@dataclass
class FraudPreprocessor:
    scaler: StandardScaler

    def transform_df(self, df: pd.DataFrame) -> np.ndarray:
        transformed = df.copy()
        transformed[["Time", "Amount"]] = self.scaler.transform(transformed[["Time", "Amount"]])
        return transformed[MODEL_FEATURES].astype(np.float32).to_numpy()

    @classmethod
    def fit(cls, df: pd.DataFrame) -> "FraudPreprocessor":
        scaler = StandardScaler()
        scaler.fit(df[["Time", "Amount"]])
        return cls(scaler=scaler)


def _stable_value(seed: str, min_val: float = -3.0, max_val: float = 3.0) -> float:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    as_int = int(digest[:8], 16)
    normalized = as_int / 0xFFFFFFFF
    return min_val + (max_val - min_val) * normalized


def build_feature_row(amount: float, time_hour: float, location: str, device: str, merchant: str, international: bool) -> dict:
    row: dict[str, float] = {"Time": float(time_hour * 3600.0), "Amount": float(amount)}
    for i in range(1, 29):
        base = _stable_value(f"{location}|{device}|{merchant}|V{i}")
        if international:
            base += 0.15
        row[f"V{i}"] = base
    return row


def _ensure_artifact_dir() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def _evaluate_with_threshold(probs: np.ndarray, truth: np.ndarray, threshold: float) -> dict:
    pred = (probs >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(truth, pred, labels=[0, 1]).ravel()
    return {
        "accuracy": float(accuracy_score(truth, pred)),
        "precision": float(precision_score(truth, pred, zero_division=0)),
        "recall": float(recall_score(truth, pred, zero_division=0)),
        "f1_score": float(f1_score(truth, pred, zero_division=0)),
        "tn": int(tn),
        "fp": int(fp),
        "fn": int(fn),
        "tp": int(tp),
    }


def train_model(force_retrain: bool = False) -> dict:
    _ensure_artifact_dir()
    if MODEL_PATH.exists() and PREPROCESSOR_PATH.exists() and METRICS_PATH.exists() and not force_retrain:
        with METRICS_PATH.open("r", encoding="utf-8") as fp:
            return json.load(fp)

    df = pd.read_csv(DATASET_PATH)
    for col in MODEL_FEATURES + ["Class"]:
        if col not in df.columns:
            raise ValueError(f"Missing expected column: {col}")

    data = df[MODEL_FEATURES + ["Class"]].copy()
    data["Class"] = data["Class"].astype(int)

    x_dev, x_test, y_dev, y_test = train_test_split(
        data[MODEL_FEATURES],
        data["Class"],
        test_size=0.2,
        random_state=42,
        stratify=data["Class"],
    )

    x_train, x_val, y_train, y_val = train_test_split(
        x_dev,
        y_dev,
        test_size=0.2,
        random_state=42,
        stratify=y_dev,
    )

    preprocessor = FraudPreprocessor.fit(x_train)
    x_train_np = preprocessor.transform_df(x_train)
    x_val_np = preprocessor.transform_df(x_val)
    x_test_np = preprocessor.transform_df(x_test)

    y_train_np = y_train.astype(np.float32).to_numpy().reshape(-1, 1)
    y_val_np = y_val.astype(np.float32).to_numpy().reshape(-1, 1)
    y_test_np = y_test.astype(np.float32).to_numpy().reshape(-1, 1)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = FraudANN(input_dim=x_train_np.shape[1]).to(device)

    x_train_tensor = torch.tensor(x_train_np, dtype=torch.float32).to(device)
    y_train_tensor = torch.tensor(y_train_np, dtype=torch.float32).to(device)
    x_val_tensor = torch.tensor(x_val_np, dtype=torch.float32).to(device)
    y_val_tensor = torch.tensor(y_val_np, dtype=torch.float32).to(device)
    x_test_tensor = torch.tensor(x_test_np, dtype=torch.float32).to(device)

    positive_count = max(1.0, float(y_train_np.sum()))
    negative_count = float(y_train_np.shape[0] - positive_count)
    pos_weight = torch.tensor([negative_count / positive_count], dtype=torch.float32).to(device)

    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", factor=0.5, patience=3)

    best_val = float("inf")
    best_state = None
    patience = 0
    max_epochs = 35
    for _ in range(max_epochs):
        model.train()
        optimizer.zero_grad()
        train_logits = model(x_train_tensor)
        train_loss = criterion(train_logits, y_train_tensor)
        train_loss.backward()
        optimizer.step()

        model.eval()
        with torch.no_grad():
            val_logits = model(x_val_tensor)
            val_loss = criterion(val_logits, y_val_tensor).item()

        scheduler.step(val_loss)
        if val_loss < best_val:
            best_val = val_loss
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            patience = 0
        else:
            patience += 1
            if patience >= 7:
                break

    if best_state:
        model.load_state_dict(best_state)

    model.eval()
    with torch.no_grad():
        probs = torch.sigmoid(model(x_test_tensor)).cpu().numpy().reshape(-1)

    truth = y_test_np.reshape(-1).astype(int)

    best_threshold = 0.5
    best_f1 = -1.0
    for threshold in np.arange(0.05, 0.96, 0.01):
        candidate = (probs >= threshold).astype(int)
        score = f1_score(truth, candidate, zero_division=0)
        if score > best_f1:
            best_f1 = float(score)
            best_threshold = float(threshold)

    evaluated = _evaluate_with_threshold(probs, truth, best_threshold)
    roc_auc = roc_auc_score(truth, probs)
    pr_auc = average_precision_score(truth, probs)

    metrics = {
        "accuracy": round(evaluated["accuracy"], 6),
        "precision": round(evaluated["precision"], 6),
        "recall": round(evaluated["recall"], 6),
        "f1_score": round(evaluated["f1_score"], 6),
        "roc_auc": round(float(roc_auc), 6),
        "pr_auc": round(float(pr_auc), 6),
        "tn": evaluated["tn"],
        "fp": evaluated["fp"],
        "fn": evaluated["fn"],
        "tp": evaluated["tp"],
        "threshold": round(best_threshold, 4),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "device": str(device),
    }

    torch.save(model.state_dict(), MODEL_PATH)
    joblib.dump(preprocessor, PREPROCESSOR_PATH)
    with METRICS_PATH.open("w", encoding="utf-8") as fp:
        json.dump(metrics, fp, indent=2)

    return metrics


def load_model_and_preprocessor() -> tuple[FraudANN, FraudPreprocessor, dict]:
    metrics = train_model(force_retrain=False)

    preprocessor: FraudPreprocessor = joblib.load(PREPROCESSOR_PATH)
    model = FraudANN(input_dim=len(MODEL_FEATURES))
    try:
        model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu"))
    except RuntimeError:
        # Model definition changed; retrain once to regenerate a compatible checkpoint.
        metrics = train_model(force_retrain=True)
        preprocessor = joblib.load(PREPROCESSOR_PATH)
        model = FraudANN(input_dim=len(MODEL_FEATURES))
        model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu"))
    model.eval()

    return model, preprocessor, metrics


def model_predict_probability(
    model: FraudANN,
    preprocessor: FraudPreprocessor,
    amount: float,
    time_hour: float,
    location: str,
    device: str,
    merchant: str,
    international: bool,
) -> float:
    row = build_feature_row(amount, time_hour, location, device, merchant, international)
    frame = pd.DataFrame([row], columns=MODEL_FEATURES)
    x = preprocessor.transform_df(frame)

    with torch.no_grad():
        logits = model(torch.tensor(x, dtype=torch.float32))
        probability = torch.sigmoid(logits).item()

    return float(probability)
