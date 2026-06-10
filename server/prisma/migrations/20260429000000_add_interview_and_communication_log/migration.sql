-- CreateTable
CREATE TABLE "interview" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT,
    "round" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "interviewers" JSONB NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "location" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_log" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "result" TEXT,
    "followUpAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_candidateId_idx" ON "interview"("candidateId");

-- CreateIndex
CREATE INDEX "interview_jobId_idx" ON "interview"("jobId");

-- CreateIndex
CREATE INDEX "interview_scheduledAt_idx" ON "interview"("scheduledAt");

-- CreateIndex
CREATE INDEX "interview_status_idx" ON "interview"("status");

-- CreateIndex
CREATE INDEX "interview_createdById_idx" ON "interview"("createdById");

-- CreateIndex
CREATE INDEX "interview_scheduledAt_status_idx" ON "interview"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "communication_log_candidateId_idx" ON "communication_log"("candidateId");

-- CreateIndex
CREATE INDEX "communication_log_candidateId_createdAt_idx" ON "communication_log"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "communication_log_type_idx" ON "communication_log"("type");

-- CreateIndex
CREATE INDEX "communication_log_followUpAt_idx" ON "communication_log"("followUpAt");

-- AddForeignKey
ALTER TABLE "interview" ADD CONSTRAINT "interview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview" ADD CONSTRAINT "interview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview" ADD CONSTRAINT "interview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_log" ADD CONSTRAINT "communication_log_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_log" ADD CONSTRAINT "communication_log_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
