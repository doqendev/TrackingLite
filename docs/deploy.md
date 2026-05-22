# Deployment Runbook

## Workspace Mode Release

Before deploying app or worker code that reads `Workspace.productMode` and
`Workspace.installType`, apply committed Prisma migrations against production:

```bash
pnpm prisma migrate deploy
```

The build scripts only run `prisma generate`; Vercel and Railway do not apply
database migrations automatically.

Protect existing headless/custom Shopify workspaces before or during rollout:

```sql
UPDATE "Workspace"
SET "productMode" = 'LEGACY_ALL_DESTINATIONS',
    "installType" = 'HEADLESS_CUSTOM'
WHERE id = 'cmo1hd1x600045r6d9elaw3tg';
```

Set the same workspace ID in production environment variables:

```bash
LEGACY_WORKSPACE_IDS=cmo1hd1x600045r6d9elaw3tg
```

For future internal workspace classification, do not use public APIs. Use:

```bash
pnpm tsx scripts/set-workspace-mode.ts <workspaceId> <productMode> <installType>
```

Supported values:

- `productMode`: `SHOPIFY_META_TIKTOK_V1`, `LEGACY_ALL_DESTINATIONS`
- `installType`: `SHOPIFY_CUSTOM_PIXEL`, `HEADLESS_CUSTOM`

After deployment, verify `https://trackclear.io/api/health` reports the expected
commit and `database: "connected"`.
