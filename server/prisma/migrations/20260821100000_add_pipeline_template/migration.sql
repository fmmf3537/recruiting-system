-- AlterTable
ALTER TABLE "job" ADD COLUMN     "pipelineTemplateId" TEXT;

-- CreateTable
CREATE TABLE "pipeline_template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stages" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_template_type_isDefault_idx" ON "pipeline_template"("type", "isDefault");

-- CreateIndex
CREATE INDEX "job_pipelineTemplateId_idx" ON "job"("pipelineTemplateId");

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_pipelineTemplateId_fkey" FOREIGN KEY ("pipelineTemplateId") REFERENCES "pipeline_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
