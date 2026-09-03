import { env } from '../lib/env';
import { decryptSecret } from '../lib/crypto';
import prisma from '../lib/prisma';

/** 本期固定四家提供方，不支持自定义新增 */
export const AI_PROVIDERS = ['deepseek', 'zhipu', 'kimi', 'minimax'] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export function isAiProviderId(value: string): value is AiProviderId {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

/** 预置 baseUrl / model / 中文名（从原 llm.ts 静态配置迁出，单处收口） */
export const AI_PROVIDER_PRESETS: Record<
  AiProviderId,
  { name: string; baseUrl: string; model: string }
> = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  zhipu: {
    name: '智谱',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
  },
  kimi: {
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
  minimax: {
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    model: 'abab6.5s-chat',
  },
};

export interface ActiveLlmConfig {
  provider: AiProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
}

const CACHE_TTL_MS = 30_000;

let cache: { value: ActiveLlmConfig | null; expiresAt: number } | null = null;

/** 配置写成功后调用，下次读取跳过缓存 */
export function invalidate(): void {
  cache = null;
}

export function envApiKeyOf(provider: AiProviderId): string | undefined {
  switch (provider) {
    case 'deepseek':
      return env.DEEPSEEK_API_KEY;
    case 'zhipu':
      return env.ZHIPU_API_KEY;
    case 'kimi':
      return env.KIMI_API_KEY;
    case 'minimax':
      return env.MINIMAX_API_KEY;
  }
}

function fromEnv(): ActiveLlmConfig | null {
  const provider = env.LLM_PROVIDER;
  const apiKey = envApiKeyOf(provider);
  if (!apiKey) {
    return null;
  }
  const preset = AI_PROVIDER_PRESETS[provider];
  return {
    provider,
    baseUrl: preset.baseUrl,
    model: preset.model,
    apiKey,
  };
}

async function loadActiveLlmConfig(): Promise<ActiveLlmConfig | null> {
  const row = await prisma.aiProviderConfig.findFirst({
    where: { isActive: true, enabled: true },
  });
  if (row?.apiKeyEnc) {
    try {
      const apiKey = decryptSecret(row.apiKeyEnc);
      if (apiKey) {
        const provider = isAiProviderId(row.provider) ? row.provider : env.LLM_PROVIDER;
        return {
          provider,
          baseUrl: row.baseUrl,
          model: row.model,
          apiKey,
        };
      }
    } catch {
      // 解密失败（主密钥变更等）回退环境变量，不阻断现有 AI 能力
    }
  }
  return fromEnv();
}

/**
 * 当前生效的 LLM 配置：DB 激活行优先，否则回退环境变量；都无 key 返回 null。
 * 进程内缓存 30s。
 */
export async function getActiveLlmConfig(): Promise<ActiveLlmConfig | null> {
  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return cache.value;
  }
  const value = await loadActiveLlmConfig();
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** 供记录归属用：provider/model；无配置时退回 env.LLM_PROVIDER */
export async function getActiveLlmProviderLabel(): Promise<string> {
  const cfg = await getActiveLlmConfig();
  if (!cfg) {
    return env.LLM_PROVIDER;
  }
  return `${cfg.provider}/${cfg.model}`;
}
