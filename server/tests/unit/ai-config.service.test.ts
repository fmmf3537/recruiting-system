import { describe, it, expect, vi, beforeEach } from 'vitest';

const envMock = vi.hoisted(() => ({
  LLM_PROVIDER: 'deepseek' as 'deepseek' | 'zhipu' | 'kimi' | 'minimax',
  DEEPSEEK_API_KEY: 'sk-env-deepseek-key' as string | undefined,
  ZHIPU_API_KEY: undefined as string | undefined,
  KIMI_API_KEY: undefined as string | undefined,
  MINIMAX_API_KEY: undefined as string | undefined,
  JWT_SECRET: 'test-secret-key-for-testing-only',
}));

vi.mock('../../src/lib/env', () => ({
  env: envMock,
  AI_CONFIG_ENC_KEY: Buffer.alloc(32, 7),
}));

vi.mock('../../src/lib/prisma', () => ({
  default: {
    aiProviderConfig: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import prisma from '../../src/lib/prisma';
import { encryptSecret } from '../../src/lib/crypto';
import {
  getActiveLlmConfig,
  getActiveLlmProviderLabel,
  invalidate,
} from '../../src/services/ai-config.service';

describe('ai-config.service - 热生效 LLM 配置', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidate();
    envMock.LLM_PROVIDER = 'deepseek';
    envMock.DEEPSEEK_API_KEY = 'sk-env-deepseek-key';
    envMock.ZHIPU_API_KEY = undefined;
    envMock.KIMI_API_KEY = undefined;
    envMock.MINIMAX_API_KEY = undefined;
  });

  it('DB 命中优先：激活且启用且有密文时解密返回，不走 env', async () => {
    const apiKeyEnc = encryptSecret('sk-db-kimi-key-xxxx');
    vi.mocked(prisma.aiProviderConfig.findFirst).mockResolvedValue({
      provider: 'kimi',
      baseUrl: 'https://custom.moonshot.example/v1',
      model: 'custom-kimi',
      isActive: true,
      enabled: true,
      apiKeyEnc,
    } as never);

    const cfg = await getActiveLlmConfig();
    expect(cfg).toEqual({
      provider: 'kimi',
      baseUrl: 'https://custom.moonshot.example/v1',
      model: 'custom-kimi',
      apiKey: 'sk-db-kimi-key-xxxx',
    });
    expect(cfg?.apiKey).not.toBe(envMock.DEEPSEEK_API_KEY);
  });

  it('DB 空时回退 env.LLM_PROVIDER + 预置 baseUrl/model', async () => {
    vi.mocked(prisma.aiProviderConfig.findFirst).mockResolvedValue(null);

    const cfg = await getActiveLlmConfig();
    expect(cfg).toEqual({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'sk-env-deepseek-key',
    });
  });

  it('解密失败时回退 env，不抛错', async () => {
    vi.mocked(prisma.aiProviderConfig.findFirst).mockResolvedValue({
      provider: 'zhipu',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4-flash',
      isActive: true,
      enabled: true,
      apiKeyEnc: `${'aa'.repeat(12)}:${'bb'.repeat(16)}:${'cc'.repeat(16)}`,
    } as never);

    const cfg = await getActiveLlmConfig();
    expect(cfg?.provider).toBe('deepseek');
    expect(cfg?.apiKey).toBe('sk-env-deepseek-key');
  });

  it('缓存命中不重复查库；invalidate 后重读', async () => {
    vi.mocked(prisma.aiProviderConfig.findFirst).mockResolvedValue(null);

    const first = await getActiveLlmConfig();
    const second = await getActiveLlmConfig();
    expect(first).toEqual(second);
    expect(prisma.aiProviderConfig.findFirst).toHaveBeenCalledTimes(1);

    invalidate();
    vi.mocked(prisma.aiProviderConfig.findFirst).mockResolvedValue({
      provider: 'minimax',
      baseUrl: 'https://api.minimax.chat/v1',
      model: 'abab6.5s-chat',
      isActive: true,
      enabled: true,
      apiKeyEnc: encryptSecret('sk-minimax-from-db'),
    } as never);

    const third = await getActiveLlmConfig();
    expect(prisma.aiProviderConfig.findFirst).toHaveBeenCalledTimes(2);
    expect(third?.provider).toBe('minimax');
    expect(third?.apiKey).toBe('sk-minimax-from-db');
  });

  it('DB 与 env 都无 key 时返回 null', async () => {
    vi.mocked(prisma.aiProviderConfig.findFirst).mockResolvedValue(null);
    envMock.DEEPSEEK_API_KEY = undefined;

    const cfg = await getActiveLlmConfig();
    expect(cfg).toBeNull();
  });

  it('getActiveLlmProviderLabel 返回 provider/model', async () => {
    vi.mocked(prisma.aiProviderConfig.findFirst).mockResolvedValue(null);
    const label = await getActiveLlmProviderLabel();
    expect(label).toBe('deepseek/deepseek-chat');
  });
});
