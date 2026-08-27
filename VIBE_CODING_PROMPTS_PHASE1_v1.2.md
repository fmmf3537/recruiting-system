# 阶段 1 可观测性提示词集（v1.2 - 自包含可直接粘贴版）

> **使用方式**：打开 Cursor Composer 新会话，从上到下按顺序复制粘贴。每个 prompt 都是自包含的，**复制下面 ```markdown ... ``` 代码块里的全部内容**粘贴即可。
> **基于**：阶段 0 实战反馈（PROMPT-01 ~ 06）+ PROMPT-05 Migration Guard 实战
> **顺序**：从最简单开始，先熟悉节奏，再做复杂任务

---

# 第 1 个：PROMPT-10 增强健康检查（30 分钟）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：增强 /api/health 端点（检查 DB / Redis / BullMQ）

## Context
- 后端：Express + Prisma + Redis + BullMQ
- 现有 `server/src/routes/index.ts:26-35` 有简单 `/health`：
  ```ts
  router.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', timestamp: ..., version: '1.0.0' } });
  });
  ```
- 需要扩展为：检查 PostgreSQL / Redis / BullMQ 队列积压
- 用途：Kubernetes liveness / readiness 探针、监控告警

## 设计原则
1. **快速失败**：每个检查设 2 秒超时
2. **HTTP 状态语义**：200 = 全部 ok，503 = DB 或 Redis 不可用
3. **缓存 5 秒**：避免高频探针压垮 DB
4. **优雅降级**：单组件失败不导致整个端点崩溃

## Phase 1：新建 `server/src/services/health.service.ts`

```ts
import prisma from '../lib/prisma';
import { redis } from '../lib/redis';
import { getBullMQConnection } from '../lib/redis';
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
  version: string;
  uptime: number;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    bullmq: CheckResult;
  };
}

const startTime = Date.now();

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

修改 `server/src/routes/index.ts`，把现有 `/health` 替换为：

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
- ❌ 不要把缓存时间设短于 3 秒
- ❌ 不要让 BullMQ 失败影响整体 HTTP 状态（只 warn）
- ❌ 不要触碰其他 service
- ❌ 不要在 health 检查里调用 `process.exit`
- ❌ 不要硬编码版本号（已从 package.json 读）

## 必须新增的测试
文件：`server/tests/unit/health.service.test.ts`
测试用例：
1. DB 正常时 `checkDatabase()` 返回 `{ status: 'ok', latencyMs: ... }`
2. DB 超时时返回 `{ status: 'fail', message: 'timeout' }`
3. Redis ping 失败时返回 fail
4. BullMQ 队列积压 > 1000 时返回 warn
5. 整体快照：DB 正常 + Redis 正常 → `status: 'ok'`
6. 缓存机制：连续两次调用，DB 查询只执行 1 次
7. 版本号从 package.json 读取，不是硬编码

## 完成后请按这个格式输出实施备注

```
## 实施备注

- 实际改动：[health.service.ts 行数 + routes/index.ts diff 行数]
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
  - [✅/❌] 版本号读 package.json
```

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ `curl http://localhost:3001/api/health` 返回 JSON 包含 `database` / `redis` / `bullmq` 三项
3. ✅ 故意停掉 Redis 后，curl 返回 HTTP 200（degraded）
4. ✅ 缓存生效：5 秒内连续 curl 5 次，DB 连接数无明显增长
5. ✅ 响应中的 version 与 package.json 一致
```

---

# 第 2 个：PROMPT-12 单测覆盖率门槛纳入 CI（半天）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：把单测覆盖率门槛纳入 CI

## Context
- 测试运行器：Vitest 1.6
- 已有：`server/vitest.config.ts` 已有基础 coverage 配置
- 当前现状：覆盖率只是开发参考，没有 CI 卡控
- 目标：在 CI 失败时阻止合并
- 项目根目录无 `.github/workflows/`，需新建

## 设计原则
1. **门槛渐进**：当前基线 - 5% 设门槛，避免 CI 全红
2. **失败友好**：CI 失败时输出"哪些文件不达标 + 缺多少"
3. **容器启动等待**：CI 中 postgres/redis 必须就绪后才跑测试

## Phase 1：先摸清基线
```bash
cd server
pnpm test:coverage
```
把输出的覆盖率表保存到对话。

## Phase 2：调整 vitest.config.ts
**修改** `server/vitest.config.ts`（如不存在则新建）：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ... 现有配置保留
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.ts',
        'src/lib/prisma.ts',
        'src/lib/redis.ts',
        'src/lib/env.ts',
        'src/lib/logger.ts',
      ],
      // 门槛：取基线 - 5%
      thresholds: {
        lines: 60,        // 根据 Phase 1 实际基线调整
        functions: 60,
        statements: 60,
        branches: 55,
        perFile: false,
      },
    },
  },
});
```

**关键**：门槛值取 **基线 - 5%**。例如基线 75%，门槛设 70%。基线 < 60% 时门槛 = 60%。

## Phase 3：CI 配置

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
      - run: cd server && npx prisma migrate deploy
      - run: cd server && pnpm test:coverage
      - name: Upload coverage
        if: always()
        uses: codecov/codecov-action@v3
        with:
          directory: ./server/coverage
          fail_ci_if_error: false
```

## Phase 4：本地预演
```bash
cd server
pnpm test:coverage
```
观察覆盖率表输出和 HTML 报告是否生成。

## Phase 5：新建 smoke test

新建 `server/tests/smoke.test.ts`：
```ts
import { describe, it, expect } from 'vitest';

describe('测试基础设施 smoke test', () => {
  it('vitest 工作正常', () => {
    expect(1 + 1).toBe(2);
  });
});
```

新建 `server/tests/README.md`，说明测试分类、运行方式、CI 流程。

## 禁止事项
- ❌ 不要把门槛一开始就设 80%
- ❌ 不要排除 service 文件
- ❌ 不要在 CI 里跑 `pnpm dev`
- ❌ 不要在 CI 里 hardcode 数据库密码（用 secrets/variables）
- ❌ 不要把 CI 文件放进 `server/` 目录
- ❌ 不要修改 package.json 的 scripts

## 完成后请按这个格式输出实施备注

```
## 实施备注

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

## 验收条件
1. ✅ `pnpm test:coverage` 本地跑通，HTML 报告生成
2. ✅ CI 配置文件语法正确
3. ✅ 门槛值低于当前基线，CI 首次跑通
```

---

# 第 3 个：PROMPT-11 SQL 索引（1 天，⚠️ 需要 Guard）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：为关键慢查询补全索引

## ⚠️ 数据库 schema 变更
本任务涉及新增索引。**严格按以下 9 步流程执行，不要跳步**：

### Step 1：EXPLAIN ANALYZE 现有查询
**只读不改**，运行以下 SQL（在 dev 数据库）。如果 Cursor Agent 无法连接 dev DB，请生成 SELECT 语句让人类手动运行并粘贴结果。

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

把 EXPLAIN 输出贴到对话。

### Step 2：分析 + 提出索引
整理成表格：
| 查询 | 当前计划 | 问题 | 建议索引 |
|------|---------|------|---------|
| ... | ... | ... | ... |

### Step 3：修改 schema.prisma（仅追加）
只追加 `@@index`，不要修改现有索引或其他字段。

### Step 4：生成 client
```bash
cd server
npx prisma generate
```

### Step 5：生成 migration SQL（不 apply）
```bash
npx prisma migrate dev --create-only --name add_performance_indexes
```
如果失败（无 TTY），fallback 到：
```bash
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script
```

### Step 6：完整展示 SQL，等待人工 review
**重要：大表索引必须用 CONCURRENTLY**

Prisma 默认：
```sql
CREATE INDEX "stage_record_status_enteredAt_idx" ON "stage_record"("status", "enteredAt");
```

如果表行数 > 10 万，**手动改写为**：
```sql
CREATE INDEX CONCURRENTLY "stage_record_status_enteredAt_idx" ON "stage_record"("status", "enteredAt");
```

CONCURRENTLY 不能在事务内。如果 migration 含 CONCURRENTLY，整个 migration 不能有 BEGIN/COMMIT 包裹。

### Step 7：🛑 停下来等人类 review

输出以下中断提示：

```
🛑 已生成 migration SQL，请人工 review：

文件路径：server/prisma/migrations/<timestamp>_add_performance_indexes/migration.sql

📋 Review 检查清单：
1. [✅/❌] USING 或 CREATE INDEX 写法（不是 DROP COLUMN）
2. [✅/❌] 没有意外 DROP 索引
3. [✅/❌] 大表索引用 CONCURRENTLY
4. [✅/❌] 索引无冗余（如 (a, b) 存在时不要单独 (a)）
5. [✅/❌] SQL 字符编码无乱码

请回复以下任一指令：
- "apply" → 我会执行 npx prisma migrate deploy 并继续
- "rollback" → 我会还原 schema.prisma 并停止
- "fix <说明>" → 我会按你的指示修改后重新展示
```

未收到指令前不会 apply。

### Step 8：收到 apply 指令后
```bash
npx prisma migrate deploy
npx prisma generate
```

### Step 9：再次 EXPLAIN 验证
重新跑 Step 1 的 SQL，确认 Seq Scan → Index Scan，执行时间下降 ≥ 50%。

如果某条索引没有改善，单独 DROP 该索引。

## 设计原则
1. **数据驱动**：先 EXPLAIN，再加索引；不加"以防万一"的索引
2. **复合索引优先**：单列索引只在 WHERE 单独出现时有用
3. **避免冗余**：(a, b) 已存在时 (a) 单独索引是冗余
4. **大表 CONCURRENTLY**：避免锁表

## 推荐索引（按需添加）
- `StageRecord`: `(candidateId, enteredAt)`, `(stage, enteredAt)`, `(status, enteredAt)`
- `Interview`: `(scheduledAt, status)` 已存在，不要重复加
- `CandidateJob`: `(jobId, candidateId)` 已存在
- `Offer`: `(status, offerDate)`, `(result, offerDate)`

## 禁止事项
- ❌ 不要盲加索引（每个新索引都要有 EXPLAIN 证据）
- ❌ 不要修改现有索引（只追加）
- ❌ 不要触碰其他 schema 字段
- ❌ 不要修改 service 代码
- ❌ 不要触碰 `prisma/seed.ts`
- ❌ 不要省略 Step 5/6/7/8 直接 apply
- ❌ 不要在大表加非 CONCURRENTLY 索引

## 完成后请按这个格式输出实施备注

```
## 实施备注

- 实际改动：[migration SQL 行数 + schema 改动行数]
- 推荐方案预估：[预估加 N 个索引]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- **本次 migration 的人工 review 反馈**：[apply / rollback / fix ...]
- **是否使用 CONCURRENTLY**：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 使用 --create-only 或 fallback migrate diff
  - [✅/❌] 完整展示 SQL
  - [✅/❌] 等人类 apply 后才 deploy
  - [✅/❌] 大表索引用 CONCURRENTLY
  - [✅/❌] 不盲加索引（每个有 EXPLAIN 证据）
  - [✅/❌] 不修改现有索引
  - [✅/❌] 不触碰其他模型字段
  - [✅/❌] 不触碰 seed.ts
```

## 验收条件
1. ✅ 所有高频慢查询 EXPLAIN 显示使用了新索引
2. ✅ 迁移文件 SQL 清晰（人眼可读）
3. ✅ 大表索引用 CONCURRENTLY
4. ✅ `pnpm test` 全部通过
5. ✅ `pnpm prisma migrate dev` 在干净数据库上可重复执行

## 回滚预案
```bash
npx prisma migrate resolve --rolled-back add_performance_indexes
# 或单独 DROP：
DROP INDEX CONCURRENTLY "stage_record_status_enteredAt_idx";
```
```

---

# 第 4 个：PROMPT-07 OpenTelemetry trace（半天）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：接入 OpenTelemetry 分布式追踪

## Context
- 后端：Express 4 + TypeScript + Prisma + Redis + BullMQ
- 已有：`pino` 结构化日志已就位（`server/src/lib/logger.ts`，PROMPT-02）
- 没有现成的 APM/trace 工具
- 目标：HTTP 请求 → Service → Prisma 调用的全链路 trace

## 设计原则
1. **零侵入业务代码**：用 OTel auto-instrumentation 库
2. **OTLP 协议**：用 OTLP HTTP exporter（4318 端口）
3. **优雅降级**：未配置 OTLP endpoint 时不连接，app 照常运行
4. **关联 pino 日志**：trace_id 写入 pino 日志

## Phase 0：先确认环境
```bash
pnpm list tsx 2>/dev/null | head -3
node --version
```
确认 tsx 版本（决定用 `--import` 还是 `-r`）。

## Phase 1：安装依赖
```bash
cd server
pnpm add @opentelemetry/api \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
pnpm add -D @opentelemetry/sdk-trace-node
```

## Phase 2：新建 `server/src/lib/tracing.ts`

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
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
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

## Phase 3：修改 package.json 启动脚本

修改 `server/package.json` 的 `scripts.dev` 和 `scripts.start`：
```json
{
  "dev": "tsx watch --import ./src/lib/tracing.ts src/index.ts",
  "start": "node --import ./dist/lib/tracing.js dist/index.js"
```

## Phase 4：环境变量
在 `server/src/lib/env.ts` 中追加（不修改现有字段）：
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

## Phase 5：关联 pino 日志
修改 `server/src/lib/logger.ts`，**只追加 mixin，不要修改现有 redact 路径**：

```ts
import { trace, context } from '@opentelemetry/api';

export const logger = pino({
  // ... 现有配置不动（包括 PROMPT-02 的 redact 路径）
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
- ❌ 不要修改现有的中间件顺序
- ❌ 不要触碰 `server/src/lib/prisma.ts`
- ❌ 不要触碰前端代码
- ❌ 不要把 trace 数据持久化到 DB
- ❌ 不要修改 PROMPT-02 pino 现有的 redact 路径

## 必须新增的测试
文件：`server/tests/unit/tracing.test.ts`
测试用例：
1. 当 `OTEL_EXPORTER_OTLP_ENDPOINT` 未设置时，require `tracing.ts` 不报错、不连接外部服务
2. 当环境变量设置时，OTLP exporter 应被实例化
3. pino logger mixin 中当有 active span 时包含 `trace_id` 和 `span_id`
4. mixin 在无 span context 时返回空对象
5. trace_id 不会绕过 pino redact 路径（即 trace_id 本身不视为 PII）

## 完成后请按这个格式输出实施备注

```
## 实施备注

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

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ `pnpm dev` 启动 server，控制台无 OTel 相关错误
3. ✅ 启动 Jaeger 后访问 traces UI，能看到请求
4. ✅ 不设置 OTLP endpoint 时，应用启动速度无明显下降（< 100ms）
5. ✅ `pnpm type-check` 通过
```

---

# 第 5 个：PROMPT-08 Prometheus 指标（半天）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：接入 Prometheus 指标采集

## Context
- 后端：Express 4 + Prisma + Redis
- 现状：完全没有指标采集
- 目标：暴露 `/api/metrics` 端点

## 设计原则
1. **独立路由**：metrics 端点不走全局 rate-limit
2. **零侵入**：用 `prom-client` 的 default metrics + 自定义 metric
3. **合理 cardinality**：标签值要限定枚举，禁止高基数（userId / candidateId 不能做 label）
4. **应用前缀**：所有自定义 metric 加 `ats_` 前缀

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
  labelNames: ['action', 'role'],
  registers: [register],
});

export const llmCallDuration = new client.Histogram({
  name: 'ats_llm_call_duration_seconds',
  help: 'LLM API call duration',
  labelNames: ['provider', 'purpose'],
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

## Phase 3：在 app.ts 注入 metrics 中间件
**追加**（不修改现有顺序）：

```ts
import { httpRequestDuration, httpRequestTotal } from './lib/metrics';

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
新建 `server/src/routes/metrics.ts`：

```ts
import { Router } from 'express';
import { register } from '../lib/metrics';

const router = Router();

router.get('/', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

export default router;
```

修改 `server/src/routes/index.ts`，挂载新路由：
```ts
import metricsRoutes from './metrics';
// 在 auth 路由同级添加
router.use('/metrics', metricsRoutes);
```

注意：`/api/metrics` 不强制 JWT（Prometheus 抓取通常不带 token）。

## Phase 5：在关键业务代码埋点
**只改这 3 个 service，每个加 1-2 行**：
1. `candidate.service.ts` advanceStage 末尾
2. `offer.service.ts` 审批相关方法
3. `lib/llm.ts` callLLM 函数

具体埋点代码示例：
```ts
// candidate.service.ts
import { candidateStageAdvanceTotal } from '../lib/metrics';
candidateStageAdvanceTotal.inc({ from_stage: currentStage, to_stage: stage, status });

// offer.service.ts
import { offerApprovalTotal } from '../lib/metrics';
offerApprovalTotal.inc({ action: 'approve', role: isAdmin ? 'admin' : 'member' });

// llm.ts
import { llmCallDuration } from './metrics';
const end = llmCallDuration.startTimer({ provider: LLM_CONFIG.provider, purpose: 'unknown' });
// ... fetch 调用
end();
```

## 与 PROMPT-02 pino 的协调
- PROMPT-02 已在 pino 层 redact phone/email/name
- metrics label 禁止含这些字段（已在禁止事项强调）
- 操作人 ID 也不应作为 label（避免高基数）

## 禁止事项
- ❌ 不要把 `userId` / `candidateId` / `email` / `phone` 等高基数字段作为 label
- ❌ 不要在 metrics 端点强制 JWT 鉴权
- ❌ 不要替换 `express-rate-limit`
- ❌ 不要触碰现有 metrics 之外的中间件
- ❌ 不要修改 `lib/prisma.ts`
- ❌ metric 必须加 `ats_` 前缀

## 必须新增的测试
文件：`server/tests/integration/metrics.test.ts`
测试用例：
1. `GET /api/metrics` 返回 200，Content-Type 是 `text/plain`
2. 响应体包含 `ats_http_requests_total`
3. 默认 metrics 包含 `nodejs_eventloop_lag_seconds`
4. 触发 POST /api/auth/login 后，相应 metric 增加
5. 触发阶段推进后，`ats_candidate_stage_advance_total` 增加

## 完成后请按这个格式输出实施备注

```
## 实施备注

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
  - [✅/❌] metric 加了 ats_ 前缀
```

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ `curl http://localhost:3001/api/metrics` 返回 Prometheus 格式文本
3. ✅ 故意触发 10 个 200 和 1 个 500，`ats_http_requests_total{status_code="500"}` 计数 = 1
4. ✅ `pnpm lint` 通过
```

---

# 第 6 个：PROMPT-09 Sentry 错误聚合（半天）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：接入 Sentry 错误聚合

## Context
- 后端：Express 4 + TypeScript
- 已有：pino 日志（PROMPT-02）、OTel trace（PROMPT-07）
- 现状：错误只在 console.error 输出
- 目标：5xx 错误、未捕获异常自动上报

## 设计原则
1. **只上报 5xx**，不上报 4xx
2. **PII 自动 redact**：候选人姓名/手机/邮箱不能进 Sentry
3. **优雅降级**：未配置 SENTRY_DSN 时完全跳过
4. **不重复上报**：与 pino 错误日志并存

## 与 PROMPT-02 pino redact 协调
PROMPT-02 已处理 phone/email/name 等基础字段。Sentry 的 beforeSend 扩展而非重复：
- pino redact：phone/email/name 等
- Sentry 特有：request.data、user.email、user.ip_address、URL 中的 cuid

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
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || '1.0.0',
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // PII redact：Sentry 特有字段
      if (event.request?.data) {
        event.request.data = '[REDACTED]';
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      // URL 中的 cuid 脱敏
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/\/[a-z0-9]{20,}/gi, '/:id');
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'http') {
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

## Phase 3：在 app.ts 接入

```ts
import * as Sentry from '@sentry/node';
import { initSentry, isSentryEnabled } from './lib/sentry';

// 文件最顶部
initSentry();

// ... 现有中间件

app.use('/api', routes);

// Sentry error handler（在 errorHandler 之前）
if (isSentryEnabled()) {
  app.use(Sentry.Handlers.errorHandler());
}

// 全局错误处理（保持现有）
app.use(errorHandler);
```

## Phase 4：进程级异常捕获
修改 `server/src/index.ts`，**只改 uncaughtException / unhandledRejection 部分**：

```ts
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
- ❌ 不要在 service / controller 里手动调用 `Sentry.captureException`
- ❌ 不要把 `req.body` 上报
- ❌ 不要上报 4xx 错误
- ❌ 不要替换现有 pino 日志
- ❌ 不要触碰 OTel trace（PROMPT-07）
- ❌ 不要修改 Prisma 错误处理
- ❌ 不要重复定义 PROMPT-02 已有的 redact 规则

## 必须新增的测试
文件：`server/tests/unit/sentry.test.ts`
测试用例：
1. 当 `SENTRY_DSN` 未设置时，`initSentry()` 不抛错，`isSentryEnabled()` 返回 false
2. 当 `SENTRY_DSN` 设置时，`isSentryEnabled()` 返回 true
3. `beforeSend` 钩子能正确 redact `request.data`
4. `beforeSend` 钩子能正确删除 `user.email`
5. URL 中含 `token=xxx` 的 breadcrumb 被脱敏
6. URL 中含 cuid/UUID 的请求路径被脱敏为 `:id`

## 完成后请按这个格式输出实施备注

```
## 实施备注

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

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ 未设置 SENTRY_DSN 时，启动 server 一切正常
3. ✅ 设置 SENTRY_DSN 后，故意触发一个 500，Sentry 面板能看到事件
4. ✅ 触发 500 时，日志中不应出现候选人手机号/邮箱/姓名
5. ✅ 4xx 错误不上报到 Sentry
```

---

## ✅ 6 个 prompt 都完成后

你会有这些 commit（建议命名）：

```
1. feat(server): PROMPT-10 增强 /api/health 健康检查
2. feat(server): PROMPT-12 单测覆盖率门槛纳入 CI
3. feat(server): PROMPT-11 SQL 索引（migration）
4. feat(server): PROMPT-07 接入 OpenTelemetry trace
5. feat(server): PROMPT-08 接入 Prometheus 指标
6. feat(server): PROMPT-09 接入 Sentry 错误聚合
```

每个 commit 后告诉我，我帮你 review + 准备 commit message + 帮你 commit。

## 🚀 现在开始

按上面的顺序，**第 1 个是 PROMPT-10 健康检查**。

打开本文件，找到"第 1 个：PROMPT-10 增强健康检查"，复制从 ```markdown 到 ``` 的所有内容，粘贴到 Cursor 即可。
