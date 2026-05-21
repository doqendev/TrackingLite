"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SiMeta, SiTiktok } from "react-icons/si";

const platforms = [
  {
    key: "meta",
    name: "Meta CAPI",
    desc: "Conversions API for Facebook & Instagram",
    Icon: SiMeta,
    border: "border-l-blue-500",
    text: "text-blue-500",
    connected: true,
    enabled: true,
    fields: [
      { label: "Pixel ID", value: "548293017264" },
      { label: "Access Token", value: "EAAGx...k8ZD", masked: true },
    ],
  },
  {
    key: "tiktok",
    name: "TikTok Events API",
    desc: "Server-side events for TikTok ads",
    Icon: SiTiktok,
    border: "border-l-pink-500",
    text: "text-pink-500",
    connected: true,
    enabled: true,
    fields: [
      { label: "Pixel ID", value: "CP4R2ORC77U..." },
      { label: "Access Token", value: "act.2xR...wQ", masked: true },
    ],
  },
];

export function LandingIntegrationsPreview() {
  const [expanded, setExpanded] = useState<string | null>("meta");

  return (
    <div className="pn-app-preview">
      <div className="pn-app-preview-grid">
        {platforms.map((p) => {
          const isOpen = expanded === p.key;

          return (
            <div
              key={p.key}
              className={`pn-integration-card ${p.border}`}
            >
              {/* Card header */}
              <div
                className="pn-integration-header"
                onClick={() => setExpanded(isOpen ? null : p.key)}
              >
                <p.Icon className={`pn-integration-icon ${p.text}`} />
                <div className="pn-integration-info">
                  <p className="pn-integration-name">{p.name}</p>
                  <p className="pn-integration-desc">{p.desc}</p>
                </div>
                <div className="pn-integration-controls">
                  <span className={`pn-integration-badge ${p.connected ? "pn-integration-badge--connected" : ""}`}>
                    <span
                      className={`pn-integration-badge-dot ${p.connected ? "pn-integration-badge-dot--active" : ""}`}
                    />
                    {p.connected ? "Connected" : "Not connected"}
                  </span>
                  <div className={`pn-integration-switch ${p.enabled ? "pn-integration-switch--on" : ""}`}>
                    <div className={`pn-integration-switch-thumb ${p.enabled ? "pn-integration-switch-thumb--on" : ""}`} />
                  </div>
                  <ChevronDown
                    className={`pn-integration-chevron ${isOpen ? "pn-integration-chevron--open" : ""}`}
                  />
                </div>
              </div>

              {/* Expanded form preview */}
              <div className={`pn-integration-expand ${isOpen ? "pn-integration-expand--open" : ""}`}>
                <div className="pn-integration-form">
                  {p.fields.map((f) => (
                    <div key={f.label} className="pn-integration-field">
                      <div className="pn-integration-field-header">
                        <span className="pn-integration-field-label">{f.label}</span>
                        {f.masked && f.value && (
                          <span className="pn-integration-encrypted">Encrypted</span>
                        )}
                      </div>
                      <div className={`pn-integration-input ${f.value ? "pn-integration-input--filled" : ""}`}>
                        {f.masked && f.value ? "●●●●●●●●●●●●" : f.value || `Enter ${f.label.toLowerCase()}...`}
                      </div>
                    </div>
                  ))}
                  <div className="pn-integration-form-action">
                    <div className="pn-integration-save-btn">SAVE CREDENTIALS</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
