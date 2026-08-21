-- CreateTable
CREATE TABLE "interview_evaluation" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "dimensions" JSONB,
    "overallScore" INTEGER,
    "conclusion" TEXT,
    "submittedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_evaluation_interviewId_idx" ON "interview_evaluation"("interviewId");

-- CreateIndex
CREATE INDEX "interview_evaluation_interviewerId_submittedAt_idx" ON "interview_evaluation"("interviewerId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "interview_evaluation_interviewId_interviewerId_key" ON "interview_evaluation"("interviewId", "interviewerId");

-- AddForeignKey
ALTER TABLE "interview_evaluation" ADD CONSTRAINT "interview_evaluation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evaluation" ADD CONSTRAINT "interview_evaluation_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
