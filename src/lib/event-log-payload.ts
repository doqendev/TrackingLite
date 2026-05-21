type UnknownRecord = Record<string, unknown>;

const REDACTED_CUSTOM_DATA_KEYS = new Set([
  "address",
  "address1",
  "address2",
  "billingaddress",
  "city",
  "country",
  "countrycode",
  "customerid",
  "email",
  "firstname",
  "fullname",
  "lastname",
  "name",
  "phone",
  "postalcode",
  "province",
  "shippingaddress",
  "state",
  "zip",
  "zipcode",
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeEventLogCustomData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeEventLogCustomData(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const out: UnknownRecord = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (REDACTED_CUSTOM_DATA_KEYS.has(normalizedKey(key))) continue;
    out[key] = sanitizeEventLogCustomData(nestedValue);
  }
  return out;
}

export function buildEventLogPayload(input: {
  eventName: string;
  customData?: Record<string, unknown> | null;
  userData?: Record<string, unknown> | null;
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  ttclid?: string | null;
  rdtCid?: string | null;
  epik?: string | null;
  gclid?: string | null;
}) {
  const userData = input.userData ?? {};

  return {
    eventName: input.eventName,
    customData: sanitizeEventLogCustomData(input.customData ?? {}) as Record<string, unknown>,
    userDataFlags: {
      hasEmail: hasValue(userData.email),
      hasPhone: hasValue(userData.phone),
      hasName: hasValue(userData.firstName) || hasValue(userData.lastName),
      hasAddress:
        hasValue(userData.city) ||
        hasValue(userData.state) ||
        hasValue(userData.zip) ||
        hasValue(userData.countryCode),
      hasCustomerId: hasValue(userData.customerId),
    },
    clickIdFlags: {
      hasFbp: hasValue(input.fbp),
      hasFbc: hasValue(input.fbc),
      hasFbclid: hasValue(input.fbclid),
      hasGbraid: hasValue(input.gbraid),
      hasWbraid: hasValue(input.wbraid),
      hasTtclid: hasValue(input.ttclid),
      hasRdtCid: hasValue(input.rdtCid),
      hasEpik: hasValue(input.epik),
      hasGclid: hasValue(input.gclid),
    },
  };
}
