-- AlterTable
ALTER TABLE "user" ADD COLUMN     "feishuEmployeeId" TEXT;

-- CreateTable
CREATE TABLE "tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#409EFF',
    "category" TEXT NOT NULL DEFAULT 'custom',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_tag" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_tag" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tag_category_idx" ON "tag"("category");

-- CreateIndex
CREATE UNIQUE INDEX "tag_name_key" ON "tag"("name");

-- CreateIndex
CREATE INDEX "candidate_tag_candidateId_idx" ON "candidate_tag"("candidateId");

-- CreateIndex
CREATE INDEX "candidate_tag_tagId_idx" ON "candidate_tag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_tag_candidateId_tagId_key" ON "candidate_tag"("candidateId", "tagId");

-- CreateIndex
CREATE INDEX "job_tag_jobId_idx" ON "job_tag"("jobId");

-- CreateIndex
CREATE INDEX "job_tag_tagId_idx" ON "job_tag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "job_tag_jobId_tagId_key" ON "job_tag"("jobId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "user_feishuEmployeeId_key" ON "user"("feishuEmployeeId");

-- AddForeignKey
ALTER TABLE "candidate_tag" ADD CONSTRAINT "candidate_tag_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_tag" ADD CONSTRAINT "candidate_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_tag" ADD CONSTRAINT "job_tag_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_tag" ADD CONSTRAINT "job_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
