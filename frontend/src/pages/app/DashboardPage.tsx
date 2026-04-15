import { ShieldAlert, ShieldCheck, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/layout/AppShell";
import { api, type AnalyticsResult, type MetricsResult, type ProfileResult } from "@/lib/api";
import { Bar, BarChart, Cell, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function DashboardPage() {
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null);
  const [metrics, setMetrics] = useState<MetricsResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [profileData, analyticsData, metricData] = await Promise.all([api.profile(), api.analytics(), api.metrics()]);
        setProfile(profileData);
        setAnalytics(analyticsData);
        setMetrics(metricData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      }
    };
    void load();
  }, []);

  const safeCount = useMemo(() => {
    if (!analytics) return 0;
    return analytics.legit_count;
  }, [analytics]);

  const qualityBars = useMemo(() => {
    if (!metrics) return [];
    return [
      { name: "Precision", value: Number((metrics.precision * 100).toFixed(2)), color: "hsl(var(--primary))" },
      { name: "Recall", value: Number((metrics.recall * 100).toFixed(2)), color: "hsl(var(--success))" },
      { name: "PR-AUC", value: Number((metrics.pr_auc * 100).toFixed(2)), color: "hsl(var(--accent))" },
      { name: "ROC-AUC", value: Number((metrics.roc_auc * 100).toFixed(2)), color: "hsl(var(--danger))" },
    ];
  }, [metrics]);

  return (
    <AppShell title="Overview">
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <section className="rounded-3xl border border-border bg-panel/80 p-4 md:p-5">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl leading-none text-foreground md:text-5xl">Hello, {profile?.name ?? "Analyst"}!</h2>
            <p className="mt-2 text-sm text-muted-foreground">Live fraud monitoring summary</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Total Transactions</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold">{analytics?.total_transactions ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Fraud Detected</CardTitle>
              <ShieldAlert className="h-4 w-4 text-danger" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold text-danger">{analytics?.fraud_count ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Safe Transactions</CardTitle>
              <ShieldCheck className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold text-success">{safeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Model Quality (F1)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold">{metrics ? `${(metrics.f1_score * 100).toFixed(1)}%` : "--"}</div>
              <p className="text-xs text-muted-foreground">Threshold: {metrics?.threshold ?? "--"}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Detection Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={qualityBars} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }} width={80} />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(2)}%`, "Score"]}
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
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {qualityBars.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {qualityBars.map((metric) => (
                <div key={metric.name} className="rounded-2xl border border-border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">{metric.name}</p>
                  <div className="h-28 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        cx="50%"
                        cy="50%"
                        innerRadius="62%"
                        outerRadius="92%"
                        barSize={10}
                        data={[{ name: metric.name, value: metric.value }]}
                        startAngle={90}
                        endAngle={-270}
                      >
                        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                        <RadialBar dataKey="value" cornerRadius={8} fill={metric.color} background />
                      </RadialBarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="-mt-3 text-center text-lg font-semibold">{metric.value.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
