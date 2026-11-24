-- AlterTable
ALTER TABLE "campaigns" DROP COLUMN "depotLat",
DROP COLUMN "depotLng";

-- AlterTable
ALTER TABLE "routes" ADD COLUMN     "depotId" INTEGER;

-- CreateTable
CREATE TABLE "depots" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "houseNumber" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "depots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "depots_campaignId_idx" ON "depots"("campaignId");

-- AddForeignKey
ALTER TABLE "depots" ADD CONSTRAINT "depots_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "depots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

