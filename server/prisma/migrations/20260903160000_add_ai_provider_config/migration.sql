-- AI 提供方配置：密钥 AES-256-GCM 密文落库；表为空时运行时回退环境变量

CREATE TABLE "ai_provider_config" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "apiKeyEnc" TEXT,
    "apiKeyMask" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_provider_config_provider_key" ON "ai_provider_config"("provider");
