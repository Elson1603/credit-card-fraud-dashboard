import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MetricCardProps {
  title: string;
  value: string;
  subText: string;
  icon: ReactNode;
}

export const MetricCard = ({ title, value, subText, icon }: MetricCardProps) => {
  return (
    <Card className="border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-primary">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight text-card-foreground">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{subText}</p>
      </CardContent>
    </Card>
  );
};
