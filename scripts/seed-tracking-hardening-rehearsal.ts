import { PrismaClient } from "@prisma/client";

const EXPECTED_EVENT_COUNT = 20_000;
const EXPECTED_PURCHASE_COUNT = 5_000;

const prisma = new PrismaClient();

function assertSafeRehearsalTarget(): void {
  if (process.env.TRACKING_HARDENING_REHEARSAL !== "1") {
    throw new Error(
      "Refusing to seed without TRACKING_HARDENING_REHEARSAL=1"
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.toLowerCase();
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !loopbackHosts.has(host) ||
    !databaseName.endsWith("_test")
  ) {
    throw new Error(
      `Refusing to seed unsafe database target ${host}/${databaseName}; ` +
        "the rehearsal requires loopback PostgreSQL and a database ending in _test"
    );
  }
}

type BaselineShapeRow = {
  eventLogHardeningColumns: number;
  workspaceHardeningColumns: number;
  inboxExists: boolean;
};

type ExistingCountsRow = {
  userCount: number;
  workspaceCount: number;
  eventCount: number;
};

type SeededCountsRow = {
  eventCount: number;
  purchaseCount: number;
};

async function assertEmptyBaselineSchema(): Promise<void> {
  const [shape] = await prisma.$queryRaw<BaselineShapeRow[]>`
    SELECT
      (
        SELECT COUNT(*)::integer
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'EventLog'
          AND column_name = ANY(ARRAY[
            'nextRetryAt',
            'orderName',
            'checkoutToken',
            'cartToken',
            'deliveryClaimToken'
          ]::text[])
      ) AS "eventLogHardeningColumns",
      (
        SELECT COUNT(*)::integer
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Workspace'
          AND column_name = ANY(ARRAY[
            'shopifyWebhookVerifiedAt',
            'metaBrowserTrackingEnabled',
            'tiktokBrowserTrackingEnabled'
          ]::text[])
      ) AS "workspaceHardeningColumns",
      to_regclass(format('%I.%I', current_schema(), 'ShopifyWebhookInbox')) IS NOT NULL
        AS "inboxExists"
  `;

  if (
    !shape ||
    shape.eventLogHardeningColumns !== 0 ||
    shape.workspaceHardeningColumns !== 0 ||
    shape.inboxExists
  ) {
    throw new Error(
      "Refusing to seed because the database is not the pre-hardening baseline schema"
    );
  }

  const [counts] = await prisma.$queryRaw<ExistingCountsRow[]>`
    SELECT
      (SELECT COUNT(*)::integer FROM "User") AS "userCount",
      (SELECT COUNT(*)::integer FROM "Workspace") AS "workspaceCount",
      (SELECT COUNT(*)::integer FROM "EventLog") AS "eventCount"
  `;

  if (
    !counts ||
    counts.userCount !== 0 ||
    counts.workspaceCount !== 0 ||
    counts.eventCount !== 0
  ) {
    throw new Error(
      `Refusing to seed non-empty baseline: users=${counts?.userCount ?? "unknown"}, ` +
        `workspaces=${counts?.workspaceCount ?? "unknown"}, ` +
        `events=${counts?.eventCount ?? "unknown"}`
    );
  }
}

async function seedBaseline(): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "User" (
          "id",
          "name",
          "email",
          "createdAt",
          "updatedAt"
        ) VALUES (
          'tracking-hardening-rehearsal-user',
          'Tracking Hardening Rehearsal',
          'tracking-hardening-rehearsal@example.invalid',
          TIMESTAMP '2026-01-01 00:00:00',
          TIMESTAMP '2026-01-01 00:00:00'
        )
      `;

      await tx.$executeRaw`
        INSERT INTO "Workspace" (
          "id",
          "userId",
          "name",
          "domain",
          "apiKey",
          "shopifyDomain",
          "createdAt",
          "updatedAt"
        ) VALUES (
          'tracking-hardening-rehearsal-workspace',
          'tracking-hardening-rehearsal-user',
          'Tracking Hardening Rehearsal Store',
          'tracking-hardening-rehearsal.myshopify.com',
          'tl_tracking_hardening_rehearsal',
          'tracking-hardening-rehearsal.myshopify.com',
          TIMESTAMP '2026-01-01 00:00:00',
          TIMESTAMP '2026-01-01 00:00:00'
        )
      `;

      await tx.$executeRaw`
        INSERT INTO "EventLog" (
          "id",
          "workspaceId",
          "eventName",
          "eventId",
          "status",
          "errorMessage",
          "retryCount",
          "payload",
          "value",
          "currency",
          "numItems",
          "orderId",
          "destination",
          "source",
          "createdAt"
        )
        SELECT
          'tracking-hardening-event-log-' || lpad(series::text, 5, '0'),
          'tracking-hardening-rehearsal-workspace',
          (
            CASE
              WHEN series <= ${EXPECTED_PURCHASE_COUNT} THEN 'Purchase'
              WHEN series % 3 = 0 THEN 'InitiateCheckout'
              WHEN series % 3 = 1 THEN 'AddToCart'
              ELSE 'ViewContent'
            END
          )::"EventName",
          'tracking-hardening-event-' || lpad(series::text, 5, '0'),
          (CASE WHEN series % 100 = 0 THEN 'FAILED' ELSE 'SENT' END)::"EventStatus",
          CASE WHEN series % 100 = 0 THEN 'historical rehearsal failure' ELSE NULL END,
          CASE WHEN series % 100 = 0 THEN 3 ELSE 0 END,
          CASE
            WHEN series <= 2000 THEN jsonb_build_object(
              'customData',
              jsonb_build_object(
                'orderName', '#RH-CAMEL-' || lpad(series::text, 5, '0'),
                'checkoutToken', 'checkout-camel-' || lpad(series::text, 5, '0'),
                'cartToken', 'cart-camel-' || lpad(series::text, 5, '0')
              )
            )
            WHEN series <= 4000 THEN jsonb_build_object(
              'customData',
              jsonb_build_object(
                'order_name', '#RH-SNAKE-' || lpad(series::text, 5, '0'),
                'checkout_token', 'checkout-snake-' || lpad(series::text, 5, '0'),
                'cart_token', 'cart-snake-' || lpad(series::text, 5, '0')
              )
            )
            WHEN series <= 4500 THEN jsonb_build_object(
              'customData',
              jsonb_build_object(
                'orderName', '#RH-CAMEL-' || lpad(series::text, 5, '0'),
                'order_name', '#RH-SNAKE-' || lpad(series::text, 5, '0'),
                'checkoutToken', 'checkout-camel-' || lpad(series::text, 5, '0'),
                'checkout_token', 'checkout-snake-' || lpad(series::text, 5, '0'),
                'cartToken', 'cart-camel-' || lpad(series::text, 5, '0'),
                'cart_token', 'cart-snake-' || lpad(series::text, 5, '0')
              )
            )
            ELSE jsonb_build_object(
              'customData',
              jsonb_build_object(
                'value', series::numeric / 100,
                'currency', 'USD'
              )
            )
          END,
          CASE WHEN series <= ${EXPECTED_PURCHASE_COUNT} THEN series::double precision / 100 ELSE NULL END,
          CASE WHEN series <= ${EXPECTED_PURCHASE_COUNT} THEN 'USD' ELSE NULL END,
          CASE WHEN series <= ${EXPECTED_PURCHASE_COUNT} THEN 1 ELSE NULL END,
          CASE WHEN series <= ${EXPECTED_PURCHASE_COUNT} THEN (100000 + series)::text ELSE NULL END,
          (CASE WHEN series % 2 = 0 THEN 'META' ELSE 'TIKTOK' END)::"Destination",
          CASE WHEN series <= 100 THEN 'webhook' ELSE 'snippet' END,
          TIMESTAMP '2026-01-01 00:00:00' + series * INTERVAL '1 second'
        FROM generate_series(1, ${EXPECTED_EVENT_COUNT}) AS generated(series)
      `;

      const [seededCounts] = await tx.$queryRaw<SeededCountsRow[]>`
        SELECT
          COUNT(*)::integer AS "eventCount",
          COUNT(*) FILTER (WHERE "eventName" = 'Purchase')::integer
            AS "purchaseCount"
        FROM "EventLog"
      `;

      if (
        !seededCounts ||
        seededCounts.eventCount !== EXPECTED_EVENT_COUNT ||
        seededCounts.purchaseCount !== EXPECTED_PURCHASE_COUNT
      ) {
        throw new Error(
          `Unexpected seeded counts: events=${seededCounts?.eventCount ?? "unknown"}, ` +
            `purchases=${seededCounts?.purchaseCount ?? "unknown"}`
        );
      }
    },
    { timeout: 60_000 }
  );
}

async function main(): Promise<void> {
  assertSafeRehearsalTarget();
  await assertEmptyBaselineSchema();
  await seedBaseline();

  console.log(
    `Seeded tracking hardening rehearsal: 1 user, 1 workspace, ` +
      `${EXPECTED_EVENT_COUNT} EventLogs, ${EXPECTED_PURCHASE_COUNT} Purchases.`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
