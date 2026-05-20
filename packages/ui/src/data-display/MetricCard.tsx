import { Badge, type BadgeTone } from "../components/Badge";
import { Card } from "../components/Card";

export type MetricCardProps = {
  label: string;
  value: string;
  delta?: string;
  tone?: BadgeTone;
};

export function MetricCard({ label, value, delta, tone = "neutral" }: MetricCardProps) {
  return (
    <Card className="yuni-metric-card" padding="md">
      <p className="yuni-metric-card__label">{label}</p>
      <p className="yuni-metric-card__value">{value}</p>
      {delta ? <Badge tone={tone}>{delta}</Badge> : null}
    </Card>
  );
}
