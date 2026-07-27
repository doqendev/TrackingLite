"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  countPresentDiagnosticsAuditFields,
  countOptionalDiagnosticsAuditFields,
  getVisibleDiagnosticsAuditFields,
  isOptionalDiagnosticsAuditField,
} from "@/lib/diagnostics-audit-fields";

// ---------------------------------------------------------------------------
// Types — mirror exact API response shape from /api/diagnostics
// ---------------------------------------------------------------------------

interface EventCoverageRow {
  eventName: string;
  tracked: boolean; // false = fire-and-forget (sent to platforms but not stored in DB)
  total24h: number;
  total7d: number;
  total30d: number;
  successRate24h: number;
  failedCount24h: number;
  pendingCount24h: number;
  lastSeen: string | null;
}

interface DestinationHealthRow {
  destination: string;
  enabled: boolean;
  hasCredentials: boolean;
  sent24h: number;
  failed24h: number;
  pending24h: number;
  retrying24h: number;
  total24h: number;
  successRate24h: number;
  lastSuccess: string | null;
  lastFailure: string | null;
}

interface MatrixEntry {
  eventName: string;
  destination: string;
  count: number;
  sent: number;
  failed: number;
}

interface DataQuality {
  purchaseEvents7d: number;
  purchasesWithValue: number;
  purchasesWithCurrency: number;
  purchasesWithOrderId: number;
  totalEvents7d: number;
  eventsWithUtmSource: number;
  eventsWithGclid: number;
}

interface FunnelStep {
  eventName: string;
  count7d: number;
  dropOffPercent: number | null;
}

interface RecentFailure {
  id: string;
  createdAt: string;
  eventName: string;
  destination: string;
  status: string;
  eventId: string;
}

interface StuckEvents {
  count: number;
  oldest: string | null;
}

interface DiagnosticsWorkspace {
  id: string;
  name: string;
  isActive: boolean;
  productMode: string;
  installType: string;
  allowedDestinations: string[];
}

interface PurchaseAuditDestination {
  destination: string;
  status: string;
  errorMessage: string | null;
  retryCount: number;
}

interface PurchaseAuditEntry {
  eventId: string;
  createdAt: string;
  destinations: PurchaseAuditDestination[];
  value: number | null;
  currency: string | null;
  orderId: string | null;
  numItems: number | null;
  fbp: string | null;
  fbc: string | null;
  pageUrl: string | null;
  customerIp: string | null;
  userAgent: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  ttclid: string | null;
  rdtCid: string | null;
  epik: string | null;
}

interface DiagnosticsData {
  generatedAt: string;
  workspace: DiagnosticsWorkspace;
  eventCoverage: EventCoverageRow[];
  destinationHealth: DestinationHealthRow[];
  eventDestinationMatrix: MatrixEntry[];
  dataQuality: DataQuality;
  funnel: FunnelStep[];
  recentFailures: RecentFailure[];
  stuckEvents: StuckEvents;
  purchaseAudit: PurchaseAuditEntry[];
  addToCartAudit: PurchaseAuditEntry[];
  initiateCheckoutAudit: PurchaseAuditEntry[];
}

type DiagnosticTestEventName = "AddToCart" | "InitiateCheckout";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(isoString: string | null): string {
  if (!isoString) return "Never";
  const now = Date.now();
  const diffMs = now - new Date(isoString).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function rateColor(rate: number | null): string {
  if (rate === null) return "text-zinc-500";
  if (rate >= 95) return "text-green-400";
  if (rate >= 80) return "text-yellow-400";
  return "text-red-400";
}

function pct(num: number, den: number): string {
  if (den === 0) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
      {children}
    </h2>
  );
}

function RateBadge({ rate }: { rate: number }) {
  const color = rateColor(rate);
  return <span className={`font-mono font-semibold ${color}`}>{rate.toFixed(0)}%</span>;
}

function EnabledBadge({ value }: { value: boolean }) {
  return value ? (
    <Badge className="bg-green-900/50 text-green-400 border-green-800 text-xs">Yes</Badge>
  ) : (
    <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700 text-xs">No</Badge>
  );
}

// ---------------------------------------------------------------------------
// Section: Event Coverage
// ---------------------------------------------------------------------------

const ALL_EVENTS = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
] as const;

function EventCoverageSection({ rows }: { rows: EventCoverageRow[] }) {
  const rowMap = Object.fromEntries(rows.map((r) => [r.eventName, r]));

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <SectionTitle>Event Coverage</SectionTitle>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800">
              <TableHead className="text-zinc-400 text-xs">Event</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">24h</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">7d</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">30d</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">Success Rate</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">Failed</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">Pending</TableHead>
              <TableHead className="text-zinc-400 text-xs">Last Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ALL_EVENTS.map((name) => {
              const row = rowMap[name];
              const isFireAndForget = row && !row.tracked;
              const missing7d = !isFireAndForget && (!row || row.total7d === 0);
              return (
                <TableRow
                  key={name}
                  className={`border-zinc-800 ${missing7d ? "bg-red-950/20" : ""} ${isFireAndForget ? "opacity-60" : ""}`}
                >
                  <TableCell className="font-mono text-xs text-white">
                    {name}
                    {isFireAndForget && (
                      <span className="ml-2 text-blue-400 text-xs">(fire-and-forget)</span>
                    )}
                    {missing7d && (
                      <span className="ml-2 text-red-400 text-xs">(missing)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-zinc-300">
                    {isFireAndForget ? <span className="text-zinc-600">n/a</span> : (row?.total24h ?? 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-zinc-300">
                    {isFireAndForget ? <span className="text-zinc-600">n/a</span> : (row?.total7d ?? 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-zinc-300">
                    {isFireAndForget ? <span className="text-zinc-600">n/a</span> : (row?.total30d ?? 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {isFireAndForget ? <span className="text-zinc-600">n/a</span> : row ? <RateBadge rate={row.successRate24h} /> : <span className="text-zinc-600">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-red-400">
                    {isFireAndForget ? <span className="text-zinc-600">n/a</span> : (row?.failedCount24h ?? 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-yellow-400">
                    {isFireAndForget ? <span className="text-zinc-600">n/a</span> : (row?.pendingCount24h ?? 0)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {isFireAndForget ? (
                      <span className="text-blue-400">Sent via worker (not stored)</span>
                    ) : row?.lastSeen ? (
                      <span className="text-zinc-400">{timeAgo(row.lastSeen)}</span>
                    ) : (
                      <span className="text-red-400">Never</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Destination Health
// ---------------------------------------------------------------------------

const DESTINATIONS = ["META", "TIKTOK", "GA4", "KLAVIYO", "REDDIT", "PINTEREST", "GOOGLE_ADS"] as const;

const destinationLabels: Record<string, string> = {
  META: "Meta",
  TIKTOK: "TikTok",
  GA4: "GA4",
  KLAVIYO: "Klaviyo",
  REDDIT: "Reddit",
  PINTEREST: "Pinterest",
  GOOGLE_ADS: "Google Ads",
};

function DestinationHealthSection({
  rows,
  destinations,
}: {
  rows: DestinationHealthRow[];
  destinations: readonly string[];
}) {
  const rowMap = Object.fromEntries(rows.map((r) => [r.destination, r]));

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <SectionTitle>Destination Health</SectionTitle>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800">
              <TableHead className="text-zinc-400 text-xs">Destination</TableHead>
              <TableHead className="text-zinc-400 text-xs">Enabled</TableHead>
              <TableHead className="text-zinc-400 text-xs">Credentials</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">24h Sent</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">24h Failed</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">Pending</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">Retrying</TableHead>
              <TableHead className="text-zinc-400 text-xs text-right">Success Rate</TableHead>
              <TableHead className="text-zinc-400 text-xs">Last Success</TableHead>
              <TableHead className="text-zinc-400 text-xs">Last Failure</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {destinations.map((dest) => {
              const row = rowMap[dest];
              const warnNoCredentials = row?.enabled && !row?.hasCredentials;
              return (
                <TableRow
                  key={dest}
                  className={`border-zinc-800 ${warnNoCredentials ? "bg-yellow-950/20" : ""}`}
                >
                  <TableCell className="font-semibold text-xs text-white">
                    {destinationLabels[dest]}
                    {warnNoCredentials && (
                      <span className="ml-2 text-yellow-400 text-xs">(no creds)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <EnabledBadge value={row?.enabled ?? false} />
                  </TableCell>
                  <TableCell>
                    <EnabledBadge value={row?.hasCredentials ?? false} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-zinc-300">
                    {row?.sent24h ?? 0}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-red-400">
                    {row?.failed24h ?? 0}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-yellow-400">
                    {row?.pending24h ?? 0}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-orange-400">
                    {row?.retrying24h ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    {row ? (
                      <RateBadge rate={row.successRate24h} />
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">
                    {row?.lastSuccess ? timeAgo(row.lastSuccess) : <span className="text-zinc-600">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row?.lastFailure ? (
                      <span className="text-red-400">{timeAgo(row.lastFailure)}</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Event x Destination Matrix
// ---------------------------------------------------------------------------

function MatrixSection({
  entries,
  enabledDestinations,
  destinations,
}: {
  entries: MatrixEntry[];
  enabledDestinations: Set<string>;
  destinations: readonly string[];
}) {
  // Build nested map: eventName -> destination -> {sent, total}
  const matrixMap: Record<string, Record<string, { sent: number; total: number }>> = {};
  for (const entry of entries) {
    if (!matrixMap[entry.eventName]) matrixMap[entry.eventName] = {};
    matrixMap[entry.eventName][entry.destination] = {
      sent: entry.sent,
      total: entry.count,
    };
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <SectionTitle>Event x Destination Matrix (24h)</SectionTitle>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800">
              <TableHead className="text-zinc-400 text-xs">Event</TableHead>
              {destinations.map((dest) => (
                <TableHead
                  key={dest}
                  className={`text-xs text-center ${
                    enabledDestinations.has(dest) ? "text-zinc-400" : "text-zinc-700"
                  }`}
                >
                  {destinationLabels[dest]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ALL_EVENTS.map((event) => (
              <TableRow key={event} className="border-zinc-800">
                <TableCell className="font-mono text-xs text-white">{event}</TableCell>
                {destinations.map((dest) => {
                  const cell = matrixMap[event]?.[dest];
                  const isEnabled = enabledDestinations.has(dest);
                  if (!isEnabled) {
                    return (
                      <TableCell key={dest} className="text-center text-xs text-zinc-700">
                        —
                      </TableCell>
                    );
                  }
                  if (!cell || cell.total === 0) {
                    return (
                      <TableCell key={dest} className="text-center font-mono text-xs text-zinc-600">
                        0/0
                      </TableCell>
                    );
                  }
                  const rate = cell.total > 0 ? (cell.sent / cell.total) * 100 : null;
                  return (
                    <TableCell
                      key={dest}
                      className={`text-center font-mono text-xs ${rateColor(rate)}`}
                    >
                      {cell.sent}/{cell.total}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Data Quality
// ---------------------------------------------------------------------------

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pctNum = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const color =
    pctNum >= 95 ? "bg-green-500" : pctNum >= 80 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-zinc-800 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${color} transition-all`}
          style={{ width: `${pctNum}%` }}
        />
      </div>
      <span className={`font-mono text-xs w-10 text-right ${rateColor(pctNum)}`}>
        {pct(value, max)}
      </span>
    </div>
  );
}

function DataQualitySection({
  dq,
  allowedDestinations,
}: {
  dq: DataQuality;
  allowedDestinations: readonly string[];
}) {
  const rows = [
    { label: "Purchase value capture", value: dq.purchasesWithValue, max: dq.purchaseEvents7d },
    { label: "Currency capture", value: dq.purchasesWithCurrency, max: dq.purchaseEvents7d },
    { label: "Order ID capture", value: dq.purchasesWithOrderId, max: dq.purchaseEvents7d },
    { label: "UTM attribution", value: dq.eventsWithUtmSource, max: dq.totalEvents7d },
  ];

  if (allowedDestinations.includes("GOOGLE_ADS")) {
    rows.push({ label: "Google Click ID", value: dq.eventsWithGclid, max: dq.totalEvents7d });
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <SectionTitle>Data Quality (7d)</SectionTitle>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rows.map(({ label, value, max }) => (
            <div key={label}>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-zinc-400">{label}</span>
                <span className="text-xs text-zinc-500 font-mono">
                  {value}/{max}
                </span>
              </div>
              <ProgressBar value={value} max={max} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Funnel Analysis
// ---------------------------------------------------------------------------

function FunnelSection({ funnel }: { funnel: FunnelStep[] }) {
  const FIRE_AND_FORGET = new Set(["PageView", "ViewContent"]);
  // Use first tracked event as the top for percentage calculation
  const trackedSteps = funnel.filter((s) => !FIRE_AND_FORGET.has(s.eventName));
  const topCount = trackedSteps[0]?.count7d ?? 0;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <SectionTitle>Funnel Analysis (7d)</SectionTitle>
        </CardTitle>
        <p className="text-xs text-zinc-500">PageView/ViewContent are fire-and-forget (not stored in DB). Funnel starts from AddToCart.</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {funnel.map((step) => {
            const isFF = FIRE_AND_FORGET.has(step.eventName);
            const widthPct = isFF
              ? 0
              : topCount === 0
                ? 0
                : Math.round((step.count7d / topCount) * 100);

            return (
              <div key={step.eventName} className={isFF ? "opacity-40" : ""}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-mono text-white">
                    {step.eventName}
                    {isFF && <span className="ml-2 text-blue-400">(not stored)</span>}
                  </span>
                  <div className="flex items-center gap-3">
                    {!isFF && step.dropOffPercent !== null && (
                      <span className="text-xs text-zinc-500">
                        -{step.dropOffPercent}% drop
                      </span>
                    )}
                    <span className="text-xs font-mono text-zinc-400 w-24 text-right">
                      {isFF ? "n/a" : `${step.count7d.toLocaleString()} (${widthPct}%)`}
                    </span>
                  </div>
                </div>
                <div className="bg-zinc-800 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${isFF ? "bg-zinc-700" : "bg-blue-500"}`}
                    style={{ width: isFF ? "100%" : `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Recent Failures
// ---------------------------------------------------------------------------

function RecentFailuresSection({ failures }: { failures: RecentFailure[] }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <SectionTitle>Recent Failures (last 20)</SectionTitle>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {failures.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-green-400">
            No failures — all clear
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800">
                <TableHead className="text-zinc-400 text-xs">Time</TableHead>
                <TableHead className="text-zinc-400 text-xs">Event</TableHead>
                <TableHead className="text-zinc-400 text-xs">Destination</TableHead>
                <TableHead className="text-zinc-400 text-xs">Status</TableHead>
                <TableHead className="text-zinc-400 text-xs font-mono">Event ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failures.map((f) => (
                <TableRow key={f.id} className="border-zinc-800">
                  <TableCell className="text-xs text-zinc-400">
                    {timeAgo(f.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-300">
                    {f.eventName}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-300">
                    {destinationLabels[f.destination] ?? f.destination}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-red-900/50 text-red-400 border-red-800 text-xs">
                      {f.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-500 truncate max-w-[180px]">
                    {f.eventId}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Stuck Events
// ---------------------------------------------------------------------------

function StuckEventsSection({ stuck }: { stuck: StuckEvents }) {
  if (stuck.count === 0) {
    return (
      <div className="rounded-lg border border-green-800 bg-green-950/30 px-4 py-3 text-sm text-green-400 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
        No stuck events — pipeline is flowing
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-400">
      <div className="flex items-center gap-2 font-semibold">
        <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        {stuck.count} stuck event{stuck.count !== 1 ? "s" : ""} detected
      </div>
      {stuck.oldest && (
        <div className="mt-1 text-xs text-red-500">
          Oldest stuck since: {timeAgo(stuck.oldest)} ({new Date(stuck.oldest).toISOString()})
        </div>
      )}
      <div className="mt-1 text-xs text-red-600">
        Events in PENDING state older than 10 minutes that the stale-requeue worker may have missed.
      </div>
    </div>
  );
}

function LiveValidationSection({
  workspaceId,
  onSent,
}: {
  workspaceId: string | null;
  onSent: () => void;
}) {
  const [running, setRunning] = useState<DiagnosticTestEventName | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function sendTestEvent(eventName: DiagnosticTestEventName) {
    if (!workspaceId) return;
    setRunning(eventName);
    setMessage(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/diagnostics/test-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventName }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to send diagnostic event");
      }

      const destinations = Array.isArray(body.destinations)
        ? body.destinations.join(", ")
        : "none";
      setMessage(`${eventName} queued for ${destinations}. Refreshing diagnostics shortly.`);
      setTimeout(onSent, 1500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(null);
    }
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <SectionTitle>Live Non-Purchase Validation</SectionTitle>
        </CardTitle>
        <p className="text-xs text-zinc-500">
          Sends safe diagnostic AddToCart or InitiateCheckout events through the same ingest pipeline. Purchase/order events are intentionally not supported here.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:text-white text-xs"
            onClick={() => sendTestEvent("AddToCart")}
            disabled={!workspaceId || running !== null}
          >
            {running === "AddToCart" ? "Sending..." : "Send AddToCart"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:text-white text-xs"
            onClick={() => sendTestEvent("InitiateCheckout")}
            disabled={!workspaceId || running !== null}
          >
            {running === "InitiateCheckout" ? "Sending..." : "Send InitiateCheckout"}
          </Button>
        </div>
        {message && (
          <p className="mt-3 text-xs text-zinc-400">{message}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Purchase Event Audit
// ---------------------------------------------------------------------------

function FieldPresenceDot({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="inline-block w-2 h-2 rounded-full bg-zinc-700" title="Missing" />;
  }
  return <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Present" />;
}

function FieldKindBadge({ optional }: { optional: boolean }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
        optional
          ? "border-blue-800/70 bg-blue-950/40 text-blue-300"
          : "border-zinc-700 bg-zinc-800 text-zinc-400"
      }`}
    >
      {optional ? "Optional" : "Core"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SENT: "bg-green-900/50 text-green-400 border-green-800",
    FAILED: "bg-red-900/50 text-red-400 border-red-800",
    PENDING: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    RETRYING: "bg-orange-900/50 text-orange-400 border-orange-800",
    SUPERSEDED: "bg-slate-900/50 text-slate-400 border-slate-800",
  };
  return (
    <Badge className={`${colors[status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} text-xs`}>
      {status}
    </Badge>
  );
}

function EventAuditSection({
  entries,
  title,
  emptyLabel,
  eventName,
  allowedDestinations,
}: {
  entries: PurchaseAuditEntry[];
  title: string;
  emptyLabel: string;
  eventName: string;
  allowedDestinations: readonly string[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            <SectionTitle>{title}</SectionTitle>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500 text-center py-6">No {emptyLabel} events recorded yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <SectionTitle>{title}</SectionTitle>
        </CardTitle>
        <p className="text-xs text-zinc-500">
          Shows captured core data, plus optional click/UTM fields only when they exist for an allowed destination. Click a row to expand.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-zinc-800">
          {entries.map((entry) => {
            const isExpanded = expanded === entry.eventId;
            const dataFields = getVisibleDiagnosticsAuditFields(
              entry,
              allowedDestinations,
              eventName
            );
            const presentCount = countPresentDiagnosticsAuditFields(entry, dataFields);
            const optionalCount = countOptionalDiagnosticsAuditFields(dataFields);
            const totalFields = dataFields.length;
            const completeness = Math.round((presentCount / totalFields) * 100);
            const allSent = entry.destinations.every((d) => d.status === "SENT");
            const anyFailed = entry.destinations.some((d) => d.status === "FAILED");

            return (
              <div key={entry.eventId}>
                {/* Summary row */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : entry.eventId)}
                  className="w-full px-4 py-3 flex items-center gap-4 hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <span className="text-xs text-zinc-500 w-20 shrink-0">
                    {timeAgo(entry.createdAt)}
                  </span>
                  <span className="font-mono text-xs text-zinc-400 truncate w-48 shrink-0" title={entry.eventId}>
                    {entry.eventId.substring(0, 8)}...
                  </span>
                  <span className="text-xs text-zinc-300 w-24 shrink-0">
                    {entry.value !== null ? `${entry.currency ?? "?"} ${entry.value.toFixed(2)}` : "no value"}
                  </span>
                  <span className="text-xs text-zinc-500 w-20 shrink-0">
                    {entry.orderId ? `#${entry.orderId.substring(0, 8)}` : "no order"}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    {entry.destinations.map((d) => (
                      <StatusBadge key={d.destination} status={d.status} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 ml-auto shrink-0">
                    <span className={`text-xs font-mono ${completeness >= 80 ? "text-green-400" : completeness >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                      {presentCount}/{totalFields} captured
                    </span>
                    {optionalCount > 0 && (
                      <span className="text-xs text-blue-400">+{optionalCount} optional</span>
                    )}
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        allSent ? "bg-green-500" : anyFailed ? "bg-red-500" : "bg-yellow-500"
                      }`}
                    />
                    <span className="text-zinc-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 bg-zinc-950/50">
                    {/* Destination breakdown */}
                    <div className="mb-4">
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Destination Delivery
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {entry.destinations.map((d) => (
                          <div
                            key={d.destination}
                            className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-white">
                                {destinationLabels[d.destination] ?? d.destination}
                              </span>
                              <StatusBadge status={d.status} />
                            </div>
                            {d.retryCount > 0 && (
                              <p className="text-xs text-zinc-500">Retries: {d.retryCount}</p>
                            )}
                            {d.errorMessage && (
                              <p className="text-xs text-red-400 mt-1 truncate" title={d.errorMessage}>
                                {d.errorMessage}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Data fields grid */}
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                      Captured Data
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
                      {dataFields.map((field) => {
                        const val = entry[field.key];
                        const optional = isOptionalDiagnosticsAuditField(field);
                        return (
                          <div key={field.key} className="flex items-center gap-2 py-1">
                            <FieldPresenceDot value={val} />
                            <span className="text-xs text-zinc-500 w-28 shrink-0">{field.label}</span>
                            <FieldKindBadge optional={optional} />
                            <span
                              className={`text-xs font-mono truncate ${
                                val !== null && val !== undefined ? "text-zinc-300" : "text-zinc-700"
                              }`}
                              title={val !== null && val !== undefined ? String(val) : "missing"}
                            >
                              {val !== null && val !== undefined ? String(val) : "---"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DiagnosticsPage() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [secondsSince, setSecondsSince] = useState(0);

  // Fetch workspaceId on mount
  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((json: { id: string }[]) => {
        if (Array.isArray(json) && json.length > 0) {
          setWorkspaceId(json[0].id);
        } else {
          setError("No workspaces found.");
          setLoading(false);
        }
      })
      .catch(() => {
        setError("Failed to load workspaces.");
        setLoading(false);
      });
  }, []);

  const fetchDiagnostics = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/diagnostics?workspaceId=${workspaceId}`);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      const json: DiagnosticsData = await res.json();
      setData(json);
      setLastUpdated(Date.now());
      setSecondsSince(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Fetch when workspaceId becomes available
  useEffect(() => {
    if (workspaceId) {
      fetchDiagnostics();
    }
  }, [workspaceId, fetchDiagnostics]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!workspaceId) return;
    const interval = setInterval(() => {
      fetchDiagnostics();
    }, 30_000);
    return () => clearInterval(interval);
  }, [workspaceId, fetchDiagnostics]);

  // "Last updated X seconds ago" ticker
  useEffect(() => {
    if (lastUpdated === null) return;
    const ticker = setInterval(() => {
      setSecondsSince(Math.floor((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => clearInterval(ticker);
  }, [lastUpdated]);

  // Compute enabled destinations from health data
  const enabledDestinations = new Set<string>(
    (data?.destinationHealth ?? [])
      .filter((r) => r.enabled)
      .map((r) => r.destination)
  );
  const allowedDestinations = data?.workspace.allowedDestinations?.length
    ? data.workspace.allowedDestinations
    : [...DESTINATIONS];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Diagnostics</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Developer debugging view — not for end users
          </p>
        </div>
        <div className="flex items-center gap-4">
          {lastUpdated !== null && (
            <span className="text-xs text-zinc-500">
              Last updated: {secondsSince}s ago
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:text-white text-xs"
            onClick={fetchDiagnostics}
            disabled={loading || !workspaceId}
          >
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-400 mb-6">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-40 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Content */}
      {data && (
        <div className="space-y-6">
          {/* Stuck Events Banner — always top */}
          <StuckEventsSection stuck={data.stuckEvents} />
          <LiveValidationSection
            workspaceId={workspaceId}
            onSent={fetchDiagnostics}
          />

          {/* Main sections */}
          <EventCoverageSection rows={data.eventCoverage} />
          <DestinationHealthSection
            rows={data.destinationHealth}
            destinations={allowedDestinations}
          />
          <MatrixSection
            entries={data.eventDestinationMatrix}
            enabledDestinations={enabledDestinations}
            destinations={allowedDestinations}
          />

          {/* Two-column: Data Quality + Funnel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DataQualitySection
              dq={data.dataQuality}
              allowedDestinations={allowedDestinations}
            />
            <FunnelSection funnel={data.funnel} />
          </div>

          {/* Recent Failures */}
          <RecentFailuresSection failures={data.recentFailures} />

          {/* Event Audits */}
          <EventAuditSection
            entries={data.purchaseAudit}
            title="Purchase Event Audit (last 10)"
            emptyLabel="Purchase"
            eventName="Purchase"
            allowedDestinations={allowedDestinations}
          />
          <EventAuditSection
            entries={data.addToCartAudit}
            title="Add to Cart Event Audit (last 10)"
            emptyLabel="AddToCart"
            eventName="AddToCart"
            allowedDestinations={allowedDestinations}
          />
          <EventAuditSection
            entries={data.initiateCheckoutAudit}
            title="Initiate Checkout Event Audit (last 10)"
            emptyLabel="InitiateCheckout"
            eventName="InitiateCheckout"
            allowedDestinations={allowedDestinations}
          />

          {/* Footer note */}
          <p className="text-center text-xs text-zinc-700 pb-4">
            Auto-refreshes every 30 seconds &bull; Workspace ID: {workspaceId}
          </p>
        </div>
      )}
    </div>
  );
}
