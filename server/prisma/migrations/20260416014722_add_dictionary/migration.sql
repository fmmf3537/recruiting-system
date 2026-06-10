-- CreateTable
CREATE TABLE "dictionary" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dictionary_category_idx" ON "dictionary"("category");

-- CreateIndex
CREATE INDEX "dictionary_category_enabled_idx" ON "dictionary"("category", "enabled");

-- CreateIndex
CREATE INDEX "dictionary_category_sortOrder_idx" ON "dictionary"("category", "sortOrder");
