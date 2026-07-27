import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const processors = [
  ["meta-event-processor.ts", "sendToMetaCapi", "MetaCapiError"],
  ["tiktok-event-processor.ts", "sendToTikTok", "TikTokApiError"],
  ["ga4-event-processor.ts", "sendToGA4", "GA4ApiError"],
  ["klaviyo-event-processor.ts", "sendToKlaviyo", "KlaviyoApiError"],
  ["reddit-event-processor.ts", "sendToReddit", "RedditApiError"],
  ["pinterest-event-processor.ts", "sendToPinterest", "PinterestApiError"],
  ["google-ads-event-processor.ts", "sendToGoogleAds", "GoogleAdsApiError"],
] as const;

describe("destination worker delivery ownership", () => {
  it.each(processors)(
    "%s claims before outbound I/O and classifies failure ambiguity conservatively",
    (filename, sendFunction, apiErrorClass) => {
      const source = readFileSync(
        resolve(process.cwd(), "src", "workers", filename),
        "utf8"
      );
      const claimCall = source.indexOf("await claimEventDelivery(eventLogId)");
      const outboundStartedDeclaration = source.indexOf(
        "let outboundStarted = false;"
      );
      const outboundStartedCall = source.indexOf("outboundStarted = true;");
      const sendCall = source.indexOf(`await ${sendFunction}(`);
      const acceptedCall = source.indexOf(
        "await markEventDeliveryAccepted(deliveryClaim, response)"
      );
      const completeCall = source.indexOf(
        "await completeEventDeliveryClaim(deliveryClaim, response)"
      );

      expect(claimCall).toBeGreaterThan(-1);
      expect(outboundStartedDeclaration).toBeGreaterThan(-1);
      expect(outboundStartedCall).toBeGreaterThan(claimCall);
      expect(sendCall).toBeGreaterThan(outboundStartedCall);
      expect(acceptedCall).toBeGreaterThan(sendCall);
      expect(completeCall).toBeGreaterThan(acceptedCall);
      expect(source).toContain("if (eventLogId && !outboundAccepted)");
      expect(source).toContain("await failEventDeliveryClaim({");
      expect(source).toContain("const terminalDestinationRejection =");
      expect(source).toContain(`error instanceof ${apiErrorClass} &&`);
      expect(source).toContain("!terminalDestinationRejection &&");
      expect(source).toContain("throw new UnrecoverableError(errorMessage);");
      expect(source).toContain('? "DEFINITELY_NOT_DELIVERED"');
      expect(source).toContain(': "DELIVERY_AMBIGUOUS"');
      expect(source).not.toContain("shouldSkipEventDelivery");
      expect(source).not.toContain("db.eventLog.update(");
    }
  );
});
