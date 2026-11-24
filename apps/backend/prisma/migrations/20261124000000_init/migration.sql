-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('QR_INVOICE', 'ON_DELIVERY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('OPEN', 'PAID');

-- CreateEnum
CREATE TYPE "PaidVia" AS ENUM ('BANK', 'CASH', 'TWINT');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'NOT_HOME');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('DIRECTORY', 'GEOCODED', 'MANUAL', 'NONE');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "deliveryDate" DATE NOT NULL,
    "deliveryTimeText" TEXT,
    "orderDeadline" TIMESTAMP(3) NOT NULL,
    "infoDe" TEXT,
    "infoEn" TEXT,
    "purposeDe" TEXT,
    "purposeEn" TEXT,
    "invoiceDueDays" INTEGER NOT NULL DEFAULT 30,
    "zipCodes" TEXT[],
    "depotLat" DOUBLE PRECISION,
    "depotLng" DOUBLE PRECISION,
    "orderPrefix" TEXT NOT NULL,
    "nextOrderNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "nameDe" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionDe" TEXT,
    "descriptionEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_sizes" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "labelDe" TEXT NOT NULL,
    "labelEn" TEXT,
    "priceRappen" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" SERIAL NOT NULL,
    "egaid" BIGINT NOT NULL,
    "street" TEXT NOT NULL,
    "houseNumber" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "searchText" TEXT NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "locale" TEXT NOT NULL DEFAULT 'de',
    "confirmTokenHash" TEXT,
    "accessTokenHash" TEXT,
    "confirmExpiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "customerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "addressId" INTEGER,
    "street" TEXT NOT NULL,
    "houseNumber" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "addressManual" BOOLEAN NOT NULL DEFAULT false,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "locationSource" "LocationSource" NOT NULL DEFAULT 'NONE',
    "notes" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'OPEN',
    "paidVia" "PaidVia",
    "paidAt" TIMESTAMP(3),
    "totalRappen" INTEGER NOT NULL,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "deliveryNote" TEXT,
    "routeId" INTEGER,
    "routeSeq" INTEGER,
    "reminderOptIn" BOOLEAN NOT NULL DEFAULT false,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productSizeId" INTEGER,
    "productName" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceRappen" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "leaders" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "accessTokenHash" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_events" (
    "id" SERIAL NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "routeId" INTEGER,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "clientCreatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_contacts" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "confirmTokenHash" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribeTokenHash" TEXT NOT NULL,
    "lastRemindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_mail_logs" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_mail_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_mails" (
    "id" SERIAL NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_mails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "routeId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" INTEGER,
    "data" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns"("slug");

-- CreateIndex
CREATE INDEX "products_campaignId_idx" ON "products"("campaignId");

-- CreateIndex
CREATE INDEX "product_sizes_productId_idx" ON "product_sizes"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "addresses_egaid_key" ON "addresses"("egaid");

-- CreateIndex
CREATE INDEX "addresses_zip_idx" ON "addresses"("zip");

-- CreateIndex
CREATE INDEX "addresses_searchText_idx" ON "addresses"("searchText");

-- CreateIndex
CREATE UNIQUE INDEX "orders_confirmTokenHash_key" ON "orders"("confirmTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "orders_accessTokenHash_key" ON "orders"("accessTokenHash");

-- CreateIndex
CREATE INDEX "orders_campaignId_status_idx" ON "orders"("campaignId", "status");

-- CreateIndex
CREATE INDEX "orders_routeId_idx" ON "orders"("routeId");

-- CreateIndex
CREATE INDEX "orders_email_idx" ON "orders"("email");

-- CreateIndex
CREATE UNIQUE INDEX "orders_campaignId_number_key" ON "orders"("campaignId", "number");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "routes_accessTokenHash_key" ON "routes"("accessTokenHash");

-- CreateIndex
CREATE INDEX "routes_campaignId_idx" ON "routes"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_events_clientEventId_key" ON "delivery_events"("clientEventId");

-- CreateIndex
CREATE INDEX "delivery_events_orderId_idx" ON "delivery_events"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_contacts_email_key" ON "reminder_contacts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_contacts_confirmTokenHash_key" ON "reminder_contacts"("confirmTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_contacts_unsubscribeTokenHash_key" ON "reminder_contacts"("unsubscribeTokenHash");

-- CreateIndex
CREATE INDEX "order_mail_logs_orderId_idx" ON "order_mail_logs"("orderId");

-- CreateIndex
CREATE INDEX "outbox_mails_nextAttempt_idx" ON "outbox_mails"("nextAttempt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productSizeId_fkey" FOREIGN KEY ("productSizeId") REFERENCES "product_sizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_mail_logs" ADD CONSTRAINT "order_mail_logs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

