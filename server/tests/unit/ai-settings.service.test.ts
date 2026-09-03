import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    aiProviderConfig: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { default: mock };
});

const callLLMMock = vi.fn();
vi.mock('../../src/lib/llm', () => ({
  callLLM: (...args: unknown[]) => callLLMMock(...args),
}));

import prisma from '../../src/lib/prisma';
import { decryptSecret, encryptSecret } from '../../src/lib/crypto';
import {
  ensureDefaultRows,
  listProviders,
  maskApiKey,
  testConnection,
  updateProvider,
} from '../../src/services/ai-settings.service';

const USER_ID = 'user-admin-1';

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-1',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    isActive: false,
    enabled: true,
    apiKeyEnc: null,
    apiKeyMask: null,
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ai-settings.service - AI 提供方设置', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.aiProviderConfig.upsert).mockResolvedValue(baseRow() as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const callback = fn as (tx: typeof prisma) => Promise<unknown>;
      return callback(prisma);
    });
  });

  describe('maskApiKey', () => {
    it('明文 ≤8 位返回 ****', () => {
      expect(maskApiKey('short')).toBe('****');
      expect(maskApiKey('12345678')).toBe('****');
    });

    it('超过 8 位为首 4 + **** + 尾 4', () => {
      expect(maskApiKey('123456789')).toBe('1234****6789');
      expect(maskApiKey('sk-abcdefghijklmnop')).toBe('sk-a****mnop');
    });
  });

  describe('encryptSecret / decryptSecret', () => {
    it('加密往返还原明文，格式为 iv:tag:cipher', () => {
      const enc = encryptSecret('sk-hello-world-key');
      const parts = enc.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toHaveLength(24); // 12 bytes hex
      expect(parts[1]).toHaveLength(32); // 16 bytes hex
      expect(decryptSecret(enc)).toBe('sk-hello-world-key');
    });

    it('密文损坏时抛业务错误', () => {
      expect(() => decryptSecret('not-a-valid-payload')).toThrow(
        'AI 配置解密失败，请检查 AI_CONFIG_ENC_KEY'
      );
    });
  });

  describe('ensureDefaultRows', () => {
    it('对四家提供方幂等 upsert（update 为空对象，不覆盖已有 key）', async () => {
      await ensureDefaultRows();
      await ensureDefaultRows();
      expect(prisma.aiProviderConfig.upsert).toHaveBeenCalledTimes(8);
      const firstCall = vi.mocked(prisma.aiProviderConfig.upsert).mock.calls[0][0];
      expect(firstCall.update).toEqual({});
      expect(firstCall.create).toMatchObject({
        isActive: false,
        enabled: true,
        provider: 'deepseek',
      });
      const providers = vi
        .mocked(prisma.aiProviderConfig.upsert)
        .mock.calls.slice(0, 4)
        .map((c) => c[0].where.provider);
      expect(providers.sort()).toEqual(['deepseek', 'kimi', 'minimax', 'zhipu']);
    });
  });

  describe('listProviders', () => {
    it('DB 为空时用预置常量补齐四家，且不含明文', async () => {
      vi.mocked(prisma.aiProviderConfig.findMany).mockResolvedValue([]);
      const list = await listProviders();
      expect(list).toHaveLength(4);
      expect(list.map((p) => p.provider)).toEqual(['deepseek', 'zhipu', 'kimi', 'minimax']);
      list.forEach((p) => {
        expect(p).not.toHaveProperty('apiKeyEnc');
        expect(p.hasKey).toBe(false);
        expect(p.apiKeyMask).toBeNull();
      });
    });
  });

  describe('updateProvider', () => {
    it('isActive 唯一切换：先 updateMany 置其它行为 false，再置本行 true', async () => {
      const enc = encryptSecret('sk-existing-key-xxxx');
      vi.mocked(prisma.aiProviderConfig.findUnique).mockResolvedValue(
        baseRow({ apiKeyEnc: enc, apiKeyMask: 'sk-e****xxxx' }) as never
      );
      vi.mocked(prisma.aiProviderConfig.updateMany).mockResolvedValue({ count: 3 } as never);
      vi.mocked(prisma.aiProviderConfig.update).mockResolvedValue(
        baseRow({ isActive: true, apiKeyEnc: enc, apiKeyMask: 'sk-e****xxxx' }) as never
      );

      const result = await updateProvider('deepseek', { isActive: true }, USER_ID);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.aiProviderConfig.updateMany).toHaveBeenCalledWith({
        where: { provider: { not: 'deepseek' } },
        data: { isActive: false },
      });
      expect(prisma.aiProviderConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { provider: 'deepseek' },
          data: expect.objectContaining({ isActive: true }),
        })
      );
      expect(result.isActive).toBe(true);
      expect(result).not.toHaveProperty('apiKeyEnc');
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ai_provider_update',
            targetType: 'System',
            detail: expect.objectContaining({ provider: 'deepseek', isActive: true }),
          }),
        })
      );
    });

    it('无 key 时激活拒绝', async () => {
      vi.mocked(prisma.aiProviderConfig.findUnique).mockResolvedValue(
        baseRow({ apiKeyEnc: null }) as never
      );

      await expect(updateProvider('deepseek', { isActive: true }, USER_ID)).rejects.toMatchObject({
        message: '请先填写 API Key 再启用此提供方',
        statusCode: 400,
      } satisfies Partial<AppError>);
      expect(prisma.aiProviderConfig.update).not.toHaveBeenCalled();
    });

    it('apiKey 留空不覆盖已有密文', async () => {
      const enc = encryptSecret('sk-keep-me');
      vi.mocked(prisma.aiProviderConfig.findUnique).mockResolvedValue(
        baseRow({ apiKeyEnc: enc, apiKeyMask: 'sk-k****e-me' }) as never
      );
      vi.mocked(prisma.aiProviderConfig.update).mockResolvedValue(
        baseRow({ apiKeyEnc: enc, apiKeyMask: 'sk-k****e-me', model: 'new-model' }) as never
      );

      await updateProvider('deepseek', { model: 'new-model', apiKey: '' }, USER_ID);

      const data = vi.mocked(prisma.aiProviderConfig.update).mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(data.model).toBe('new-model');
      expect(data).not.toHaveProperty('apiKeyEnc');
      expect(data).not.toHaveProperty('apiKeyMask');
    });

    it('非法 provider 返回 400', async () => {
      await expect(updateProvider('openai', { isActive: true }, USER_ID)).rejects.toMatchObject({
        message: '不支持的 AI 提供方',
        statusCode: 400,
      });
    });
  });

  describe('testConnection', () => {
    it('错误透出 401，且不落库', async () => {
      callLLMMock.mockRejectedValue(new Error('LLM API error: 401 - invalid api key'));

      const result = await testConnection(
        { provider: 'deepseek', apiKey: 'sk-wrong-key' },
        USER_ID
      );

      expect(result).toEqual({ ok: false, error: '密钥无效（401）' });
      expect(prisma.aiProviderConfig.update).not.toHaveBeenCalled();
      expect(prisma.aiProviderConfig.create).not.toHaveBeenCalled();
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ai_provider_test',
            detail: expect.objectContaining({ ok: false }),
          }),
        })
      );
    });

    it('成功返回 ok: true', async () => {
      callLLMMock.mockResolvedValue({ content: 'pong' });
      const result = await testConnection(
        { provider: 'deepseek', apiKey: 'sk-good-key' },
        USER_ID
      );
      expect(result).toEqual({ ok: true });
      expect(callLLMMock).toHaveBeenCalledWith(
        'ping',
        undefined,
        'ai-provider-test',
        expect.objectContaining({
          maxTokens: 8,
          config: expect.objectContaining({ apiKey: 'sk-good-key', provider: 'deepseek' }),
        })
      );
    });
  });
});
