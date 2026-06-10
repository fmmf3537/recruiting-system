-- DropIndex
DROP INDEX "stage_record_candidateId_idx";

-- CreateIndex
CREATE INDEX "candidate_name_idx" ON "candidate"("name");

-- CreateIndex
CREATE INDEX "job_title_idx" ON "job"("title");

-- CreateIndex
CREATE INDEX "stage_record_candidateId_enteredAt_idx" ON "stage_record"("candidateId", "enteredAt");
