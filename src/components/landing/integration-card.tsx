export interface IntegrationCardProps {
  file: string;
  platform: string;
  title: string;
  description: string;
}

export function IntegrationCard({
  file,
  platform,
  title,
  description,
}: IntegrationCardProps) {
  return (
    <div className="pn-card">
      <div className="pn-card-header">
        <div className="pn-card-header-main">
          <span>{file}</span>
          <span>***</span>
        </div>
        <span>[ {platform} ]</span>
      </div>
      <div className="pn-card-body">
        <div>
          <h3 className="pn-card-title">{title}</h3>
          <p className="pn-card-desc">{description}</p>
        </div>
        <div className="pn-scan-line" />
        <div className="pn-card-status">
          <div className="pn-status-dot" />
          LINK ESTABLISHED
        </div>
      </div>
    </div>
  );
}
