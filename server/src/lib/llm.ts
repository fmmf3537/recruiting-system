import { env } from './env';
import { llmCallDuration } from './metrics';

const LLM_CONFIG = {
  provider: env.LLM_PROVIDER,
  deepseek: {
    apiKey: env.DEEPSEEK_API_KEY,
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  zhipu: {
    apiKey: env.ZHIPU_API_KEY,
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
  },
  kimi: {
    apiKey: env.KIMI_API_KEY,
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
  minimax: {
    apiKey: env.MINIMAX_API_KEY,
    baseUrl: 'https://api.minimax.chat/v1',
    model: 'abab6.5s-chat',
  },
};

// LLM 请求超时（简历解析文本较长，给足 60s；防止 LLM 挂起导致 BullMQ worker 永久占用）
const LLM_TIMEOUT_MS = 60_000;

interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

async function callLLM(
  prompt: string,
  systemPrompt?: string,
  // 调用目的标签，写入 Prometheus llmCallDuration.purpose 维度，便于按业务区分统计
  // 兼容旧调用：未传时维持历史默认 'unknown'，避免误读旧指标
  purpose: string = 'unknown'
): Promise<LLMResponse> {
  const config = LLM_CONFIG[LLM_CONFIG.provider as keyof typeof LLM_CONFIG] as {
    apiKey: string;
    baseUrl: string;
    model: string;
  };

  if (!config?.apiKey) {
    throw new Error(`${LLM_CONFIG.provider} API key not configured`);
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const end = llmCallDuration.startTimer({ provider: LLM_CONFIG.provider, purpose });
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
        max_tokens: 4000,
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
    };
  } finally {
    end();
  }
}

export async function extractResumeInfo(resumeText: string): Promise<any> {
  const systemPrompt = `你是一个简历信息提取助手。请从以下简历文本中提取结构化信息。
只返回 JSON 格式，不要包含其他文字。`;

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

  let jsonStr = result.content.trim();
  
  // 移除 ```json 和 ``` 标记
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('Failed to parse LLM response as JSON');
  }
}

export { callLLM };
