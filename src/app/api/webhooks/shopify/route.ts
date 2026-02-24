import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { db } from "@/lib/db";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";
import {
  getEventQueue,
  getTiktokQueue,
  getGA4Queue,
  getKlaviyoQueue,
  getRedditQueue,
  getPinterestQueue,
} from "@/lib/queue";
import type { MetaEventJob, DestinationEventJob } from "@/lib/queue";
import { checkOrderLimits } from "@/lib/billing";
import { shouldSendToDestination } from "@/lib/consent";
import type { Queue } from "bullmq";

const log = createLogger({ component: "shopify-webhook" });

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const reqLog = log.child({ requestId });

  try {
    // 1. Read raw body for HMAC verification
    const rawBody = Buffer.from(await request.arrayBuffer());
    const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
    const topic = request.headers.get("x-shopify-topic");
    const shopDomain = request.headers.get("x-shopify-shop-domain");

    if (!hmacHeader || !topic || !shopDomain) {
      reqLog.warn("Missing required Shopify headers");
      return NextResponse.json({ error: "Missing headers" }, { status: 400 });
    }

    // We only handle orders/paid
    if (topic !== "orders/paid") {
      reqLog.info("Ignoring non-orders/paid topic", { topic });
      return NextResponse.json({ ok: true });
    }

    // 2. Find ALL active workspaces matching this shop domain
    const matchingWorkspaces = await db.workspace.findMany({
      where: {
        shopifyDomain: shopDomain,
        isActive: true,
        shopifyWebhookSecret: { not: null },
      },
      select: {
        id: true,
        userId: true,
        shopifyWebhookSecret: true,
        enableMeta: true,
        metaPixelId: true,
        metaAccessTokenEncrypted: true,
        enableReddit: true,
        redditAccessTokenEncrypted: true,
        enablePinterest: true,
        pinterestConversionTokenEncrypted: true,
        enableTikTok: true,
        tiktokPixelId: true,
        tiktokAccessTokenEncrypted: true,
        enableGA4: true,
        ga4MeasurementId: true,
        ga4ApiSecretEncrypted: true,
        enableKlaviyo: true,
        klaviyoApiKeyEncrypted: true,
        enablePurchase: true,
        consentMode: true,
      },
    });

    if (matchingWorkspaces.length === 0) {
      reqLog.warn("No matching workspaces for domain", { shopDomain });
      return NextResponse.json({ ok: true });
    }

    // 3. Parse the order JSON
    let orderData: Record<string, unknown>;
    try {
      orderData = JSON.parse(rawBody.toString("utf-8"));
    } catch {
      reqLog.error("Invalid JSON body");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const orderId = orderData.id ? String(orderData.id) : null;
    const orderName = orderData.name ? String(orderData.name) : null;
    const totalPrice = orderData.total_price
      ? Number(orderData.total_price)
      : undefined;
    const currency = orderData.currency
      ? String(orderData.currency)
      : undefined;
    const email =
      (orderData.email as string) ||
      (orderData.contact_email as string) ||
      undefined;
    const phone = (orderData.phone as string) || undefined;

    const billingAddress = orderData.billing_address as
      | Record<string, unknown>
      | undefined;
    const customer = orderData.customer as
      | Record<string, unknown>
      | undefined;

    const lineItems =
      (orderData.line_items as Array<Record<string, unknown>>) || [];
    const numItems = lineItems.reduce(
      (sum: number, item: Record<string, unknown>) =>
        sum + (Number(item.quantity) || 0),
      0
    );

    // Filter out non-web orders (POS, draft, subscription, manual, bulk)
    const orderSource = orderData.source_name ? String(orderData.source_name) : "web";
    const ALLOWED_SOURCES = new Set(["web", "mobile", "iphone", "android"]);
    if (!ALLOWED_SOURCES.has(orderSource)) {
      reqLog.info("Skipping non-web order", { orderSource, orderId: orderId || orderName });
      return NextResponse.json({ ok: true });
    }

    reqLog.info("Processing order", {
      shopDomain,
      orderId,
      orderName,
      workspaceCount: matchingWorkspaces.length,
    });

    // 4. Process for each workspace that passes HMAC
    for (const workspace of matchingWorkspaces) {
      const wsLog = reqLog.child({ workspaceId: workspace.id });

      // Verify HMAC
      if (
        !verifyShopifyWebhook(
          rawBody,
          hmacHeader,
          workspace.shopifyWebhookSecret!
        )
      ) {
        wsLog.warn("HMAC verification failed");
        continue;
      }

      // Check Purchase toggle
      if (!workspace.enablePurchase) {
        wsLog.info("Purchase events disabled for workspace");
        continue;
      }

      // Check order limits
      const billing = await checkOrderLimits(workspace.userId, "Purchase");
      if (!billing.allowed) {
        wsLog.warn("Order limit reached", {
          limit: billing.limit,
          used: billing.used,
        });
        continue;
      }

      // Build destination list
      const destinations: Array<{
        destination: string;
        queue: Queue;
        jobName: string;
      }> = [];

      if (
        workspace.enableMeta &&
        workspace.metaPixelId &&
        workspace.metaAccessTokenEncrypted
      ) {
        destinations.push({
          destination: "META",
          queue: getEventQueue(),
          jobName: "send-meta-event",
        });
      }
      if (workspace.enableReddit && workspace.redditAccessTokenEncrypted) {
        destinations.push({
          destination: "REDDIT",
          queue: getRedditQueue(),
          jobName: "send-reddit-event",
        });
      }
      if (workspace.enablePinterest && workspace.pinterestConversionTokenEncrypted) {
        destinations.push({
          destination: "PINTEREST",
          queue: getPinterestQueue(),
          jobName: "send-pinterest-event",
        });
      }
      if (workspace.enableTikTok && workspace.tiktokAccessTokenEncrypted) {
        destinations.push({
          destination: "TIKTOK",
          queue: getTiktokQueue(),
          jobName: "send-tiktok-event",
        });
      }
      if (
        workspace.enableGA4 &&
        workspace.ga4MeasurementId &&
        workspace.ga4ApiSecretEncrypted
      ) {
        destinations.push({
          destination: "GA4",
          queue: getGA4Queue(),
          jobName: "send-ga4-event",
        });
      }
      if (
        workspace.enableKlaviyo &&
        workspace.klaviyoApiKeyEncrypted &&
        email
      ) {
        destinations.push({
          destination: "KLAVIYO",
          queue: getKlaviyoQueue(),
          jobName: "send-klaviyo-event",
        });
      }

      if (destinations.length === 0) {
        wsLog.info("No destinations configured");
        continue;
      }

      // Filter destinations by consent mode
      // Webhook events have no browser consent signal, so:
      // - LAX mode: allows by default (undefined !== false)
      // - STRICT mode: blocks all (undefined !== true)
      const consentFiltered = destinations.filter((dest) =>
        shouldSendToDestination(workspace.consentMode, undefined, dest.destination)
      );

      if (consentFiltered.length === 0) {
        wsLog.info("All destinations blocked by consent mode", {
          consentMode: workspace.consentMode,
        });
        continue;
      }

      // Deterministic eventId for dedup
      const webhookEventId = `webhook-${orderId || orderName || crypto.randomUUID()}`;

      // Check orderId dedup: if Purchase with this orderId already exists, skip
      const dedupIds = [orderId, orderName].filter(Boolean) as string[];
      if (dedupIds.length > 0) {
        const existing = await db.eventLog.findFirst({
          where: {
            workspaceId: workspace.id,
            orderId: { in: dedupIds },
            eventName: "Purchase",
            status: { in: ["SENT", "PENDING", "RETRYING"] },
            createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // 2h window
          },
        });
        if (existing) {
          wsLog.info("Purchase already delivered via snippet, skipping", {
            orderId: orderId || orderName,
            matchedOrderId: existing.orderId,
            matchedStatus: existing.status,
          });
          continue;
        }
      }

      // Create EventLog entries with dedup
      const eventLogBaseData = {
        workspaceId: workspace.id,
        eventName: "Purchase" as const,
        eventId: webhookEventId,
        status: "PENDING" as const,
        payload: {
          eventName: "Purchase",
          customData: {
            value: totalPrice,
            currency,
            num_items: numItems,
            order_id: orderName || orderId,
          },
          hasUserData: !!(email || phone),
        } as any, // eslint-disable-line
        customerIp: null,
        userAgent: null,
        value: totalPrice ?? null,
        currency: currency ?? null,
        numItems: numItems || null,
        orderId: orderName || orderId || null,
        source: "webhook",
      };

      const eventLogEntries = await Promise.all(
        consentFiltered.map(async (dest) => {
          try {
            return await db.eventLog.create({
              data: {
                ...eventLogBaseData,
                destination: dest.destination as any, // eslint-disable-line
              },
            });
          } catch (err: any) { // eslint-disable-line
            if (err?.code === "P2002") return null; // duplicate
            throw err;
          }
        })
      );

      const validEntries = eventLogEntries.filter(
        (e): e is NonNullable<typeof e> => e !== null
      );
      const validDests = consentFiltered.filter(
        (_, idx) => eventLogEntries[idx] !== null
      );

      if (validEntries.length === 0) {
        wsLog.info("All events deduplicated");
        continue;
      }

      // Build event data for workers
      const eventData = {
        eventName: "Purchase",
        eventId: webhookEventId,
        timestamp: Date.now(),
        url: "",
        referrer: "",
        fbp: null,
        fbc: null,
        userData: {
          email: email || null,
          phone: phone || null,
          firstName:
            (customer?.first_name as string) ||
            (billingAddress?.first_name as string) ||
            null,
          lastName:
            (customer?.last_name as string) ||
            (billingAddress?.last_name as string) ||
            null,
          city: (billingAddress?.city as string) || null,
          state: (billingAddress?.province_code as string) || null,
          zip: (billingAddress?.zip as string) || null,
          countryCode: (billingAddress?.country_code as string) || null,
        },
        customData: {
          value: totalPrice,
          currency,
          num_items: numItems,
          order_id: orderId,
          content_ids: lineItems.map(
            (li) => String(li.product_id || li.sku || "")
          ),
        },
        clientIp: "",
        userAgent: "",
      };

      // Queue jobs
      await Promise.all(
        validDests.map((dest, idx) => {
          const eventLogId = validEntries[idx].id;

          if (dest.destination === "META") {
            return dest.queue.add(dest.jobName, {
              workspaceId: workspace.id,
              requestId,
              event: eventData,
              eventLogId,
            } satisfies MetaEventJob);
          } else {
            return dest.queue.add(dest.jobName, {
              workspaceId: workspace.id,
              destination: dest.destination,
              requestId,
              eventLogId,
              event: { ...eventData, ttclid: null, gclid: null, rdtCid: null, epik: null },
            } satisfies DestinationEventJob);
          }
        })
      );

      wsLog.info("Purchase queued from webhook", {
        orderId: orderId || orderName,
        destinations: validDests.map((d) => d.destination),
        eventLogCount: validEntries.length,
      });
    }

    // Always return 200 quickly (Shopify requires response within 5 seconds)
    return NextResponse.json({ ok: true });
  } catch (error) {
    reqLog.error("Webhook processing error", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Still return 200 to prevent Shopify from retrying (we log the error)
    return NextResponse.json({ ok: true });
  }
}
