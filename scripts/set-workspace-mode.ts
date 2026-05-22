import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const PRODUCT_MODES = new Set([
  "SHOPIFY_META_TIKTOK_V1",
  "LEGACY_ALL_DESTINATIONS",
]);

const INSTALL_TYPES = new Set([
  "SHOPIFY_CUSTOM_PIXEL",
  "HEADLESS_CUSTOM",
]);

function usage(): never {
  console.error(
    "Usage: pnpm tsx scripts/set-workspace-mode.ts <workspaceId> <productMode> <installType>"
  );
  console.error("productMode: SHOPIFY_META_TIKTOK_V1 | LEGACY_ALL_DESTINATIONS");
  console.error("installType: SHOPIFY_CUSTOM_PIXEL | HEADLESS_CUSTOM");
  process.exit(1);
}

async function invalidateApiKeyCache(apiKey: string): Promise<void> {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL is not set; API key cache may take up to 5 minutes to expire.");
    return;
  }

  const redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();
    await redis.del(`apikey:${apiKey}`);
    console.log("Invalidated API key cache for workspace.");
  } catch (error) {
    console.warn(
      `Could not invalidate API key cache; it may take up to 5 minutes to expire. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    redis.disconnect();
  }
}

async function main() {
  const [workspaceId, productMode, installType] = process.argv.slice(2);

  if (!workspaceId || !productMode || !installType) usage();
  if (!PRODUCT_MODES.has(productMode)) {
    console.error(`Invalid productMode: ${productMode}`);
    usage();
  }
  if (!INSTALL_TYPES.has(installType)) {
    console.error(`Invalid installType: ${installType}`);
    usage();
  }

  const prisma = new PrismaClient();

  try {
    const existing = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        apiKey: true,
        productMode: true,
        installType: true,
      },
    });

    if (!existing) {
      console.error(`Workspace not found: ${workspaceId}`);
      process.exit(1);
    }

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        productMode: productMode as "SHOPIFY_META_TIKTOK_V1" | "LEGACY_ALL_DESTINATIONS",
        installType: installType as "SHOPIFY_CUSTOM_PIXEL" | "HEADLESS_CUSTOM",
      },
      select: {
        id: true,
        name: true,
        productMode: true,
        installType: true,
      },
    });

    console.log(`Workspace: ${existing.name} (${existing.id})`);
    console.log(`Old productMode: ${existing.productMode ?? "null"}`);
    console.log(`Old installType: ${existing.installType ?? "null"}`);
    console.log(`New productMode: ${updated.productMode ?? "null"}`);
    console.log(`New installType: ${updated.installType ?? "null"}`);

    await invalidateApiKeyCache(existing.apiKey);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
