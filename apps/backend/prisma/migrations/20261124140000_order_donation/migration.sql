-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "donationRappen" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "number" DROP NOT NULL;

