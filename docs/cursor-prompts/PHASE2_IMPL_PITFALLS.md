# 阶段 2 高危 Prompt 实施陷阱清单

> **适用版本**：VIBE_CODING_PROMPTS_PHASE2_v1.3.md
> **针对 prompt**：PROMPT-16a / PROMPT-16b / PROMPT-17
> **来源**：v1.2 详细 review + 8 个 prompt 逐个 review + 3 个高危 prompt 风险点扩展
> **用途**：在 Cursor 执行这 3 个 prompt 之前/期间/之后，**必看**的避坑指南
> **配套文件**：`VIBE_CODING_PROMPTS_PHASE2_v1.3.md`（主提示词集）

---

## 📑 目录

- [通用前置：环境与依赖](#通用前置环境与依赖)
- [PROMPT-16a：Chatbot 后端（12 个坑）](#prompt-16achatbot-后端12-个坑)
- [PROMPT-16b：Chatbot 前端（10 个坑）](#prompt-16bchatbot-前端10-个坑)
- [PROMPT-17：飞书日历（10 个坑）](#prompt-17飞书日历10-个坑)
- [综合实施 checklist](#综合实施-checklist)
- [Cursor 自我 review 模板](#cursor-自我-review-模板)

---

## 通用前置：环境与依赖

> 这部分 3 个 prompt **共用**，实施任何 1 个之前必须先确认

### P0-1 `lib/llm.ts` 必须已就位
- **现象**：PROMPT-16a/16b 强依赖 `callLLM` / `callLLMStream` 两个函数
- **触发**：Cursor 实施时 `import { callLLM } from '../lib/llm'` 报 `not exported`
- **解决**：在跑 PROMPT-16a 之前，**确认 `server/src/lib/llm.ts` 已存在**且导出这两个函数；如果没有，先跑"基础设施"prompt（**不在本批次范围**，属于阶段 0/1）

### P0-2 Redis 必须可达
- **现象**：限流/配额/state CSRF 全用 Redis，连接失败直接 500
- **触发**：开发环境未启动 Redis / `REDIS_URL` 配错
- **解决**：
  - `docker compose up -d redis`（参考 `docker-compose.yml`）
  - `.env` 中 `REDIS_URL=redis://localhost:6379`
  - 启动后 `redis-cli ping` 应返回 `PONG`

### P0-3 Pino redact 配置
- **现象**：`X-Portal-Token` / `feishu-access-token` 等敏感 header 被 pino 完整记录
- **触发**：未配置 `pino-pretty` redact 列表
- **解决**：在 `server/src/lib/logger.ts` 追加：
  ```ts
  logger = pino({
    redact: {
      paths: ['req.headers.x-portal-token', 'req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
  });
  ```

### P0-4 LLM Provider 配置
- **现象**：v1.3 假定 OpenAI 兼容接口（`/chat/completions` + Bearer Token）
- **触发**：用 Anthropic / 自托管 LLM 时接口路径不匹配
- **解决**：`env.LLM_BASE_URL` / `env.LLM_API_KEY` / `env.LLM_MODEL` 三件套必须正确；如换 provider，**整个 chatbot 重写 prompt**（不在本批次范围）

---

## PROMPT-16a：Chatbot 后端（12 个坑）

### 坑 16a-1：`callLLM` 返回格式不匹配
- **现象**：v1.3 假定 `result.usage.totalTokens / promptTokens / completionTokens`，但 `lib/llm.ts` 实际可能只返回 `result.usage.prompt_tokens`（OpenAI 风格 snake_case）
- **触发**：Cursor 直接 `result.usage?.totalTokens` 取值
- **解决**：
  ```ts
  // 适配函数
  function normalizeUsage(usage: any) {
    return {
      totalTokens: usage?.total_tokens ?? usage?.totalTokens ?? 0,
      promptTokens: usage?.prompt_tokens ?? usage?.promptTokens ?? 0,
      completionTokens: usage?.completion_tokens ?? usage?.completionTokens ?? 0,
    };
  }
  ```
- **验证**：手动 `callLLM('hi', 'hi')` 看返回结构，断言 3 个字段

### 坑 16a-2：few-shot + schema 摘要占用 token 超限
- **现象**：5+ few-shot × `SCHEMA_SUMMARY` 加起来 ~2500 tokens，每次 LLM 调用都要带
- **触发**：上线后发现 LLM 成本是开发时的 3 倍
- **解决**：
  - **A 方案**：few-shot 精简到 3 个，去除 `SCHEMA_SUMMARY` 中重复字段
  - **B 方案**：用 **schema 索引 → few-shot 检索**（根据用户问题相似度动态选 1-2 个 example）
  - **C 方案**：把 schema 摘要做"懒加载"（只在第一次问时给，后续对话保留）
- **本批次选 A 方案**，B/C 留到 v1.4

### 坑 16a-3：`validateSql` 正则被 `/* */` 注释绕过
- **现象**：`SELECT 1 /* malicious */ ; DROP TABLE users` 实际不会执行（多语句），但 LLM 生成的 SQL 可能长这样
- **触发**：`validateSql` 只 split `;` 不去注释
- **解决**：
  ```ts
  function validateSql(sql: string): void {
    // 先去除注释再校验
    const noComments = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    // ... 用 noComments 走原有校验
  }
  ```

### 坑 16a-4：限流 `redis.incr` 首次未设 EXPIRE
- **现象**：`redis.incr` 第一次返回 1，但 key **永远存在**（无 TTL）
- **触发**：第二天同一用户首次调用，`count > 10` 误判
- **解决**：v1.3 已用 `redis.expire(key, Math.ceil(windowMs/1000))` —— **Cursor 必须照搬**这一行，**不要**改成 `redis.expire(key, windowMs)`（毫秒 vs 秒错位）

### 坑 16a-5：配额用 `toISOString().slice(0,10)` 时区错位
- **现象**：北京用户 0:00-8:00 仍属"昨天"的 UTC 配额 key
- **触发**：跨 0 点（UTC）时配额计数错乱
- **解决**：
  ```ts
  // 用本地时区
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\//g, '-');  // '2026-08-28'
  // 或者用 process.env.TZ='Asia/Shanghai' 强制
  ```

### 坑 16a-6：`wrapUserQuestion` 没限长
- **现象**：用户粘贴 10KB 文本，LLM 上下文窗口爆
- **触发**：恶意用户或误操作
- **解决**：
  ```ts
  const MAX_QUESTION_LEN = 2000;
  function wrapUserQuestion(q: string): string {
    const truncated = q.length > MAX_QUESTION_LEN
      ? q.slice(0, MAX_QUESTION_LEN) + '\n...[已截断]'
      : q;
    return `<<USER_QUESTION_START>>\n${truncated}\n<<USER_QUESTION_END>>...`;
  }
  ```

### 坑 16a-7：FEW_SHOT_EXAMPLES 用 `currentDate` 但时间不固定
- **现象**：5 月份跑的 SQL 在 6 月份不准确（few-shot 模板有"本月"）
- **触发**：few-shot 长期不更新
- **解决**：
  - **本批次**：few-shot 用**通用模式**（如"过去 7 天"、"本季度"），不依赖具体日期
  - **v1.4**：把 few-shot 存 DB，每次运行时拼接当前时间

### 坑 16a-8：`extractSql` 处理空内容抛错
- **现象**：LLM 偶尔返回空字符串（rate limit / 模型降级），`extractSql('')` 走完所有 if 仍返回空，`validateSql('')` 抛 "仅支持 SELECT"
- **触发**：测试覆盖不足，没断言 "LLM 返回空时给友好提示"
- **解决**：
  ```ts
  function extractSql(content: string): string {
    let sql = content?.trim() || '';
    if (!sql) throw new AppError('LLM 未生成 SQL', 502);
    // ... 原有逻辑
  }
  ```

### 坑 16a-9：`ChatSession.title` 中文截断乱码
- **现象**：`title: req.question.slice(0, 30)` 在中英文混排时切到半个字符
- **触发**：候选人 "张三是⼀个" 这种 UTF-8 多字节字符正好在 30 字节边界
- **解决**：
  ```ts
  function truncate(s: string, max: number): string {
    // 按字符数截断（不是字节）
    return Array.from(s).slice(0, max).join('');
  }
  // title: truncate(req.question, 30)
  ```

### 坑 16a-10：`ChatMessageRole` enum 生成时机不对
- **现象**：v1.3 加了 `enum ChatMessageRole`，但 `npx prisma generate` 跑在 `migrate deploy` 之前
- **触发**：TypeScript 类型还没生成，Cursor 写 `role: 'user'` 报 "Type string is not assignable"
- **解决**：严格按 Guard 流程 Step 5 顺序 — `migrate deploy` **之后**才 `prisma generate`，**之后**才动 service

### 坑 16a-11：`session.userId !== userId` 越权检查放错位置
- **现象**：v1.3 把越权检查放在 `if (!session || session.userId !== userId)`，但**早于** `req.sessionId` 校验
- **触发**：user A 给个不存在的 sessionId，**也走越权抛 403 而不是 404**
- **解决**：
  ```ts
  if (req.sessionId) {
    const session = await prisma.chatSession.findUnique({ where: { id: req.sessionId } });
    if (!session) throw new AppError('session 不存在', 404);  // ← 优先 404
    if (session.userId !== userId) throw new AppError('session 无权访问', 403);  // ← 再 403
  }
  ```

### 坑 16a-12：`prisma.$queryRawUnsafe` SQL 注入隐患
- **现象**：v1.3 假定 `validateSql` 100% 拦截危险 SQL，但漏了"参数化"路径
- **触发**：LLM 生成 `SELECT * FROM candidate WHERE name = '{user_input}'`，直接拼进去
- **解决**：
  - **A 方案**：`validateSql` 加"必须用 `$1, $2` 参数化，禁止字符串拼接"检测
  - **B 方案**：只允许 LLM 引用**预先定义的安全模板**，不允许生成完整 SQL
  - **本批次选 A 方案**，B 留 v1.4

---

## PROMPT-16b：Chatbot 前端（10 个坑）

### 坑 16b-1：`EventSource` 误用（v1.2 致命错误）
- **现象**：v1.2 用 `new EventSource('/api/...?question=...')`，但 EventSource **仅支持 GET**、URL 长度限制 ~2KB
- **触发**：中文 + 长 question 必爆
- **解决**：v1.3 已用 `fetch` + `ReadableStream` —— **Cursor 必须照搬 v1.3，不要回去用 EventSource**（v1.2 的 prompt 在老文件里，别参考错）

### 坑 16b-2：SSE 响应头漏 `X-Accel-Buffering: no`
- **现象**：Nginx 默认缓冲 SSE，导致前端收不到流
- **触发**：本地开发无 Nginx 时一切正常，部署到生产前端看到"整段一次性到达"
- **解决**：v1.3 已加 `res.setHeader('X-Accel-Buffering', 'no')` —— **Cursor 必须照搬**，缺这个 100% 踩坑

### 坑 16b-3：SSE timeout 与 LLM stream 超时不同步
- **现象**：v1.3 路由设 30s timeout，但 `callLLMStream` 内部可能跑 60s（长文本生成）
- **触发**：长问题被中途截断
- **解决**：
  ```ts
  // 路由 timeout 与 LLM 调用 timeout 错开
  const ROUTE_TIMEOUT_MS = 60_000;  // 路由比 LLM 长
  const LLM_TIMEOUT_MS = 50_000;    // LLM 超时在前
  ```

### 坑 16b-4：流式 `data: [DONE]` 标记漏处理
- **现象**：OpenAI 流式最后一行是 `data: [DONE]`，如果不识别会 `JSON.parse('[DONE]')` 抛错
- **触发**：流式聊天偶发崩溃
- **解决**：
  ```ts
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;  // ← 关键
      try { yield JSON.parse(data); } catch { /* skip */ }
    }
  }
  ```
- **验证**：手动测 `data: [DONE]` 不抛错

### 坑 16b-5：流式 abort 时 Sentry 误报
- **现象**：用户主动关闭页面 → fetch abort → service 端 stream 抛错 → Sentry 收到 "LLM error"
- **触发**：Sentry 收到大量"假错误"
- **解决**：
  ```ts
  // service 端
  } catch (err: any) {
    if (err.name === 'AbortError') return;  // ← 客户端主动断开不报错
    Sentry.captureException(err);
  }
  ```

### 坑 16b-6：mobile 端误用 Element Plus
- **现象**：v1.3 prompt 写 "用 highlight.js"，但 Cursor 直接复制 PC 端 `el-button` 组件
- **触发**：mobile 是 Vant 4 项目，Element Plus 不存在 → 编译失败
- **解决**：
  - **mobile chatbot** 用 Vant 4：`van-button` / `van-cell` / `van-list`
  - **PC chatbot** 用 Element Plus：`el-button` / `el-card` / `el-timeline`
  - **明确分工**，不要让 Cursor 跨端复用组件

### 坑 16b-7：E2E spec 用真 LLM 调用
- **现象**：v1.3 已加 `page.route` mock，但 Cursor 可能跳过
- **触发**：CI 跑 e2e 时 LLM API 调用超时 / 费用爆炸
- **解决**：v1.3 E2E 测试代码块**完整保留**（已经给 `page.route` 模板），Cursor 必须**整段复制**

### 坑 16b-8：流式 chunk 频繁 re-render 性能差
- **现象**：每秒几十个 chunk 触发 Vue 重新渲染，卡顿
- **触发**：长答案生成时界面卡死
- **解决**：
  ```ts
  // 节流：每 100ms 更新一次
  import { throttle } from 'lodash-es';
  const updateContent = throttle((text) => {
    streamingContent.value = text;
  }, 100);
  ```

### 坑 16b-9：axios 拦截器对流式 fetch 无效
- **现象**：PC 端 axios 拦截器统一注入 JWT，但流式 fetch 是 `fetch()`，不走 axios
- **触发**：流式调用 401（缺 JWT header）
- **解决**：v1.3 已用 `headers: { Authorization: \`Bearer ${token}\` }` —— **Cursor 必须手动加**，不要以为 axios 拦截器会兜底

### 坑 16b-10：错误事件 SSE 格式错
- **现象**：后端用 `res.write('error: ...')` 而非 `res.write('event: error\ndata: ...\n\n')`
- **触发**：前端 `addEventListener('error', ...)` 收不到（因为 SSE 协议要求 `event: xxx` 前缀）
- **解决**：v1.3 已规范为 `event: error\ndata: {...}\n\n` —— 后端必须严格遵守 SSE 协议格式

---

## PROMPT-17：飞书日历（10 个坑）

### 坑 17-1：加密 key 长度错
- **现象**：env 校验用 `z.string().regex(/^[0-9a-f]{64}$/)`，但 `.env` 里写 `FEISHU_TOKEN_ENCRYPTION_KEY=xxx`（短了 / 含大写 / 含 `-`）
- **触发**：进程启动直接 throw
- **解决**：
  ```bash
  # 生成正确 key 的命令
  openssl rand -hex 32
  # 输出 64 字符小写 hex，写到 .env
  ```
- **CI 验证**：在 `server/src/index.ts` 启动前 `await env.parse(process.env)`，失败 `process.exit(1)`

### 坑 17-2：base64 标准 vs url-safe 混用
- **现象**：`encrypt()` 用 `toString('base64')`，但 OAuth 跳转 URL 期望 `base64url`
- **触发**：token 包含 `+` / `/` / `=` 时 URL 解析失败
- **解决**：
  - DB 内部存**标准 base64**（`encrypt` 用 `base64`）
  - URL 拼接时**用 url-safe 编码**（`token.toString('base64url')`）
  - 不要混用同一个变量

### 坑 17-3：OAuth state 没设 EXPIRE
- **现象**：`redis.set('feishu-oauth-state:xxx', userId)` 无 TTL，state 永久有效
- **触发**：CSRF 攻击窗口扩大
- **解决**：v1.3 已用 `redis.setex(..., 600, ...)`（10 分钟），Cursor 必须保留

### 坑 17-4：OAuth callback 缺 state 校验
- **现象**：v1.2 路由只校验 `code`，不校验 `state`
- **触发**：攻击者构造 `/api/feishu-calendar/callback?code=恶意` → 当前登录用户的 binding 被替换
- **解决**：v1.3 完整实现 state 校验 —— **Cursor 必须保留** `redis.get + redis.del` 两步

### 坑 17-5：refresh_token 飞书不返回新值
- **现象**：飞书 OAuth refresh 协议中，`refresh_token` 可能**不变**（不像 Google 必返新值）
- **触发**：`data.refresh_token || refreshToken` 这个 fallback 必须有
- **解决**：v1.3 已加 `|| refreshToken` fallback —— Cursor 实施时**必须保留**

### 坑 17-6：`getFreeBusy` 误用 `findFirst`
- **现象**：schema 上 `userId @unique`，应该用 `findUnique`，但 Cursor 凭直觉写 `findFirst({ where: { userId } })`
- **触发**：每次都额外查表，浪费 IO；且 Prisma 类型推断会报"redundant where"
- **解决**：用 `findUnique({ where: { userId } })`

### 坑 17-7：`AbortSignal.timeout(5000)` 需 Node 18+
- **现象**：AGENTS.md 写 `>= 18.0.0`，但 `package.json` `engines` 没强制
- **触发**：Node 16 部署时 `AbortSignal.timeout is not a function`
- **解决**：
  ```json
  // package.json
  "engines": {
    "node": ">=18.0.0"
  }
  ```
  + 实施时用 `setTimeout` + `AbortController` polyfill（兜底）：
  ```ts
  function timeoutSignal(ms: number): AbortSignal {
    if ('timeout' in AbortSignal) return AbortSignal.timeout(ms);
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  }
  ```

### 坑 17-8：`data.notes` 改入参副作用
- **现象**：v1.2 `data.notes = ... + ...` 直接改入参对象，caller 后续还想用 `data.notes` 时已被污染
- **触发**：interview-scheduler 写日志时拿到的是污染后的 notes
- **解决**：v1.3 已用新变量 `let notes = ...` —— Cursor 必须保留

### 坑 17-9：`interviewers` 是 JSON 字符串 vs 对象
- **现象**：DB schema `interviewers Json`，Prisma 读出来是对象；但 client 传过来可能是字符串（序列化的 JSON）
- **触发**：`data.interviewers` 传 `checkFeishuConflicts` 时 TypeScript 类型不一致
- **解决**：
  ```ts
  // 入口归一化
  const interviewerIds: string[] = typeof data.interviewers === 'string'
    ? JSON.parse(data.interviewers)
    : data.interviewers;
  ```

### 坑 17-10：env 校验失败在 import 阶段 throw
- **现象**：`lib/env.ts` 用 `z.object({...}).parse(process.env)` 在 import 时执行；缺 key 时整个 server 起不来
- **触发**：本地开发忘了配 `.env`，所有路由 500
- **解决**：
  - **A 方案**（推荐）：env 校验挪到 `index.ts` 启动入口，**显式 fail-fast**
  - **B 方案**：env 校验用 `.safeParse()`，缺 key 时**降级到默认值**而非 throw
  - **本批次选 A 方案**，更安全

---

## 综合实施 checklist

> 在向 Cursor 粘贴每个 prompt **之前**，逐项确认

### 基础设施
- [ ] `server/src/lib/llm.ts` 已就位（含 `callLLM` + `callLLMStream`）
- [ ] Redis 已启动并连通（`redis-cli ping` 返回 PONG）
- [ ] `.env` 中 `REDIS_URL` / `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` 已配置
- [ ] Pino logger redact 列表已包含 `x-portal-token` / `authorization` / `cookie`

### PROMPT-16a
- [ ] Step 1-5 走 Guard 流程完整（`migrate --create-only` + 人工 review SQL）
- [ ] `npx prisma generate` 在 `migrate deploy` 之后跑
- [ ] `ChatMessageRole` enum 用枚举值不用字符串
- [ ] 限流 / 配额都用 `redis.expire` 设 TTL
- [ ] 配额用本地时区不用 UTC
- [ ] `wrapUserQuestion` 限长 ≤ 2000 字符
- [ ] `validateSql` 去注释后再校验
- [ ] `extractSql` 处理空内容友好抛 502
- [ ] 越权检查 404 优先于 403

### PROMPT-16b
- [ ] 用 `fetch + ReadableStream`（**不是 EventSource**）
- [ ] SSE 响应头含 `X-Accel-Buffering: no`
- [ ] 路由 timeout (60s) > LLM stream timeout (50s)
- [ ] 处理 `data: [DONE]` 标记
- [ ] abort 错误不报 Sentry
- [ ] mobile 用 Vant，PC 用 Element Plus
- [ ] E2E spec 必须 mock LLM
- [ ] 流式更新做节流 (100ms)
- [ ] 手动加 `Authorization: Bearer ${token}` header

### PROMPT-17
- [ ] `openssl rand -hex 32` 生成 64 字符小写 hex key
- [ ] DB 存 base64，URL 用 base64url
- [ ] OAuth state 用 `setex(..., 600, ...)` 设 10 分钟 TTL
- [ ] OAuth callback 校验 state（`redis.get` + `redis.del`）
- [ ] refresh_token 用 fallback `|| refreshToken`
- [ ] `getFreeBusy` 用 `findUnique` 不用 `findFirst`
- [ ] AbortSignal polyfill 兜底（兼容 Node 16）
- [ ] interview notes 用新变量不污染入参
- [ ] env 校验挪到启动入口 fail-fast
- [ ] interview-scheduler 加 `try/catch` 兜单面试官检查失败

### 提交前
- [ ] `pnpm test` 全部通过
- [ ] 至少手动跑 1 次核心流程
- [ ] 检查 git diff 不超出 prompt 允许范围
- [ ] 实施备注按通用块 B 格式输出

---

## Cursor 自我 review 模板

> Cursor 完成实施后，把这个表**填好**贴在交付里

```markdown
## 16a/16b/17 实施 review

### 已避免的坑（✅）
- [ ] 坑 16a-1：用 normalizeUsage 适配 usage 字段
- [ ] 坑 16a-4：限流 key 设 EXPIRE
- [ ] 坑 16a-5：配额用本地时区
- ... (其他相关)

### 仍存在的风险（⚠️）
- 坑 XX-X：实施时没规避，原因：xxx；后续方案：xxx

### 验证证据
- 截图 1：限流触发截图（连续 11 次第 11 次 429）
- 截图 2：配额触发截图（单日 100k token 后 429）
- 截图 3：飞书 OAuth 流程截图
- SQL dump：Guard review 通过的 migration.sql
- 测试覆盖率：services 覆盖率 X%（目标 ≥ 80%）
```

---

> **配套文件**：[VIBE_CODING_PROMPTS_PHASE2_v1.3.md](../../VIBE_CODING_PROMPTS_PHASE2_v1.3.md)
> **创建时间**：基于 v1.3 详细 review
> **演进**：每踩到一个新坑，在对应 prompt 章节追加"坑 XX-N"
