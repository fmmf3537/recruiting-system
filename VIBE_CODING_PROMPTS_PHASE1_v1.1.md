# 阶段 1 可观测性 - Cursor Vibe Coding 提示词集（v1.1 修订版）

> **目标读者**：Cursor Composer / Cursor Agent
> **使用方式**：每次打开一个新的 Composer 会话，**只粘贴一个提示词**，不要合并
> **原则**：单一变更 + 测试先行 + 禁止越界
> **范围**：阶段 1「可观测性与稳定性」7 个任务中的 6 个可编码任务
> **前置条件**：阶段 0 全部完成（pino 日志、JWT 缓存已就位）

---

## 📋 版本说明

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-04 | 初版 |
| **v1.1** | 2026-08 | **基于阶段 0 实战经验全面修订**（PROMPT-01 ~ 06 实战反馈 + PROMPT-05 Migration Guard 实战） |

### v1.1 主要改进（11 项）

| # | 来源 | 改进 |
|---|------|------|
| 1 | PROMPT-05 实战 | **PROMPT-11 加 Migration Guard**（schema 变更必须走 Guard 流程） |
| 2 | PROMPT-05 实战 | 新增"无 TTY 时 fallback 用 `migrate diff`"提示 |
| 3 | PROMPT-02 实战 | 各 prompt 补充"与 PROMPT-02 pino redact 路径的协调" |
| 4 | PROMPT-04 实战 | 行数/文件数硬约束改为软目标（v1.1 元规则） |
| 5 | PROMPT-04 实战 | 每个 prompt 末尾标准化"实施备注"输出模板 |
| 6 | PROMPT-01 实战 | 新增"先确认环境版本再执行"提示（tsx 版本等） |
| 7 | 通用 | PROMPT-12 CI 增加容器启动等待与重试 |
| 8 | 通用 | PROMPT-08 metric 命名加应用前缀 `ats_*` |
| 9 | 通用 | PROMPT-10 版本号读 package.json 而非硬编码 |
| 10 | 通用 | 修复 PROMPT-11 `(scheduledAt, status, status)` typo |
| 11 | v1.1 元规则 | 通用约束段补充"标准做法合理膨胀"说明 |

---

## 📋 提示词索引

| # | 修复项 | 优先级 | 估时 | 是否涉及 schema | 提示词锚点 |
|---|--------|--------|------|----------------|------------|
| 1 | OpenTelemetry trace 接入 | P1 | 1 天 | ❌ | [PROMPT-07](#prompt-07-接入-opentelemetry-trace) |
| 2 | Prometheus 指标 + Grafana 看板 | P1 | 1 天 | ❌ | [PROMPT-08](#prompt-08-接入-prometheus-指标) |
| 3 | Sentry 错误聚合 | P1 | 半天 | ❌ | [PROMPT-09](#prompt-09-接入-sentry-错误聚合) |
| 4 | `/api/health` 增强（DB+Redis+BullMQ） | P1 | 2 小时 | ❌ | [PROMPT-10](#prompt-10-增强-apihealth-健康检查) |
| 5 | SQL 索引梳理 + EXPLAIN ANALYZE | P1 | 1 天 | **✅ 必须用 Guard** | [PROMPT-11](#prompt-11-关键-sql-索引梳理) |
| 6 | 单元测试覆盖率门槛纳入 CI | P1 | 半天 | ❌ | [PROMPT-12](#prompt-12-单测覆盖率门槛纳入-ci) |
| - | 移动端 E2E（手工 + Playwright 配置） | P2 | - | ❌ | 不在本批，单独说明 |

---

## ⚙️ 阶段 1 通用约束（每次粘贴前先看）

```
🚨 通用铁律：
1. 必须先完成阶段 0，特别是 PROMPT-02（pino 日志已就位）
2. 禁止添加本提示词未列出的 npm 包
3. 禁止触碰业务 service / controller 的实现逻辑
4. 所有外部依赖（OTel collector / Prometheus / Sentry）必须支持优雅降级：
   - 未配置环境变量时，应用照常启动，不报错
   - 仅在配置存在时才推送数据
5. 不要修改 docker-compose.yml（运维改动不在本次范围）
6. 涉及数据库变更（PROMPT-11）必须应用 Migration Guard 并独立 commit
7. **与 PROMPT-02 pino redact 路径协调**：
   - 不要重复 redact（PROMPT-02 已处理 phone/email/name 等）
   - 也不要和 PROMPT-02 的策略冲突
   - 现有 pino redact 路径（参考 server/src/lib/logger.ts）：
     *.password / *.phone / *.email / *.name / *.resumeUrl /
     *.detail.password / *.detail.phone / *.detail.email 等
```

### 📐 v1.1 元规则：当"行数约束"与"功能完整性"冲突时

> **本节基于 PROMPT-01 实战反馈**：用户指出"1-3 行"约束与推荐方案的 try/catch 块本身冲突。

当提示词中"X 行变更" / "Y 个文件"等量化约束与标准做法（try/catch、空值检查、错误传播）冲突时，按以下优先级处理：

| 优先级 | 约束类型 | 处理方式 |
|--------|---------|---------|
| 🔴 硬 | 功能完整性 / 安全校验 / 错误处理 | **不可妥协**，允许行数膨胀 |
| 🔴 硬 | "禁止做的事"清单 | 不可触碰 |
| 🔴 硬 | Migration Guard 流程（PROMPT-11） | schema 变更必经流程 |
| 🟡 软 | "X 行 / Y 文件"等量化指标 | **允许 ±50% 偏差**，前提是偏差由标准错误处理导致 |
| 🟢 软 | 代码风格（命名、注释位置） | 与现有风格一致即可 |

**Cursor 自我 review 时**，如果实际行数超出预期，必须在末尾"实施备注"中说明。

**禁止的偏差**：删除 try/catch、删除空值检查、删除错误传播以"凑行数"。

### 📋 Cursor 完成后必须输出"实施备注"模板

每个提示词任务完成后，Cursor 必须输出以下 5 行小节：

```markdown
## 实施备注

- 实际改动：[实际行数 / 文件数]
- 推荐方案预估：[预估行数 / 文件数]
- 偏差原因：[解释多了什么 / 少了什么；如无偏差填"无"]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项逐条勾选：[✅/❌] × 4-7 条
```

---

## 🛡️ 数据库 Migration Guard（PROMPT-11 必须应用）

> **PROMPT-11 涉及 schema 变更（新增索引），必须应用 Migration Guard 流程。**
> **PROMPT-05 实战证明**：没有 Guard，Cursor 默认行为（直接 apply + DROP COLUMN）会丢数据。
> **完整 Guard Prompt** 见 `VIBE_CODING_MIGRATION_GUARD.md`。

### PROMPT-11 专属 Guard 强化项

由于 PROMPT-11 的特殊性（新增索引可能锁大表），在标准 Guard 流程外额外注意：

```markdown
## 索引迁移特殊规则（仅 PROMPT-11）

### 大表加索引必须用 CONCURRENTLY
```sql
-- 标准写法（锁表几分钟）
CREATE INDEX "stage_record_status_enteredAt_idx" ON "stage_record"("status", "enteredAt");

-- 推荐写法（不锁表，但慢一些）
CREATE INDEX CONCURRENTLY "stage_record_status_enteredAt_idx" ON "stage_record"("status", "enteredAt");
```

Prisma migrate 默认用第一种。如果表行数 > 10 万，**必须改写为 CONCURRENTLY**。
但 CONCURRENTLY 不能在事务内执行，所以 CREATE INDEX 必须独立成一个 migration。

### 验证步骤
1. 生成 SQL 后人工 review 索引数量（避免冗余）
2. 确认每个索引都有对应的 EXPLAIN 证据支持
3. `pg_indexes` 查询确认新索引生效
```

---

### Guard 实操：PROMPT-11 完整流程

```
Step 1：生成 EXPLAIN ANALYZE 报告
  - 在 dev 库运行 4 条慢查询的 EXPLAIN
  - 贴出结果，由人类判断需要哪些索引

Step 2：修改 schema.prisma（仅追加 @@index）
  - 不要修改现有索引
  - 不要触碰其他字段

Step 3：prisma generate（仅生成 client，不动 DB）

Step 4：migrate dev --create-only（生成 SQL，不 apply）
  - 如果无 TTY，fallback 到 migrate diff（PROMPT-05 实战经验）

Step 5：人工 review SQL
  - 大表必须用 CONCURRENTLY
  - 无冗余索引（避免 (a,b) 已存在时再加 (a)）

Step 6：人类回复 "apply" 后才 migrate deploy

Step 7：重新跑 EXPLAIN，确认 Seq Scan → Index Scan

Step 8：commit
```

---

<a id="prompt-07"></a>
## PROMPT-07：接入 OpenTelemetry trace

### Cursor 提示词

```markdown
# 任务：接入 OpenTelemetry 分布式追踪

## Context
- 项目后端：`server/`，Express 4 + TypeScript + Prisma + Redis + BullMQ
- 阶段 0 已完成：`pino` 结构化日志已就位（`server/src/lib/logger.ts`）
- 入口：`server/src/index.ts` → `server/src/app.ts`
- 中间件链顺序：helmet → cors → morgan → json → rate-limit → routes
- 没有现成的 APM/trace 工具
- 目标：HTTP 请求 → Service → Prisma 调用的全链路 trace

## 设计原则
1. **零侵入业务代码**：用 OTel auto-instrumentation 库，不改 service 实现
2. **OTLP 协议**：用 OTLP HTTP exporter（最通用，支持 Jaeger / Tempo / 阿里云 ARMS）
3. **优雅降级**：未配置 `OTEL_EXPORTER_OTLP_ENDPOINT` 时不连接，app 照常运行
4. **关联日志**：trace_id 应能写入 pino 日志（与 PROMPT-02 联动）

## Phase 0：先确认环境（v1.1 新增）
```bash
cd server
pnpm list tsx 2>/dev/null | head -3
node --version
```
确认：
- tsx 版本：0.x 用 `--import`，老版本用 `-r`
- Node 版本：≥ 18（已经满足）

## Phase 1：安装依赖
```bash
pnpm add @opentelemetry/api \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
pnpm add -D @opentelemetry/sdk-trace-node
```

## Phase 2：新建 `server/src/lib/tracing.ts`
这是 OTel SDK 的初始化文件，**必须**在任何业务代码 import 之前 require（用 `--import` 加载）。

内容结构：
```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'ats-server',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    }),
    // v1.1: OTLP HTTP 端口约定（4318 是 HTTP，4317 是 gRPC）
    // 如果 4318 不可用，前缀 path 可以自定义
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // 关闭不需要的 instrumentation，减少噪音
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown().catch(console.error);
  });
}
```

## Phase 3：package.json 启动脚本
修改 `server/package.json` 的 `scripts.dev` 和 `scripts.start`：
```json
{
  "dev": "tsx watch --import ./src/lib/tracing.ts src/index.ts",
  "start": "node --import ./dist/lib/tracing.js dist/index.js"
```
（tsx 0.x 用 `--import`；老版本用 `-r ./src/lib/tracing.ts`，Phase 0 已确认）

## Phase 4：环境变量
在 `server/src/lib/env.ts` 中**追加**（不修改现有字段）：
```ts
OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
OTEL_SAMPLING_RATIO: z.string().optional().transform((v) => (v ? parseFloat(v) : 1.0)),
```

更新 `.env.example`：
```
# OpenTelemetry（留空则禁用）
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
# OTEL_SAMPLING_RATIO=1.0
```

## Phase 5：关联 pino 日志（与 PROMPT-02 协调）
修改 `server/src/lib/logger.ts`，**只追加 mixin，不动现有 redact 路径**：

**重要**：PROMPT-02 已经设置了 pino redact 路径（`*.password` / `*.phone` / `*.email` / `*.name` 等），
**不要重复定义或冲突**。只在 mixin 函数里追加 trace 字段即可。

```ts
import { trace, context } from '@opentelemetry/api';

export const logger = pino({
  // ... 现有配置不动（包含 PROMPT-02 的 redact 路径）
  mixin() {
    const span = trace.getSpan(context.active());
    if (!span) return {};
    const ctx = span.spanContext();
    return { trace_id: ctx.traceId, span_id: ctx.spanId };
  },
});
```

## 禁止事项
- ❌ 不要修改任何 service / controller / middleware 的业务实现
- ❌ 不要把 OTel SDK 直接 import 进 service（必须用 auto-instrumentation）
- ❌ 不要修改现有的 rate-limit、helmet、cors 中间件顺序
- ❌ 不要触碰 `server/src/lib/prisma.ts`（Prisma instrumentation 会自动接入）
- ❌ 不要触碰前端代码
- ❌ 不要把 trace 数据持久化到 DB
- ❌ **不要修改 PROMPT-02 现有的 pino redact 路径**（已有 PII 防护，不要重复或冲突）

## 必须新增的测试
文件：`server/tests/unit/tracing.test.ts`
测试用例：
1. 当 `OTEL_EXPORTER_OTLP_ENDPOINT` 未设置时，require `tracing.ts` 不报错、不连接外部服务
2. 当环境变量设置时，OTLP exporter 应被实例化（用 mock 验证）
3. pino logger 的输出 mixin 中，当有 active span 时包含 `trace_id` 和 `span_id`
4. mixin 在无 span context 时返回空对象（不报错）
5. **新增**：trace_id 不会绕过 pino redact 路径（即 trace_id 本身不视为 PII）

测试用 vitest，无需启动 OTel collector。

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ `pnpm dev` 启动 server，控制台无 OTel 相关错误
3. ✅ 启动 Jaeger（`docker run -p 16686:16686 jaegertracing/all-in-one`）后访问 traces UI，能看到请求
4. ✅ 不设置 `OTEL_EXPORTER_OTLP_ENDPOINT` 时，应用启动速度无明显下降（< 100ms）
5. ✅ `pnpm type-check` 通过
6. ✅ pino 日志中 trace_id 与 PROMPT-02 的 redact 路径互不干扰

## 完成后请输出
1. 新文件 `tracing.ts` 完整代码
2. `logger.ts` / `env.ts` / `package.json` diff
3. 手动验证截图或日志（启动 → 访问接口 → 看到 trace）
4. 自我 review：是否触犯了任何"禁止事项"

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[新文件 tracing.ts 行数 + logger.ts/env.ts diff + package.json 变更]
- 推荐方案预估：[1 新文件 + 3 文件小改]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不修改任何 service / controller / middleware 业务实现
  - [✅/❌] 不在 service 里 import OTel
  - [✅/❌] 不修改中间件顺序
  - [✅/❌] 不触碰 prisma.ts
  - [✅/❌] 不触碰前端
  - [✅/❌] 不把 trace 数据持久化到 DB
  - [✅/❌] 不修改 PROMPT-02 pino redact 路径
```

---

<a id="prompt-08"></a>
## PROMPT-08：接入 Prometheus 指标

### Cursor 提示词

```markdown
# 任务：接入 Prometheus 指标采集

## Context
- 阶段 1 PROMPT-07 已完成（OTel trace 就位）
- 后端：Express 4 + Prisma + Redis
- 现状：完全没有指标采集
- 目标：暴露 `/api/metrics` 端点，采集 HTTP、Prisma、Redis、自定义业务指标

## 设计原则
1. **独立路由**：metrics 端点**不走**全局 rate-limit（避免被业务限流影响）
2. **零侵入**：用 `prom-client` 的 default metrics + 自定义 metric
3. **优雅降级**：未配置 Prometheus 推送时，本地累积即可
4. **合理 cardinality**：标签值要限定枚举，禁止高基数（userId / candidateId 不能做 label）
5. **应用前缀**（v1.1 新增）：所有自定义 metric 加 `ats_` 前缀，避免与基础设施 metric 冲突

## Phase 1：安装
```bash
cd server
pnpm add prom-client
pnpm add -D @types/prom-client
```

## Phase 2：新建 `server/src/lib/metrics.ts`
```ts
import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

// v1.1: 所有自定义 metric 加 `ats_` 前缀
export const httpRequestDuration = new client.Histogram({
  name: 'ats_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: 'ats_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const candidateStageAdvanceTotal = new client.Counter({
  name: 'ats_candidate_stage_advance_total',
  help: 'Total candidate stage advances',
  labelNames: ['from_stage', 'to_stage', 'status'],
  registers: [register],
});

export const offerApprovalTotal = new client.Counter({
  name: 'ats_offer_approval_total',
  help: 'Total offer approval actions',
  labelNames: ['action', 'role'],  // action: submit/approve/reject/send
  registers: [register],
});

export const llmCallDuration = new client.Histogram({
  name: 'ats_llm_call_duration_seconds',
  help: 'LLM API call duration',
  labelNames: ['provider', 'purpose'],  // purpose: resume_parse/match
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const dbQueryDuration = new client.Histogram({
  name: 'ats_db_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['model', 'operation'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});
```

## Phase 3：在 `app.ts` 注入 metrics 中间件
**追加**（不修改现有顺序）：
```ts
import { register, httpRequestDuration, httpRequestTotal } from './lib/metrics';

// 在 app.use('/api', routes) 之前注入
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path || req.path;
    // 脱敏：将路径中的 cuid 替换为 :id（避免高基数 label）
    const safeRoute = route.replace(/[a-z0-9]{20,}/gi, ':id');
    const labels = {
      method: req.method,
      route: safeRoute,
      status_code: String(res.statusCode),
    };
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
  });
  next();
});
```

## Phase 4：新增 metrics 端点
**新文件**：`server/src/routes/metrics.ts`
```ts
import { Router } from 'express';
import { register } from '../lib/metrics';

const router = Router();

// 不走全局 rate-limit，不走 JSON body parser
router.get('/', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

export default router;
```

**修改** `server/src/routes/index.ts`（保持与 `/health` 风格一致）：
```ts
import metricsRoutes from './metrics';
// 保留现有 /health 路由位置，新增 metrics 路由
// 建议放在 router.use('/metrics', metricsRoutes) 与 auth 路由同级
```

注意：`/api/metrics` 必须能在**不携带 JWT**的情况下访问（Prometheus 抓取通常不走鉴权）。
如有内网隔离需求可加 IP 白名单，但**不要**强制 JWT。

## Phase 5：在关键业务代码埋点
**只改这 3 个 service，每个加 1-2 行**：
1. `server/src/services/candidate.service.ts` 的 `advanceStage` 末尾
2. `server/src/services/offer.service.ts` 的审批相关方法
3. `server/src/lib/llm.ts` 的 `callLLM` 函数

具体埋点代码与 v1.0 相同，metric 名记得加 `ats_` 前缀。

## 与 PROMPT-02 pino 的协调
- PROMPT-02 已经在 pino 层 redact phone/email/name 等 PII
- metrics label 禁止含这些字段（已在禁止事项强调）
- 如果某个指标需要记录"哪个候选人/操作人"，应使用 ID 而非姓名/邮箱

## 禁止事项
- ❌ 不要把 `userId` / `candidateId` / `email` / `phone` 等高基数字段作为 label
- ❌ 不要在 metrics 端点强制 JWT 鉴权（Prometheus 不带 token）
- ❌ 不要替换 `express-rate-limit`（继续保留）
- ❌ 不要触碰现有 metrics 之外的中间件
- ❌ 不要修改 `lib/prisma.ts`（不要做 Prisma 包装埋点，histogram 已经够用）
- ❌ 不要给 `/api/metrics` 单独写一个新服务
- ❌ **不要让 metric 名与 PROMPT-02 的 redact 路径冲突**（虽然不直接相关，但保持命名规范一致）
- ❌ **不要省略 `ats_` 前缀**（v1.1 强制）

## 必须新增的测试
文件：`server/tests/integration/metrics.test.ts`（supertest）
测试用例：
1. `GET /api/metrics` 返回 200，Content-Type 是 `text/plain`
2. 响应体包含 `ats_http_requests_total` metric 名
3. 默认 metrics 包含 `nodejs_eventloop_lag_seconds`
4. 触发一次 `POST /api/auth/login` 后，`ats_http_requests_total{method="POST",route="/api/auth/login",status_code="401"}` 增加
5. 触发阶段推进后，`ats_candidate_stage_advance_total` 增加

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ `curl http://localhost:3001/api/metrics` 返回 Prometheus 格式文本，包含 `ats_` 前缀
3. ✅ 启动 Prometheus + Grafana，能看到数据
4. ✅ 故意触发 10 个 200 和 1 个 500，`ats_http_requests_total{status_code="500"}` 计数 = 1
5. ✅ `pnpm lint` 通过

## 完成后请输出
1. 新文件 `metrics.ts` 和 `routes/metrics.ts`
2. 修改的文件 diff（清单：app.ts / routes/index.ts / candidate.service.ts / offer.service.ts / llm.ts；[软目标：清单不变]）
3. `/api/metrics` 真实响应样例（截取前 50 行）
4. Grafana 看板截图（可选）

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[metrics.ts 行数 + 修改文件数]
- 推荐方案预估：[2 新文件 + 4-5 文件小改]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不把 userId/candidateId/email/phone 当 label
  - [✅/❌] 不在 metrics 端点强制 JWT
  - [✅/❌] 不替换 express-rate-limit
  - [✅/❌] 不修改 metrics 之外的中间件
  - [✅/❌] 不修改 lib/prisma.ts
  - [✅/❌] 不给 /api/metrics 单写新服务
  - [✅/❌] metric 加了 ats_ 前缀
```

---

<a id="prompt-09"></a>
## PROMPT-09：接入 Sentry 错误聚合

### Cursor 提示词

```markdown
# 任务：接入 Sentry 错误聚合

## Context
- 后端：Express 4 + TypeScript
- 阶段 0 已完成：pino 日志（PROMPT-02）
- 阶段 1 PROMPT-07 已完成：OTel trace（trace_id 应能关联到 Sentry）
- 现状：错误只在 console.error 输出，没有聚合
- 目标：5xx 错误、未捕获异常、LLM 错误自动上报

## 设计原则
1. **只上报 5xx**，不上报 4xx（4xx 是用户错误不是系统错误）
2. **PII 自动 redact**：候选人姓名/手机/邮箱/简历 URL 不能进 Sentry
3. **优雅降级**：未配置 SENTRY_DSN 时完全跳过，app 启动不受影响
4. **不重复上报**：与 pino 错误日志并存即可
5. **与 PROMPT-02 pino redact 协调**（v1.1 重要）：
   - PROMPT-02 已处理 `*.phone` / `*.email` / `*.name` / `*.resumeUrl` 等
   - Sentry 的 `beforeSend` 不应与 pino 的策略冲突
   - 优先复用 PROMPT-02 的 redact 思路，扩展到 Sentry 特有的字段

## Phase 1：安装
```bash
cd server
pnpm add @sentry/node
```

## Phase 2：新建 `server/src/lib/sentry.ts`
```ts
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

let initialized = false;

export function initSentry() {
  if (!dsn) {
    return;  // 优雅降级
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || '1.0.0',
    tracesSampleRate: 0.1,  // 10% 采样，避免性能影响
    beforeSend(event) {
      // PII redact：与 PROMPT-02 pino 协调
      // PROMPT-02 已处理 phone/email/name 等基础字段
      // 这里补充 Sentry 特有的：request.data, user.email, user.ip_address
      if (event.request?.data) {
        // POST body 不上报（可能含候选人敏感信息）
        event.request.data = '[REDACTED]';
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      // v1.1 新增：防止请求 URL 中的 cuid/UUID 暴露业务信息
      if (event.request?.url) {
        event.request.url = event.request.url.replace(
          /\/[a-z0-9]{20,}/gi,
          '/:id'
        );
      }
      // v1.1 新增：breadcrumb 中可能含 query string 的 JWT token
      return event;
    },
    ignoreErrors: [],
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'http') {
        // URL query 中的 JWT token 不上报
        if (breadcrumb.data?.url?.includes('token=')) {
          breadcrumb.data.url = breadcrumb.data.url.split('?')[0];
        }
      }
      return breadcrumb;
    },
  });

  initialized = true;
}

export function isSentryEnabled() {
  return initialized;
}
```

## Phase 3：在 `app.ts` 接入
**修改顺序**（重要）：
1. `initSentry()` 在 `app.ts` 第 1 行（所有中间件之前）
2. 在所有路由之后、`errorHandler` 之前，加 Sentry 的 error handler：

```ts
import * as Sentry from '@sentry/node';
import { initSentry, isSentryEnabled } from './lib/sentry';

// 文件最顶部
initSentry();

// ... 现有中间件（helmet, cors, etc.）

app.use('/api', routes);

// Sentry error handler（在 errorHandler 之前）
if (isSentryEnabled()) {
  app.use(Sentry.Handlers.errorHandler());
}

// 全局错误处理（保持现有）
app.use(errorHandler);
```

## Phase 4：进程级异常捕获
**修改** `server/src/index.ts`，**只改 uncaughtException / unhandledRejection 部分**：
```ts
// 改后：
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (isSentryEnabled()) {
    Sentry.captureException(error);
    Sentry.flush(2000).finally(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
```
同理处理 `unhandledRejection`。

## Phase 5：环境变量
在 `server/src/lib/env.ts` 追加：
```ts
SENTRY_DSN: z.string().url().optional(),
SENTRY_TRACES_SAMPLE_RATE: z.string().optional().transform((v) => (v ? parseFloat(v) : 0.1)),
```

更新 `.env.example`：
```
# Sentry（留空则禁用）
# SENTRY_DSN=https://xxx@sentry.io/123
# SENTRY_TRACES_SAMPLE_RATE=0.1
```

## 禁止事项
- ❌ 不要在 service / controller 里手动调用 `Sentry.captureException`（让全局 handler 自动捕获）
- ❌ 不要把 `req.body` 上报
- ❌ 不要上报 4xx 错误（用 `beforeSend` 过滤或在路由层不 throw）
- ❌ 不要替换现有 pino 日志（两者并存）
- ❌ 不要触碰 OTel trace（PROMPT-07）
- ❌ 不要修改 Prisma 错误处理
- ❌ **不要与 PROMPT-02 pino redact 路径重复或冲突**（v1.1 强化）
- ❌ **不要在 Sentry 重新定义 PROMPT-02 已有的 redact 规则**（应扩展而非重复）

## 必须新增的测试
文件：`server/tests/unit/sentry.test.ts`
测试用例：
1. 当 `SENTRY_DSN` 未设置时，`initSentry()` 不抛错，`isSentryEnabled()` 返回 false
2. 当 `SENTRY_DSN` 设置时，`initSentry()` 后 `isSentryEnabled()` 返回 true
3. `beforeSend` 钩子能正确 redact `request.data`
4. `beforeSend` 钩子能正确删除 `user.email`
5. URL 中含 `token=xxx` 的 breadcrumb 被脱敏
6. **v1.1 新增**：URL 中含 cuid/UUID 的请求路径被脱敏为 `:id`

测试用 mock 验证，不需要真实 Sentry 连接。

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ 未设置 `SENTRY_DSN` 时，启动 server 一切正常
3. ✅ 设置 `SENTRY_DSN` 后，故意触发一个 500，查看 Sentry 面板能看到事件
4. ✅ 触发 500 时，日志中**不应**出现候选人手机号/邮箱/姓名（验证 PII redact）
5. ✅ 4xx 错误不上报到 Sentry

## 完成后请输出
1. 新文件 `sentry.ts` 完整代码
2. `app.ts` / `index.ts` / `env.ts` diff
3. 测试文件
4. Sentry 面板截图（如有真实 DSN）

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[sentry.ts 行数 + 3 文件 diff]
- 推荐方案预估：[1 新文件 + 3 文件小改]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不在 service/controller 手动调 Sentry.captureException
  - [✅/❌] 不上报 req.body
  - [✅/❌] 不上报 4xx 错误
  - [✅/❌] 不替换 pino 日志
  - [✅/❌] 不触碰 OTel trace
  - [✅/❌] 不修改 Prisma 错误处理
  - [✅/❌] 与 PROMPT-02 pino redact 协调（不重复）
```

---

<a id="prompt-10"></a>
## PROMPT-10：增强 `/api/health` 健康检查

### Cursor 提示词

```markdown
# 任务：增强 /api/health 端点（检查 DB / Redis / BullMQ）

## Context
- 当前 `server/src/routes/index.ts:26-35` 有简单 `/health`：
  ```ts
  router.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', timestamp: ..., version: '1.0.0' } });
  });
  ```
- 需要扩展为：
  - 检查 PostgreSQL 连通性
  - 检查 Redis 连通性
  - 检查 BullMQ 队列积压情况
  - 返回分项状态
- 用途：Kubernetes liveness / readiness 探针、监控告警

## 设计原则
1. **快速失败**：每个检查设 2 秒超时，避免一个慢依赖拖死整个端点
2. **HTTP 状态语义**：
   - 200：所有核心依赖（DB + Redis）正常
   - 503：DB 或 Redis 不可用
   - BullMQ 积压过多只 warn，不影响 HTTP 状态
3. **缓存机制**：结果缓存 5 秒，避免高频探针压垮 DB
4. **版本号从 package.json 读**（v1.1 改进）：不要硬编码 '1.0.0'

## Phase 1：实现 `server/src/services/health.service.ts`
```ts
import prisma from '../lib/prisma';
import { redis } from '../lib/redis';
import { getBullMQConnection } from '../lib/redis';
import { env } from '../lib/env';
import fs from 'fs';
import path from 'path';

interface CheckResult {
  status: 'ok' | 'warn' | 'fail';
  latencyMs?: number;
  message?: string;
  detail?: Record<string, unknown>;
}

interface HealthResult {
  status: 'ok' | 'degraded' | 'fail';
  timestamp: string;
  version: string;  // v1.1: 从 package.json 读
  uptime: number;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    bullmq: CheckResult;
  };
}

const startTime = Date.now();

// v1.1: 从 package.json 读版本号
function getAppVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 2000);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'fail', message: (err as Error).message };
  }
}

export async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(redis.ping(), 2000);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'fail', message: (err as Error).message };
  }
}

export async function checkBullMQ(): Promise<CheckResult> {
  try {
    const { Queue } = await import('bullmq');
    const queue = new Queue('resume-parse', { connection: getBullMQConnection() });
    const counts = await withTimeout(queue.getJobCounts(), 2000);
    await queue.close();
    const total = counts.waiting + counts.active + counts.delayed;
    return {
      status: total > 1000 ? 'warn' : 'ok',
      detail: { jobs: counts, total },
      message: total > 1000 ? '队列积压过多' : undefined,
    };
  } catch (err) {
    return { status: 'warn', message: `BullMQ 检查失败: ${(err as Error).message}` };
  }
}

let cache: { result: HealthResult; ts: number } | null = null;

export async function getHealthSnapshot(): Promise<HealthResult> {
  if (cache && Date.now() - cache.ts < 5000) {
    return cache.result;
  }

  const [database, redisResult, bullmq] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkBullMQ(),
  ]);

  const result: HealthResult = {
    status: database.status === 'ok' && redisResult.status === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: getAppVersion(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: { database, redis: redisResult, bullmq },
  };

  cache = { result, ts: Date.now() };
  return result;
}
```

## Phase 2：替换路由
**修改** `server/src/routes/index.ts`：
```ts
import { getHealthSnapshot } from '../services/health.service';

router.get('/health', async (_req, res) => {
  const result = await getHealthSnapshot();
  const httpStatus = result.status === 'fail' ? 503 : 200;
  res.status(httpStatus).json({ success: result.status === 'ok', data: result });
});
```

## 禁止事项
- ❌ 不要修改 `/api/health` 的路径
- ❌ 不要把健康检查塞进全局 rate-limit
- ❌ 不要把缓存时间设短于 3 秒（防止探针风暴）
- ❌ 不要让 BullMQ 检查失败影响整体 HTTP 状态（只 warn）
- ❌ 不要触碰 health.service.ts 之外的其他 service
- ❌ 不要在 health 检查里调用 `process.exit`
- ❌ **不要硬编码版本号**（v1.1）

## 必须新增的测试
文件：`server/tests/unit/health.service.test.ts`
测试用例：
1. DB 正常时 `checkDatabase()` 返回 `{ status: 'ok', latencyMs: ... }`
2. DB 超时时返回 `{ status: 'fail', message: 'timeout' }`（用 mock 让 queryRaw 挂起）
3. Redis ping 失败时返回 fail
4. BullMQ 队列积压 > 1000 时返回 warn
5. 整体快照：DB 正常 + Redis 正常 → `status: 'ok'`、HTTP 200
6. 整体快照：DB fail → `status: 'degraded'`、HTTP 200（注意：degraded 仍 200，fail 才 503）
7. 缓存机制：连续两次调用，DB 查询只执行 1 次
8. **v1.1 新增**：版本号从 package.json 读取，不是硬编码

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ `curl http://localhost:3001/api/health` 返回 JSON 包含 `database` / `redis` / `bullmq` 三项
3. ✅ 故意停掉 Redis（`docker stop ats_redis`）后，curl 返回 HTTP 200（degraded）或 503
4. ✅ 缓存生效：5 秒内连续 curl 5 次，DB 连接数无明显增长
5. ✅ `/api/health` 不在全局 rate-limit 范围内
6. ✅ **v1.1 新增**：响应中的 version 与 package.json 一致

## 完成后请输出
1. 新文件 `health.service.ts`
2. `routes/index.ts` diff
3. 三种状态下的 curl 响应样例（ok / degraded / fail）
4. 测试文件

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[health.service.ts 行数 + routes/index.ts diff]
- 推荐方案预估：[1 新文件 + 1 文件小改]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不修改 /api/health 路径
  - [✅/❌] 不把健康检查塞进全局 rate-limit
  - [✅/❌] 不把缓存时间设短于 3 秒
  - [✅/❌] 不让 BullMQ 失败影响整体 HTTP 状态
  - [✅/❌] 不触碰其他 service
  - [✅/❌] 不在 health 检查里调 process.exit
  - [✅/❌] 版本号读 package.json，不硬编码
```

---

<a id="prompt-11"></a>
## PROMPT-11：关键 SQL 索引梳理

> ⚠️ **本 prompt 涉及 schema 变更，必须应用 [Migration Guard](./VIBE_CODING_MIGRATION_GUARD.md) 流程**

### Cursor 提示词

```markdown
# 任务：为关键慢查询补全索引（需 Migration Guard）

## Context
- 数据库：PostgreSQL 14+
- ORM：Prisma 5.22
- `server/prisma/schema.prisma` 已定义所有模型
- 已识别的高频慢查询（来自审计）：
  - `candidate.service.ts:300-345`：候选人列表 + 标签 + 阶段筛选
  - `stats.service.ts:633-650`：阶段记录按 stage 分组
  - `interview-scheduler.service.ts:116-131`：面试冲突检测
- 阶段记录表 `stage_record` 数据量增长最快，是首要优化目标

## 设计原则
1. **数据驱动**：先 EXPLAIN ANALYZE，再加索引；不加"以防万一"的索引
2. **复合索引优先**：单列索引只在 WHERE 单独出现时有用，复合索引覆盖更广
3. **避免冗余**：(a, b) 已存在时 (a) 单独索引是冗余
4. **业务+技术共同 review**：每个索引都需要解释"为什么这个查询会用到它"
5. **大表必须用 CONCURRENTLY**（v1.1 新增）：避免锁表阻塞生产

## ⚠️ Migration Guard 必须应用
本任务涉及 schema 变更（新索引），**必须严格按 Guard 流程执行**：
1. `prisma migrate dev --create-only`（如无 TTY fallback 到 `migrate diff`）
2. 完整展示 SQL 给人类 review
3. 大表必须用 `CREATE INDEX CONCURRENTLY`
4. 人类回复 `apply` 后才 `migrate deploy`
5. 详情见 `VIBE_CODING_MIGRATION_GUARD.md`

## Phase 1：EXPLAIN ANALYZE 现有查询

**只读不改**，运行以下 SQL（在 dev 数据库）。如果 Cursor Agent 无法连接 dev DB，
请生成 SELECT 语句让人类手动运行并粘贴结果。

```sql
-- 查询 1：候选人列表 + 阶段筛选
EXPLAIN (ANALYZE, BUFFERS) 
SELECT "candidateId" FROM (
  SELECT "candidateId", stage, status,
         ROW_NUMBER() OVER (PARTITION BY "candidateId" ORDER BY "enteredAt" DESC) as rn
  FROM "stage_record"
) t WHERE rn = 1 AND stage = '复试' AND status = 'passed';

-- 查询 2：阶段停留时长统计
EXPLAIN (ANALYZE, BUFFERS)
SELECT stage, AVG(EXTRACT(EPOCH FROM ("completedAt" - "enteredAt")) / 86400)::numeric
FROM stage_record
WHERE "completedAt" IS NOT NULL
  AND "enteredAt" >= $1 AND "enteredAt" <= $2
GROUP BY stage;

-- 查询 3：面试冲突检测
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM interview
WHERE status = 'scheduled'
  AND "scheduledAt" < $1
  AND "scheduledAt" >= $2;

-- 查询 4：候选人最新阶段
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM stage_record
WHERE "candidateId" IN ($1, $2, ...)
ORDER BY "enteredAt" DESC;
```

把每个查询的 EXPLAIN 输出贴到对话里。

## Phase 2：分析 EXPLAIN 输出
针对每个查询：
1. 是否走 Seq Scan？→ 需要索引
2. 走 Index Scan 但用了哪个索引？是否最优？
3. Sort 是否在内存中？→ 可能需要复合索引避免排序

| 查询 | 当前计划 | 问题 | 建议索引 |
|------|---------|------|---------|
| ... | ... | ... | ... |

## Phase 3：修改 schema.prisma 添加索引

**只追加不修改**（重要）：
- 已存在索引不要动
- 其他模型字段不要碰
- 不要触碰 `prisma/seed.ts`

可能的索引（按需添加）：
- `StageRecord`: `(candidateId, enteredAt)`, `(stage, enteredAt)`, `(status, enteredAt)`
- `Interview`: `(scheduledAt, status)` 已存在，**不要重复加 `(scheduledAt, status, status)`（这是 typo）**
- `CandidateJob`: `(jobId, candidateId)` 已存在
- `Offer`: `(status, offerDate)`, `(result, offerDate)`

参考示例：
```prisma
model StageRecord {
  @@index([candidateId, enteredAt(sort: Desc)])
  @@index([stage, enteredAt])
  @@index([status, enteredAt])
}
```

## Phase 4：生成 migration（应用 Guard）

```bash
# Step 4.1：仅生成 client
npx prisma generate

# Step 4.2：生成 migration SQL（不 apply）
npx prisma migrate dev --create-only --name add_performance_indexes
# 如果无 TTY：npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --script

# Step 4.3：完整展示生成的 SQL，等待人类 review

# Step 4.4：人类回复 "apply" 后：
npx prisma migrate deploy
npx prisma generate
```

**v1.1 重要：大表索引必须改写为 CONCURRENTLY**

Prisma 生成的默认 SQL：
```sql
CREATE INDEX "stage_record_status_enteredAt_idx" ON "stage_record"("status", "enteredAt");
```

如果表行数 > 10 万，**手动改写**为：
```sql
CREATE INDEX CONCURRENTLY "stage_record_status_enteredAt_idx" ON "stage_record"("status", "enteredAt");
```

注意：CONCURRENTLY 不能在事务内。如果 migration 含 CONCURRENTLY，整个 migration 不能有 BEGIN/COMMIT 包裹。

## Phase 5：再次 EXPLAIN 验证
重新跑 Phase 1 的 SQL，确认：
- Seq Scan 变为 Index Scan
- 执行时间下降 ≥ 50%
- 缓冲区命中数（Buffers）下降

如果某条索引没有改善，回滚该索引。

## 禁止事项
- ❌ 不要盲加索引（每个新索引都要有 EXPLAIN 证据）
- ❌ 不要修改现有索引（只追加 `@@index`）
- ❌ 不要触碰其他 schema 字段（类型、关系、默认值）
- ❌ **不要修改 service 代码**（v1.1 软化：EXPLAIN 后如必须调整 where 条件，可小幅修改，但需说明）
- ❌ 不要触碰 `prisma/seed.ts`
- ❌ 不要触碰其他模型（User / Job / PipelineTemplate 等）的字段
- ❌ **不要省略 Guard 流程直接 apply**（这是 P0 铁律）
- ❌ **不要在大表上加非 CONCURRENTLY 索引**（v1.1 新增）

## 验收条件
1. ✅ 所有高频慢查询 EXPLAIN 显示使用了新索引
2. ✅ 迁移文件 SQL 清晰（人眼可读）
3. ✅ 大表索引用 CONCURRENTLY
4. ✅ `pnpm test` 全部通过
5. ✅ `pnpm prisma migrate dev` 在干净数据库上可重复执行
6. ✅ 应用的 service 代码基本无变更（[软目标：如需微调必须说明]）
7. ✅ Migration Guard 流程完整执行（--create-only → review → apply）

## 回滚预案
```bash
# 如果 apply 后发现某索引无效
npx prisma migrate resolve --rolled-back add_performance_indexes
# 或单独 DROP INDEX
DROP INDEX CONCURRENTLY "stage_record_status_enteredAt_idx";
```

## 完成后请输出
1. EXPLAIN 对比表（Phase 1 vs Phase 5）
2. `schema.prisma` diff（只追加，不修改）
3. 迁移文件 `migrations/xxx_add_performance_indexes/migration.sql`
4. 一句话总结："加 N 个索引后，最慢的 K 条查询从 Xms 降到 Yms"
5. **v1.1 必填**：Guard 流程的人工 review 反馈（apply / rollback / fix ...）

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[migration SQL 行数 + schema 改动行数 + 是否有 service 改动]
- 推荐方案预估：[预估加多少索引]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- **额外必填**：本次 migration 的人工 review 反馈
- **额外必填**：是否使用 CONCURRENTLY
- 禁止事项勾选：
  - [✅/❌] 使用 --create-only 或 fallback
  - [✅/❌] 完整展示 SQL
  - [✅/❌] 等人类 apply 后才 deploy
  - [✅/❌] apply 成功后才改 service（如有）
  - [✅/❌] schema 与 migration 一致
  - [✅/❌] 大表索引用 CONCURRENTLY
  - [✅/❌] 不盲加索引（每个有 EXPLAIN 证据）
  - [✅/❌] 不修改现有索引
  - [✅/❌] 不触碰其他模型字段
  - [✅/❌] 不触碰 seed.ts
```

---

<a id="prompt-12"></a>
## PROMPT-12：单测覆盖率门槛纳入 CI

### Cursor 提示词

```markdown
# 任务：把单测覆盖率门槛纳入 CI

## Context
- 测试运行器：Vitest 1.6
- 已有：`server/vitest.config.ts` 已有基础 coverage 配置（需确认）
- 当前现状：覆盖率只是开发参考，没有 CI 卡控
- 目标：在 CI 失败时阻止合并（用 GitHub Actions / GitLab CI）
- 项目根目录无 `.github/workflows/`，需新建

## 设计原则
1. **门槛渐进**：当前覆盖率基线是多少，先记录，再设当前 - 5% 的目标，避免 CI 全红
2. **核心文件高门槛**：service 文件门槛 ≥ 80%（已声明），其他文件门槛可宽松
3. **失败友好**：CI 失败时输出"哪些文件不达标 + 缺多少"，而非只是 fail
4. **容器启动顺序**（v1.1 新增）：CI 中 postgres/redis 容器要等就绪后才跑测试

## Phase 1：先摸清基线
```bash
cd server
pnpm test:coverage
```
把输出的覆盖率表（文件级别 lines/branches/functions/statements）保存到对话。

## Phase 2：调整 vitest.config.ts
**修改** `server/vitest.config.ts`（如果不存在则新建）：
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ... 现有配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      // 排除不需要覆盖率的文件
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.ts',
        'src/lib/prisma.ts',
        'src/lib/redis.ts',
        'src/lib/env.ts',
        'src/lib/tracing.ts',
        'src/lib/logger.ts',
        'src/lib/metrics.ts',
        'src/lib/sentry.ts',
        'src/lib/health.service.ts',  // v1.1: 健康检查是基础设施，可排除
      ],
      // 门槛：核心 service 高，其他宽松
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 55,
        perFile: false,
      },
    },
  },
});
```

**关键**：门槛值取 **基线 - 5%**（向下取整）。
例如基线 lines = 75%，门槛设 70%。基线 < 60% 时门槛 = 60%。

## Phase 3：CI 配置（v1.1 增强：容器启动等待）

### 选项 A：GitHub Actions
新建 `.github/workflows/ci.yml`：
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        ports: ['5432:5432']
        options: --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: --health-cmd "redis-cli ping" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test_db"
      REDIS_URL: "redis://localhost:6379"
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: cd server && pnpm install --frozen-lockfile
      # v1.1: 等待 postgres 就绪
      - run: cd server && pg_isready -h localhost || sleep 5
      - run: cd server && npx prisma migrate deploy
      - run: cd server && pnpm test:coverage
      - name: Upload coverage
        if: always()
        uses: codecov/codecov-action@v3
        with:
          directory: ./server/coverage
          fail_ci_if_error: false
```

### 选项 B：GitLab CI
新建 `.gitlab-ci.yml`：
```yaml
backend:test:
  image: node:20
  services:
    - name: postgres:18-alpine
      alias: postgres
    - name: redis:7-alpine
      alias: redis
  variables:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
    POSTGRES_DB: test_db
    DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/test_db"
    REDIS_URL: "redis://redis:6379"
  before_script:
    - corepack enable
    - pnpm config set store-dir .pnpm-store
    - cd server && pnpm install --frozen-lockfile
  script:
    # v1.1: 等待 postgres 就绪
    - until pg_isready -h postgres; do sleep 1; done
    - cd server && npx prisma migrate deploy
    - cd server && pnpm test:coverage
```

## Phase 4：本地预演
```bash
cd server
pnpm test:coverage
```
观察：覆盖率表输出 / 是否触发 threshold 失败 / HTML 报告是否生成。

## Phase 5：阶段性提门槛
门槛第一版设保守值；后续每 sprint 提 2-3%。

更新 `server/tests/README.md`：
- 当前门槛
- 历史门槛变更
- 如何本地跑覆盖率

## 禁止事项
- ❌ 不要把门槛一开始就设 80%
- ❌ 不要排除 service 文件
- ❌ 不要在 CI 里跑 `pnpm dev`
- ❌ 不要在 CI 里 hardcode 数据库密码（用 secrets/variables）
- ❌ 不要把 CI 文件放进 `server/` 目录
- ❌ 不要修改 package.json 的 scripts（只新增 `test:coverage`）
- ❌ **不要让 CI 容器启动顺序导致 flake**（v1.1 新增：必须等 postgres/redis 就绪）

## 必须新增的测试
**不写单测**（这次任务本身就是测试基础设施）。

但**必须**做：
1. `server/tests/README.md`：覆盖现有测试分类、运行方式、CI 流程
2. `server/tests/smoke.test.ts`：确保测试基础设施可用
   ```ts
   import { describe, it, expect } from 'vitest';

   describe('测试基础设施 smoke test', () => {
     it('vitest 工作正常', () => {
       expect(1 + 1).toBe(2);
     });
   });
   ```

## 验收条件
1. ✅ `pnpm test:coverage` 本地跑通，HTML 报告生成
2. ✅ 故意降低某个 service 的覆盖率，门槛生效导致失败
3. ✅ CI 配置文件语法正确
4. ✅ 门槛值低于当前基线，CI 首次跑通
5. ✅ CI 中 postgres / redis 容器有等待机制，不会因为启动顺序问题 flake

## 完成后请输出
1. 当前基线覆盖率表
2. 设定的门槛值 + 理由（基线 - 5%）
3. `vitest.config.ts` diff
4. CI 配置文件完整内容
5. `tests/README.md` 内容

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[vitest.config.ts diff + CI 文件行数 + tests/README.md 行数]
- 推荐方案预估：[3 文件：vitest.config + CI 配置 + README]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不把门槛一开始就设 80%
  - [✅/❌] 不排除 service 文件
  - [✅/❌] 不在 CI 跑 pnpm dev
  - [✅/❌] 不在 CI hardcode 数据库密码
  - [✅/❌] 不把 CI 文件放进 server/ 目录
  - [✅/❌] 不修改 package.json 的 scripts
  - [✅/❌] CI 容器有等待就绪机制
```

---

## 📌 阶段 1 执行总结

### 推荐执行顺序（修订）

| 周 | 任务 | 理由 |
|----|------|------|
| W1 D1-2 | PROMPT-10（健康检查） | 最简单，建立节奏 |
| W1 D3 | PROMPT-12（CI 门槛） | 防止后续回归 |
| W1 D4-5 | **PROMPT-11（索引 + Guard）** | **必须用 Guard**，先实战验证 Guard |
| W2 D1-2 | PROMPT-07（OTel） | 基础设施先行 |
| W2 D3 | PROMPT-08（Prometheus） | 与 OTel 协同 |
| W2 D4 | PROMPT-09（Sentry） | 收尾 |

**v1.1 调整**：把 PROMPT-11 推到 PROMPT-07 之前，确保：
1. Guard 在做 OTel 之前就经过实战验证
2. 索引迁移 + Guard 流程熟练后，再做复杂的多文件依赖任务

### 每个提示词的"打开方式"
同阶段 0：
1. 新开 Cursor Composer 对话
2. **PROMPT-11 必须先粘贴 [Migration Guard](./VIBE_CODING_MIGRATION_GUARD.md)**
3. 粘贴单个提示词
4. 人工 review "禁止事项"
5. 跑测试验收
6. commit：`feat(observability): PROMPT-07 OpenTelemetry trace`

### v1.0 → v1.1 主要变化

| 维度 | v1.0 | v1.1 |
|------|------|------|
| Migration Guard | ❌ 没应用 | ✅ PROMPT-11 强制应用 |
| PROMPT-02 协调 | ❌ 没说明 | ✅ 各 prompt 明确协调 |
| 行数/文件约束 | 硬约束 | 软目标（v1.1 元规则） |
| 实施备注 | 不强制 | 5 行小节模板 |
| 大表 CONCURRENTLY | 提示一下 | 强制要求 |
| CI 容器启动顺序 | 没注意 | health check + 等待 |
| Metric 前缀 | 无 | `ats_` 前缀 |
| 版本号 | 硬编码 | 从 package.json 读 |
| Typo | `(scheduledAt, status, status)` | 删除 |

### 跳过的任务说明
**移动端 E2E 测试覆盖**（阶段 1 原 7 个任务中的第 7 个）：
- 当前 E2E 仅覆盖 PC 端
- 移动端 `mobile/` 是独立 Vite 项目
- 建议**作为阶段 1.5** 单独执行

---

## 🔗 相关文档

- [VIBE_CODING_PROMPTS_PHASE0.md](./VIBE_CODING_PROMPTS_PHASE0.md) - 阶段 0 提示词集
- [VIBE_CODING_PROMPTS_UPDATE_v1.1.md](./VIBE_CODING_PROMPTS_UPDATE_v1.1.md) - v1.1 元规则
- [VIBE_CODING_PROMPTS_UPDATE_v1.2.md](./VIBE_CODING_PROMPTS_UPDATE_v1.2.md) - PROMPT-05 Migration Guard 实战
- [VIBE_CODING_MIGRATION_GUARD.md](./VIBE_CODING_MIGRATION_GUARD.md) - **PROMPT-11 必读**
- [VIBE_CODING_PROMPTS_v1.1_PATCHES.md](./VIBE_CODING_PROMPTS_v1.1_PATCHES.md) - PHASE 0/1/2 修订补丁

---

> **生成时间**：基于 PHASE 0 实战反馈（6 个 PROMPT 全部完成）
> **前置依赖**：阶段 0 的 PROMPT-02（pino）已就位
> **下一步**：从 PROMPT-10 开始执行（最简单，建立节奏）
