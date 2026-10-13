# Event retention

The retention release separates merchant-visible history from operational delivery
identity. Every plan has seven days of detailed event logs and 30 days of reporting.
It does not change order exemptions, store allowances, consent, or attribution TTLs.

## Data lifecycle

- Existing 48-hour IP/user-agent redaction and 72-hour encrypted retry expiry remain.
- Hourly cleanup atomically refreshes `EventDailySummary` per workspace before any
  compaction. Summaries group logical commerce by event, currency, campaign, source
  and payment gateway, and delivery counts by event/platform/status. They contain
  no event/order/session IDs, payloads, cookies or customer identity. Product-mode
  scopes are distinct. Inactive workspaces follow the same policy.
- After seven days, settled EventLog rows lose payload, provider response, URL,
  cookies, click IDs and detailed UTM fields. The Events and diagnostic audit views
  only expose the latest seven days, avoiding misleading missing-field warnings
  from intentionally compacted receipts.
- Compact rows retain event IDs, Purchase/refund aliases, original timestamps,
  destination bindings, delivery state and accounting/campaign scalars for 35 days.
  Existing unique constraints, alias reconciliation and current-month billing
  reconstruction therefore continue working without a new admission or sending path.
- Pending/retrying rows, scheduled recovery, encrypted retry context and *any*
  unresolved delivery owner are excluded from both compaction and identity expiry.
  Ambiguous/accepted Purchase claims keep their existing non-expiring protection.
- Campaign reports combine daily summaries with recent records and exact partial
  day boundaries. Live revenue/health and conversion delivery rates continue to use
  the retained accounting fields. Summary rebuilds reconcile late corrections;
  existing analytics caching and hourly summary refresh can delay old corrections.
- Workspace/account deletion cascades to summaries as well as receipts.

Thirty-day reports cannot recreate history already removed by the former seven-day
plan cleanup. Historical coverage fills as data arrives. UTC timestamps are explicit
in raw SQL so non-UTC database sessions do not shift cutoffs or revenue days.

## Release and operations

Migration `20261013_event_retention_summaries` adds one table and one nullable column;
it is required by production readiness. No existing index or tracking gate is removed.
Compaction/deletion use batches of 500 with row locks and `SKIP LOCKED`. Aggregation
failure stops that cleanup run before compaction or identity deletion.

Database updates create WAL and dead tuples before autovacuum reuses their space.
Verify volume headroom and a fresh encrypted PostgreSQL/Redis backup before the first
production cleanup. Do not use `VACUUM FULL` on the nearly full live database as a
shortcut; normal cleanup does not promise an immediate drop in allocated disk space.

## Infinite Layers health investigation, 2026-10-13

Read-only seven-day Meta audit: all 9,362 PageView, ViewContent, AddToCart and
InitiateCheckout delivery rows were SENT. Both IL and Dirava have browser ownership
disabled. Meta's insufficient-browser-volume parameter comparison is expected for
this server-only setup. IL is STRICT and Dirava is LAX; explicit denial remains
authoritative in either mode and was not changed.

Meta's current match-quality scores (platform-selected reporting window):

| Event | Infinite Layers | Dirava |
|---|---:|---:|
| PageView | 6.1 | 6.5 |
| ViewContent | 6.1 | 6.2 |
| AddToCart | 6.1 | 6.2 |
| InitiateCheckout | 7.4 | 7.9 |

Checkout email coverage is 61.9% vs 62.5%; phone 7.9% vs 12.5%. IL's top-funnel
direct customer fields are absent in the sampled seven days, while returning-session
hashes are carried successfully. Dirava also has direct Shopify customer identity
on some visits. These are availability differences, not evidence of failed Meta
delivery. We cannot manufacture contact details for anonymous visitors or guarantee
the disappearance of Meta's coverage suggestions. The supplied third image is
ViewContent, not PageView; both were checked. No Purchase verification was initiated.

A separate ChatGPT issue affected nine checkout events containing phone numbers:
`libphonenumber-js/min` resolves its relative JSON metadata import incorrectly under
the production `tsx` loader. The resulting TypeError occurs before outbound I/O.
The fix uses the documented `/core` API with explicitly imported metadata. The new
runtime probe runs in Node 20/24 CI and inside the worker image, supplementing Vitest.
Six still-live encrypted envelopes normalized locally after the fix, without sending
events; three had expired and must not be reconstructed or assigned fresh timestamps.
Two additional ChatGPT failures were consent blocks and must not be bypassed.

## Live release verification

Release `d3f553a3e38b8bc27a5e1ce8855326ce20c40c68` (PR #22) keeps seven days
of detailed logs and 30 days of reporting for every plan. Compact EventLog identities
remain for 35 days, preserving deduplication and current-month billing. Pending,
recoverable and ambiguous delivery owners remain protected. Redis attribution,
consent, original event times and webhook recovery lifetimes are unchanged.
New modules: `event-retention.ts`, `event-retention-policy.ts`, `sql-timestamp.ts`,
`logical-events-sql.ts`; migration: `20261013_event_retention_summaries`.
See `docs/event-retention.md` for lifecycle and health findings.

Exact-merge CI `38377464019` passed all five gates: Node 20/24, the worker image,
and PostgreSQL 16/17 migration rehearsals. 753 unit tests and 76 integration tests
pass. An isolated production-data rehearsal preserved all 68,173 rows and every
identity/accounting value, and exposed the temporary WAL headroom requirement.

The user approved capacity up to 2 GB. Railway only offered 1 GB or 5 GB; PostgreSQL
was resized online from 500 MB to 1 GB, staying below that approval. The first live
cleanup compacted 39,645 settled rows and created 44 summaries. Checksums of their
tracking identities and accounting values matched before/after. Current EventLog
row bytes fell from 91.2 MB to 49.9 MB; allocated database space is reused rather
than immediately returned to the filesystem. Volume use was 50% after cleanup.

Vercel `dpl_4fdMqyobwNGQa2UKjggMbC6zxNc5` and Railway
`3cb055b2-cd2c-4c8f-97b6-7b7d96f129fb` report the exact release SHA, healthy DB/Redis,
and 12/12 worker listeners in one fleet. The old workers were removed before the
schema-first cutover. Twenty migrations, 11 required indexes valid, zero drift.
Encrypted restore point: `E:/backups/trackclear/2026-10-13-retention-release`.
Infinite Layers' unlimited orders/stores and complimentary Growth remain intact.

Infinite Layers Meta: all 9,362 sampled seven-day non-Purchase funnel rows were SENT.
Dirava has similar anonymous-visitor contact-coverage gaps; both use server-only
Meta. No browser mode or consent setting changed. The separate ChatGPT phone
normalization failure was reproduced under tsx and fixed using explicit /core
metadata. All six recoverable checkout events subsequently received HTTP 200
acceptance with their original IDs, timestamps and Pixel binding unchanged. Three
older envelopes had expired and were not reconstructed. Two consent blocks remain
untouched. Purchase verification remains on hold until the user reports an order.

