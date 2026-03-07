const destinations = [
  "META",
  "TIKTOK",
  "GA4",
  "KLAVIYO",
  "REDDIT",
  "PINTEREST",
  "G.ADS",
];

export function PipelineVisual() {
  return (
    <div className="pn-pipeline">
      <div className="pn-pipeline-node pn-pipeline-node--source">
        <span>BROWSER</span>
      </div>
      <div className="pn-pipeline-line pn-pipeline-line--vertical" />
      <div className="pn-pipeline-node pn-pipeline-node--server">
        <span>api.trackclear.io</span>
      </div>
      <div className="pn-pipeline-line pn-pipeline-line--vertical" />
      <div className="pn-pipeline-fanout">
        {destinations.map((dest) => (
          <div key={dest} className="pn-pipeline-dest">
            <div className="pn-status-dot" />
            <span>{dest}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
