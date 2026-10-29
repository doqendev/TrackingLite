# Google Ads conversions (Data Manager API)

Track Clear uploads Shopify Purchases to Google Ads as offline click conversions
through Google's Data Manager API. One merchant conversion action of type
"Website (Import from clicks)" receives every Purchase with the Google click ID
(gclid, gbraid or wbraid) when one exists, plus normalized, SHA-256 hashed
customer data for matching. Google processes each upload asynchronously; Track
Clear stores the request ID and later records Google's final processing result.

## Why the previous Google Ads destination was replaced

The old worker sent a server-side GET to the browser conversion endpoint
(`googleadservices.com/pagead/conversion/...`). That endpoint attributes through
the shopper's Google cookies. A request from Track Clear's server carries none,
so those conversions could not be attributed, and failures were invisible. The
Conversion ID and label columns remain in the schema read-only and are no longer
used; a later release can drop them.

## Operator setup (once per deployment)

1. In Google Cloud, create or pick a project and enable the **Data Manager API**.
2. Create a service account. It needs no Google Cloud IAM roles; access is
   granted inside each merchant's Google Ads account.
3. Create a JSON key for it. Set `GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_KEY` to the
   key JSON or to base64 of it on **Railway** (worker: delivery and status
   checks) and **Vercel** (web: settings validation and the address shown to
   merchants). Never commit or log the key. Rotating it only requires replacing
   the variable and restarting; tokens are cached in memory for under an hour.
4. Without the variable, the settings card says Google Ads is not available yet,
   validation is refused, and queued uploads retry every 15 minutes with
   "service account is not configured" (HTTP 503) until it is set. A malformed key
   logs a warning at worker start.

No Google Ads developer token is needed. One service account email can be a user
of at most 20 Google Ads accounts; beyond that, merchants grant access through a
manager account and enter its ID as the manager (login) account.

## Merchant setup (Integrations > Google Ads)

1. Google Ads > Admin > Account settings: keep auto-tagging on; it is what adds
   gclid, gbraid and wbraid to ad clicks. Google Ads > Goals > Settings: accept the
   customer data terms (also in the manager account, when one grants access).
   Without them Google rejects every upload that carries customer data
   (`DESTINATION_ACCOUNT_ENHANCED_CONVERSIONS_TERMS_NOT_SIGNED`), and every
   Track Clear upload carries some. New accounts have not accepted them.
2. Google Ads > Goals > Conversions > New conversion action > Import > Other data
   sources or CRMs > Track conversions from clicks. Category Purchase, count
   **Every**: a one-per-click action rejects gbraid and wbraid (iPhone app) clicks
   (`ONE_PER_CLICK_CONVERSION_ACTION_NOT_PERMITTED_WITH_BRAID`) and would drop a
   shopper's repeat purchases. A 90-day click-through window matches Google's
   click retention. The conversion action ID is the number after `ctId=` in its
   page address.
3. Google Ads > Admin > Access and security: add the service account address
   shown on the card with Standard access.
4. Enter the 10-digit customer ID (dashes are accepted), the conversion action
   ID, and, only when access was granted through a manager account, the manager
   account ID. **Save and validate** sends a `validateOnly` upload that checks
   access, the conversion action and the event schema without recording
   anything. Delivery is enabled only after validation passes. Validation does
   not check the customer data terms; Tracking Health reports that after the
   first real upload.
5. If the store also has a Google tag purchase conversion (Shopify's Google &
   YouTube app creates one), keep only one of them Primary. `transactionId`
   deduplicates only within one conversion action, so two Primary actions count
   every purchase twice.

Google Ads is available to standard Shopify workspaces (`SHOPIFY_CUSTOM_PIXEL`)
and legacy workspaces. Headless V1 installs are excluded, as for ChatGPT Ads.

## Delivery path

- Ingest and the Shopify orders/paid webhook create a `GOOGLE_ADS` EventLog only
  for Purchase (`DESTINATION_EVENT_MAP.GOOGLE_ADS`) and bind it to
  `deliveryTargetId = "<customerId>:<conversionActionId>"`. The encrypted retry
  envelope carries the same `googleAdsTargetId`, the click IDs and
  `googleClickCapturedAt`.
- The storefront keeps a Google click (gclid, gbraid or wbraid) for Google's 90
  days whatever touch follows, as Google's own conversion linker does. A later
  Meta, TikTok or UTM-tagged visit changes the last-touch attribution (source,
  time, UTMs, landing page, other click IDs) but not the Google click; only a
  newer Google click replaces it. The Custom Pixel, legacy script and Cart Helper
  store its capture time (`ga`) beside it and write it to the cart as
  `_tc_google_click_at`; ingest receives it as `googleClickCapturedAt` and Redis
  ages the click from it. `googleClickCapturedAt` on a Purchase comes from the
  source that supplied the click ID (`googleClickCapturedAtForPurchase`); carts
  and scripts from before this change fall back to the last touch when that touch
  was the Google click. Clicks known to be 90 or more days old are left out, as
  Google cannot attribute them. A marketing or sale-of-data denial clears the
  click and its time. Before 29 October 2026 any later non-Google touch erased
  the Google click, so a Google Ads purchase after a Meta, TikTok or email visit
  reached Google without its click ID.
- The worker (`src/workers/google-ads-event-processor.ts`) follows the ChatGPT
  Ads pattern: durable claim, encrypted envelope required, current workspace
  enablement, mode, Purchase toggle and target re-checked, original
  `occurredAt` used, consent and later tombstones re-checked fail-closed.
  Purchases older than 60 days are not uploaded.
- Six-hour hold: Google rejects a click conversion while its click is under six
  hours old (`PROCESSING_ERROR_REASON_TOO_RECENT_CLICK`, "retry after 6 hours")
  and does not keep it, so uploading at purchase time lost the purchases made
  soon after an ad click. The click always precedes the purchase, so the worker
  holds every upload until `occurredAt` plus six hours and fifteen minutes
  (`GOOGLE_CLICK_SETTLE_MS`, `googleAdsUploadNotBefore`). It moves the BullMQ job
  back to delayed (`DelayedError`, not an attempt or a failure) before claiming
  the row and sets the PENDING row's `nextRetryAt`, which stale-PENDING recovery
  skips until due; if Redis loses the delayed job, recovery queues the row once
  the hold ends. Every terminal path clears `nextRetryAt`. Recovered older
  purchases upload at once. The hold usually also clears Google's
  `DESTINATION_TOO_RECENTLY_CREATED` window for a newly created conversion action.
  Google recommends uploading within 24 hours, so the hold stays well inside that.
- Request (`src/lib/destinations/google-ads.ts`): operating account,
  optional login account, `productDestinationId` = conversion action ID,
  `encoding: HEX`, `transactionId` = Shopify order name (Google's dedupe key),
  `eventTimestamp`, `eventSource: WEB`, `conversionValue` in currency units,
  `currency`, one ad identifier (gclid, then gbraid, then wbraid) and user
  identifiers: Google-normalized email (Gmail dots and +suffix removed), E.164
  phone with `+`, and an address only when first name, last name, country and
  postal code are all present. A Purchase with neither a click ID nor customer
  data fails with a clear message instead of being sent.
- Consent: marketing `true` sends `adUserData` and `adPersonalization` as
  `CONSENT_GRANTED`; a sale-of-data opt-out sends `adPersonalization:
  CONSENT_DENIED`; unknown consent (LAX mode only) is omitted. Denied marketing
  never reaches Google.

## Processing status

`status = SENT` only means Google accepted the request. The row also carries:

| Column | Meaning |
| --- | --- |
| `destinationRequestId` | Data Manager request ID |
| `destinationRequestStatus` | `PROCESSING`, `SUCCESS`, `PARTIAL_SUCCESS`, `FAILED` or `TIMED_OUT` |
| `destinationStatusNextCheckAt` / `CheckedAt` | Polling schedule |
| `destinationStatusDetail` | Google's enum reasons and record counts only |

The request fields are written with the accepted state, so crash recovery keeps
them. `pollGoogleAdsRequestStatuses()` runs inside the existing 5-minute
stale-outbox cycle (no extra listener; still 12): first check 30 minutes after
upload, then 1.3x backoff up to 60 minutes, `TIMED_OUT` after 24 hours. Index
`EventLog_destination_request_status_idx` serves the due-row query. Tracking
Health shows "Google Ads delivery" with the latest upload, seven-day counts and
the most recent Google error reason (for example `INVALID_GCLID`). A purchase
still in the six-hour hold is shown as expected, with its upload time in UTC.

## Errors

| Symptom | Cause |
| --- | --- |
| `HTTP 403 PERMISSION_DENIED` | Service account not added to the account, or a missing/wrong manager account ID |
| `HTTP 400 INVALID_ARGUMENT` | Wrong conversion action ID or type, or a rejected field |
| `HTTP 503` service account not configured | Deployment variable missing; retried every 15 minutes |
| `HTTP 429` | Rate limited; durable recovery waits for Retry-After |
| Request status `FAILED` / `PARTIAL_SUCCESS` | Google rejected records after acceptance; see the reason in Tracking Health |
| `..._DESTINATION_ACCOUNT_ENHANCED_CONVERSIONS_TERMS_NOT_SIGNED` | Customer data terms not accepted in Goals > Settings |
| `..._ONE_PER_CLICK_CONVERSION_ACTION_NOT_PERMITTED_WITH_BRAID` | Conversion action counts One; set it to Every |
| `..._DESTINATION_TOO_RECENTLY_CREATED` | Conversion action created a few hours ago; later uploads succeed |
| `..._TOO_RECENT_CLICK` | Should not occur with the six-hour hold; points to a clock or `occurredAt` problem |
| `..._UNKNOWN_CONSENT` / `..._DENIED_CONSENT` | No or denied ad consent for that shopper (EEA); check the store's consent banner |
| `..._CLICK_NOT_FOUND` / `..._INVALID_CLICK` | The click is not from this account's campaigns, or Google could not match the customer data |

Reason codes are stored in full, prefixed `PROCESSING_ERROR_REASON_`.

Error bodies are never stored, since they can echo request fields; only the HTTP
status and Google's error status code are kept.
