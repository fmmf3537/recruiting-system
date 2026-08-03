-- CreateTable
CREATE TABLE "upload_record" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT,
    "mimetype" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "upload_record_filename_key" ON "upload_record"("filename");

-- CreateIndex
CREATE INDEX "upload_record_uploadedById_idx" ON "upload_record"("uploadedById");

-- AddForeignKey
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
