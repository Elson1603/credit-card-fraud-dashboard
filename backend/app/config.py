from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_PATH = BASE_DIR / "creditcard.csv"
FAKE_TRANSACTION_PATH = BASE_DIR / "fake_transaction_data.csv"
ARTIFACT_DIR = BASE_DIR / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "fraud_ann.pt"
PREPROCESSOR_PATH = ARTIFACT_DIR / "preprocessor.joblib"
METRICS_PATH = ARTIFACT_DIR / "metrics.json"

DB_PATH = BASE_DIR / "fraud_dashboard.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

JWT_SECRET_KEY = "replace-this-with-env-secret"
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_MINUTES = 60 * 24

MODEL_THRESHOLD = 0.5
