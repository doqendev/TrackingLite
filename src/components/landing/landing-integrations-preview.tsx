"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SiMeta, SiTiktok, SiGoogleanalytics, SiGoogleads } from "react-icons/si";
import { FaReddit, FaPinterest } from "react-icons/fa";

function KlaviyoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 152 152" className={className || "h-5 w-5"} fill="currentColor">
      <path d="M148.76,124.01H3.24V26.63H148.76l-30.55,48.69,30.55,48.69Z" />
    </svg>
  );
}

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
  {
    key: "ga4",
    name: "GA4 Measurement Protocol",
    desc: "Google Analytics server-side tracking",
    Icon: SiGoogleanalytics,
    border: "border-l-amber-500",
    text: "text-amber-500",
    connected: true,
    enabled: true,
    fields: [
      { label: "Measurement ID", value: "G-AB12CD34EF" },
      { label: "API Secret", value: "xYz...789", masked: true },
    ],
  },
  {
    key: "klaviyo",
    name: "Klaviyo",
    desc: "Email flows from purchase events",
    Icon: KlaviyoIcon,
    border: "border-l-green-500",
    text: "text-green-500",
    connected: true,
    enabled: true,
    fields: [
      { label: "API Key", value: "pk_abc...xyz", masked: true },
    ],
  },
  {
    key: "reddit",
    name: "Reddit Conversions API",
    desc: "Track which Reddit ads drive purchases",
    Icon: FaReddit,
    border: "border-l-orange-500",
    text: "text-orange-500",
    connected: false,
    enabled: false,
    fields: [
      { label: "Account ID", value: "" },
      { label: "Access Token", value: "", masked: true },
    ],
  },
  {
    key: "pinterest",
    name: "Pinterest Conversions API",
    desc: "Send checkout data to Pinterest",
    Icon: FaPinterest,
    border: "border-l-red-500",
    text: "text-red-500",
    connected: false,
    enabled: false,
    fields: [
      { label: "Ad Account ID", value: "" },
      { label: "Conversion Token", value: "", masked: true },
    ],
  },
  {
    key: "googleAds",
    name: "Google Ads",
    desc: "Server-side conversion tracking",
    Icon: SiGoogleads,
    border: "border-l-yellow-500",
    text: "text-yellow-500",
    connected: true,
    enabled: true,
    fields: [
      { label: "Conversion ID", value: "AW-123456789" },
      { label: "Purchase Label", value: "abcDEF123" },
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
