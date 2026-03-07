export interface IntegrationCardProps {
  file: string;
  platform: string;
  title: string;
  description: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  META: "#3b82f6",
  TIKTOK: "#ec4899",
  GA4: "#f59e0b",
  KLAVIYO: "#22c55e",
  REDDIT: "#f97316",
  PINTEREST: "#ef4444",
  GOOGLE_ADS: "#eab308",
};

export function IntegrationCard({
  file,
  platform,
  title,
  description,
}: IntegrationCardProps) {
  const color = PLATFORM_COLORS[platform] ?? "#06b6d4";

  return (
    <div className="pn-card" style={{ borderTopColor: color, borderTopWidth: 2 }}>
      <div className="pn-card-header">
        <div className="pn-card-header-main">
          <span>{file}</span>
          <span>***</span>
        </div>
        <span style={{ color }}>[ {platform} ]</span>
      </div>
      <div className="pn-card-body">
        <div>
          <h3 className="pn-card-title">{title}</h3>
          <p className="pn-card-desc">{description}</p>
        </div>
        <div className="pn-scan-line" />
        <div className="pn-card-status" style={{ color }}>
          <div
            className="pn-status-dot"
            style={{
              background: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
          LINK ESTABLISHED
        </div>
      </div>
    </div>
  );
}
