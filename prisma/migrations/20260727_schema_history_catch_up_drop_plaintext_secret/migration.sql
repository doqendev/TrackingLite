-- Never discard a populated legacy secret unless the same row already has a
-- complete encrypted replacement. A failed guard leaves the additive catch-up
-- migration applied so operators can backfill the encrypted fields and retry.
DO $$
DECLARE
  unsafe_plaintext_count BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Workspace'
      AND column_name = 'shopifyWebhookSecret'
  ) THEN
    EXECUTE $query$
      SELECT COUNT(*)
      FROM "Workspace"
      WHERE NULLIF(BTRIM("shopifyWebhookSecret"), '') IS NOT NULL
        AND (
          NULLIF(BTRIM("shopifyWebhookSecretEncrypted"), '') IS NULL
          OR NULLIF(BTRIM("shopifyWebhookSecretIv"), '') IS NULL
          OR NULLIF(BTRIM("shopifyWebhookSecretTag"), '') IS NULL
        )
    $query$
    INTO unsafe_plaintext_count;

    IF unsafe_plaintext_count > 0 THEN
      RAISE EXCEPTION
        'Refusing to drop Workspace.shopifyWebhookSecret: % row(s) lack a complete encrypted replacement',
        unsafe_plaintext_count
        USING HINT = 'Populate shopifyWebhookSecretEncrypted, shopifyWebhookSecretIv, and shopifyWebhookSecretTag before retrying this migration.';
    END IF;

    EXECUTE 'ALTER TABLE "Workspace" DROP COLUMN "shopifyWebhookSecret"';
  END IF;
END
$$;
