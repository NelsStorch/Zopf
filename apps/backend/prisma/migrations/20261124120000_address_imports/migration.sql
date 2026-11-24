-- CreateTable
CREATE TABLE "address_imports" (
    "id" SERIAL NOT NULL,
    "zipCodes" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "imported" INTEGER NOT NULL DEFAULT 0,
    "removed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "userId" INTEGER,

    CONSTRAINT "address_imports_pkey" PRIMARY KEY ("id")
);

