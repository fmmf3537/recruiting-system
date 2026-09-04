import { env } from './env';
import { llmCallDuration } from './metrics';
import { getActiveLlmConfig } from '../services/ai-config.service';
import { extractJsonFromLlmContent } from '../utils/llm-json';

// 对外再导出，满足 LLM-FIX「从 llm.ts 导出」约定
export { extractJsonFromLlmContent };

// LLM 请求超时（简历解析文本较长，给足 60s；防止 LLM 挂起导致 BullMQ worker 永久占用）
const LLM_TIMEOUT_MS = 60_000;

export interface LlmRuntimeConfig {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider?: string;
  model?: string;
}

export interface CallLLMOptions {
  maxTokens?: number;
  config?: LlmRuntimeConfig;
}

async function callLLM(
  prompt: string,
  systemPrompt?: string,
  // 调用目的标签，写入 Prometheus llmCallDuration.purpose 维度，便于按业务区分统计
  // 兼容旧调用：未传时维持历史默认 'unknown'，避免误读旧指标
  purpose: string = 'unknown',
  options?: CallLLMOptions
): Promise<LLMResponse> {
  const config = options?.config ?? (await getActiveLlmConfig());

  if (!config?.apiKey) {
    throw new Error(`${config?.provider ?? 'LLM'} API key not configured`);
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const end = llmCallDuration.startTimer({ provider: config.provider, purpose });
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.1,
        max_tokens: options?.maxTokens ?? 8000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } };
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage,
      provider: config.provider,
      model: config.model,
    };
  } finally {
    end();
  }
}

export async function extractResumeInfo(resumeText: string): Promise<any> {
  const systemPrompt = `你是一个简历信息提取助手。请从以下简历文本中提取结构化信息。
只返回 JSON 格式，不要包含其他文字。
注意：只提取简历中的公开信息（姓名/学历/工作经历等招聘相关字段），不要在输出中回显手机号、邮箱等个人敏感联系方式；不要编造信息，如与原简历无关不要引用。`;

  const userPrompt = `简历文本：
${resumeText}

请提取以下字段（如果找不到对应信息，返回 null）：
{
  "name": "姓名",
  "phone": "手机号",
  "email": "邮箱",
  "gender": "性别（男/女）",
  "age": 年龄（数字）,
  "workYears": 工作年限（数字）,
  "education": "最高学历",
  "school": "毕业院校",
  "currentCompany": "当前公司",
  "currentPosition": "当前职位",
  "expectedSalary": "期望薪资",
  "workHistory": [
    {
      "company": "公司名称",
      "position": "职位名称",
      "startDate": "开始时间YYYY-MM格式",
      "endDate": "结束时间YYYY-MM格式，如至今则返回null",
      "description": "工作描述"
    }
  ],
  "skills": ["技能1", "技能2"]
}
注意：只返回最近2段工作经历即可，避免内容过长。`;

  const result = await callLLM(userPrompt, systemPrompt);

  if (env.NODE_ENV === 'development') {
    console.log('[LLM] resume extraction completed');
  }

  const jsonStr = extractJsonFromLlmContent(result.content);

  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('Failed to parse LLM response as JSON');
  }
}

export { callLLM };
