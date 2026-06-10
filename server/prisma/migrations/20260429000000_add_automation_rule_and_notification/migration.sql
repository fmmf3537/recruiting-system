-- CreateTable
CREATE TABLE "automation_rule" (
    "id" TEXT NOT NULL,
    "triggerStage" TEXT NOT NULL,
    "triggerStatus" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "businessId" TEXT,
    "businessType" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_rule_triggerStage_triggerStatus_idx" ON "automation_rule"("triggerStage", "triggerStatus");

-- CreateIndex
CREATE INDEX "automation_rule_enabled_idx" ON "automation_rule"("enabled");

-- CreateIndex
CREATE INDEX "notification_recipientId_isRead_idx" ON "notification"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "notification_recipientId_createdAt_idx" ON "notification"("recipientId", "createdAt");

-- AddForeignKey
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
