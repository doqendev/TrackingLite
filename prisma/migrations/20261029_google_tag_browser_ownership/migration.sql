ALTER TABLE "Workspace"
  ADD COLUMN "googleTagId" TEXT,
  ADD COLUMN "googleTagPurchaseLabel" TEXT,
  ADD COLUMN "googleTagAddToCartLabel" TEXT,
  ADD COLUMN "googleTagBeginCheckoutLabel" TEXT,
  ADD COLUMN "googleTagPageViewLabel" TEXT,
  ADD COLUMN "googleBrowserTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;
