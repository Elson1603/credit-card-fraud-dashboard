from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PredictionInput(BaseModel):
    transaction_id: str = Field(min_length=2, max_length=64)
    amount: float = Field(gt=0)
    time: float = Field(ge=0, le=23)
    location: str = Field(default="Unknown")
    device: str = Field(default="Unknown")
    merchant: str = Field(default="Unknown")
    international: bool = False
    receiver: str = Field(default="")


class PredictionResponse(BaseModel):
    tx_id: str
    amount: float
    merchant: str
    location: str
    label: str
    probability: float
    model_score: float
    rule_score: float
    confidence: float
    risk_reasons: list[str] = []


class MetricsResponse(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    roc_auc: float
    pr_auc: float
    tn: int
    fp: int
    fn: int
    tp: int
    threshold: float
    trained_at: str
    device: str


class ThresholdTuneResponse(BaseModel):
    threshold: float
    message: str


class HistoryItem(BaseModel):
    id: int
    tx_id: str
    receiver: str
    merchant: str
    location: str
    device: str
    amount: float
    time: float
    international: bool
    probability: float
    is_fraud: bool
    created_at: datetime


class HistoryResponse(BaseModel):
    rows: list[HistoryItem]
    total: int


class ProfileResponse(BaseModel):
    name: str
    email: str
    total_predictions: int
    fraud_detections: int


class AnalyticsResponse(BaseModel):
    total_transactions: int
    fraud_count: int
    legit_count: int
    fraud_share: float
    by_day: list[dict]


class PaymentSimulationRequest(BaseModel):
    receiver: str = Field(min_length=2, max_length=120)
    amount: float = Field(gt=0)
    location: str = Field(default="Unknown")
    device: str = Field(default="Browser")
    merchant: str = Field(default="Payment Gateway")
    international: bool = False


class CsvPredictionRow(BaseModel):
    row_id: int
    amount: float
    time: float
    location: str
    device: str
    merchant: str
    international: bool
    probability: float
    label: str


class CsvPredictionResponse(BaseModel):
    total: int
    fraud_count: int
    legit_count: int
    rows: list[CsvPredictionRow]
    download_token: str
