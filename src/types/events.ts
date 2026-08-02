export interface SnippetEventPayload {
  eventName: string;
  eventId: string;
  timestamp: number;
  url?: string;
  referrer?: string;
  trackclearSessionId?: string | null;
  checkoutToken?: string | null;
  cartToken?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  userAgent?: string;
  customData?: Record<string, unknown>;
  userData?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    zip?: string;
    countryCode?: string;
    customerId?: string;
  };
  consent?: {
    analyticsAllowed?: boolean;
    marketingAllowed?: boolean;
    saleOfDataAllowed?: boolean;
  };
  ttclid?: string | null;
  ttp?: string | null;
  attributionTimestamp?: number | null;
  attributionSource?: string | null;
  rdtCid?: string | null;
  epik?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  gaClientId?: string | null;
  onlyDestinations?: string[];
  excludeDestinations?: string[];
}
