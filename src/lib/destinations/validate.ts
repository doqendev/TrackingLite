import { decrypt } from "@/lib/encryption";

export interface ValidationResult {
  connected: boolean;
  message: string;
}

export async function validateMeta(pixelId: string, encryptedToken: string, iv: string, tag: string): Promise<ValidationResult> {
  try {
    const accessToken = decrypt(encryptedToken, iv, tag);
    const res = await fetch(`https://graph.facebook.com/v21.0/${pixelId}?access_token=${accessToken}&fields=name,id`);
    if (res.ok) {
      const data = await res.json();
      return { connected: true, message: `Connected to pixel: ${data.name || pixelId}` };
    }
    const error = await res.json().catch(() => ({}));
    return { connected: false, message: error?.error?.message || `HTTP ${res.status}` };
  } catch (err) {
    return { connected: false, message: err instanceof Error ? err.message : "Connection failed" };
  }
}

export async function validateTikTok(encryptedToken: string, iv: string, tag: string): Promise<ValidationResult> {
  try {
    const accessToken = decrypt(encryptedToken, iv, tag);
    const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/user/info/", {
      headers: { "Access-Token": accessToken },
    });
    if (res.ok) {
      return { connected: true, message: "TikTok API key is valid" };
    }
    const error = await res.json().catch(() => ({}));
    return { connected: false, message: error?.message || `HTTP ${res.status}` };
  } catch (err) {
    return { connected: false, message: err instanceof Error ? err.message : "Connection failed" };
  }
}

export async function validateGA4(measurementId: string, encryptedSecret: string, iv: string, tag: string): Promise<ValidationResult> {
  try {
    const apiSecret = decrypt(encryptedSecret, iv, tag);
    // Use GA4 debug endpoint to validate
    const res = await fetch(
      `https://www.google-analytics.com/debug/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "validation_test",
          events: [{ name: "test_event", params: {} }],
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const messages = data?.validationMessages || [];
      if (messages.length === 0) {
        return { connected: true, message: "GA4 credentials are valid" };
      }
      return { connected: false, message: messages[0]?.description || "Validation failed" };
    }
    return { connected: false, message: `HTTP ${res.status}` };
  } catch (err) {
    return { connected: false, message: err instanceof Error ? err.message : "Connection failed" };
  }
}

export async function validateKlaviyo(encryptedKey: string, iv: string, tag: string): Promise<ValidationResult> {
  try {
    const apiKey = decrypt(encryptedKey, iv, tag);
    const res = await fetch("https://a.klaviyo.com/api/accounts/", {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: "2024-02-15",
        Accept: "application/json",
      },
    });
    if (res.ok) {
      return { connected: true, message: "Klaviyo API key is valid" };
    }
    const error = await res.json().catch(() => ({}));
    return { connected: false, message: error?.errors?.[0]?.detail || `HTTP ${res.status}` };
  } catch (err) {
    return { connected: false, message: err instanceof Error ? err.message : "Connection failed" };
  }
}

export async function validateGoogleAds(encryptedConversionId: string, iv: string, tag: string): Promise<ValidationResult> {
  try {
    // Basic validation: decrypt and check format
    const conversionId = decrypt(encryptedConversionId, iv, tag);
    if (!conversionId || conversionId.length < 3) {
      return { connected: false, message: "Invalid conversion ID format" };
    }
    // Google Ads tracking pixel doesn't have a simple validation endpoint
    // Just verify we can decrypt the credential
    return { connected: true, message: `Conversion ID configured: ${conversionId.slice(0, 4)}****` };
  } catch (err) {
    return { connected: false, message: err instanceof Error ? err.message : "Decryption failed" };
  }
}
