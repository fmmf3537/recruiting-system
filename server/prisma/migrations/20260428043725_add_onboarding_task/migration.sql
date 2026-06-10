-- CreateTable
CREATE TABLE "onboarding_task" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "assigneeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_task_candidateId_idx" ON "onboarding_task"("candidateId");

-- CreateIndex
CREATE INDEX "onboarding_task_status_idx" ON "onboarding_task"("status");

-- CreateIndex
CREATE INDEX "onboarding_task_category_idx" ON "onboarding_task"("category");

-- AddForeignKey
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
