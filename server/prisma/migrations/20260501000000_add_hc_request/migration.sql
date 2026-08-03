-- CreateTable
CREATE TABLE "hc_request" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL,
    "filledCount" INTEGER NOT NULL DEFAULT 0,
    "urgency" TEXT NOT NULL,
    "expectedDate" TIMESTAMP(3),
    "salaryMin" TEXT,
    "salaryMax" TEXT,
    "reason" TEXT NOT NULL,
    "reasonNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT,
    "approveNote" TEXT,
    "createdJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hc_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hc_request_status_idx" ON "hc_request"("status");

-- CreateIndex
CREATE INDEX "hc_request_requesterId_idx" ON "hc_request"("requesterId");

-- CreateIndex
CREATE INDEX "hc_request_department_idx" ON "hc_request"("department");

-- CreateIndex
CREATE INDEX "hc_request_createdAt_idx" ON "hc_request"("createdAt");

-- AddForeignKey
ALTER TABLE "hc_request" ADD CONSTRAINT "hc_request_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hc_request" ADD CONSTRAINT "hc_request_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
