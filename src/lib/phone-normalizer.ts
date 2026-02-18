const COUNTRY_PHONE_PREFIX: Record<string, string> = {
  US: "1", CA: "1", GB: "44", IE: "353", DE: "49", FR: "33",
  ES: "34", IT: "39", NL: "31", BE: "32", AT: "43", CH: "41",
  AU: "61", NZ: "64", BR: "55", MX: "52", AR: "54", CL: "56",
  CO: "57", PE: "51", IN: "91", JP: "81", KR: "82", CN: "86",
  HK: "852", SG: "65", MY: "60", TH: "66", PH: "63", ID: "62",
  VN: "84", ZA: "27", NG: "234", KE: "254", EG: "20", AE: "971",
  SA: "966", IL: "972", TR: "90", RU: "7", UA: "380", PL: "48",
  CZ: "420", RO: "40", HU: "36", SE: "46", NO: "47", DK: "45",
  FI: "358", PT: "351", GR: "30",
};

export function normalizePhoneToE164(
  phone: string | null | undefined,
  countryCode: string | null | undefined
): string | undefined {
  if (!phone) return undefined;

  let digits = phone.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else if (countryCode) {
    const prefix = COUNTRY_PHONE_PREFIX[countryCode.toUpperCase()];
    if (prefix) {
      if (digits.startsWith("0")) {
        digits = digits.slice(1);
      }
      digits = prefix + digits;
    }
  } else if (digits.length === 10) {
    digits = "1" + digits; // US fallback
  }

  if (digits.length < 7 || digits.length > 15) {
    return undefined;
  }

  return digits;
}

export { COUNTRY_PHONE_PREFIX };
