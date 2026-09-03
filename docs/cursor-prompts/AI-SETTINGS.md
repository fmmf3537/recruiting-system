# 切片：AI 提供方/密钥界面化管理（AI-SETTINGS）

> 本提示词供 Cursor（或同类编码 agent）执行。执行 agent 只写代码与本地验证，**不跑最终验收、不 commit**；验收由审核方（人工/主 agent）按文末《验收清单》亲手重跑。

## 1. 背景与目标

当前系统所有 AI 能力（简历解析、AI 匹配、AI 简历打分、AI JD 助手、AI 面试出题）统一走 `server/src/lib/llm.ts` 的 `callLLM`，其提供方/密钥来自**服务器环境变量静态快照**（`server/.env` → `env.ts` 校验 → `llm.ts` 模块加载时构建 `LLM_CONFIG`）。运维改 Key/换提供方必须改 `.env` 并重启进程，无任何界面入口。

目标：新增 **admin 的「AI 设置」页面**，在界面上维护 AI 提供方与密钥，**保存即热生效（无需重启后端）**，密钥 **AES-256-GCM 密文落库、界面只显示掩码**，并提供**连接测试**。

已确认的产品决策（不可再改）：
1. 密钥 AES-256-GCM 密文落库（不回显明文）；
2. 保存即热生效，不改 `llm.ts` 为动态读取不验收；
3. baseUrl / model 在页面可编辑（不只预置只读）；
4. 提供方范围本期固定 deepseek / zhipu / kimi / minimax 四家（可编辑 baseUrl/model 兼容网关/官方改版，但不支持自定义新增 provider）。

## 2. 非目标（明确不做，避免蔓延）

- 不做自定义「新增」任意 provider（仅四家固定 + baseUrl/model 可编辑）；
- 不做用量/费用统计、不做按 AI 功能分别指定模型、不做 Key 轮换/过期策略；
- 不动 `dictionary` 的 `matching_dimension`（AI 打分维度权重，与本功能无关）；
- 不改简历解析 prompt 等业务内容（上一轮已修的“评估基准日期”逻辑不要回退）。

## 3. 约束与规范（沿用仓库 AGENTS.md）

- 最小变更：只新增/改动本切片列出的文件；不顺手重构无关代码、不做 prettier 整文件重排（仓库多数文件未严格 prettier 化，**禁止对旧文件跑 prettier --write**，新文件保持仓库既有风格：`semi`/`singleQuote`/`tabWidth 2`/`printWidth 100`/`endOfLine lf`）。
- 注释中文为主，复杂逻辑写意图；导入用别名（`@/`、`@services/`、`@lib/` 等），不写深层相对路径。
- 不用 `any`（确需时 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 并说明）。
- 改 `services/` 必须同步补/改 `server/tests/unit/`；改路由建议检查 `tests/integration/`。
- 改 `schema.prisma` 后**必须**生成 migration 并 `prisma generate`。
- 新增环境变量同步更新 `server/src/lib/env.ts` 与 `server/.env.example`。
- lint 一律用无 `--fix` 的 `lint:check` 变体，防误改源码。

## 4. 后端改动清单

### 4.1 数据模型（`server/prisma/schema.prisma`）

```prisma
model AiProviderConfig {
  id          String   @id @default(cuid())
  provider    String   @unique // deepseek | zhipu | kimi | minimax
  baseUrl     String            // 预置默认值；页面可编辑（URL）
  model       String            // 预置默认值；页面可编辑
  isActive    Boolean  @default(false) // 全局同时仅一行 true，service 层保证
  enabled     Boolean  @default(true)
  apiKeyEnc   String?           // AES-256-GCM 密文，hex 格式 iv:tag:cipher
  apiKeyMask  String?           // 展示用掩码，如 sk-****abcd；有 key 才有值
  updatedById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

- 迁移：`npx prisma migrate dev --name add_ai_provider_config`，随后 `npx prisma generate`。
- **不做 seed**：表为空 = 未初始化 = 运行时回退到环境变量配置，保证老部署先跑通。

### 4.2 密钥加密 `server/src/lib/crypto.ts`（新增）

- `encryptSecret(plain) -> hex(iv:tag:cipher)` / `decryptSecret(hex) -> plain`，AES-256-GCM，`iv` 随机 12B、`authTag` 16B。
- 主密钥解析放 `env.ts`：新增可选 `AI_CONFIG_ENC_KEY`（32 字节，建议 base64 存放），**未配置时由 `JWT_SECRET` 经 SHA-256 派生**（保证有值且稳定）；`env.ts` 中派生一次导出。`.env.example` 同步加注释说明。
- 解密失败（如主密钥变更）抛业务错误「AI 配置解密失败，请检查 AI_CONFIG_ENC_KEY」，不静默返回空。

### 4.3 配置服务 `server/src/services/ai-config.service.ts`（新增，核心热生效入口）

- `getActiveLlmConfig(): Promise<{ provider, baseUrl, model, apiKey }>`：
  1. 查 DB `isActive = true` 且 `enabled = true` 且 `apiKeyEnc` 非空 → 解密返回；
  2. 无满足行/解密失败 → 回退 `env.LLM_PROVIDER` + 对应 `env.*_API_KEY`（保持现状兜底），baseUrl/model 用下节预置常量；
  3. 都无 key → 返回 null（由调用方报「API key not configured」）。
- **进程内缓存**：TTL 30s；提供 `invalidate()`（配置写成功后调用，下次读取即新值）。读取走缓存、写后失效，避免每请求查库。
- `getActiveLlmProviderLabel()`：供记录归属用（取 `provider` + `model`）。
- 预置常量（沿用现有 `llm.ts` 值，迁移到本服务或独立常量，`llm.ts` 不再硬编码）：
  - deepseek → `https://api.deepseek.com/v1` + `deepseek-chat`
  - zhipu → `https://open.bigmodel.cn/api/paas/v4` + `glm-4-flash`
  - kimi → `https://api.moonshot.cn/v1` + `moonshot-v1-8k`
  - minimax → `https://api.minimax.chat/v1` + `abab6.5s-chat`

### 4.4 设置服务 `server/src/services/ai-settings.service.ts`（新增，业务 CRUD）

- `listProviders()`：返回四家（预置缺失时用常量补齐展示），字段 `{ provider, name(中文名), baseUrl, model, isActive, enabled, apiKeyMask, hasKey }`，**绝不返回明文**。
- `ensureDefaultRows()`：首次初始化按 4.3 常量 upsert 四行（key 空、isActive=false）；写接口调用前确保存在。
- `updateProvider(provider, { baseUrl?, model?, apiKey?, isActive?, enabled? })`：
  - `apiKey` 传入 → 加密存 `apiKeyEnc` + 计算 `apiKeyMask`；**不传/空串 = 不修改** key；
  - `isActive=true` → 同一事务内先 `updateMany` 把其它行置 false，再置本行 true（保证唯一）；
  - 置 `isActive=true` 且无 key 时拒绝（提示先填 Key，避免激活不可用的提供方）；
  - 成功后调 `ai-config` 的 `invalidate()`；写 `OperationLog`（`action: 'ai_provider_update'`，targetType 建议 `'System'` 或按现有枚举最接近值，detail 含 provider/enabled/isActive/是否有 key）。
- `testConnection(payload)`：用「当前激活配置」或 payload 指定 provider+临时 key 调 `callLLM`（短提示如「ping」，`max_tokens` 极小），返回 `{ ok: true }` 或 `{ ok: false, error: '可读错误' }`（区分 401 密钥无效/网络/超时/模型不存在），并写 `OperationLog`（`action: 'ai_provider_test'`）。测试**不落库**。
- 掩码规则：`sk-****abcd` 风格（明文 ≤8 位全 `****`；否则首 4 + `****` + 尾 4）。

### 4.5 `llm.ts` 动态化改造（热生效关键，改动最小）

- 删除模块顶部 `LLM_CONFIG` 静态快照的**运行时使用**；`callLLM` 内部改调 `getActiveLlmConfig()` 取 `{ baseUrl, model, apiKey }`。
- 签名与调用点不变（`callLLM(userPrompt, systemPrompt?, purpose?)`），因此简历解析 worker、ai-matcher、match-score、jd-assist、interview-outline 等全部自动生效。
- Prometheus `llmCallDuration` 的 `provider` label 改取自动态配置（`getActiveLlmConfig().provider`）。
- 保留旧常量仅作「预置种子」引用或删除（以 4.3 收口为准，勿两处重复定义）。

### 4.6 记录归属修正 `server/src/services/match-score.service.ts`

- `AiMatchScore.model` 目前写死 `env.LLM_PROVIDER`（create 与 update 两处）：改为记录**本次实际调用**的 `provider`（可调用 `getActiveLlmConfig()` 的 provider/model 或让 `callLLM` 返回所用 provider）。上一轮新增的 `PROMPT_VERSION='v2'` 逻辑**原样保留**。

### 4.7 路由/控制器（admin only）

- `server/src/routes/ai-settings.ts` + `server/src/controllers/ai-settings.controller.ts`，挂 `authenticate` + `authorize('admin')`，并注册进 `server/src/routes/index.ts`（仿现有字典/流程模板注册方式）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/settings/ai-providers` | 列表（见 4.4，掩码字段） |
| PUT | `/api/settings/ai-providers/:provider` | Zod 校验 `{ baseUrl?: url, model?: string≤100, apiKey?: string≤500 留空=不改, isActive?: boolean, enabled?: boolean }`；provider 限四家枚举 |
| POST | `/api/settings/ai-providers/test` | Zod：`{ provider?: 四家枚举, apiKey?: string }`（都不传=测当前激活配置） |

- 错误码语义沿用 `AppError`：越权 403、非法 provider 400、未知 404。
- 所有响应遵循 `{ success, data?, error?, code? }` 约定。

## 5. 前端改动清单

- 路由 `client/src/router/index.ts`：settings 子路由新增 `/settings/ai`，`meta: { title: 'AI 设置', requireAdmin: true }`（复用现有守卫）。
- 菜单 `client/src/layouts/DefaultLayout.vue`：admin 分组追加 `{ path: '/settings/ai', title: 'AI 设置', icon: <现有 Setting/Connection 风格图标> }`（跟随现有 `items.push` 与角色判断写法）。
- API 封装 `client/src/api/aiSettings.ts`：`getAiProviders()` / `updateAiProvider(provider, payload)` / `testAiProvider(payload?)`，类型对齐后端响应。
- 页面 `client/src/views/settings/AiSettings.vue`（参考现有设置页风格）：
  - 顶部说明文案：改动保存后立即生效，无需重启；
  - 每张 provider 卡片：provider 中文名 + 状态 tag（启用中/已启用/停用）；
    - `baseUrl`、`model` 可编辑输入框（默认预置值）；
    - `API Key`：密码输入框，placeholder 显示掩码（如 `sk-****abcd`），提示「留空 = 不修改」；保存成功后清空输入框、刷新掩码；
    - 「启用此提供方」按钮（点后调 PUT `{ isActive: true }`）、「保存」按钮、「测试连接」按钮；
  - 「测试连接」用当前表单值即时调用（含未保存的新 key），成功/失败 ElMessage 展示后端 error 文案；
  - 提交 loading、错误 ElMessage，风格与 `MatchScoreCard.vue` / 字典管理页一致；
  - 仅 admin 可达（路由守卫已拦）。
- 无需新增全局状态；页面自管理表单即可。

## 6. 测试义务（执行 agent 本地必须跑绿）

- 新增 `server/tests/unit/ai-settings.service.test.ts`：掩码规则、加密往返（encrypt→decrypt）、幂等 upsert、isActive 唯一切换（updateMany 先置 false）、无 key 激活拒绝、testConnection 错误透出。
- 新增 `server/tests/unit/ai-config.service.test.ts`：DB 命中优先、DB 空/解密失败 → env 回退、缓存命中与 `invalidate()` 后重读、全空返回 null。
- 改 `llm.ts` 后：现有各调用方单测仍绿（它们在 `callLLM` 层 mock；若因 LLM_CONFIG 移除需同步 mock 调整，最小化）。
- `match-score.service.test.ts` 现有 16 用例必须保持通过（含上一轮新增的日期注入与版本失效用例，不得回退）。

## 7. 验收清单（审核方执行，执行 agent 不必跑到这份基线外）

```bash
# server
pnpm test              # 基线 54 文件 / 561 用例全过（新增后 ≥ 该数）
pnpm build             # 0 错误
pnpm lint:check        # 基线 15600 errors / 253 warnings，不得新增
# client
pnpm type-check        # 存量 90 个 TS 错误，不得新增
pnpm lint:check        # 基线 137 errors / 231 warnings，不得新增
```

手工验收场景（审核方实测）：
1. 首次部署、表空：现有 AI 打分/解析仍工作（env 兜底）；
2. 页面填入某家 Key → 保存 → **不重启** → 触发 AI 打分/出题，请求已带新 Key 且成功；`AiMatchScore.model` 记录为实际 provider；
3. 重新打开页面：Key 只显示掩码；保存 Key 留空不覆盖旧 Key；
4. 切换激活提供方：仅一行 isActive=true；激活无 Key 的被拒绝；
5. 「测试连接」填错 Key → 明确报 401/错误；改对 → ok；
6. 重启后端：DB 配置仍生效（不回落 env）；删空表/清空行 → 回落 env；
7. member 访问 `/settings/ai` 与相关 API → 403/被路由拦。

## 8. 交付物清单（供审核对照 diff）

- 新增：`server/src/lib/crypto.ts`、`server/src/services/ai-config.service.ts`、`server/src/services/ai-settings.service.ts`、`server/src/controllers/ai-settings.controller.ts`、`server/src/routes/ai-settings.ts`、`server/prisma/migrations/<新迁移>/`、`client/src/api/aiSettings.ts`、`client/src/views/settings/AiSettings.vue`、两份 unit 测试文件（及必要的 integration）
- 改动：`server/prisma/schema.prisma`、`server/src/lib/env.ts`、`server/src/lib/llm.ts`、`server/src/services/match-score.service.ts`、`server/src/routes/index.ts`、`server/.env.example`、`client/src/router/index.ts`、`client/src/layouts/DefaultLayout.vue`、可能连带 mock 的既有测试
- 验收基线以上文《验收清单》为准；diff 只应包含本切片相关文件。
