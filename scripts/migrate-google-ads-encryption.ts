/**
 * One-time migration script: encrypts plaintext Google Ads columns and removes duplicate EventLogs.
 * Run BEFORE prisma db push --accept-data-loss.
 *
 * Usage: tsx scripts/migrate-google-ads-encryption.ts
 */
import "dotenv/config";
import { createCipheriv, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function encrypt(plaintext: string): { encrypted: string; iv: string; tag: string } {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY required");
  const keyBuf = Buffer.from(key, "hex");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", keyBuf, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  return { encrypted, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
}

async function migrateGoogleAds() {
  console.log("[Migration] Checking for plaintext Google Ads columns...");

  // Check if old columns exist
  const columns = await db.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'Workspace' AND column_name IN ('googleAdsConversionId', 'googleAdsViewContentLabel', 'googleAdsAddToCartLabel', 'googleAdsCheckoutLabel', 'googleAdsPurchaseLabel')`
  );

  if (columns.length === 0) {
    console.log("[Migration] No plaintext Google Ads columns found, skipping.");
    return;
  }

  console.log(`[Migration] Found ${columns.length} plaintext columns. Migrating...`);

  // Ensure new encrypted columns exist
  const encryptedColumns = [
    "googleAdsConversionIdEncrypted", "googleAdsConversionIdIv", "googleAdsConversionIdTag",
    "googleAdsViewContentLabelEncrypted", "googleAdsViewContentLabelIv", "googleAdsViewContentLabelTag",
    "googleAdsAddToCartLabelEncrypted", "googleAdsAddToCartLabelIv", "googleAdsAddToCartLabelTag",
    "googleAdsCheckoutLabelEncrypted", "googleAdsCheckoutLabelIv", "googleAdsCheckoutLabelTag",
    "googleAdsPurchaseLabelEncrypted", "googleAdsPurchaseLabelIv", "googleAdsPurchaseLabelTag",
  ];

  for (const col of encryptedColumns) {
    await db.$executeRawUnsafe(
      `ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "${col}" TEXT`
    ).catch(() => {}); // Ignore if already exists
  }

  // Read workspaces with plaintext data
  const oldColumnNames = columns.map(c => c.column_name);
  const selectCols = oldColumnNames.map(c => `"${c}"`).join(", ");
  const workspaces = await db.$queryRawUnsafe<Record<string, string | null>[]>(
    `SELECT "id", ${selectCols} FROM "Workspace" WHERE "googleAdsConversionId" IS NOT NULL`
  ).catch(() => [] as Record<string, string | null>[]);

  for (const ws of workspaces) {
    const updates: string[] = [];
    const fields: Record<string, string> = {
      googleAdsConversionId: "googleAdsConversionId",
      googleAdsViewContentLabel: "googleAdsViewContentLabel",
      googleAdsAddToCartLabel: "googleAdsAddToCartLabel",
      googleAdsCheckoutLabel: "googleAdsCheckoutLabel",
      googleAdsPurchaseLabel: "googleAdsPurchaseLabel",
    };

    for (const [oldField, base] of Object.entries(fields)) {
      const value = ws[oldField];
      if (value) {
        const enc = encrypt(value);
        updates.push(`"${base}Encrypted" = '${enc.encrypted}', "${base}Iv" = '${enc.iv}', "${base}Tag" = '${enc.tag}'`);
      }
    }

    if (updates.length > 0) {
      await db.$executeRawUnsafe(
        `UPDATE "Workspace" SET ${updates.join(", ")} WHERE "id" = '${ws.id}'`
      );
      console.log(`[Migration] Encrypted Google Ads data for workspace ${ws.id}`);
    }
  }

  console.log("[Migration] Google Ads encryption migration complete.");
}

async function deduplicateEventLogs() {
  console.log("[Migration] Removing duplicate EventLog entries...");

  const result = await db.$executeRawUnsafe(`
    DELETE FROM "EventLog" a USING "EventLog" b
    WHERE a."id" > b."id"
      AND a."workspaceId" = b."workspaceId"
      AND a."eventId" = b."eventId"
      AND a."destination" = b."destination"
  `);

  console.log(`[Migration] Removed ${result} duplicate EventLog entries.`);
}

async function main() {
  try {
    await migrateGoogleAds();
    await deduplicateEventLogs();
    console.log("[Migration] All migrations complete.");
  } catch (err) {
    console.error("[Migration] Error:", err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
