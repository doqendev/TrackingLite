export interface WorkspaceWithStats {
  id: string;
  name: string;
  domain: string | null;
  platform: string;
  apiKey: string;
  isActive: boolean;
  metaPixelId: string | null;
  hasMetaAccessToken: boolean;
  consentMode: string;
  eventsForwardedCount: number;
  eventToggles: {
    enablePageView: boolean;
    enableViewContent: boolean;
    enableAddToCart: boolean;
    enableInitiateCheckout: boolean;
    enablePurchase: boolean;
  };
}

// --- Dashboard Analytics Types ---

export interface HealthMetrics {
  status: "healthy" | "degraded" | "down" | "inactive";
  successRate: number;
  totalEvents24h: number;
  sentEvents24h: number;
  failedEvents24h: number;
  lastEventAt: Date | null;
}

export interface TimeComparison {
  today: number;
  yesterday: number;
  currency: string;
}

export interface RevenueMetrics {
  addToCartValue: TimeComparison;
  checkoutValue: TimeComparison;
  purchaseValue: TimeComparison;
  ordersToday: number;
  ordersYesterday: number;
}

export interface EventCount {
  today: number;
  yesterday: number;
}

export interface EventBreakdown {
  PageView: EventCount;
  ViewContent: EventCount;
  AddToCart: EventCount;
  InitiateCheckout: EventCount;
  Purchase: EventCount;
}

export interface BillingUsage {
  plan: string;
  ordersUsed: number;
  ordersLimit: number;
  usagePercent: number;
}

export interface DashboardAnalytics {
  health: HealthMetrics;
  revenue: RevenueMetrics;
  eventBreakdown: EventBreakdown;
  billing: BillingUsage;
  retentionDays: number;
}
