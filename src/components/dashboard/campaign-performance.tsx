"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CampaignRow } from "@/types/app";

const SOURCE_COLORS: Record<string, string> = {
  facebook: "bg-blue-500",
  fb: "bg-blue-500",
  meta: "bg-blue-500",
  google: "bg-amber-500",
  tiktok: "bg-pink-500",
  klaviyo: "bg-green-500",
  instagram: "bg-purple-500",
  email: "bg-teal-500",
  bing: "bg-cyan-500",
  twitter: "bg-sky-500",
  x: "bg-sky-500",
};

function getSourceColor(source: string): string {
  const key = source.toLowerCase();
  for (const [prefix, color] of Object.entries(SOURCE_COLORS)) {
    if (key.includes(prefix)) return color;
  }
  return "bg-muted-foreground";
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

interface CampaignPerformanceProps {
  campaigns: CampaignRow[];
  currency: string;
}

export function CampaignPerformance({ campaigns, currency }: CampaignPerformanceProps) {
  const maxRevenue = campaigns.length > 0 ? Math.max(...campaigns.map((c) => c.revenue)) : 0;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Campaign Performance</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Last 30 days</p>
        </div>

        {campaigns.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No campaign data yet. Make sure your ad URLs include UTM parameters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Source</TableHead>
                  <TableHead className="whitespace-nowrap">Campaign</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Events</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign, i) => {
                  const barWidth = maxRevenue > 0 ? (campaign.revenue / maxRevenue) * 100 : 0;

                  return (
                    <TableRow key={`${campaign.utmSource}-${campaign.utmCampaign}-${i}`}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getSourceColor(campaign.utmSource)}`} />
                          <span className="text-sm text-foreground">
                            {campaign.utmSource.length > 15
                              ? campaign.utmSource.slice(0, 15) + "..."
                              : campaign.utmSource}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span
                          className="text-sm text-muted-foreground truncate block"
                          title={campaign.utmCampaign}
                        >
                          {campaign.utmCampaign
                            ? campaign.utmCampaign.length > 25
                              ? campaign.utmCampaign.slice(0, 25) + "..."
                              : campaign.utmCampaign
                            : "--"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <span className="text-sm font-medium text-foreground tabular-nums">
                          {campaign.events.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="relative inline-flex items-center justify-end w-full">
                          <div
                            className="absolute inset-y-0 right-0 bg-brand-500/10 rounded-sm"
                            style={{ width: `${barWidth}%` }}
                          />
                          <span className="relative text-sm font-medium text-foreground tabular-nums">
                            {formatCurrency(campaign.revenue, currency)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
