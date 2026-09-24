-- CreateEnum
CREATE TYPE "MercadoPagoConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('CREATED', 'CHECKOUT_CREATED', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK');

-- CreateTable
CREATE TABLE "FreeTierEntitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstPublishedListId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeTierEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeProductSlot" (
    "id" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "listItemId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "FreeProductSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MercadoPagoConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mercadoPagoUserId" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "status" "MercadoPagoConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "liveMode" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoPagoConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "encryptedCodeVerifier" TEXT NOT NULL,
    "returnPath" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "listItemId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "contributorName" TEXT,
    "contributorMessage" TEXT,
    "status" "ContributionStatus" NOT NULL DEFAULT 'CREATED',
    "platformFeeRateBps" INTEGER NOT NULL,
    "platformFeeAmountMinor" BIGINT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "mpPreferenceId" TEXT,
    "mpPaymentId" TEXT,
    "mpStatusDetail" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "topic" TEXT,
    "resourceId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "result" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FreeTierEntitlement_userId_key" ON "FreeTierEntitlement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FreeTierEntitlement_firstPublishedListId_key" ON "FreeTierEntitlement"("firstPublishedListId");

-- CreateIndex
CREATE UNIQUE INDEX "FreeProductSlot_listItemId_key" ON "FreeProductSlot"("listItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FreeProductSlot_entitlementId_slotNumber_key" ON "FreeProductSlot"("entitlementId", "slotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MercadoPagoConnection_userId_key" ON "MercadoPagoConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MercadoPagoConnection_mercadoPagoUserId_key" ON "MercadoPagoConnection"("mercadoPagoUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_stateHash_key" ON "OAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contribution_mpPreferenceId_key" ON "Contribution"("mpPreferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Contribution_mpPaymentId_key" ON "Contribution"("mpPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Contribution_idempotencyKey_key" ON "Contribution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Contribution_listItemId_status_idx" ON "Contribution"("listItemId", "status");

-- CreateIndex
CREATE INDEX "Contribution_status_createdAt_idx" ON "Contribution"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_resourceId_idx" ON "WebhookEvent"("provider", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "FreeTierEntitlement" ADD CONSTRAINT "FreeTierEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeTierEntitlement" ADD CONSTRAINT "FreeTierEntitlement_firstPublishedListId_fkey" FOREIGN KEY ("firstPublishedListId") REFERENCES "WishList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeProductSlot" ADD CONSTRAINT "FreeProductSlot_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "FreeTierEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeProductSlot" ADD CONSTRAINT "FreeProductSlot_listItemId_fkey" FOREIGN KEY ("listItemId") REFERENCES "ListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MercadoPagoConnection" ADD CONSTRAINT "MercadoPagoConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_listItemId_fkey" FOREIGN KEY ("listItemId") REFERENCES "ListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
