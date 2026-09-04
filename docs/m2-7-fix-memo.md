# 备忘：MiniMax M2.7 推理模型适配（未完成，下个开发阶段做）

> **状态**：已诊断完成，未改代码
> **背景**：用户在 AI 设置里把 MiniMax 的 model 改为 `MiniMax-M2.7` 后，简历解析「无法识别」（失败）。经实测验证根因，见下。
> **当前**：已回退到可用模型（B 方案）；本备忘记录 A 方案（代码适配）的具体改动需求。

---

## 1. 实测结论（2026-09-04，curl 直测）

| 项 | 结果 |
|----|------|
| key | `sk-api-8pWqi-...` 有效（200，认证通过）|
| baseUrl 国际站 | `https://api.minimax.chat/v1` ✅ 正确 |
| 模型 ID | `MiniMax-M2.7` ✅ 有效 |
| **响应格式** | ❌ **必带思考段**：`thinking...\n\nresponse\n\n{JSON}` |
| max_tokens 影响 | **思考过程会吃掉 token**：max_tokens=100 时 `finish_reason="length"`，JSON 被截断 |

**根因**：M2.7 是推理模型，输出**始终**带 `thinking...response\n` 前缀，即使强约束也只换行不消前缀。

项目 `extractResumeInfo`（`server/src/lib/llm.ts:85-141`）拿到 content 后：
1. 只剥 ```json 围栏（128-133 行）
2. 直接 `JSON.parse(jsonStr)`（137 行）

→ 带思考段的内容必然 parse 失败 → 「无法识别简历」→ BullMQ worker failed。

**结论：不是配置错误（key/url/model 都正确），是代码不兼容推理模型的输出格式。**

---

## 2. 改动需求（A 方案）

### 核心：新增统一 JSON 提取工具

新函数（放 `server/src/lib/llm.ts` 或 `utils/`）：

```ts
/**
 * 从 LLM 输出中提取合法 JSON 字符串。
 * 兼容推理模型（MiniMax M2.7 等）输出的 thinking...response\n 前缀。
 * 也兼容 ```json 围栏与首尾空白。
 */
export function extractJsonFromLlmContent(content: string): string {
  let jsonStr = content.trim();
  // 1) 推理模型：取 response 标记之后的正文
  const respMarker = jsonStr.search(/response\n/);
  if (respMarker !== -1) {
    jsonStr = jsonStr.slice(respMarker + 'response\n'.length);
  }
  // 2) ```json 围栏
  if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
  if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
  // 3) 取第一个 { 到最后一个 }（兜底防前后多余文字）
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }
  return jsonStr.trim();
}
```

### 应用点（所有做 JSON 解析的 LLM 调用）

| 文件 | 现状 | 改法 |
|------|------|------|
| `server/src/lib/llm.ts` `extractResumeInfo`（137 行 `JSON.parse(jsonStr)`）| 手剥围栏 | 用 `extractJsonFromLlmContent` |
| `server/src/services/match-score.service.ts`（LLM 打分 JSON 解析）| 手剥 | 用它 |
| `server/src/services/jd-assist.service.ts`（polish/draft JSON 解析）| 手剥 + 重试 | 用它 |
| `server/src/services/interview-outline.service.ts`（大纲 JSON 解析）| 手剥 + 重试 | 用它 |
| 其他 `callLLM` 后 `JSON.parse` 的地方（grep `JSON.parse` 排查）| — | 统一替换 |

### max_tokens 提高

`server/src/lib/llm.ts:64`：`max_tokens: options?.maxTokens ?? 4000` → 默认提到 **8000~10000**（推理模型思考段吃 token）。

### 回归测试

- 各 AI service 单测补「LLM 返回思考段前缀」用例 → 应能正确提取 JSON
- 真实简历跑通（M2.7 + minimaxi 国际站）

---

## 3. 验收口径（下阶段做时的检查点）

1. `MiniMax-M2.7` 在 AI 设置配置后，上传简历能成功识别（worker 不 failed）
2. 打分 / JD 完善 / 大纲生成 用 M2.7 均正常
3. 旧模型（deepseek-chat / glm-4-flash / abab6.5s-chat）回归不破坏（思考段提取函数对无前缀内容无影响）
4. 测试：`server pnpm test` 全量过；lint 不新增

---

## 4. 当前回退状态（B 方案已完成）

- 用户在 AI 设置把 model 改回 `abab6.5s-chat`（或激活 DeepSeek）
- 简历解析恢复可用
- 原 M2.7 失败的 bullmq failed 任务不影响（历史失败记录）

---

*记录人：Mavis（DeepSeek Harness）；时间：2026-09-04；来源：实测 curl 输出*