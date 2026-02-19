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

export interface EmqMetrics {
  score: number;         // 0-10 average
  totalSampled: number;  // how many events were sampled
  breakdown: {
    email: number;       // percentage of events with email
    phone: number;       // percentage with phone
    fbp: number;         // percentage with fbp
    fbc: number;         // percentage with fbc
    ip: number;          // percentage with IP
    userAgent: number;   // percentage with user agent
  };
}

export interface ConversionAccuracyPeriod {
  total: number;
  sent: number;
  failed: number;
  accuracy: number; // 0-100 percentage with 1 decimal
}

export interface ConversionAccuracy {
  last7d: ConversionAccuracyPeriod;
  last30d: ConversionAccuracyPeriod;
}

export interface DashboardAnalytics {
  health: HealthMetrics;
  revenue: RevenueMetrics;
  eventBreakdown: EventBreakdown;
  billing: BillingUsage;
  retentionDays: number;
  emq: EmqMetrics;
  conversionAccuracy: ConversionAccuracy;
}
