-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'BIGCOMMERCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EventName" AS ENUM ('PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "ConsentMode" AS ENUM ('STRICT', 'LAX');

-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('FREE', 'STARTER', 'GROWTH', 'SCALE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

-- CreateEnum
CREATE TYPE "Destination" AS ENUM ('META', 'TIKTOK', 'GA4', 'KLAVIYO', 'REDDIT', 'PINTEREST');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "hashedPassword" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "displayCurrency" TEXT NOT NULL DEFAULT 'USD',
    "language" TEXT NOT NULL DEFAULT 'en',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "platform" "Platform" NOT NULL DEFAULT 'SHOPIFY',
    "apiKey" TEXT NOT NULL,
    "metaPixelId" TEXT,
    "metaAccessTokenEncrypted" TEXT,
    "metaAccessTokenIv" TEXT,
    "metaAccessTokenTag" TEXT,
    "metaTestEventCode" TEXT,
    "enableMeta" BOOLEAN NOT NULL DEFAULT true,
    "tiktokPixelId" TEXT,
    "tiktokAccessTokenEncrypted" TEXT,
    "tiktokAccessTokenIv" TEXT,
    "tiktokAccessTokenTag" TEXT,
    "enableTikTok" BOOLEAN NOT NULL DEFAULT false,
    "ga4MeasurementId" TEXT,
    "ga4ApiSecretEncrypted" TEXT,
    "ga4ApiSecretIv" TEXT,
    "ga4ApiSecretTag" TEXT,
    "enableGA4" BOOLEAN NOT NULL DEFAULT false,
    "klaviyoApiKeyEncrypted" TEXT,
    "klaviyoApiKeyIv" TEXT,
    "klaviyoApiKeyTag" TEXT,
    "enableKlaviyo" BOOLEAN NOT NULL DEFAULT false,
    "redditAccountId" TEXT,
    "redditAccessTokenEncrypted" TEXT,
    "redditAccessTokenIv" TEXT,
    "redditAccessTokenTag" TEXT,
    "enableReddit" BOOLEAN NOT NULL DEFAULT false,
    "pinterestAdAccountId" TEXT,
    "pinterestConversionTokenEncrypted" TEXT,
    "pinterestConversionTokenIv" TEXT,
    "pinterestConversionTokenTag" TEXT,
    "enablePinterest" BOOLEAN NOT NULL DEFAULT false,
    "shopifyWebhookSecret" TEXT,
    "shopifyDomain" TEXT,
    "consentMode" "ConsentMode" NOT NULL DEFAULT 'STRICT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enablePageView" BOOLEAN NOT NULL DEFAULT true,
    "enableViewContent" BOOLEAN NOT NULL DEFAULT true,
    "enableAddToCart" BOOLEAN NOT NULL DEFAULT true,
    "enableInitiateCheckout" BOOLEAN NOT NULL DEFAULT true,
    "enablePurchase" BOOLEAN NOT NULL DEFAULT true,
    "eventsForwardedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventName" "EventName" NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "metaResponse" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "customerIp" TEXT,
    "userAgent" TEXT,
    "fbp" TEXT,
    "fbc" TEXT,
    "pageUrl" TEXT,
    "value" DOUBLE PRECISION,
    "currency" TEXT,
    "numItems" INTEGER,
    "orderId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "gclid" TEXT,
    "ttclid" TEXT,
    "rdtCid" TEXT,
    "epik" TEXT,
    "destination" "Destination" NOT NULL DEFAULT 'META',
    "source" TEXT DEFAULT 'snippet',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "plan" "BillingPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackingDown" BOOLEAN NOT NULL DEFAULT true,
    "highErrorRate" BOOLEAN NOT NULL DEFAULT true,
    "orderLimitWarning" BOOLEAN NOT NULL DEFAULT true,
    "orderLimitReached" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_apiKey_key" ON "Workspace"("apiKey");

-- CreateIndex
CREATE INDEX "Workspace_userId_idx" ON "Workspace"("userId");

-- CreateIndex
CREATE INDEX "Workspace_apiKey_idx" ON "Workspace"("apiKey");

-- CreateIndex
CREATE INDEX "Workspace_shopifyDomain_idx" ON "Workspace"("shopifyDomain");

-- CreateIndex
CREATE INDEX "EventLog_workspaceId_createdAt_idx" ON "EventLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "EventLog_workspaceId_eventName_idx" ON "EventLog"("workspaceId", "eventName");

-- CreateIndex
CREATE INDEX "EventLog_workspaceId_destination_idx" ON "EventLog"("workspaceId", "destination");

-- CreateIndex
CREATE INDEX "EventLog_workspaceId_utmSource_utmCampaign_idx" ON "EventLog"("workspaceId", "utmSource", "utmCampaign");

-- CreateIndex
CREATE INDEX "EventLog_eventId_idx" ON "EventLog"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventLog_workspaceId_eventId_destination_key" ON "EventLog"("workspaceId", "eventId", "destination");

-- CreateIndex
CREATE INDEX "EventLog_status_createdAt_idx" ON "EventLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EventLog_workspaceId_status_createdAt_idx" ON "EventLog"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EventLog_workspaceId_eventName_destination_createdAt_idx" ON "EventLog"("workspaceId", "eventName", "destination", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertPreference_userId_key" ON "AlertPreference"("userId");

-- CreateIndex
CREATE INDEX "AlertLog_userId_alertType_sentAt_idx" ON "AlertLog"("userId", "alertType", "sentAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertPreference" ADD CONSTRAINT "AlertPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
