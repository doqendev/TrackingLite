export interface ProblemCardProps {
  threatId: string;
  severity: string;
  title: string;
  description: string;
}

export function ProblemCard({
  threatId,
  severity,
  title,
  description,
}: ProblemCardProps) {
  return (
    <div className="pn-card pn-card--threat">
      <div className="pn-card-header">
        <div className="pn-card-header-main">
          <span>{threatId}</span>
          <span>***</span>
        </div>
        <span>[ {severity} ]</span>
      </div>
      <div className="pn-card-body">
        <div>
          <h3 className="pn-card-title">{title}</h3>
          <p className="pn-card-desc">{description}</p>
        </div>
        <div className="pn-scan-line" />
        <div className="pn-card-status pn-card-status--danger">
          <div className="pn-status-dot pn-status-dot--danger" />
          VECTOR ACTIVE
        </div>
      </div>
    </div>
  );
}
