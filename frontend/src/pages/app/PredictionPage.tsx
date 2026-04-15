import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type PredictionResult } from "@/lib/api";

export default function PredictionPage() {
  const [transactionId, setTransactionId] = useState("");
  const [amount, setAmount] = useState("230");
  const [time, setTime] = useState("14");
  const [location, setLocation] = useState("Mumbai");
  const [device, setDevice] = useState("Mobile");
  const [merchant, setMerchant] = useState("MetroPay");
  const [international, setInternational] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runPrediction = async () => {
    setError("");
    if (!transactionId.trim()) {
      setError("Transaction ID is mandatory for prediction.");
      return;
    }
    setLoading(true);
    try {
      const prediction = await api.predict({
        transaction_id: transactionId.trim(),
        amount: Number(amount),
        time: Number(time),
        location,
        device,
        merchant,
        international,
      });
      setResult(prediction);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title="Transaction Prediction">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card shadow-soft">
          <CardHeader>
            <CardTitle>Input Transaction Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="transactionId">Transaction ID (Mandatory)</Label>
              <Input id="transactionId" required value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="e.g. T00003" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (INR ₹)</Label>
              <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Transaction Hour (0-23)</Label>
              <Input id="time" type="number" min="0" max="23" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="device">Device</Label>
              <Input id="device" value={device} onChange={(e) => setDevice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant">Merchant</Label>
              <Input id="merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={international} onChange={(e) => setInternational(e.target.checked)} />
              International transaction
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button className="w-full" onClick={runPrediction} disabled={loading}>
              {loading ? "Predicting..." : "Predict Transaction"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-soft">
          <CardHeader>
            <CardTitle>Prediction Result</CardTitle>
          </CardHeader>
          <CardContent>
            {!result ? (
              <p className="text-sm text-muted-foreground">Run prediction to see legitimacy and confidence score.</p>
            ) : result.label === "Fraud" ? (
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-5">
                <div className="flex items-center gap-2 text-danger">
                  <ShieldAlert className="h-5 w-5 animate-alert-pulse" />
                  <p className="font-semibold">Fraudulent Transaction</p>
                </div>
                <p className="mt-2 text-sm text-foreground">Probability: {(result.probability * 100).toFixed(1)}%</p>
                <p className="mt-1 text-sm text-muted-foreground">Confidence: {(result.confidence * 100).toFixed(1)}%</p>
                {result.risk_reasons.length ? <p className="mt-2 text-xs text-danger">Reasons: {result.risk_reasons.join(", ")}</p> : null}
              </div>
            ) : (
              <div className="rounded-xl border border-success/30 bg-success/10 p-5">
                <div className="flex items-center gap-2 text-success">
                  <ShieldCheck className="h-5 w-5" />
                  <p className="font-semibold">Legitimate Transaction</p>
                </div>
                <p className="mt-2 text-sm text-foreground">Probability: {(result.probability * 100).toFixed(1)}%</p>
                <p className="mt-1 text-sm text-muted-foreground">Confidence: {(result.confidence * 100).toFixed(1)}%</p>
                {result.risk_reasons.length ? <p className="mt-2 text-xs text-foreground">Checks: {result.risk_reasons.join(", ")}</p> : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
