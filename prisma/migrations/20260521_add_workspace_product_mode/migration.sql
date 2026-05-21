-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "WorkspaceProductMode" AS ENUM ('SHOPIFY_META_TIKTOK_V1', 'LEGACY_ALL_DESTINATIONS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "WorkspaceInstallType" AS ENUM ('SHOPIFY_CUSTOM_PIXEL', 'HEADLESS_CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "productMode" "WorkspaceProductMode";
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "installType" "WorkspaceInstallType";
