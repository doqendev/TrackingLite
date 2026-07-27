# Custom Ingest Domain

Custom ingest domains let a workspace serve the TrackClear pixel loader and
event ingest endpoint from a merchant-owned subdomain after DNS is verified.
Existing workspaces keep using the default TrackClear endpoints until a custom
domain is saved and verified.

## Setup

1. Choose a dedicated subdomain, for example `t.example.com`.
2. Add the subdomain to the TrackClear Vercel project.
3. Point the subdomain DNS to the record Vercel requests for that domain.
   Common Vercel subdomain setup uses a CNAME to `cname.vercel-dns.com`,
   controlled by `NEXT_PUBLIC_CUSTOM_INGEST_CNAME_TARGET`, but Vercel may
   request an A record such as `76.76.21.21` for a specific domain.
4. Save the subdomain in Settings > Custom Ingest Domain.
5. Click Verify domain.

Verification calls:

```text
https://<custom-domain>/api/custom-ingest-domain/check?workspaceId=<workspaceId>
```

The domain is considered verified only if that route returns the TrackClear
marker response. Generated snippets and public pixel scripts use the custom
domain only after `Workspace.customIngestDomainVerifiedAt` is set.

## Runtime Behavior

- Loader snippet:
  - verified domain: `https://<custom-domain>/api/pixel/<workspaceId>?loader=bridge-v1`
  - otherwise: `NEXT_PUBLIC_APP_URL/api/pixel/<workspaceId>?loader=bridge-v1`
- Pixel ingest URL:
  - verified domain: `https://<custom-domain>/api/events/ingest`
  - otherwise: `NEXT_PUBLIC_INGEST_URL`
- Changing or clearing the saved domain immediately clears verification.
- Verification failure clears `customIngestDomainVerifiedAt` and stores the
  last checked time plus a short error message.

## Operational Notes

- Apply the `20260522_add_custom_ingest_domain` Prisma migration before
  deploying code that reads these fields.
- Do not replace the default TrackClear ingest endpoint globally. This feature
  is per workspace and opt-in.
- Public pixel responses require browser revalidation and use a 30-second shared
  cache (`max-age=0, s-maxage=30`). Allow at least 30 seconds and start a fresh
  browser session after endpoint or browser-owner changes. The first deployment
  can still encounter an older five-minute CDN entry for an unversioned URL;
  repasting `bridge-v1` uses a versioned URL and bypasses that transition cache.
