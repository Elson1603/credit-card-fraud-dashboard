import { ChartColumnIncreasing, FileUp, Gauge, History, Home, LogOut, Menu, ShieldAlert, X } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { API_BASE_URL, api, clearToken, getToken } from "@/lib/api";

const mainNavItems = [
  { label: "Home", to: "/", icon: Home },
  { label: "Prediction", to: "/prediction", icon: ShieldAlert },
  { label: "CSV Upload", to: "/upload", icon: FileUp },
  { label: "Real-Time", to: "/simulation", icon: Gauge },
  { label: "Analytics", to: "/analytics", icon: ChartColumnIncreasing },
  { label: "History", to: "/history", icon: History },
];

interface AppShellProps {
  title: string;
  children: ReactNode;
}

export const AppShell = ({ title, children }: AppShellProps) => {
  const [open, setOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [device, setDevice] = useState<string>("--");
  const [fraudToday, setFraudToday] = useState<number>(0);
  const [lastAlertAt, setLastAlertAt] = useState<string>("--");

  useEffect(() => {
    let active = true;

    const loadSnapshot = async () => {
      try {
        const healthRes = await fetch(`${API_BASE_URL}/api/health`);
        if (!active) return;
        if (healthRes.ok) {
          const health = (await healthRes.json()) as { model_loaded?: boolean };
          setBackendOnline(true);
          setModelLoaded(Boolean(health.model_loaded));
        } else {
          setBackendOnline(false);
          setModelLoaded(false);
        }
      } catch {
        if (!active) return;
        setBackendOnline(false);
        setModelLoaded(false);
      }

      try {
        const metrics = await api.metrics();
        if (!active) return;
        setThreshold(metrics.threshold);
        setDevice(metrics.device);
      } catch {
        if (!active) return;
        setThreshold(null);
        setDevice("--");
      }

      const token = getToken();
      if (token) {
        try {
          const analytics = await api.analytics();
          if (!active) return;
          setFraudToday(analytics.fraud_count);
        } catch {
          if (!active) return;
          setFraudToday(0);
        }
      }

      const last = localStorage.getItem("last_fraud_alert_at");
      if (active) {
        setLastAlertAt(last ? new Date(last).toLocaleTimeString() : "--");
      }
    };

    void loadSnapshot();
    const timer = setInterval(() => {
      void loadSnapshot();
    }, 20000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-page p-3 md:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1600px] overflow-hidden rounded-[2rem] border border-border bg-background shadow-soft md:min-h-[calc(100vh-2rem)]">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-sidebar-border bg-sidebar p-5 transition-transform duration-300 md:static md:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-8 flex items-center justify-between md:justify-start">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-card text-xl font-semibold text-primary">⦿</div>
              <h1 className="font-display text-2xl leading-none text-panel-foreground">Fraud Shield</h1>
            </div>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <p className="mb-3 pl-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Menu</p>
          <nav className="space-y-2">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "border-border bg-background text-foreground shadow-glow"
                        : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-secondary-foreground",
                    )
                  }
                  onClick={() => setOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-6 rounded-2xl border border-border bg-card/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">Operations Panel</p>
            <div className="mt-3 space-y-2 text-xs">
              <p className="flex items-center justify-between"><span>Backend</span><span className={backendOnline ? "text-success" : "text-danger"}>{backendOnline ? "Online" : "Offline"}</span></p>
              <p className="flex items-center justify-between"><span>Model</span><span className={modelLoaded ? "text-success" : "text-danger"}>{modelLoaded ? "Loaded" : "Not loaded"}</span></p>
              <p className="flex items-center justify-between"><span>Threshold</span><span>{threshold ?? "--"}</span></p>
              <p className="flex items-center justify-between"><span>Device</span><span className="uppercase">{device}</span></p>
              <p className="flex items-center justify-between"><span>Fraud Today</span><span className="text-danger">{fraudToday}</span></p>
              <p className="flex items-center justify-between"><span>Last Alert</span><span>{lastAlertAt}</span></p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <NavLink
                to="/prediction"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border bg-secondary px-2 py-2 text-center text-xs font-medium text-foreground hover:bg-accent"
              >
                Predict
              </NavLink>
              <NavLink
                to="/upload"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border bg-secondary px-2 py-2 text-center text-xs font-medium text-foreground hover:bg-accent"
              >
                Upload CSV
              </NavLink>
            </div>
          </div>

          <div className="mt-auto border-t border-sidebar-border pt-4">
            <NavLink
              to="/login"
              className="group flex items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-all duration-200 hover:border-border hover:bg-secondary hover:text-secondary-foreground"
              onClick={() => {
                clearToken();
                setOpen(false);
              }}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </NavLink>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col md:ml-0">
          <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
            <div className="flex h-20 items-center justify-between gap-3 px-4 md:px-8">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Button variant="outline" size="icon" className="md:hidden" onClick={() => setOpen(true)}>
                  <Menu className="h-5 w-5" />
                </Button>
                <p className="text-sm font-semibold text-foreground md:text-base">Fraud Monitoring Dashboard</p>
              </div>
            </div>
          </header>

          <main className="panel-grid flex-1 p-4 md:p-6">
            <h2 className="sr-only">{title}</h2>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};
