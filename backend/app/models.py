from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PredictionRecord(Base):
    __tablename__ = "prediction_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    tx_id: Mapped[str] = mapped_column(String(40), index=True)
    receiver: Mapped[str] = mapped_column(String(120), default="")
    merchant: Mapped[str] = mapped_column(String(120), default="")
    device: Mapped[str] = mapped_column(String(120), default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    time: Mapped[float] = mapped_column(Float, nullable=False)
    international: Mapped[bool] = mapped_column(Boolean, default=False)
    probability: Mapped[float] = mapped_column(Float, nullable=False)
    is_fraud: Mapped[bool] = mapped_column(Boolean, nullable=False)
    model_score: Mapped[float] = mapped_column(Float, default=0.0)
    rule_score: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
