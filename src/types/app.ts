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

export interface DashboardStats {
  totalEvents24h: number;
  sentEvents24h: number;
  failedEvents24h: number;
  pendingEvents24h: number;
  successRate: number;
  lastEventAt: Date | null;
}
