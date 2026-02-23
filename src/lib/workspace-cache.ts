import { db } from "@/lib/db";

interface CacheEntry {
  data: Record<string, unknown>;
  expiry: number;
}

const cache = new Map<string, CacheEntry>();
const TTL = 60_000; // 1 minute
const MAX_SIZE = 500;

function evictIfNeeded(): void {
  if (cache.size <= MAX_SIZE) return;
  // Map iterates in insertion order — delete oldest entries
  const excess = cache.size - MAX_SIZE;
  let removed = 0;
  for (const key of Array.from(cache.keys())) {
    if (removed >= excess) break;
    cache.delete(key);
    removed++;
  }
}

export async function getWorkspaceForDestination(
  workspaceId: string,
  destination: string
): Promise<Record<string, unknown> | null> {
  const key = `${workspaceId}:${destination}`;
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) return cached.data;

  // Build select based on destination
  const baseSelect = { id: true, isActive: true };
  const destSelects: Record<string, Record<string, boolean>> = {
    META: {
      metaPixelId: true,
      metaAccessTokenEncrypted: true,
      metaAccessTokenIv: true,
      metaAccessTokenTag: true,
      metaTestEventCode: true,
    },
    REDDIT: {
      redditAccountId: true,
      redditAccessTokenEncrypted: true,
      redditAccessTokenIv: true,
      redditAccessTokenTag: true,
    },
    PINTEREST: {
      pinterestAdAccountId: true,
      pinterestConversionTokenEncrypted: true,
      pinterestConversionTokenIv: true,
      pinterestConversionTokenTag: true,
    },
    TIKTOK: {
      tiktokPixelId: true,
      tiktokAccessTokenEncrypted: true,
      tiktokAccessTokenIv: true,
      tiktokAccessTokenTag: true,
    },
    GA4: {
      ga4MeasurementId: true,
      ga4ApiSecretEncrypted: true,
      ga4ApiSecretIv: true,
      ga4ApiSecretTag: true,
    },
    KLAVIYO: {
      klaviyoApiKeyEncrypted: true,
      klaviyoApiKeyIv: true,
      klaviyoApiKeyTag: true,
    },
  };

  const select = { ...baseSelect, ...(destSelects[destination] || {}) };

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select,
  });

  if (workspace) {
    cache.set(key, {
      data: workspace as Record<string, unknown>,
      expiry: Date.now() + TTL,
    });
    evictIfNeeded();
  }

  return (workspace as Record<string, unknown>) || null;
}

export function invalidateWorkspaceCache(workspaceId: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(`${workspaceId}:`)) {
      cache.delete(key);
    }
  }
}
