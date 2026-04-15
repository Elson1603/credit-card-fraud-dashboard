import { useMemo, useState } from "react";
import { useEffect } from "react";
import { AppShell } from "@/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type HistoryResult } from "@/lib/api";

export default function HistoryPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [history, setHistory] = useState<HistoryResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const status = filter === "safe" ? "legit" : filter;
        const data = await api.history(query, status);
        setHistory(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      }
    };
    void load();
  }, [query, filter]);

  const rows = useMemo(() => history?.rows ?? [], [history]);

  return (
    <AppShell title="Transaction History">
      <Card className="border-border bg-card shadow-soft">
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Input placeholder="Search by ID or customer" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="safe">Safe</SelectItem>
              <SelectItem value="fraud">Fraud</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="mt-6 border-border bg-card shadow-soft">
        <CardContent className="overflow-x-auto pt-6">
          {error ? <p className="pb-4 text-sm text-danger">{error}</p> : null}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-3">Transaction ID</th>
                <th className="pb-3">Merchant</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Location</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.is_fraud ? "border-b border-border bg-danger/10" : "border-b border-border"}>
                  <td className="py-3">{row.tx_id}</td>
                  <td>{row.merchant || "-"}</td>
                  <td>₹{row.amount.toFixed(2)}</td>
                  <td>{row.location || "-"}</td>
                  <td className={row.is_fraud ? "font-semibold text-danger" : "font-semibold text-success"}>{row.is_fraud ? "fraud" : "safe"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
