export type CatalogIdMode =
  | "VARIANT_NUMERIC_ID"
  | "PRODUCT_NUMERIC_ID"
  | "VARIANT_GRAPHQL_ID"
  | "PRODUCT_GRAPHQL_ID"
  | "SKU"
  | "CUSTOM";

export type ContentIdInput = {
  variantId?: string | number | null;
  productId?: string | number | null;
  variantGraphqlId?: string | null;
  productGraphqlId?: string | null;
  sku?: string | null;
  country?: string | null;
};

export type ContentIdOptions = {
  mode?: CatalogIdMode | string | null;
  prefix?: string | null;
  suffix?: string | null;
  template?: string | null;
};

export type ContentIdWorkspaceSource = {
  catalogIdMode?: CatalogIdMode | string | null;
  catalogIdPrefix?: string | null;
  catalogIdSuffix?: string | null;
  catalogIdTemplate?: string | null;
};

export function contentIdOptionsFromWorkspace(
  workspace: ContentIdWorkspaceSource | null | undefined
): ContentIdOptions {
  return {
    mode: workspace?.catalogIdMode ?? "VARIANT_NUMERIC_ID",
    prefix: workspace?.catalogIdPrefix ?? null,
    suffix: workspace?.catalogIdSuffix ?? null,
    template: workspace?.catalogIdTemplate ?? null,
  };
}

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export function numericShopifyId(value: unknown): string | null {
  const text = clean(value);
  if (!text) return null;

  const gidMatch = text.match(/\/(\d+)(?:[/?#].*)?$/);
  if (gidMatch) return gidMatch[1];

  const numericMatch = text.match(/^\d+$/);
  if (numericMatch) return text;

  return null;
}

function graphqlId(resource: "ProductVariant" | "Product", explicit: string | null | undefined, numeric: unknown): string | null {
  const explicitValue = clean(explicit);
  if (explicitValue?.startsWith("gid://shopify/")) return explicitValue;

  const numericValue = numericShopifyId(explicitValue ?? numeric);
  return numericValue ? `gid://shopify/${resource}/${numericValue}` : explicitValue ?? null;
}

function applyAffixes(value: string | null, options: ContentIdOptions): string | null {
  if (!value) return null;
  return `${options.prefix ?? ""}${value}${options.suffix ?? ""}`;
}

function applyTemplate(template: string, input: ContentIdInput): string | null {
  const values: Record<string, string> = {
    variant_id: numericShopifyId(input.variantId ?? input.variantGraphqlId) ?? "",
    product_id: numericShopifyId(input.productId ?? input.productGraphqlId) ?? "",
    variant_graphql_id: graphqlId("ProductVariant", input.variantGraphqlId ?? null, input.variantId) ?? "",
    product_graphql_id: graphqlId("Product", input.productGraphqlId ?? null, input.productId) ?? "",
    sku: clean(input.sku) ?? "",
    country: clean(input.country) ?? "",
  };

  const rendered = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
  return clean(rendered);
}

export function normalizeContentId(input: ContentIdInput, options: ContentIdOptions = {}): string | null {
  const mode = options.mode ?? "VARIANT_NUMERIC_ID";
  let value: string | null;

  switch (mode) {
    case "PRODUCT_NUMERIC_ID":
      value = numericShopifyId(input.productId ?? input.productGraphqlId);
      break;
    case "VARIANT_GRAPHQL_ID":
      value = graphqlId("ProductVariant", input.variantGraphqlId ?? null, input.variantId);
      break;
    case "PRODUCT_GRAPHQL_ID":
      value = graphqlId("Product", input.productGraphqlId ?? null, input.productId);
      break;
    case "SKU":
      value = clean(input.sku);
      break;
    case "CUSTOM":
      value = options.template ? applyTemplate(options.template, input) : null;
      break;
    case "VARIANT_NUMERIC_ID":
    default:
      value =
        numericShopifyId(input.variantId ?? input.variantGraphqlId) ??
        numericShopifyId(input.productId ?? input.productGraphqlId) ??
        clean(input.sku);
      break;
  }

  return applyAffixes(value, options);
}

export function normalizeRawShopifyContentId(value: unknown): string | null {
  const numericValue = numericShopifyId(value);
  if (numericValue) return numericValue;
  return clean(value);
}

function scalarContentId(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstDefined(source: Record<string, unknown> | null, keys: string[]): unknown {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined && clean(value)) return value;
  }
  return null;
}

function contentInputFromSource(
  source: Record<string, unknown> | null,
  fallbackId: unknown
): ContentIdInput {
  const itemId = firstDefined(source, ["id", "content_id", "contentId"]);
  const variantId = firstDefined(source, ["variantId", "variant_id", "variantID"]) ?? fallbackId ?? itemId;
  const productId = firstDefined(source, ["productId", "product_id", "productID"]);

  return {
    variantId: scalarContentId(variantId),
    productId: scalarContentId(productId),
    variantGraphqlId: clean(firstDefined(source, ["variantGraphqlId", "variant_graphql_id"])),
    productGraphqlId: clean(firstDefined(source, ["productGraphqlId", "product_graphql_id"])),
    sku: clean(firstDefined(source, ["sku", "SKU"])),
    country: clean(firstDefined(source, ["country", "countryCode", "country_code"])),
  };
}

function normalizeContentIdFromSource(
  source: Record<string, unknown> | null,
  fallbackId: unknown,
  options: ContentIdOptions
): string | null {
  const input = contentInputFromSource(source, fallbackId);
  return (
    normalizeContentId(input, options) ??
    normalizeRawShopifyContentId(fallbackId ?? input.variantId ?? input.productId ?? input.sku)
  );
}

export function normalizeCustomDataContentIds<T extends Record<string, unknown>>(
  customData: T,
  options: ContentIdOptions = {}
): T {
  const normalized = { ...customData } as Record<string, unknown>;
  const rawContentIds = normalized.contentIds ?? normalized.content_ids;
  const contentItems = Array.isArray(normalized.contents)
    ? (normalized.contents as unknown[]).map(recordValue)
    : [];
  const rootSource = recordValue(normalized);

  if (Array.isArray(rawContentIds)) {
    const contentIds = rawContentIds
      .map((rawId, index) => {
        const id = scalarContentId(rawId);
        const itemSource = contentItems[index] ?? rootSource;
        return id ? normalizeContentIdFromSource(itemSource, id, options) : null;
      })
      .filter((id): id is string => !!id);
    normalized.contentIds = contentIds;
    normalized.content_ids = contentIds;
  }

  if (Array.isArray(normalized.contents)) {
    normalized.contents = (normalized.contents as unknown[]).map((rawItem) => {
      const item = recordValue(rawItem);
      if (!item) return rawItem;
      const rawId = scalarContentId(item.id ?? item.content_id ?? item.contentId);
      const id = normalizeContentIdFromSource(item, rawId, options);
      return id ? { ...item, id, content_id: id } : item;
    });
  }

  return normalized as T;
}
