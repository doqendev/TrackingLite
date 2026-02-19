"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

function getUniqueSources(campaigns: CampaignRow[]): string[] {
  const sources = new Set<string>();
  for (const c of campaigns) {
    if (c.utmSource) sources.add(c.utmSource);
  }
  return Array.from(sources);
}

interface CampaignPerformanceProps {
  campaigns: CampaignRow[];
  currency: string;
}

export function CampaignPerformance({ campaigns, currency }: CampaignPerformanceProps) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const t = useTranslations("dashboard");
  const sources = getUniqueSources(campaigns);

  const filtered = activeTab === "all"
    ? campaigns
    : campaigns.filter((c) => c.utmSource === activeTab);

  const maxRevenue = filtered.length > 0 ? Math.max(...filtered.map((c) => c.revenue)) : 0;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("campaignPerformance")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t("last30Days")}</p>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t("noCampaignData")}
            </p>
          </div>
        ) : (
          <>
            {/* Platform tabs */}
            <div className="flex items-center gap-1.5 mb-4 flex-wrap">
              <Button
                variant={activeTab === "all" ? "brand" : "secondary"}
                size="sm"
                className="rounded-full"
                onClick={() => setActiveTab("all")}
              >
                {t("allPlatforms")}
              </Button>
              {sources.map((source) => (
                <Button
                  key={source}
                  variant={activeTab === source ? "brand" : "secondary"}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setActiveTab(source)}
                >
                  <span className={`w-2 h-2 rounded-full mr-1.5 ${getSourceColor(source)}`} />
                  {source}
                </Button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("noCampaignsSource")}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {activeTab === "all" && (
                        <TableHead className="whitespace-nowrap">{t("source")}</TableHead>
                      )}
                      <TableHead className="whitespace-nowrap">{t("campaign")}</TableHead>
                      <TableHead className="whitespace-nowrap text-right">{t("events")}</TableHead>
                      <TableHead className="whitespace-nowrap text-right">{t("revenue")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((campaign, i) => {
                      const barWidth = maxRevenue > 0 ? (campaign.revenue / maxRevenue) * 100 : 0;

                      return (
                        <TableRow key={`${campaign.utmSource}-${campaign.utmCampaign}-${i}`}>
                          {activeTab === "all" && (
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
                          )}
                          <TableCell className="max-w-[250px]">
                            <span
                              className="text-sm text-muted-foreground truncate block"
                              title={campaign.utmCampaign}
                            >
                              {campaign.utmCampaign
                                ? campaign.utmCampaign.length > 30
                                  ? campaign.utmCampaign.slice(0, 30) + "..."
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
