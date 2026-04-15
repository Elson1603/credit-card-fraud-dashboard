import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WS_BASE_URL } from "@/lib/api";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import PredictionPage from "./pages/app/PredictionPage";
import CsvUploadPage from "./pages/app/CsvUploadPage";
import SimulationPage from "./pages/app/SimulationPage";
import AnalyticsPage from "./pages/app/AnalyticsPage";
import HistoryPage from "./pages/app/HistoryPage";
import ProfilePage from "./pages/app/ProfilePage";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE_URL}/ws/alerts`);
    ws.onopen = () => ws.send("subscribe");
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; tx_id?: string; probability?: number; amount?: number };
        if (payload.type === "fraud_alert") {
          const probability = payload.probability ? `${(payload.probability * 100).toFixed(1)}%` : "unknown";
          localStorage.setItem("last_fraud_alert_at", new Date().toISOString());
          toast.error(`Fraud Alert: ${payload.tx_id}`, {
            description: `Amount: ₹${payload.amount ?? 0} | Risk: ${probability}`,
          });
        }
      } catch {
        // ignore invalid payload
      }
    };
    return () => ws.close();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/prediction" element={<PredictionPage />} />
            <Route path="/upload" element={<CsvUploadPage />} />
            <Route path="/simulation" element={<SimulationPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
