import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type PredictionResult } from "@/lib/api";

type FeedItem = {
  id: string;
  amount: number;
  merchant: string;
  isFraud: boolean;
  time: string;
  probability: number;
};

export default function SimulationPage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const result: PredictionResult = await api.simulationNext();
        setFeed((prev) => [
          {
            id: result.tx_id,
            amount: result.amount,
            merchant: result.merchant,
            isFraud: result.label === "Fraud",
            probability: result.probability,
            time: new Date().toLocaleTimeString(),
          },
          ...prev,
        ].slice(0, 12));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Simulation failed");
      }
    }, 1800);

    return () => clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    const fraud = feed.filter((item) => item.isFraud).length;
    return { total: feed.length, fraud, safe: feed.length - fraud };
  }, [feed]);

  return (
    <AppShell title="Real-Time Fraud Simulation">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border bg-card shadow-soft lg:col-span-1">
          <CardHeader>
            <CardTitle>Dynamic Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="rounded-lg bg-muted p-3">Total Live: <span className="font-semibold text-foreground">{stats.total}</span></p>
            <p className="rounded-lg bg-danger/10 p-3 text-danger">Fraud Alerts: <span className="font-semibold">{stats.fraud}</span></p>
            <p className="rounded-lg bg-success/10 p-3 text-success">Safe: <span className="font-semibold">{stats.safe}</span></p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-soft lg:col-span-2">
          <CardHeader>
            <CardTitle>Live Transaction Feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {feed.map((item) => (
              <article
                key={item.id}
                className={item.isFraud ? "animate-fade-in rounded-xl border border-danger/30 bg-danger/10 p-4" : "animate-fade-in rounded-xl border border-success/30 bg-success/10 p-4"}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.isFraud ? <AlertTriangle className="h-4 w-4 text-danger animate-alert-pulse" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                    <p className="font-medium">{item.merchant}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.time}</p>
                </div>
                <p className="mt-1 text-sm">Txn: <span className="font-semibold">{item.id}</span></p>
                <p className="mt-1 text-sm">Amount: <span className="font-semibold">₹{item.amount}</span></p>
                <p className="mt-1 text-xs text-muted-foreground">Risk: {(item.probability * 100).toFixed(1)}%</p>
              </article>
            ))}
            {!feed.length ? <p className="text-sm text-muted-foreground">Waiting for incoming transactions...</p> : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
