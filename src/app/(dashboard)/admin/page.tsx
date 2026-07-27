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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminStats {
  generatedAt: string;
  users: { total: number; new24h: number; new7d: number; new30d: number; verified: number };
  subscriptions: { total: number; byPlan: Record<string, number>; byStatus: Record<string, number>; mrr: number };
  workspaces: { total: number; active: number; byPlatform: Record<string, number> };
  events: { total24h: number; total7d: number; byDestination: Record<string, number>; byStatus: Record<string, number>; byEventName: Record<string, number> };
  recentSignups: Array<{
    id: string;
    name: string | null;
    email: string;
    emailVerified: string | null;
    createdAt: string;
    plan: string;
    subscriptionStatus: string | null;
    workspaceCount: number;
  }>;
  topWorkspaces: Array<{
    workspaceId: string;
    name: string;
    domain: string | null;
    ownerEmail: string;
    eventCount7d: number;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

const PLAN_COLORS: Record<string, string> = {
  FREE: "bg-zinc-800 text-zinc-400 border-zinc-700",
  STARTER: "bg-blue-900/50 text-blue-400 border-blue-800",
  GROWTH: "bg-purple-900/50 text-purple-400 border-purple-800",
  SCALE: "bg-amber-900/50 text-amber-400 border-amber-800",
};

const STATUS_COLORS: Record<string, string> = {
  SENT: "bg-green-900/50 text-green-400 border-green-800",
  FAILED: "bg-red-900/50 text-red-400 border-red-800",
  PENDING: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
  RETRYING: "bg-orange-900/50 text-orange-400 border-orange-800",
  SUPERSEDED: "bg-slate-900/50 text-slate-400 border-slate-800",
  ACTIVE: "bg-green-900/50 text-green-400 border-green-800",
  CANCELED: "bg-red-900/50 text-red-400 border-red-800",
  PAST_DUE: "bg-orange-900/50 text-orange-400 border-orange-800",
};

const DESTINATION_LABELS: Record<string, string> = {
  META: "Meta",
  TIKTOK: "TikTok",
  GA4: "GA4",
  KLAVIYO: "Klaviyo",
  REDDIT: "Reddit",
  PINTEREST: "Pinterest",
  GOOGLE_ADS: "Google Ads",
};

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

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-5 pb-4 px-5">
        <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-white font-mono">{value}</p>
        {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title,
  data,
  labelMap,
  colorMap,
}: {
  title: string;
  data: Record<string, number>;
  labelMap?: Record<string, string>;
  colorMap?: Record<string, string>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <SectionTitle>{title}</SectionTitle>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-zinc-600 text-center py-4">No data</p>
        ) : (
          <div className="space-y-3">
            {entries.map(([key, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const label = labelMap?.[key] ?? key;
              const color = colorMap?.[key];
              return (
                <div key={key}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-zinc-300 flex items-center gap-2">
                      {color ? (
                        <Badge className={`${color} text-xs`}>{label}</Badge>
                      ) : (
                        label
                      )}
                    </span>
                    <span className="text-xs font-mono text-zinc-400">
                      {fmt(count)} ({pct}%)
                    </span>
                  </div>
                  <div className="bg-zinc-800 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-cyan-500/70 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [secondsSince, setSecondsSince] = useState(0);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 403) {
        setError("Access denied. You are not authorized to view this page.");
        return;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      const json: AdminStats = await res.json();
      setData(json);
      setLastUpdated(Date.now());
      setSecondsSince(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (lastUpdated === null) return;
    const ticker = setInterval(() => {
      setSecondsSince(Math.floor((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => clearInterval(ticker);
  }, [lastUpdated]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Platform-wide metrics -- internal only
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
            onClick={fetchStats}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Error */}
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
              className="h-28 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Content */}
      {data && (
        <div className="space-y-6">
          {/* Stat cards row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Users"
              value={fmt(data.users.total)}
              sub={`+${data.users.new24h} today / +${data.users.new7d} this week`}
            />
            <StatCard
              label="Active Subscriptions"
              value={fmt(data.subscriptions.byStatus["ACTIVE"] ?? 0)}
              sub={`${fmt(data.subscriptions.total)} total subscriptions`}
            />
            <StatCard
              label="MRR"
              value={`$${fmt(data.subscriptions.mrr)}`}
              sub="Monthly recurring revenue"
            />
            <StatCard
              label="Events (24h)"
              value={fmt(data.events.total24h)}
              sub={`${fmt(data.events.total7d)} in last 7 days`}
            />
          </div>

          {/* Two-col: Subscriptions by Plan + Events by Destination */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BreakdownCard
              title="Subscriptions by Plan"
              data={data.subscriptions.byPlan}
              colorMap={PLAN_COLORS}
            />
            <BreakdownCard
              title="Events by Destination (7d)"
              data={data.events.byDestination}
              labelMap={DESTINATION_LABELS}
            />
          </div>

          {/* Recent Signups */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                <SectionTitle>Recent Signups</SectionTitle>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead className="text-zinc-400 text-xs">Name</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Email</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Verified</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Plan</TableHead>
                    <TableHead className="text-zinc-400 text-xs text-right">Workspaces</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Signed Up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentSignups.map((u) => (
                    <TableRow key={u.id} className="border-zinc-800">
                      <TableCell className="text-xs text-zinc-300">
                        {u.name ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-zinc-400">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        {u.emailVerified ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Verified" />
                        ) : (
                          <span className="inline-block w-2 h-2 rounded-full bg-zinc-600" title="Unverified" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${PLAN_COLORS[u.plan] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} text-xs`}>
                          {u.plan}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-zinc-300">
                        {u.workspaceCount}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {timeAgo(u.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Top Workspaces */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                <SectionTitle>Top Workspaces by Volume (7d)</SectionTitle>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.topWorkspaces.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-zinc-500">
                  No event data in the last 7 days
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-400 text-xs">#</TableHead>
                      <TableHead className="text-zinc-400 text-xs">Workspace</TableHead>
                      <TableHead className="text-zinc-400 text-xs">Domain</TableHead>
                      <TableHead className="text-zinc-400 text-xs">Owner</TableHead>
                      <TableHead className="text-zinc-400 text-xs text-right">Events (7d)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topWorkspaces.map((ws, i) => (
                      <TableRow key={ws.workspaceId} className="border-zinc-800">
                        <TableCell className="text-xs text-zinc-600 font-mono">{i + 1}</TableCell>
                        <TableCell className="text-xs text-zinc-300 font-semibold">
                          {ws.name}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500 font-mono">
                          {ws.domain ?? "-"}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400 font-mono">
                          {ws.ownerEmail}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-cyan-400 font-semibold">
                          {fmt(ws.eventCount7d)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Two-col: Events by Status + Workspaces by Platform */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BreakdownCard
              title="Events by Status (24h)"
              data={data.events.byStatus}
              colorMap={STATUS_COLORS}
            />
            <BreakdownCard
              title="Workspaces by Platform"
              data={data.workspaces.byPlatform}
            />
          </div>

          {/* Extra user stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Verified Users"
              value={fmt(data.users.verified)}
              sub={`${data.users.total > 0 ? Math.round((data.users.verified / data.users.total) * 100) : 0}% verification rate`}
            />
            <StatCard
              label="New Users (30d)"
              value={fmt(data.users.new30d)}
              sub={`${fmt(data.users.new7d)} in last 7 days`}
            />
            <StatCard
              label="Total Workspaces"
              value={fmt(data.workspaces.total)}
              sub={`${fmt(data.workspaces.active)} active`}
            />
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-zinc-700 pb-4">
            Generated: {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
