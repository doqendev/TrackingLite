import { Card, CardContent } from "@/components/ui/card";
import type { EmqMetrics } from "@/types/app";

interface EmqScoreProps {
  emq: EmqMetrics;
}

function getScoreColor(score: number): string {
  if (score >= 8) return "text-green-400";
  if (score >= 6) return "text-amber-400";
  return "text-red-400";
}

function getBarColor(score: number): string {
  if (score >= 8) return "bg-green-500";
  if (score >= 6) return "bg-amber-500";
  return "bg-red-500";
}

function getScoreLabel(score: number): string {
  if (score >= 8) return "Good";
  if (score >= 6) return "Fair";
  if (score > 0) return "Poor";
  return "No data";
}

interface BreakdownRowProps {
  label: string;
  percent: number;
}

function BreakdownRow({ label, percent }: BreakdownRowProps) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground font-medium">
          {percent}%
        </span>
      </div>
      <div className="h-1 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function getTips(breakdown: EmqMetrics["breakdown"]): string[] {
  const tips: string[] = [];

  if (breakdown.email < 50) {
    tips.push("Collect customer emails at checkout to improve matching");
  }
  if (breakdown.phone < 30) {
    tips.push("Adding phone numbers improves match rates by up to 15%");
  }
  if (breakdown.fbp < 50) {
    tips.push("Ensure the _fbp cookie is accessible to your snippet");
  }
  if (tips.length === 0) {
    tips.push("Send more user data (email, phone) to improve your score");
  }

  return tips.slice(0, 2);
}

export function EmqScore({ emq }: EmqScoreProps) {
  const { score, totalSampled, breakdown } = emq;
  const tips = getTips(breakdown);
  const barWidth = (score / 10) * 100;

  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.10]">
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Event Match Quality
        </h3>

        {/* Score display */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Match Score
          </p>
          <div className="flex items-baseline gap-2">
            <p
              className={`text-3xl font-bold tabular-nums ${getScoreColor(score)}`}
            >
              {totalSampled === 0 ? "—" : score.toFixed(1)}
            </p>
            <span className="text-sm text-muted-foreground">/&nbsp;10</span>
            <span
              className={`text-xs font-medium ml-1 ${getScoreColor(score)}`}
            >
              {getScoreLabel(score)}
            </span>
          </div>
        </div>

        {/* Score bar */}
        <div className="space-y-2 mb-4">
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getBarColor(score)}`}
              style={{ width: `${totalSampled === 0 ? 0 : barWidth}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Based on{" "}
            {totalSampled === 0
              ? "no events yet"
              : `${totalSampled.toLocaleString()} event${totalSampled === 1 ? "" : "s"} (24h)`}
          </p>
        </div>

        {/* Field breakdown */}
        {totalSampled > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Data Field Coverage
            </p>
            <div className="space-y-1.5">
              <BreakdownRow label="Email" percent={breakdown.email} />
              <BreakdownRow label="Phone" percent={breakdown.phone} />
              <BreakdownRow label="Browser pixel (_fbp)" percent={breakdown.fbp} />
              <BreakdownRow label="Click ID (_fbc)" percent={breakdown.fbc} />
              <BreakdownRow label="IP address" percent={breakdown.ip} />
              <BreakdownRow label="User agent" percent={breakdown.userAgent} />
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
            Tips
          </p>
          <ul className="space-y-1">
            {tips.map((tip) => (
              <li key={tip} className="text-xs text-muted-foreground">
                <span className="text-brand-400 mr-1.5">+</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
