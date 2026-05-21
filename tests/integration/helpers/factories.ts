import { db } from "@/lib/db";
import { hashSync } from "bcryptjs";
import { encrypt } from "@/lib/encryption";
import { generateApiKey } from "@/lib/api-key";

interface CreateUserOptions {
  name?: string;
  email?: string;
  password?: string;
}

export async function createUser(options: CreateUserOptions = {}) {
  const {
    name = "Test User",
    email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    password = "password123",
  } = options;

  return db.user.create({
    data: {
      name,
      email,
      hashedPassword: hashSync(password, 4),
    },
  });
}

interface CreateWorkspaceOptions {
  name?: string;
  metaPixelId?: string | null;
  metaAccessToken?: string | null;
  metaTestEventCode?: string | null;
  productMode?: "SHOPIFY_META_TIKTOK_V1" | "LEGACY_ALL_DESTINATIONS" | null;
  installType?: "SHOPIFY_CUSTOM_PIXEL" | "HEADLESS_CUSTOM" | null;
  consentMode?: "STRICT" | "LAX";
  isActive?: boolean;
  enablePageView?: boolean;
  enableViewContent?: boolean;
  enableAddToCart?: boolean;
  enableInitiateCheckout?: boolean;
  enablePurchase?: boolean;
}

export async function createWorkspace(
  userId: string,
  options: CreateWorkspaceOptions = {}
) {
  const {
    name = "Test Workspace",
    consentMode = "LAX",
    isActive = true,
    enablePageView = true,
    enableViewContent = true,
    enableAddToCart = true,
    enableInitiateCheckout = true,
    enablePurchase = true,
  } = options;

  const metaPixelId =
    options.metaPixelId === null
      ? null
      : options.metaPixelId ?? "123456789";
  const metaAccessToken =
    options.metaAccessToken === null
      ? null
      : options.metaAccessToken ?? "EAAtest123";
  const metaTestEventCode =
    options.metaTestEventCode === null
      ? null
      : options.metaTestEventCode ?? null;

  const apiKey = generateApiKey();

  let metaTokenFields: Record<string, string | null> = {};
  if (metaAccessToken) {
    const { encrypted, iv, tag } = encrypt(metaAccessToken);
    metaTokenFields = {
      metaAccessTokenEncrypted: encrypted,
      metaAccessTokenIv: iv,
      metaAccessTokenTag: tag,
    };
  }

  return db.workspace.create({
    data: {
      userId,
      name,
      apiKey,
      productMode: options.productMode,
      installType: options.installType,
      metaPixelId,
      metaTestEventCode,
      consentMode,
      isActive,
      enablePageView,
      enableViewContent,
      enableAddToCart,
      enableInitiateCheckout,
      enablePurchase,
      ...metaTokenFields,
    },
  });
}

interface CreateSubscriptionOptions {
  plan?: "FREE" | "STARTER" | "GROWTH" | "SCALE";
  status?: "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" | "TRIALING";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string | null;
}

export async function createSubscription(
  userId: string,
  options: CreateSubscriptionOptions = {}
) {
  const {
    plan = "FREE",
    status = "ACTIVE",
    stripeCustomerId = `cus_test_${Date.now()}`,
    stripeSubscriptionId = `sub_test_${Date.now()}`,
    stripePriceId,
  } = options;

  return db.subscription.create({
    data: {
      userId,
      plan,
      status,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId: stripePriceId ?? null,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

export function makeIngestPayload(overrides: Record<string, unknown> = {}) {
  return {
    eventName: "PageView",
    eventId: crypto.randomUUID(),
    timestamp: Date.now(),
    url: "https://mystore.myshopify.com/products/test",
    referrer: "https://google.com",
    fbp: "fb.1.1234567890.1234567890",
    fbc: null,
    consent: { analyticsAllowed: true, marketingAllowed: true },
    userData: {},
    customData: {},
    ...overrides,
  };
}
