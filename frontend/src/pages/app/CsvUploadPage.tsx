import { Download, FileUp } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type CsvPredictionRow } from "@/lib/api";

export default function CsvUploadPage() {
  const [rows, setRows] = useState<CsvPredictionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState("");

  const onFile = async (file: File) => {
    setError("");
    setLoading(true);
    try {
      const result = await api.predictCsv(file);
      setRows(result.rows);
      setDownloadUrl(api.downloadCsvUrl(result.download_token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const exportData = () => {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "prediction-results.csv";
    a.click();
  };

  const fraudCount = useMemo(() => rows.filter((r) => r.label === "Fraud").length, [rows]);

  return (
    <AppShell title="Batch CSV Prediction">
      <Card className="border-border bg-card shadow-soft">
        <CardHeader>
          <CardTitle>Upload CSV (amount,time,location,device,merchant,international)</CardTitle>
        </CardHeader>
        <CardContent>
          <label
            className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/50 p-10 text-center transition-all duration-300 hover:border-primary hover:bg-accent"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) onFile(file);
            }}
          >
            <FileUp className="h-10 w-10 text-primary transition-transform duration-300 group-hover:-translate-y-1" />
            <p className="mt-3 font-medium">Drag & drop your CSV file</p>
            <p className="mt-1 text-sm text-muted-foreground">or click to browse (first 5000 valid rows are processed)</p>
            <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {loading ? <p className="mt-3 text-sm text-muted-foreground">Predicting all rows...</p> : null}
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        </CardContent>
      </Card>

      <Card className="mt-6 border-border bg-card shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Results ({rows.length} rows, {fraudCount} fraud)</CardTitle>
          <Button variant="outline" onClick={exportData} disabled={!rows.length}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-3">ID</th>
                <th>Amount</th>
                <th>Time</th>
                <th>Merchant</th>
                <th>Prediction</th>
                <th>Probability</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.row_id} className={row.label === "Fraud" ? "border-b border-border bg-danger/10" : "border-b border-border"}>
                  <td className="py-3">{row.row_id}</td>
                  <td>₹{row.amount.toFixed(2)}</td>
                  <td>{row.time}</td>
                  <td>{row.merchant}</td>
                  <td className={row.label === "Fraud" ? "font-semibold text-danger" : "font-semibold text-success"}>{row.label}</td>
                  <td>{(row.probability * 100).toFixed(1)}%</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="py-8 text-center text-muted-foreground" colSpan={6}>
                    No CSV uploaded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
