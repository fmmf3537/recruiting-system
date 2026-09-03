import type { Prisma } from '@prisma/client';

import { decryptSecret, encryptSecret } from '../lib/crypto';
import { callLLM, type LlmRuntimeConfig } from '../lib/llm';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDERS,
  envApiKeyOf,
  getActiveLlmConfig,
  invalidate,
  isAiProviderId,
  type AiProviderId,
} from './ai-config.service';

export interface AiProviderPublic {
  provider: AiProviderId;
  name: string;
  baseUrl: string;
  model: string;
  isActive: boolean;
  enabled: boolean;
  apiKeyMask: string | null;
  hasKey: boolean;
}

export interface UpdateAiProviderInput {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  isActive?: boolean;
  enabled?: boolean;
}

export interface TestConnectionInput {
  provider?: AiProviderId;
  apiKey?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
}

/** 掩码：明文 ≤8 位全 ****；否则首 4 + **** + 尾 4 */
export function maskApiKey(plain: string): string {
  if (plain.length <= 8) {
    return '****';
  }
  return `${plain.slice(0, 4)}****${plain.slice(-4)}`;
}

function toPublic(
  provider: AiProviderId,
  row: {
    baseUrl: string;
    model: string;
    isActive: boolean;
    enabled: boolean;
    apiKeyEnc: string | null;
    apiKeyMask: string | null;
  } | null
): AiProviderPublic {
  const preset = AI_PROVIDER_PRESETS[provider];
  return {
    provider,
    name: preset.name,
    baseUrl: row?.baseUrl ?? preset.baseUrl,
    model: row?.model ?? preset.model,
    isActive: row?.isActive ?? false,
    enabled: row?.enabled ?? true,
    apiKeyMask: row?.apiKeyMask ?? null,
    hasKey: Boolean(row?.apiKeyEnc),
  };
}

async function writeOpLog(
  userId: string,
  targetId: string,
  action: string,
  detail: Prisma.InputJsonValue
): Promise<void> {
  try {
    await prisma.operationLog.create({
      data: {
        userId,
        targetType: 'System',
        targetId,
        action,
        detail,
      },
    });
  } catch (err) {
    logger.error({ err, action, targetId }, '[AI Settings] OperationLog 写入失败');
  }
}

/** 首次写接口前按预置常量 upsert 四行（key 空、isActive=false） */
export async function ensureDefaultRows(): Promise<void> {
  await Promise.all(
    AI_PROVIDERS.map((provider) => {
      const preset = AI_PROVIDER_PRESETS[provider];
      return prisma.aiProviderConfig.upsert({
        where: { provider },
        create: {
          provider,
          baseUrl: preset.baseUrl,
          model: preset.model,
          isActive: false,
          enabled: true,
        },
        update: {},
      });
    })
  );
}

/** 返回四家（DB 缺失时用预置常量补齐展示），绝不返回明文 */
export async function listProviders(): Promise<AiProviderPublic[]> {
  const rows = await prisma.aiProviderConfig.findMany();
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  return AI_PROVIDERS.map((provider) => toPublic(provider, byProvider.get(provider) ?? null));
}

export async function updateProvider(
  provider: string,
  input: UpdateAiProviderInput,
  userId: string
): Promise<AiProviderPublic> {
  if (!isAiProviderId(provider)) {
    throw new AppError('不支持的 AI 提供方', 400);
  }

  await ensureDefaultRows();

  const existing = await prisma.aiProviderConfig.findUnique({ where: { provider } });
  if (!existing) {
    throw new AppError('提供方配置不存在', 404);
  }

  const trimmedKey = input.apiKey?.trim() ?? '';
  const data: Prisma.AiProviderConfigUpdateInput = {
    updatedById: userId,
  };
  if (input.baseUrl !== undefined) {
    data.baseUrl = input.baseUrl;
  }
  if (input.model !== undefined) {
    data.model = input.model;
  }
  if (input.enabled !== undefined) {
    data.enabled = input.enabled;
  }
  if (trimmedKey) {
    data.apiKeyEnc = encryptSecret(trimmedKey);
    data.apiKeyMask = maskApiKey(trimmedKey);
  }

  if (input.isActive === true) {
    const hasKey = Boolean(trimmedKey || existing.apiKeyEnc);
    if (!hasKey) {
      throw new AppError('请先填写 API Key 再启用此提供方', 400);
    }
    data.isActive = true;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.aiProviderConfig.updateMany({
        where: { provider: { not: provider } },
        data: { isActive: false },
      });
      return tx.aiProviderConfig.update({
        where: { provider },
        data,
      });
    });
    invalidate();
    await writeOpLog(userId, provider, 'ai_provider_update', {
      provider,
      enabled: updated.enabled,
      isActive: updated.isActive,
      hasKey: Boolean(updated.apiKeyEnc),
    });
    return toPublic(provider, updated);
  }

  if (input.isActive === false) {
    data.isActive = false;
  }

  const updated = await prisma.aiProviderConfig.update({
    where: { provider },
    data,
  });
  invalidate();
  await writeOpLog(userId, provider, 'ai_provider_update', {
    provider,
    enabled: updated.enabled,
    isActive: updated.isActive,
    hasKey: Boolean(updated.apiKeyEnc),
  });
  return toPublic(provider, updated);
}

function classifyLlmError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || name === 'AbortError' || /timeout/i.test(msg)) {
    return '连接超时';
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(msg)) {
    return '网络错误，无法连接提供方';
  }
  if (/401|invalid api key|unauthorized|incorrect api key/i.test(msg)) {
    return '密钥无效（401）';
  }
  if (/model.*(not found|does not exist)|404/i.test(msg)) {
    return '模型不存在';
  }
  const stripped = msg.replace(/^LLM API error:\s*/i, '').trim();
  return stripped || '连接测试失败';
}

async function resolveTestConfig(input: TestConnectionInput): Promise<LlmRuntimeConfig | null> {
  const tempKey = input.apiKey?.trim() ?? '';

  if (input.provider) {
    const preset = AI_PROVIDER_PRESETS[input.provider];
    const row = await prisma.aiProviderConfig.findUnique({
      where: { provider: input.provider },
    });
    let apiKey = tempKey;
    if (!apiKey && row?.apiKeyEnc) {
      apiKey = decryptSecret(row.apiKeyEnc);
    }
    if (!apiKey) {
      apiKey = envApiKeyOf(input.provider) ?? '';
    }
    if (!apiKey) {
      return null;
    }
    return {
      provider: input.provider,
      baseUrl: row?.baseUrl ?? preset.baseUrl,
      model: row?.model ?? preset.model,
      apiKey,
    };
  }

  const active = await getActiveLlmConfig();
  if (!active && !tempKey) {
    return null;
  }
  if (active) {
    return {
      ...active,
      apiKey: tempKey || active.apiKey,
    };
  }
  return null;
}

/**
 * 连接测试：不落库。都不传则测当前激活配置；可带 provider / 临时 key。
 */
export async function testConnection(
  input: TestConnectionInput,
  userId: string
): Promise<TestConnectionResult> {
  if (input.provider && !isAiProviderId(input.provider)) {
    throw new AppError('不支持的 AI 提供方', 400);
  }

  const targetId = input.provider ?? 'active';
  let config: LlmRuntimeConfig | null;
  try {
    config = await resolveTestConfig(input);
  } catch (err) {
    const error = classifyLlmError(err);
    await writeOpLog(userId, targetId, 'ai_provider_test', { ok: false, error });
    return { ok: false, error };
  }

  if (!config) {
    const error = 'API key not configured';
    await writeOpLog(userId, targetId, 'ai_provider_test', { ok: false, error });
    return { ok: false, error };
  }

  try {
    await callLLM('ping', undefined, 'ai-provider-test', {
      maxTokens: 8,
      config,
    });
    await writeOpLog(userId, targetId, 'ai_provider_test', {
      ok: true,
      provider: config.provider,
    });
    return { ok: true };
  } catch (err) {
    const error = classifyLlmError(err);
    await writeOpLog(userId, targetId, 'ai_provider_test', {
      ok: false,
      provider: config.provider,
      error,
    });
    return { ok: false, error };
  }
}
