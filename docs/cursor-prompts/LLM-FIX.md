# LLM-FIX 推理模型兼容 + AI 设置模型选择 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**前后端混合**（服务端修 LLM 兼容 + 前端修超时/模型选择）——**可触碰**：
   `server/src/lib/llm.ts`、`server/src/services/**`（AI 相关）、`client/src/utils/request.ts`、
   `client/src/views/settings/AiSettings.vue`、`client/src/api/aiSettings.ts`。
   **禁止**：`e2e/**`、任何 package.json / tsconfig / eslint / vite。
2. 文件预算 **9 个**（§6.1 逐一编号）。
3. **不需要** schema 变更（不动 prisma）。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号；中文注释。
5. 不跑验收命令（`test` / `build` / `lint` 不跑，审核方重跑）。
6. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
LLM-FIX

### 1.2 背景（已实测确认）
- **MiniMax M2.7 是推理模型**：输出**必带** `thinking...\n\nresponse\n\n{JSON}` 前缀（实测 curl 确认，强约束也不消）。
- 项目 5 个 LLM JSON 解析点都只剥 ```json 围栏 → 对 M2.7 全部 `JSON.parse` 失败：
  - `server/src/lib/llm.ts` `extractResumeInfo`（139 行抛「Failed to parse LLM response as JSON」——生产日志已见）
  - `ai-matcher.service.ts`（116 行后）
  - `jd-assist.service.ts`（stripJsonFence + parse）
  - `match-score.service.ts`（stripJsonFence + parse）
  - `interview-outline.service.ts`（stripJsonFence + parse）
- **前端 axios 全局超时 10s**（`client/src/utils/request.ts:13`）→ LLM 响应慢（M2.7）→ 10s abort → 用户见「网络错误」（生产日志 `request aborted` + responseTime 10002/10010 已确认）。
- **max_tokens 默认 4000**（llm.ts:64）→ 推理模型思考段吃 token → JSON 截断（finish_reason=length）。
- **前端模型名手输**（AiSettings.vue:38 el-input）→ typo 风险（用户实测填错过）。

### 1.3 任务目标
1. 新增**统一 JSON 提取工具** `extractJsonFromLlmContent`，剥思考段 + 围栏 + 首尾 `{}` 兜底；**替换 5 处** JSON 解析。
2. **max_tokens 默认提高到 8000**（推理模型）。
3. **前端 axios 超时 10s → 60s**。
4. **AI 设置模型名改下拉选择**（预置各 provider 常用模型）+ **「去官方获取模型」按钮**（打开官方文档新标签，防 typo）。

## 2. 上下文

### 2.1 关键已核实事实（可直接采信）

- **LLM 调用链**（`server/src/lib/llm.ts` 143 行）：
  - `callLLM(prompt, systemPrompt?, purpose, options?)`：fetch `{baseUrl}/chat/completions`，`maxTokens: options?.maxTokens ?? 4000`（64 行）——**改成 8000**。
  - `extractResumeInfo`（85-141 行）：125-140 手剥围栏 + parse → **换 extractJsonFromLlmContent**。
- **各 service 的 strip 函数**：
  - `jd-assist.service.ts` / `match-score.service.ts` / `interview-outline.service.ts` 各有同名 `stripJsonFence(text)`（只剥 ```json）→ **改为调用统一工具**（或内部换成 extractJsonFromLlmContent）。
  - `ai-matcher.service.ts` 116 行后手剥（`.startsWith('```json')` 等）→ 换统一工具。
- **前端超时**：`client/src/utils/request.ts:13` `timeout: 10000` → **改 60000**（LLM 最慢 60s，60s 对齐不 abort）。
- **AI 设置页** `client/src/views/settings/AiSettings.vue`：
  - model 是 `el-input`（38 行）→ 改 `el-select` 下拉。
  - 预置模型清单（各 provider 常见模型）：
    - deepseek: `deepseek-chat` / `deepseek-reasoner`
    - zhipu: `glm-4-flash` / `glm-4-plus` / `glm-4-long`
    - kimi: `moonshot-v1-8k` / `moonshot-v1-32k` / `kimi-latest`
    - minimax: `abab6.5s-chat` / `abab6.5s-pro` / `MiniMax-M2.7`（**思考段兼容后可用**）/ `MiniMax-Text-01`
  - **「去官方获取」**：每行 model 下拉旁加小按钮（el-link/icon）→ `window.open(官方文档URL)`：
    - deepseek: `https://platform.deepseek.com/api-docs`
    - zhipu: `https://open.bigmodel.cn/dev/api`
    - kimi: `https://platform.moonshot.cn/docs`
    - minimax: `https://platform.minimaxi.com/document/Models`
  - **保底**：下拉仍允许手动输入（el-select 的 `allow-create filterable`），兼顾不在预置的模型。
- **api/aiSettings.ts**：`UpdateAiProviderPayload.model?: string` 已存在，无需改类型（下拉值还是 string）。`baseUrl` 仍手输（不改，用户测试没问题）。

### 2.2 统一 JSON 提取工具（核心）

放 `server/src/lib/llm.ts` 导出：

```ts
/**
 * 从 LLM 输出中提取合法 JSON 字符串。
 * 兼容推理模型（MiniMax M2.7 等）的 thinking...response 前缀输出；
 * 兼容 ```json 围栏、首尾空白、前后多余文字。
 */
export function extractJsonFromLlmContent(content: string): string {
  let s = content.trim();
  // 1) 推理模型：取 response 标记之后的正文（M2.7 输出 thinking...\n\nresponse\n\n{JSON}）
  const respIdx = s.search(/\bresponse\b\n/);
  if (respIdx !== -1) {
    s = s.slice(respIdx + 'response\n'.length);
  }
  // 2) ```json 围栏
  if (s.startsWith('```json')) s = s.slice(7);
  else if (s.startsWith('```')) s = s.slice(3);
  if (s.endsWith('```')) s = s.slice(0, -3);
  // 3) 兜底：取第一个 { 到最后一个 }（防前后多余文字）
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s.trim();
}
```

> 注意：`\bresponse\b` 正则——M2.7 输出是 ` response\n\n{`（response 后换行）。**若你实测发现标记是别的（如 `"response\n"` 前有 thinking 结尾的冒号）**，按实际调整。建议先跑一次 M2.7 输出确认标记字符串，再定正则（交付报告说明你实测的标记）。

### 2.3 替换点（5 处 JSON 解析 + 1 处 maxTokens）

| 文件 | 现状 | 改法 |
|------|------|------|
| `llm.ts` extractResumeInfo（125-140）| 手剥围栏 + parse | 用 extractJsonFromLlmContent |
| `llm.ts` callLLM（64 行）| `?? 4000` | `?? 8000` |
| `ai-matcher.service.ts`（116 后）| 手剥围栏 | 用 extractJsonFromLlmContent（从 '../lib/llm' import）|
| `jd-assist.service.ts` stripJsonFence | 本地函数只剥围栏 | 替换实现为调 extractJsonFromLlmContent（或 import 后删本地函数）|
| `match-score.service.ts` stripJsonFence | 同上 | 同上 |
| `interview-outline.service.ts` stripJsonFence | 同上 | 同上 |

> 各 service 的 `stripJsonFence` 若被多处调用，替换函数体（内部转调 extractJsonFromLlmContent）比删函数+改 import 更小改动——**二选一，最小 diff 优先**，交付报告说明。

### 2.4 前端改动

- `request.ts` timeout 10s → 60s（一行）。
- `AiSettings.vue`：
  - model 输入改 `el-select` + `allow-create filterable`（可下拉选 / 可手动输）：
    ```vue
    <el-select v-model="forms[row.provider].model" filterable allow-create
               default-first-option placeholder="选择或输入模型名" style="width: 100%">
      <el-option v-for="m in MODEL_OPTIONS[row.provider] || []" :key="m" :label="m" :value="m" />
    </el-select>
    <el-button link type="primary" class="model-doc-btn" @click="openModelDoc(row.provider)">
      获取官方模型
    </el-button>
    ```
  - script 加：
    ```ts
    const MODEL_OPTIONS: Record<string, string[]> = {
      deepseek: ['deepseek-chat', 'deepseek-reasoner'],
      zhipu: ['glm-4-flash', 'glm-4-plus'],
      kimi: ['moonshot-v1-8k', 'moonshot-v1-32k'],
      minimax: ['abab6.5s-chat', 'abab6.5s-pro', 'MiniMax-M2.7', 'MiniMax-Text-01'],
    };
    const MODEL_DOC_URLS: Record<string, string> = {
      deepseek: 'https://platform.deepseek.com/api-docs',
      zhipu: 'https://open.bigmodel.cn/dev/api',
      kimi: 'https://platform.moonshot.cn/docs',
      minimax: 'https://platform.minimaxi.com/document/Models',
    };
    function openModelDoc(provider: string) {
      const url = MODEL_DOC_URLS[provider];
      if (url) window.open(url, '_blank', 'noopener');
    }
    ```

## 3. 必读约束

### 3.1 不动配置落库结构
`ai_provider_config` 表 / ai-settings 接口**不改**——`model` 仍是字符串，前端下拉只是 UI 层，value 照旧传给 `UpdateAiProviderPayload.model`。

### 3.2 推理模型兼容是**通用**的
extractJsonFromLlmContent 对所有 provider 生效（DeepSeek 的 `deepseek-reasoner` 也是推理模型——同样受益）。**不是只修 MiniMax**。

### 3.3 测试义务
- `server/tests/unit/llm-json-extract.test.ts`（新增）：extractJsonFromLlmContent 单测覆盖：
  - 纯 JSON → 原样
  - ```json 围栏 → 提取
  - **M2.7 thinking 段** → 提取（`thinking abc\n\nresponse\n\n{"ok":1}` → `{"ok":1}`）
  - 前后多余文字 → 取 {} 兜底
- 各 AI service 的既有测试若 mock「LLM 返回纯 JSON」，需补一个「返回 thinking 段」用例，断言仍解析成功（**至少抽 1 个 service 补一条**，全补最好）。

### 3.4 越界红线
- 不改 `server/prisma/**`、`e2e/**`、package.json / tsconfig / eslint / vite
- 不改 ai-settings.service 的 testConnection 逻辑（maxTokens 8 目前能用，非本次范围）
- 前端 AiSettings 只改 model 输入 UI + 超时，不改 baseUrl / apiKey 逻辑

## 4. 实施任务

### 4.1 `server/src/lib/llm.ts`（条件修改）
- 加 `extractJsonFromLlmContent`（§2.2）
- `callLLM` maxTokens 默认 `?? 4000` → `?? 8000`
- `extractResumeInfo` 用 extractJsonFromLlmContent

### 4.2 `server/src/services/ai-matcher.service.ts`（条件修改）
116 行后的手剥替换为 extractJsonFromLlmContent。

### 4.3 `server/src/services/jd-assist.service.ts`（条件修改）
stripJsonFence 改为转调 extractJsonFromLlmContent（或 import 替换）。

### 4.4 `server/src/services/match-score.service.ts`（条件修改）
同 4.3。

### 4.5 `server/src/services/interview-outline.service.ts`（条件修改）
同 4.3。

### 4.6 `client/src/utils/request.ts`（条件修改）
`timeout: 10000` → `timeout: 60000`。

### 4.7 `client/src/views/settings/AiSettings.vue`（条件修改）
model el-input → el-select(allow-create filterable) + 「获取官方模型」按钮 + MODEL_OPTIONS/URLS 常量。

### 4.8 ✱ `server/tests/unit/llm-json-extract.test.ts`（新增）
extractJsonFromLlmContent 单测（§3.3）。

### 4.9 测试补丁（条件修改，至少 1 个 service）
给某 AI service 测试补「thinking 段仍解析成功」用例（如 interview-outline.service.test.ts 或 match-score）。

## 5. 关键决策点

### 5.1 stripJsonFence 处理方式
**推荐**：各 service 的 `stripJsonFence` 函数体改为 `return extractJsonFromLlmContent(text);`（import 自 llm.ts），保留函数名（少改调用点）。**若函数 export 了（测试用）则保留导出**。

### 5.2 M2.7 实测的 thinking 标记
交付报告**必须**说明你在 M2.7 实测的输出标记（`response\n` 前是什么），确认 extractJsonFromLlmContent 的正则匹配。若实测发现标记不同（如 `response\n\n` 或 `</think>`），调整正则并在报告记录。

### 5.3 下拉预置模型 vs 手输
`el-select allow-create filterable` = 既可下拉选也可手输——**兼顾防 typo 和不漏模型**。若只下拉会误伤不在预置的自定义模型。

### 5.4 maxTokens 8000 是否够
M2.7 思考段 + 大纲 JSON（sections+questions+referenceAnswer）可能 >8000 token。**若你实测仍截断**，可在 interview-outline 的 callLLM 调用点显式传更大（如 12000）——交付报告说明实测。

## 6. 修改文件清单

### 6.1 必改文件（9 个；✱=新增）
1. `server/src/lib/llm.ts`（extractJsonFromLlmContent + maxTokens + extractResumeInfo）
2. `server/src/services/ai-matcher.service.ts`
3. `server/src/services/jd-assist.service.ts`
4. `server/src/services/match-score.service.ts`
5. `server/src/services/interview-outline.service.ts`
6. `client/src/utils/request.ts`（timeout 60s）
7. `client/src/views/settings/AiSettings.vue`（模型下拉 + 官方按钮）
8. ✱ `server/tests/unit/llm-json-extract.test.ts`
9. 至少 1 个 AI service 测试补 thinking 段用例

### 6.2 禁止修改文件
- `server/prisma/**`、`e2e/**`、任何 package.json / tsconfig / eslint / vite
- `server/src/services/ai-settings.service.ts`（testConnection 不动）
- `client/src/api/aiSettings.ts`（类型已够，不用改）

### 6.3 越界检测（交付前自检）
- `git status --short` 仅 6.1 的路径。
- `git diff --stat -- e2e server/prisma` 必须 0 行。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑）
- `server pnpm build`（tsc）：0 错误。
- `server pnpm test`：全量 611 + 新测试全过。
- `server pnpm lint:check`：不新增 error。
- `client pnpm type-check`：88（0 新增）。
- `client pnpm lint:check`：137e/224w（0 新增）。
- `git diff --stat -- e2e server/prisma`：0 行。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述（9 文件 + 是否动了 stripJsonFence 实现方式）。
2. `extractJsonFromLlmContent` 实现 + **M2.7 实测输出标记**（你验证的正则匹配点）。
3. 5 个替换点逐一说明（before → after）。
4. maxTokens 8000 改动 + 是否需个别调用点更大。
5. 前端超时 60s + 模型下拉/官方按钮实现。
6. 测试清单（新单测 + 补的 thinking 段用例）。
7. 越界自检 + 已知问题（如某模型 8000 token 仍不够）。
8. 红线自检确认。

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。