import { AppShell } from "@/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type AnalyticsResult, type MetricsResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<MetricsResult | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null);
  const [threshold, setThreshold] = useState("0.63");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [m, a] = await Promise.all([api.metrics(), api.analytics()]);
        setMetrics(m);
        setThreshold(String(m.threshold));
        setAnalytics(a);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      }
    };
    void load();
  }, []);

  const pieData = useMemo(() => {
    if (!analytics) return [];
    return [
      { name: "Fraud", value: analytics.fraud_count },
      { name: "Legit", value: analytics.legit_count },
    ];
  }, [analytics]);

  const updateThreshold = async () => {
    try {
      const next = Number(threshold);
      await api.updateThreshold(next);
      const refreshed = await api.metrics();
      setMetrics(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update threshold");
    }
  };

  return (
    <AppShell title="Advanced Analytics">
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle>Accuracy</CardTitle></CardHeader><CardContent><p className="text-4xl font-semibold">{metrics ? `${(metrics.accuracy * 100).toFixed(2)}%` : "--"}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Precision</CardTitle></CardHeader><CardContent><p className="text-4xl font-semibold">{metrics ? `${(metrics.precision * 100).toFixed(2)}%` : "--"}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Recall</CardTitle></CardHeader><CardContent><p className="text-4xl font-semibold">{metrics ? `${(metrics.recall * 100).toFixed(2)}%` : "--"}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>F1-Score</CardTitle></CardHeader><CardContent><p className="text-4xl font-semibold">{metrics ? `${(metrics.f1_score * 100).toFixed(2)}%` : "--"}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>PR-AUC</CardTitle></CardHeader><CardContent><p className="text-4xl font-semibold">{metrics ? metrics.pr_auc.toFixed(3) : "--"}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>ROC-AUC</CardTitle></CardHeader><CardContent><p className="text-4xl font-semibold">{metrics ? metrics.roc_auc.toFixed(3) : "--"}</p></CardContent></Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Decision Threshold</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input type="number" min="0.05" max="0.95" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="max-w-[220px]" />
          <Button onClick={updateThreshold}>Update Threshold</Button>
          <p className="text-sm text-muted-foreground">Lower threshold improves recall; higher threshold improves precision.</p>
          {metrics ? <p className="w-full text-xs text-muted-foreground">TP: {metrics.tp} | FP: {metrics.fp} | FN: {metrics.fn} | TN: {metrics.tn}</p> : null}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Fraud Trend & Distribution</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="rounded-2xl border border-border bg-panel p-5">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={analytics?.by_day ?? []}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                    color: "hsl(var(--foreground))",
                    boxShadow: "0 8px 24px hsl(var(--background) / 0.45)",
                  }}
                  itemStyle={{ color: "hsl(var(--foreground))", fontSize: "12px" }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: "12px", marginBottom: "4px" }}
                  cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
                />
                <Bar dataKey="fraud" fill="hsl(var(--danger))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="legit" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-border bg-panel p-5">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={70}>
                  <Cell fill="hsl(var(--danger))" />
                  <Cell fill="hsl(var(--success))" />
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                    color: "hsl(var(--foreground))",
                    boxShadow: "0 8px 24px hsl(var(--background) / 0.45)",
                  }}
                  itemStyle={{ color: "hsl(var(--foreground))", fontSize: "12px" }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: "12px", marginBottom: "4px" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-6 space-y-2 text-sm">
              <p className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-danger" />Fraud</span><span>{analytics ? analytics.fraud_count : 0}</span></p>
              <p className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-success" />Legit</span><span>{analytics ? analytics.legit_count : 0}</span></p>
            </div>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
