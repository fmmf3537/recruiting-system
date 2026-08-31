# 技术债务 PROMPT 集（v1.0 - 自包含可直接粘贴版）

> **使用方式**：打开 Cursor Composer 新会话，从上到下按顺序复制粘贴。每个 prompt 都是自包含的，**复制下面 ```markdown ... ``` 代码块里的全部内容**粘贴即可。
> **基于**：AUDIT_REPORT.md 技术债务清单 + 阶段 0/1/2/3/4 实战经验
> **范围**：2 个 prompt（DEBT-010 错误处理 + DEBT-002 stats 7 天循环）
> **风格**：自包含可直接粘贴 + v1.1 元规则 + 实施备注模板

---

# 第 1 个：PROMPT-DEBT-010 错误处理传递业务 code（1-2 天）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：错误处理传递业务 code

## Context
- 后端（server/src/middleware/errorHandler.ts）：
  - 响应包含 success / error / code / stack（dev）4 个字段
  - AppError 类可自定义 code（如 401=未认证、403=无权限、404=资源不存在、409=冲突、422=校验失败）
  - Prisma 错误码（P2002 / P2003 / P2025 / P2014）映射到 HTTP 4xx
- 前端（client/src/utils/request.ts）：
  - 只读 errorData.error 字符串
  - 用 HTTP status（401/403/404/500/switch）判断行为
  - **不读 errorData.code 业务码**
- 问题：
  - HTTP 401 可能是"未登录"或"token 过期"，但前端无法区分
  - 后端 409（Prisma P2002 唯一约束冲突）跟 HTTP 404 一样处理（都弹错误信息）
  - HTTP 422（Zod 校验）跟 HTTP 500 一样处理（都弹"请求失败"）
- 目标：前端按业务 code 分支处理，不靠 HTTP status

## 设计原则
1. **不破坏现有**：HTTP status 仍可用（向后兼容），但前端优先用业务 code
2. **集中映射**：在 request.ts 维护 `code → 行为` 映射表
3. **类型化**：定义 TS interface，避免魔法字符串
4. **可扩展**：新业务码加进映射表即可

## Phase 1：后端扩展（可选增强）

**当前后端已经返回 code 字段**（第 87-88 行），不需要改。但建议：

### 1. 统一业务码常量
**新建** `server/src/constants/error-codes.ts`：

```ts
/**
 * 业务错误码（前端按此分支处理）
 * 与 HTTP statusCode 解耦：HTTP 是传输层，code 是业务层
 */
export const ErrorCode = {
  // 认证授权 1xxx
  UNAUTHORIZED: 1001,
  TOKEN_EXPIRED: 1002,
  FORBIDDEN: 1003,
  
  // 资源 2xxx
  NOT_FOUND: 2001,
  ALREADY_EXISTS: 2002,
  
  // 校验 3xxx
  VALIDATION_FAILED: 3001,
  MISSING_FIELD: 3002,
  INVALID_FORMAT: 3003,
  
  // 业务逻辑 4xxx
  CANDIDATE_DUPLICATE: 4001,
  CANDIDATE_DELETED: 4002,
  OFFER_NOT_APPROVABLE: 4003,
  INTERVIEW_NOT_EVALUABLE: 4004,
  
  // 系统 5xxx
  INTERNAL_ERROR: 5001,
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];
```

### 2. 让 controller 显式传 code

**示例**：修改 candidate.controller.ts 创建候选人：

```ts
// 改前：
throw new AppError('候选人已存在', 409);

// 改后：
throw new AppError('候选人已存在', 409, ErrorCode.CANDIDATE_DUPLICATE);
```

**注意**：本任务**不强制改所有 controller**（避免越界）。只在以下场景要求传 code：
- 新增 controller
- 修改 controller 时附带传 code
- 现有 controller 不动（HTTP status 已够区分）

### 3. 扩展 errorHandler（让 code 默认有值）

**修改** `server/src/middleware/errorHandler.ts` 第 87-88 行：

```ts
// 改前：
res.status(statusCode).json({
  success: false,
  error: message,
  code: code || statusCode,
  ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
});

// 改后：
res.status(statusCode).json({
  success: false,
  error: message,
  // 优先用业务 code，否则 fallback 到 HTTP statusCode
  code: code ?? ErrorCode.INTERNAL_ERROR ?? statusCode,
  ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
});
```

⚠️ 注意：当 AppError 没传 code 时，fallback 到 `ErrorCode.INTERNAL_ERROR`（业务码）。
HTTP status 仍准确（statusCode 字段独立），前端可双轨判断。

## Phase 2：前端改造（核心）

### 1. 定义 TypeScript 类型

**新建** `client/src/types/error.ts`：

```ts
/**
 * 后端业务错误码（与服务端 src/constants/error-codes.ts 同步）
 * HTTP 401/403/404/500 等 status 仍保留作为参考，但前端优先按 code 分支
 */
export const BackendErrorCode = {
  UNAUTHORIZED: 1001,
  TOKEN_EXPIRED: 1002,
  FORBIDDEN: 1003,
  
  NOT_FOUND: 2001,
  ALREADY_EXISTS: 2002,
  
  VALIDATION_FAILED: 3001,
  MISSING_FIELD: 3002,
  INVALID_FORMAT: 3003,
  
  CANDIDATE_DUPLICATE: 4001,
  CANDIDATE_DELETED: 4002,
  OFFER_NOT_APPROVABLE: 4003,
  INTERVIEW_NOT_EVALUABLE: 4004,
  
  INTERNAL_ERROR: 5001,
} as const;

export type BackendErrorCodeType = typeof BackendErrorCode[keyof typeof BackendErrorCode];

/**
 * 后端错误响应结构
 */
export interface BackendErrorResponse {
  success: false;
  error: string;
  code: BackendErrorCodeType | number;
  stack?: string;  // 仅 dev
}

/**
 * 业务错误（包含 code）
 */
export class BusinessError extends Error {
  public code: BackendErrorCodeType | number;
  public statusCode: number;

  constructor(message: string, code: BackendErrorCodeType | number, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = 'BusinessError';
  }
}
```

### 2. 改造 request.ts（核心）

**修改** `client/src/utils/request.ts`：

```ts
import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';
import { BackendErrorCode, type BackendErrorResponse, BusinessError } from '@/types/error';

const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截器（不变）
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('ats_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// 响应拦截器（重写）
request.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<BackendErrorResponse>) => {
    const { response } = error;
    
    if (!response) {
      ElMessage.error('网络错误，请检查网络连接');
      return Promise.reject(new BusinessError('网络错误', BackendErrorCode.INTERNAL_ERROR, 0));
    }
    
    const { status, data } = response;
    const code = data?.code ?? status;
    const message = data?.error ?? `请求失败 (${status})`;
    
    // 按业务码分支处理
    switch (code) {
      case BackendErrorCode.UNAUTHORIZED:
      case BackendErrorCode.TOKEN_EXPIPIRED:
        ElMessage.error('登录已过期，请重新登录');
        localStorage.removeItem('ats_token');
        localStorage.removeItem('ats_user');
        router.push('/login');
        break;
      case BackendErrorCode.FORBIDDEN:
        ElMessage.error(message || '没有权限执行此操作');
        break;
      case BackendErrorCode.NOT_FOUND:
        ElMessage.error(message || '请求的资源不存在');
        break;
      case BackendErrorCode.CANDIDATE_DUPLICATE:
        ElMessage.warning(message || '候选人已存在，请检查手机号或邮箱');
        break;
      case BackendErrorCode.OFFER_NOT_APPROVABLE:
        ElMessage.warning(message || 'Offer 状态不允许审批');
        break;
      default:
        // fallback 到 HTTP status 处理
        if (status === 401) {
          ElMessage.error('登录已过期，请重新登录');
          localStorage.removeItem('ats_token');
          localStorage.removeItem('ats_user');
          router.push('/login');
        } else if (status >= 500) {
          ElMessage.error('服务器内部错误，请稍后重试');
        } else {
          ElMessage.error(message);
        }
    }
    
    // 抛出 BusinessError，让调用方可以 catch 后按 code 处理
    return Promise.reject(new BusinessError(message, code, status));
  }
);

export default request;

// uploadFile 同步用同样的类型
export function uploadFile(file: File): Promise<{ success: boolean; data?: { url: string }; message?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  return request.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as Promise<{ success: boolean; data?: { url: string }; message?: string }>;
}
```

### 3. 使用示例（仅示范，不强制改造）

新建 `client/src/examples/business-error-usage.vue`：

```vue
<script setup lang="ts">
import { BusinessError, BackendErrorCode } from '@/types/error';
import { createCandidate } from '@/api/candidate';

async function handleSubmit() {
  try {
    await createCandidate(payload);
    ElMessage.success('创建成功');
  } catch (e) {
    if (e instanceof BusinessError) {
      switch (e.code) {
        case BackendErrorCode.CANDIDATE_DUPLICATE:
          // 业务级处理：高亮手机号/邮箱字段
          highlightDuplicateField(e.message);
          break;
        case BackendErrorCode.VALIDATION_FAILED:
          // 校验失败：展示字段错误
          showValidationErrors(e);
          break;
        default:
          // 其他错误：弹消息即可（拦截器已弹过）
          console.warn('已处理', e.code);
      }
    }
  }
}
</script>
```

⚠️ 这是**示例文件**，不进业务代码。现有业务代码仍走拦截器统一弹 ElMessage。

## Phase 3：测试

### 1. 后端测试（最小）

**新建** `server/tests/integration/error-code.test.ts`（3 用例）：
- AppError 抛出时返回正确 code（UNION_AUTH_TEMP 改为 USER_NOT_FOUND）
- Prisma P2002 → 409 + code=ALREADY_EXISTS
- 未指定 code 时 fallback 到 HTTP statusCode

### 2. 前端测试（核心）

**新建** `client/tests/utils/business-error.test.ts`（5 用例）：
- UNAUTHORIZED / TOKEN_EXPIRED → 跳登录页 + 清 token
- FORBIDDEN → 显示"无权限"消息
- CANDIDATE_DUPLICATE → 显示警告消息（不是错误）
- 未知 code → fallback 到 HTTP status
- 网络错误 → 显示"网络错误"

## 禁止事项

- ❌ 不改业务逻辑（controller 的 try / catch 主体）
- ❌ 不批量改 controller 加 code（只新增 / 修改时附带）
- ❌ 不在 client/src/views/* 添加任何示例代码（最多新建 examples/）
- ❌ 不修改 mobile 端
- ❌ 不改后端业务路由
- ❌ 不改后端 Prisma schema（不改 enum / 关联）

## 必须新增的测试

文件 1：`server/tests/integration/error-code.test.ts`（3 用例）
文件 2：`client/tests/utils/business-error.test.ts`（5 用例）

## 完成后请按这个格式输出实施备注

```
## 实施备注

- 实际改动：[1 新 error-codes 常量 + errorHandler 微调 + 1 新 error.ts + 1 request.ts 改造 + 1 示例文件 + 2 测试]
- 推荐方案预估：[1 error.ts + 1 request.ts 改造 + 2 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不改业务逻辑
  - [✅/❌] 不批量改 controller
  - [✅/❌] 不在 views/ 加示例
  - [✅/❌] 不改 mobile
  - [✅/❌] 不改后端 Prisma schema
```

## 验收条件

1. ✅ 后端 `pnpm test` 全部通过（420 + 3 ≈ 423）
2. ✅ 前端 `pnpm test` 全部通过（17 + 5 ≈ 22）
3. ✅ 触发 401 时前端跳登录页（既有行为保留）
4. ✅ 触发 409 P2002 时前端弹警告（非错误）
5. ✅ 未知 code fallback 到 HTTP status
6. ✅ 后端响应包含 `code` 字段（前端 axios 拦截器能拿到）

## 回滚预案

```bash
git revert HEAD
# 纯前端 + 后端常量改动，revert 安全
```
```

---

# 第 2 个：PROMPT-DEBT-002 stats 7 天趋势循环（1-2 天）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：stats 7 天趋势循环改单次 SQL

## Context
- 文件：server/src/services/stats.service.ts
- 当前实现（行号 ~214-227）：Dashboard 近 7 天趋势用 `for` 循环调用 `prisma.candidate.count()` 7 次
- 问题：
  - 7 次独立 SQL 查询（N+1 模式）
  - 数据量大时性能差（每个 count 都要扫表）
  - 应该用单次 `prisma.$queryRaw` 按日期分组返回
- 目标：单次 SQL 拿 7 天的数据

## 设计原则
1. **一次 SQL**：用 `prisma.$queryRaw` 按日期分组
2. **保持结果格式**：前端不要改
3. **性能优**：用 PostgreSQL `date_trunc('day', ...)` 做服务端聚合
4. **候选可见性**：尊重 P-2 的 candidateFilter（admin / hr / hiring_manager 看到的候选人范围不同）
5. **错误兜底**：如果查询失败，返回空数组，不让 dashboard 整体 500

## Phase 1：替换循环

**修改** `server/src/services/stats.service.ts` 行号 214-227：

```ts
// 改前：
const trend: Array<{ date: string; count: number }> = [];
for (let i = 6; i >= 0; i -= 1) {
  const d = new Date(now);
  d.setDate(d.getDate() - i);
  d.setHours(0, 0, 0, 0);
  const nextD = new Date(d);
  nextD.setDate(nextD.getDate() + 1);
  const count = await prisma.candidate.count({
    where: { createdAt: { gte: d, lt: nextD }, ...candidateFilter },
  });
  const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  trend.push({ date: dateStr, count });
}

// 改后：
const sevenDaysAgo = new Date(now);
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
sevenDaysAgo.setHours(0, 0, 0, 0);

// 用 Prisma.sql 安全拼接 visibleCandidateIds（如果存在）
const visibleIds = await getVisibleCandidateIds(scope);

let trend: Array<{ date: string; count: number }> = [];
try {
  // 单次 SQL 按日期分组统计
  const rawTrend = await prisma.$queryRaw<Array<{ day: Date; cnt: bigint }>>`
    SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS cnt
    FROM "candidate"
    WHERE "createdAt" >= ${sevenDaysAgo}
      AND "deletedAt" IS NULL
      ${visibleIds.length > 0 ? Prisma.sql`AND id IN (${Prisma.join(visibleIds)})` : Prisma.empty}
    GROUP BY day
    ORDER BY day ASC
  `;
  
  // 把 SQL 结果转为前端期望的格式（MM-DD + count）
  const trendMap = new Map<string, number>();
  for (const r of rawTrend) {
    const d = new Date(r.day);
    const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    trendMap.set(dateStr, Number(r.cnt));
  }
  
  // 补齐 7 天（缺失日期填 0）
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    trend.push({ date: dateStr, count: trendMap.get(dateStr) ?? 0 });
  }
} catch (e) {
  // 兜底：查询失败返回空趋势（dashboard 仍能展示 KPI）
  logger.error({ err: e }, '7 天趋势查询失败');
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    trend.push({ date: dateStr, count: 0 });
  }
}
```

## Phase 2：复用可见性 helper

`getVisibleCandidateIds(scope)` 已经在 stats.service.ts 里实现过（P-2 引入）。直接复用：

```ts
// 在文件顶部 import
import { Prisma } from '@prisma/client';

// 复用 P-2 已有的 helper
async function getVisibleCandidateIds(scope?: CandidateVisibilityScope): Promise<string[]> {
  if (!scope || scope.isAdmin) return [];
  const where = buildCandidateVisibilityWhere(scope);
  const rows = await prisma.candidate.findMany({ where, select: { id: true } });
  return rows.map(r => r.id);
}
```

⚠️ 注意：现有 stats.service.ts 已有 `getVisibleCandidateIds`，**复用即可**，不要重写。

## Phase 3：测试

**新建** `server/tests/unit/stats-7day-trend.test.ts`（4 用例）：
- 7 天内的 candidate → 每天分别有数据
- 部分日期有数据，部分没有 → 缺失日期填 0
- visibleIds 过滤生效（admin 看全部，member 看自己范围）
- SQL 失败时返回 7 个 0（兜底）

## 禁止事项

- ❌ 不改前端代码（响应格式不变）
- ❌ 不改 stats 的其他 KPI 计算（只动 trend）
- ❌ 不改 Prisma schema
- ❌ 不引入新依赖
- ❌ 不改 getDashboardStats 之外的函数
- ❌ 不改 cache 逻辑（P-3 引入的 Redis 缓存保持）

## 必须新增的测试

文件 1：`server/tests/unit/stats-7day-trend.test.ts`（4 用例）

## 完成后请按这个格式输出实施备注

```
## 实施备注

- 实际改动：[stats.service.ts 趋势部分改写 + 1 测试]
- 推荐方案预估：[stats 改写 + 1 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不改前端
  - [✅/❌] 不改其他 KPI
  - [✅/❌] 不改 Prisma schema
  - [✅/❌] 不引入新依赖
  - [✅/❌] 不改 getDashboardStats 之外的函数
```

## 验收条件

1. ✅ `pnpm test` 全部通过（420 + 4 ≈ 424）
2. ✅ Dashboard 加载时 7 天趋势正常显示
3. ✅ 实测：SQL 查询数从 7 次降到 1 次（看 prisma query log）
4. ✅ 数据量 1000+ candidate 时，趋势查询耗时 < 50ms

## 回滚预案

```bash
git revert HEAD
# 单个文件改动，回滚影响小
```
```

---

## 📊 技术债修复进度

- ✅ PROMPT-DEBT-010 错误处理传递业务 code
- ✅ PROMPT-DEBT-002 stats 7 天趋势改单次 SQL
- ⏸️ 其他 6 个 DEBT 暂缓

## 🎯 下一步

你实战 DEBT-010 → DEBT-002，每完成一个让我 review + commit。
