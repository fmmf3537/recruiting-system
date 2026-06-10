-- CreateIndex
CREATE INDEX "candidate_source_createdAt_idx" ON "candidate"("source", "createdAt");

-- CreateIndex
CREATE INDEX "candidate_education_createdAt_idx" ON "candidate"("education", "createdAt");

-- CreateIndex
CREATE INDEX "job_status_createdAt_idx" ON "job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "job_type_createdAt_idx" ON "job"("type", "createdAt");

-- CreateIndex
CREATE INDEX "job_location_createdAt_idx" ON "job"("location", "createdAt");

-- CreateIndex
CREATE INDEX "stage_record_stage_enteredAt_idx" ON "stage_record"("stage", "enteredAt");

-- CreateIndex
CREATE INDEX "stage_record_status_enteredAt_idx" ON "stage_record"("status", "enteredAt");

-- CreateIndex
CREATE INDEX "stage_record_candidateId_stage_enteredAt_idx" ON "stage_record"("candidateId", "stage", "enteredAt");
