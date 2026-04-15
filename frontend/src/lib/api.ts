export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

const TOKEN_KEY = "fraud_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) message = data.detail;
    } catch {
      // no-op
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export type PredictionInput = {
  transaction_id?: string;
  amount: number;
  time: number;
  location: string;
  device: string;
  merchant: string;
  international: boolean;
  receiver?: string;
};

export type PredictionResult = {
  tx_id: string;
  amount: number;
  merchant: string;
  location: string;
  label: "Fraud" | "Legit";
  probability: number;
  model_score: number;
  rule_score: number;
  confidence: number;
  risk_reasons: string[];
};

export type CsvPredictionRow = {
  row_id: number;
  amount: number;
  time: number;
  location: string;
  device: string;
  merchant: string;
  international: boolean;
  probability: number;
  label: "Fraud" | "Legit";
};

export type CsvPredictionResult = {
  total: number;
  fraud_count: number;
  legit_count: number;
  rows: CsvPredictionRow[];
  download_token: string;
};

export type MetricsResult = {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  roc_auc: number;
  pr_auc: number;
  tn: number;
  fp: number;
  fn: number;
  tp: number;
  threshold: number;
  trained_at: string;
  device: string;
};

export type AnalyticsResult = {
  total_transactions: number;
  fraud_count: number;
  legit_count: number;
  fraud_share: number;
  by_day: { day: string; fraud: number; legit: number }[];
};

export type HistoryResult = {
  total: number;
  rows: {
    id: number;
    tx_id: string;
    receiver: string;
    merchant: string;
    location: string;
    device: string;
    amount: number;
    time: number;
    international: boolean;
    probability: number;
    is_fraud: boolean;
    created_at: string;
  }[];
};

export type ProfileResult = {
  name: string;
  email: string;
  total_predictions: number;
  fraud_detections: number;
};

export type AuthResult = {
  access_token: string;
  token_type: "bearer";
};

export const api = {
  signup: (name: string, email: string, password: string) => request<AuthResult>("/api/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  login: (email: string, password: string) => request<AuthResult>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  predict: (payload: PredictionInput) => request<PredictionResult>("/api/predict", { method: "POST", body: JSON.stringify(payload) }, true),
  simulatePayment: (payload: { receiver: string; amount: number; location: string; device: string; merchant: string; international: boolean }) =>
    request<PredictionResult>("/api/predict/payment", { method: "POST", body: JSON.stringify(payload) }, true),
  predictCsv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<CsvPredictionResult>("/api/predict/csv", { method: "POST", body: form }, true);
  },
  downloadCsvUrl: (token: string) => `${API_BASE_URL}/api/predict/csv/download/${token}`,
  metrics: () => request<MetricsResult>("/api/metrics"),
  analytics: () => request<AnalyticsResult>("/api/analytics", {}, true),
  history: (query: string, status: string) => request<HistoryResult>(`/api/history?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`, {}, true),
  profile: () => request<ProfileResult>("/api/profile", {}, true),
  simulationNext: () => request<PredictionResult>("/api/simulation/next", {}, true),
  updateThreshold: (value: number) => request<{ threshold: number; message: string }>(`/api/threshold?value=${value}`, { method: "POST" }),
};
