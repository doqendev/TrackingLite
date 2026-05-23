# Dirava Catalog Mode QA

Status: pending live or controlled staging QA.

Purpose: prove that non-default catalog ID modes affect the canonical Shopify
webhook Purchase payload, Meta payload, and TikTok payload.

The default variant numeric mode was proven on real order `#5077`. This artifact
tracks the remaining non-default modes.

## Required Modes

- `PRODUCT_NUMERIC_ID`
- `SKU`
- `CUSTOM`

## Required Evidence Per Mode

For each mode, record:

- Commit:
- Workspace:
- Configured mode:
- Prefix:
- Suffix:
- Custom template:
- Test order:
- Product title(s):
- Variant ID fields available:
- Product ID fields available:
- SKU fields available:
- Final `content_ids`:
- Final `contents`:
- Meta payload `content_ids`:
- TikTok payload `contents`:
- Missing field warnings:
- Pass/fail:
- Blocker:
- Next fix:

## PRODUCT_NUMERIC_ID

- Commit:
- Workspace:
- Configured mode:
- Test order:
- Input product/variant/SKU fields:
- Final `content_ids`:
- Final `contents`:
- Meta payload `content_ids`:
- TikTok payload `contents`:
- Missing field warnings:
- Result:

## SKU

- Commit:
- Workspace:
- Configured mode:
- Test order:
- Input product/variant/SKU fields:
- Final `content_ids`:
- Final `contents`:
- Meta payload `content_ids`:
- TikTok payload `contents`:
- Missing field warnings:
- Result:

Note: if SKU mode is selected and Shopify line items do not include SKU, the
product must surface that clearly in diagnostics or setup guidance. Silent
fallback is not acceptable.

## CUSTOM

- Commit:
- Workspace:
- Configured mode:
- Template:
- Test order:
- Input product/variant/SKU fields:
- Final `content_ids`:
- Final `contents`:
- Meta payload `content_ids`:
- TikTok payload `contents`:
- Missing field warnings:
- Result:

## Privacy

Do not paste raw email, phone, name, address, customer ID, or full webhook
payloads. Use flags and summaries only.
