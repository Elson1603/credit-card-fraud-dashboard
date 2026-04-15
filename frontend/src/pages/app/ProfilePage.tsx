import { Mail, User } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type ProfileResult } from "@/lib/api";

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setProfile(await api.profile());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      }
    };
    void load();
  }, []);

  return (
    <AppShell title="User Profile">
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border bg-card shadow-soft lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-muted p-4">
              <User className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{profile?.name ?? "-"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-muted p-4">
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{profile?.email ?? "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-soft">
          <CardHeader>
            <CardTitle>Prediction Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="rounded-lg bg-muted p-3">Total Predictions: <span className="font-semibold">{profile?.total_predictions ?? 0}</span></p>
            <p className="rounded-lg bg-danger/10 p-3 text-danger">Fraud Detected: <span className="font-semibold">{profile?.fraud_detections ?? 0}</span></p>
            <p className="rounded-lg bg-success/10 p-3 text-success">Safe Classified: <span className="font-semibold">{Math.max(0, (profile?.total_predictions ?? 0) - (profile?.fraud_detections ?? 0))}</span></p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
