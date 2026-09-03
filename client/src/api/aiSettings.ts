import request from '@/utils/request';

export type AiProviderId = 'deepseek' | 'zhipu' | 'kimi' | 'minimax';

export interface AiProviderItem {
  provider: AiProviderId;
  name: string;
  baseUrl: string;
  model: string;
  isActive: boolean;
  enabled: boolean;
  apiKeyMask: string | null;
  hasKey: boolean;
}

export interface UpdateAiProviderPayload {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  isActive?: boolean;
  enabled?: boolean;
}

export interface TestAiProviderPayload {
  provider?: AiProviderId;
  apiKey?: string;
}

export interface TestAiProviderResult {
  ok: boolean;
  error?: string;
}

interface ProviderListData {
  success: boolean;
  data: AiProviderItem[];
}

interface ProviderData {
  success: boolean;
  data: AiProviderItem;
  message?: string;
}

interface TestData {
  success: boolean;
  data: TestAiProviderResult;
}

export function getAiProviders() {
  return request.get('/settings/ai-providers') as Promise<ProviderListData>;
}

export function updateAiProvider(provider: AiProviderId, payload: UpdateAiProviderPayload) {
  return request.put(`/settings/ai-providers/${provider}`, payload) as Promise<ProviderData>;
}

export function testAiProvider(payload?: TestAiProviderPayload) {
  return request.post('/settings/ai-providers/test', payload ?? {}, {
    timeout: 65000,
  }) as Promise<TestData>;
}
