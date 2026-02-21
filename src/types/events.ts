export interface SnippetEventPayload {
  eventName: string;
  eventId: string;
  timestamp: number;
  url?: string;
  referrer?: string;
  fbp?: string | null;
  fbc?: string | null;
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
  };
  consent?: {
    analytics?: boolean;
    marketing?: boolean;
  };
  ttclid?: string | null;
  rdtCid?: string | null;
  epik?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
}

