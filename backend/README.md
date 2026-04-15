# Fraud Dashboard Backend

## 1) Create virtual environment

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

## 2) Install dependencies (CUDA capable)

```powershell
pip install -r requirements.txt
```

If your CUDA build of PyTorch is not detected, reinstall from official PyTorch command for your CUDA version.

## 3) Start API

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 4) Trigger model training (uses GPU when available)

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/train?force=true"
```

The response includes `device` (`cuda` or `cpu`) and model metrics.

## 5) Verify CUDA in current Python

```powershell
python -c "import torch; print('CUDA:', torch.cuda.is_available(), '| Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```

## API summary

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/train`
- `GET /api/metrics`
- `POST /api/predict`
- `POST /api/predict/payment`
- `POST /api/predict/csv`
- `GET /api/predict/csv/download/{token}`
- `GET /api/analytics`
- `GET /api/history`
- `GET /api/profile`
- `GET /api/simulation/next`
- `WS /ws/alerts`
