# 阶段 3 角色化工作台提示词集（v1.2 - 自包含可直接粘贴版）

> **使用方式**：打开 Cursor Composer 新会话，从上到下按顺序复制粘贴。每个 prompt 都是自包含的，**复制下面 ```markdown ... ``` 代码块里的全部内容**粘贴即可。
> **基于**：阶段 0/1/2 全部实战反馈 + P-1 v1.0 设计稿
> **范围**：5 个 prompt（P-1 角色化扩展 / P-2 业务工作台 / P-3 面试官工作台 / P-4 cron 扩展 / P-5 数据迁移）
> **重要变更**：
> - v1.2 是**自包含可直接粘贴版**（无需审核员手册）
> - 5 个 prompt 按依赖顺序执行（P-1 是基础）
> - P-1 v1.0 文档保留在 `docs/cursor-prompts/PHASE3_PROMPTS_v1.0.md`，标注废弃

---

# 第 1 个：PROMPT-P1 角色化扩展 + 权限矩阵（4 天）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：角色化扩展 + 权限矩阵

## ⚠️ 数据库 schema 变更
本任务扩展 `UserRole` enum（加 `hiring_manager` / `interviewer` 2 个值）。
**严格按以下 9 步 Guard 流程执行**，不要跳步。

### Step 1：修改 schema.prisma
扩展 enum（只追加，不改其他）：
```prisma
enum UserRole {
  admin
  member
  hiring_manager   // ← 新增
  interviewer      // ← 新增
}
```

⚠️ Prisma 5 enum 扩展方式：
- 添加 enum 值不会丢失现有数据
- PostgreSQL 用 `ALTER TYPE ... ADD VALUE` 实现
- Prisma 自动生成对应 SQL

### Step 2：仅生成 client（不动 DB）
```bash
cd server
npx prisma generate
```

### Step 3：生成 migration SQL（不 apply）
```bash
npx prisma migrate dev --create-only --name add_user_role_hiring_manager_interviewer
```
如果失败（无 TTY），fallback 到：
```bash
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script
```

### Step 4：完整展示 SQL，等待人工 review

输出以下中断提示：

```
🛑 已生成 migration SQL，请人工 review：

文件路径：server/prisma/migrations/<timestamp>_add_user_role_hiring_manager_interviewer/migration.sql

📋 Review 检查清单：
1. [✅/❌] ALTER TYPE ... ADD VALUE 'hiring_manager' 存在
2. [✅/❌] ALTER TYPE ... ADD VALUE 'interviewer' 存在
3. [✅/❌] 没有 DROP TYPE
4. [✅/❌] 没有 DELETE FROM "user"（会丢现有用户）
5. [✅/❌] SQL 字符编码无乱码

请回复以下任一指令：
- "apply" → 我会执行 npx prisma migrate deploy 并继续
- "rollback" → 我会还原 schema.prisma 并停止
- "fix <说明>" → 我会按你的指示修改后重新展示
```

未收到指令前不会 apply。

### Step 5：收到 apply 指令后
```bash
npx prisma migrate deploy
npx prisma generate
```

## 设计原则

1. **角色定义**（UserRole enum 扩展）：
   - `admin` — 系统管理员（不变）
   - `hr` — 普通 HR（替换原 `member`，见 P-5）
   - `hiring_manager` — 用人经理（新增，看本部门招聘 + 审批 Offer + 发起 HC）
   - `interviewer` — 面试官（新增，**只**能看自己被指派的面试 + 填评估）

2. **权限矩阵**（中央化在 `role-permission.service.ts`）：
   - `admin`: `['*']`（通配符）
   - `hr`: 完整 HR 权限（基本等同于原 member）
   - `hiring_manager`: 13 个权限（看 + 评估 + 审批 Offer + 发起 HC）
   - `interviewer`: 5 个权限（看自己面试 + 填评估）

3. **候选人可见性按角色收敛**：
   - admin: 全部
   - hr / hiring_manager: 本部门 + 自己创建 + assigneeId 自己（共享现有逻辑）
   - interviewer: **只**看 Interview.interviewers 含自己的候选人

4. **安全**：
   - 任何 controller 必带 `requireRole(role)` 或 `requirePermission(code)` 中间件
   - 不在 controller 内部做角色判断（容易漏）

## Step 6：新建角色权限矩阵

**新建** `server/src/services/role-permission.service.ts`：

```ts
import prisma from '../lib/prisma';

export type UserRoleType = 'admin' | 'hr' | 'hiring_manager' | 'interviewer';

/**
 * 角色权限矩阵（v3.0）
 */
export function getRolePermissions(role: UserRoleType): string[] {
  switch (role) {
    case 'admin':
      return ['*'];
    case 'hr':
      return [
        'candidate:read', 'candidate:create', 'candidate:update', 'candidate:delete', 'candidate:restore',
        'job:read', 'job:create', 'job:update', 'job:delete',
        'offer:read', 'offer:create', 'offer:update', 'offer:approve', 'offer:reject',
        'interview:read', 'interview:create', 'interview:update', 'interview:delete',
        'evaluation:read', 'evaluation:create', 'evaluation:update',
        'stage:read', 'stage:create', 'stage:update',
        'hc_request:read', 'hc_request:create', 'hc_request:approve',
        'tag:read', 'tag:create', 'tag:update', 'tag:delete',
        'dictionary:read', 'dictionary:create', 'dictionary:update',
        'automation:read', 'automation:create', 'automation:update',
        'user:read', 'user:create', 'user:update', 'user:delete',
      ];
    case 'hiring_manager':
      return [
        'candidate:read',
        'job:read',
        'offer:read', 'offer:approve',
        'interview:read',
        'evaluation:read',
        'stage:read',
        'hc_request:read', 'hc_request:create',
        'dictionary:read',
      ];
    case 'interviewer':
      return [
        'candidate:read:limited',
        'interview:read:limited',
        'evaluation:read', 'evaluation:create', 'evaluation:update',
      ];
  }
}

export async function getUserRoleAndPermissions(userId: string): Promise<{
  role: UserRoleType;
  permissions: string[];
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) throw new Error('User not found');
  return {
    role: user.role as UserRoleType,
    permissions: getRolePermissions(user.role as UserRoleType),
  };
}
```

## Step 7：requireRole 中间件

**新建** `server/src/middleware/role.ts`：

```ts
import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { UserRoleType, getRolePermissions } from '../services/role-permission.service';

/**
 * 角色守卫：要求 user.role 在白名单内
 * 用法：router.get('/api/hiring/overview', authenticate, requireRole('admin', 'hiring_manager'), controller.getOverview)
 */
export function requireRole(...allowedRoles: UserRoleType[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('未认证', 401);
      const userRole = req.user.role as UserRoleType;
      if (!allowedRoles.includes(userRole)) {
        throw new AppError(
          `您当前角色 [${userRole}] 无权访问，需要 [${allowedRoles.join(' / ')}]`,
          403
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 综合守卫：要求用户同时满足角色和权限
 */
export function requireRoleAndPermission(role: UserRoleType, permissionCode: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('未认证', 401);
      const userRole = req.user.role as UserRoleType;
      if (userRole !== role) {
        throw new AppError(`您当前角色 [${userRole}] 无权访问`, 403);
      }
      const allowed = getRolePermissions(userRole).includes(permissionCode) ||
        getRolePermissions(userRole).includes('*');
      if (!allowed) {
        throw new AppError(`没有权限：${permissionCode}`, 403);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

## Step 8：候选人可见性扩展

**修改** `server/src/services/candidate-visibility.service.ts` 的 `buildCandidateVisibilityWhere`：

```ts
export function buildCandidateVisibilityWhere(user: AuthUser): Prisma.CandidateWhereInput {
  if (user.role === 'admin') return {};

  if (user.role === 'interviewer') {
    // 面试官：只看自己被指派的 Interview 对应的候选人
    // interviewers 字段是 JSON `[{id, name}]`，写法见下
    return {
      id: {
        in: await getVisibleCandidateIdsForInterviewer(user.userId),
      },
    };
  }

  // hr / hiring_manager 共享：本部门 + 自己创建 + assigneeId 自己
  return {
    OR: [
      { createdById: user.userId },
      { stageRecords: { some: { assigneeId: user.userId } } },
      { jobs: { some: { departments: { array_contains: user.department } } } },
    ],
  };
}

/**
 * 面试官可见候选人：自己被指派的 Interview 对应的候选人
 * JSON contains 查询，Prisma 5 用 path 语法
 */
async function getVisibleCandidateIdsForInterviewer(userId: string): Promise<string[]> {
  const interviews = await prisma.interview.findMany({
    where: {
      // PostgreSQL JSONB 查询：interviewers 字段含 userId
      // Prisma 5 用 path + array_contains
      // 注：interviewers 字段是 Json 类型，存储 [{id, name}]
      // 此查询可能因 Prisma 版本不同而失败，回退方案见下
    },
    select: { candidateId: true },
    distinct: ['candidateId'],
  });
  return interviews.map((i) => i.candidateId);
}
```

⚠️ **重要**：JSON contains 查询在 Prisma 5 中可能不稳定。如果 Prisma 不支持 `interviewers: { path: ..., array_contains: ... }`，**回退方案**：

```ts
async function getVisibleCandidateIdsForInterviewer(userId: string): Promise<string[]> {
  // JS 层过滤（性能差但稳定）
  const interviews = await prisma.interview.findMany({
    select: { candidateId: true, interviewers: true },
  });
  const ids = new Set<string>();
  for (const i of interviews) {
    const list = Array.isArray(i.interviewers) ? (i.interviewers as Array<{ id: string }>) : [];
    if (list.some((u) => u.id === userId)) {
      ids.add(i.candidateId);
    }
  }
  return Array.from(ids);
}
```

JS 过滤方案虽然性能差，但对面试官这种"小数据量"场景（一个面试官一个月最多 10-20 场面试）完全够用。

## Step 9：示范迁移 2 个新角色路由

**新建** `server/src/routes/hiring.ts`：

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import prisma from '../lib/prisma';

const router = Router();

// 业务工作台：hiring_manager 或 admin 可访问
// P-2 真正实现，这里只搭骨架
router.get('/overview',
  authenticate,
  requireRole('admin', 'hiring_manager'),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';
      // P-2 实现这个端点
      res.json({ success: true, data: { message: 'P-2 will implement this' } });
    } catch (err) { next(err); }
  }
);

export default router;
```

**新建** `server/src/routes/interview.ts`：

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';

const router = Router();

// 面试官工作台：interviewer 或 admin 可访问
// P-3 真正实现
router.get('/my',
  authenticate,
  requireRole('admin', 'interviewer'),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      // P-3 实现这个端点
      res.json({ success: true, data: [] });
    } catch (err) { next(err); }
  }
);

export default router;
```

**修改** `server/src/routes/index.ts`：
```ts
import hiringRoutes from './hiring';
import interviewRoutes from './interview';
// 注册
router.use('/hiring', hiringRoutes);
router.use('/interview', interviewRoutes);
```

## Step 10：前端路由 meta.role 标记

**修改** `client/src/router/index.ts`：

```ts
// 在现有路由的 meta 里加 role 字段（不破坏现有结构）
const routes = [
  // 现有路由
  {
    path: '/jobs',
    name: 'Jobs',
    component: () => import('@/views/jobs/index.vue'),
    meta: { title: '职位管理', icon: Briefcase, role: ['admin', 'hr'] },  // ← 加 role
  },
  // P-2 会加的新路由
  {
    path: '/hiring',
    name: 'Hiring',
    component: () => import('@/views/hiring/index.vue'),
    meta: { title: '招聘工作台', icon: Briefcase, role: ['admin', 'hiring_manager'] },
  },
];
```

**修改** `client/src/router/index.ts` 的路由守卫：

```ts
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  // 公开路由直接放行
  if (to.meta.public) {
    next();
    return;
  }

  // 检查登录
  if (!authStore.isLoggedIn) {
    next('/login');
    return;
  }

  // 检查角色权限（v3.0 新增）
  if (to.meta.role && Array.isArray(to.meta.role)) {
    if (!to.meta.role.includes(authStore.userInfo?.role)) {
      ElMessage.error('您当前角色无权访问该页面');
      next('/dashboard');
      return;
    }
  }

  next();
});
```

## 禁止事项

- ❌ 不要删除现有 `User.role` 字段
- ❌ 不要改 UserRole enum 的现有值（只追加 `hr` / `hiring_manager` / `interviewer`）
- ❌ 不要批量修改现有 controller 加 `requireRole`（只示范 2 个新路由）
- ❌ 不要在 controller 内部做角色判断（用 middleware）
- ❌ 不要让 `hiring_manager` 增删改候选人（permission matrix 不含 `candidate:create/update/delete`）
- ❌ 不要让 `interviewer` 看到非自己面试的候选人（visible 强制约束）
- ❌ 不要在面试官路由用 `getCandidates` 通用接口（要写专门的 `getMyInterviewCandidates`）
- ❌ 不要省略 Guard 流程
- ❌ 不要改 `auth.ts` JWT payload
- ❌ 不要在 P-1 做实际数据迁移（member → hr 留给 P-5）

## 必须新增的测试

文件 1：`server/tests/unit/role-permission.service.test.ts`
1. `admin` 角色返回 `['*']` 通配符
2. `hr` 角色返回完整 HR 权限列表
3. `hiring_manager` 角色**不**含 `candidate:create/update/delete`
4. `hiring_manager` 角色**含** `offer:approve`
5. `interviewer` 角色只含 interview + evaluation 权限
6. 角色权限矩阵与 v1.0 PROMPT-14 RBAC 兼容

文件 2：`server/tests/integration/role-middleware.test.ts`
1. `hr` 访问 `/api/hiring/overview` 返回 403
2. `hiring_manager` 访问 `/api/hiring/overview` 返回 200
3. `interviewer` 访问 `/api/hiring/overview` 返回 403
4. `interviewer` 访问 `/api/interview/my` 返回 200
5. `hr` 访问 `/api/interview/my` 返回 403（面试官专属）
6. `admin` 访问任何路由都通过

文件 3：`server/tests/integration/candidate-visibility.test.ts`（扩展现有）
1. `hiring_manager` 登录后只能看本部门候选人
2. `hiring_manager` 试图 PATCH 候选人返回 403
3. `interviewer` 登录后只能看自己被指派的候选人
4. `interviewer` 试图 GET 不相关候选人详情返回 403

## 完成后请按这个格式输出实施备注

```
## 实施备注

- 实际改动：[实际行数 / 文件数；列出每个文件的具体改动]
- 推荐方案预估：[1 schema + 1 migration + 1 service + 1 middleware + 2 routes + 2 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- **本次 migration 的人工 review 反馈**：[apply / rollback / fix <说明>]
- 禁止事项勾选：
  - [✅/❌] 使用 --create-only 或 fallback migrate diff
  - [✅/❌] 完整展示 SQL
  - [✅/❌] 等人类 apply 后才 deploy
  - [✅/❌] 不删除现有 User.role 字段
  - [✅/❌] 不改 UserRole enum 现有值
  - [✅/❌] 不批量修改现有 controller
  - [✅/❌] 不在 controller 内部做角色判断
  - [✅/❌] hiring_manager 权限矩阵不含 candidate:create/update/delete
  - [✅/❌] interviewer 只能看自己面试的候选人
  - [✅/❌] 不省略 Guard 流程
  - [✅/❌] 不做数据迁移（留给 P-5）
```

## 验收条件

1. ✅ `pnpm test` 全部通过
2. ✅ 手动测试：4 种角色登录看到不同菜单（admin 全功能 / hr / hiring_manager / interviewer）
3. ✅ `hiring_manager` 试图 PATCH 候选人返回 403
4. ✅ `interviewer` 看到候选人列表只有自己面试相关的
5. ✅ 错误码 401 / 403 文案统一

## 回滚预案

```bash
cd server
npx prisma migrate resolve --rolled-back add_user_role_hiring_manager_interviewer
git revert HEAD
```
```

---

# 第 2 个：PROMPT-P2 业务人员工作台 - hiring_manager（5 天）

> **前置**：P-1 已完成（角色权限矩阵已落地，`GET /api/hiring/overview` 骨架存在）
> **依赖**：P-1 的 `role-permission.service.ts`（权限矩阵）+ `middleware/role.ts`（requireRole）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：业务人员工作台（hiring_manager）

## Context
- P-1 已完成：4 角色权限矩阵已实现（admin / hr / hiring_manager / interviewer）
- 现有 `server/src/routes/hiring.ts` 只有骨架 `GET /overview` 返回 placeholder
- 现有 `client/src/views/hiring/index.vue` 只有占位文案
- hiring_manager 能看本部门招聘，能审批 Offer，能发起 HC，能看 / 填评估（已 P-1 fix）

## 设计原则
1. **部门隔离**：hiring_manager **只**看 `User.department === req.user.department` 的数据
2. **admin 旁路**：admin 调用时看全公司（不限制部门）
3. **不重复 HR 工作流**：hiring_manager 主要"看 + 审批 + 发起 HC"，**不**做候选人增删改
4. **复用现有服务**：尽量用 stats.service / candidate.service，不要重写

## Phase 1：扩展 hiring 路由

**修改** `server/src/routes/hiring.ts`：

```ts
import { Router, type Router as RouterType } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';

const router: RouterType = Router();

const isAdmin = (role: string) => role === 'admin';

// 总览：本部门招聘概览
router.get('/overview', authenticate, requireRole('admin', 'hiring_manager'), async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const department = req.user!.department;

    // admin 看全公司，hiring_manager 看本部门
    const jobFilter = isAdmin(role) ? {} : { departments: { array_contains: department } };

    // 并行查询
    const [openJobs, activeCandidates, pendingOffers, scheduledInterviews] = await Promise.all([
      prisma.job.count({ where: { ...jobFilter, status: 'open' } }),
      prisma.candidateJob.count({
        where: {
          job: jobFilter,
          candidate: { deletedAt: null },
        },
      }),
      prisma.offer.count({
        where: {
          status: 'pending_approval',
          candidate: { deletedAt: null },
          job: jobFilter,
        },
      }),
      prisma.interview.count({
        where: {
          status: 'scheduled',
          scheduledAt: { gte: new Date() },
          job: jobFilter,
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        scope: isAdmin(role) ? 'company' : 'department',
        department,
        openJobs,
        activeCandidates,
        pendingOffers,
        scheduledInterviews,
      },
    });
  } catch (err) { next(err); }
});

// 待审批 Offer 列表
router.get('/approvals', authenticate, requireRole('admin', 'hiring_manager'), async (req, res, next) => {
  try {
    const role = req.user!.role;
    const department = req.user!.department;
    const jobFilter = isAdmin(role) ? {} : { departments: { array_contains: department } };

    const offers = await prisma.offer.findMany({
      where: {
        status: 'pending_approval',
        candidate: { deletedAt: null },
        job: jobFilter,
      },
      include: {
        candidate: { select: { id: true, name: true } },
        job: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: offers });
  } catch (err) { next(err); }
});

// 审批 Offer（hiring_manager 实际上线用的）
router.post('/approvals/:id/approve',
  authenticate,
  requireRole('admin', 'hiring_manager'),
  async (req, res, next) => {
    try {
      const offerId = req.params.id;
      const userId = req.user!.userId;
      const offer = await prisma.offer.findUnique({ where: { id: offerId } });
      if (!offer) throw new AppError('Offer 不存在', 404);
      if (offer.status !== 'pending_approval') {
        throw new AppError('Offer 状态不允许审批', 400);
      }
      const updated = await prisma.offer.update({
        where: { id: offerId },
        data: {
          status: 'approved',
          approverId: userId,
          approvedAt: new Date(),
        },
      });
      res.json({ success: true, data: updated, message: 'Offer 审批通过' });
    } catch (err) { next(err); }
  }
);

// 本部门候选人列表（不含详情，按需点击看）
router.get('/candidates', authenticate, requireRole('admin', 'hiring_manager'), async (req, res, next) => {
  try {
    const role = req.user!.role;
    const department = req.user!.department;
    const jobFilter = isAdmin(role) ? {} : { departments: { array_contains: department } };

    const candidates = await prisma.candidateJob.findMany({
      where: {
        job: jobFilter,
        candidate: { deletedAt: null },
      },
      include: {
        candidate: {
          select: {
            id: true, name: true, currentPosition: true, currentCompany: true,
            education: true, workYears: true, stageRecords: {
              orderBy: { enteredAt: 'desc' }, take: 1,
              select: { stage: true, status: true },
            },
          },
        },
        job: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ success: true, data: candidates });
  } catch (err) { next(err); }
});

// 本部门即将到来的面试
router.get('/interviews', authenticate, requireRole('admin', 'hiring_manager'), async (req, res, next) => {
  try {
    const role = req.user!.role;
    const department = req.user!.department;
    const jobFilter = isAdmin(role) ? {} : { departments: { array_contains: department } };

    const interviews = await prisma.interview.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: { gte: new Date() },
        job: jobFilter,
      },
      include: {
        candidate: { select: { id: true, name: true } },
        job: { select: { id: true, title: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });

    res.json({ success: true, data: interviews });
  } catch (err) { next(err); }
});

export default router;
```

## Phase 2：前端 4 页面

**修改** `client/src/views/hiring/index.vue`：

```vue
<template>
  <div class="hiring-page">
    <h2>招聘工作台</h2>

    <!-- Tab 切换 -->
    <el-tabs v-model="activeTab">
      <el-tab-pane label="总览" name="overview">
        <div v-loading="overviewLoading">
          <el-row :gutter="20">
            <el-col :span="6"><el-statistic title="开放职位" :value="overview.openJobs ?? '-'"></el-statistic></el-col>
            <el-col :span="6"><el-statistic title="活跃候选人" :value="overview.activeCandidates ?? '-'"></el-statistic></el-col>
            <el-col :span="6"><el-statistic title="待审批 Offer" :value="overview.pendingOffers ?? '-'"></el-statistic></el-col>
            <el-col :span="6"><el-statistic title="即将面试" :value="overview.scheduledInterviews ?? '-'"></el-statistic></el-col>
          </el-row>
          <p class="scope-tip">数据范围：{{ overview.scope === 'company' ? '全公司' : `部门 ${overview.department || '(未设置)'}` }}</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="待审批" name="approvals">
        <el-table v-loading="approvalsLoading" :data="approvals">
          <el-table-column label="候选人"><template #default="{ row }">{{ row.candidate?.name }}</template></el-table-column>
          <el-table-column label="职位"><template #default="{ row }">{{ row.job?.title }}</template></el-table-column>
          <el-table-column label="薪资" prop="salary"></el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="approveOffer(row.id)">批准</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="本部门候选人" name="candidates">
        <el-table v-loading="candidatesLoading" :data="candidates">
          <el-table-column label="候选人"><template #default="{ row }">{{ row.candidate?.name }}</template></el-table-column>
          <el-table-column label="目标职位"><template #default="{ row }">{{ row.job?.title }}</template></el-table-column>
          <el-table-column label="当前职位"><template #default="{ row }">{{ row.candidate?.currentPosition }}</template></el-table-column>
          <el-table-column label="当前公司"><template #default="{ row }">{{ row.candidate?.currentCompany }}</template></el-table-column>
          <el-table-column label="当前阶段"><template #default="{ row }">{{ row.candidate?.stageRecords?.[0]?.stage }}</template></el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="即将面试" name="interviews">
        <el-table v-loading="interviewsLoading" :data="interviews">
          <el-table-column label="候选人"><template #default="{ row }">{{ row.candidate?.name }}</template></el-table-column>
          <el-table-column label="职位"><template #default="{ row }">{{ row.job?.title }}</template></el-table-column>
          <el-table-column label="时间"><template #default="{ row }">{{ new Date(row.scheduledAt).toLocaleString() }}</template></el-table-column>
          <el-table-column label="时长"><template #default="{ row }">{{ row.duration }} 分钟</template></el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import api from '@/utils/request';

const activeTab = ref('overview');
const overviewLoading = ref(false);
const overview = reactive<any>({});
const approvalsLoading = ref(false);
const approvals = ref<any[]>([]);
const candidatesLoading = ref(false);
const candidates = ref<any[]>([]);
const interviewsLoading = ref(false);
const interviews = ref<any[]>([]);

async function loadOverview() {
  overviewLoading.value = true;
  try {
    const res = await api.get('/api/hiring/overview');
    if (res.success) Object.assign(overview, res.data);
  } catch (e) { ElMessage.error('加载总览失败'); } finally { overviewLoading.value = false; }
}
async function loadApprovals() {
  approvalsLoading.value = true;
  try {
    const res = await api.get('/api/hiring/approvals');
    if (res.success) approvals.value = res.data;
  } catch (e) { ElMessage.error('加载待审批失败'); } finally { approvalsLoading.value = false; }
}
async function loadCandidates() {
  candidatesLoading.value = true;
  try {
    const res = await api.get('/api/hiring/candidates');
    if (res.success) candidates.value = res.data;
  } catch (e) { ElMessage.error('加载候选人失败'); } finally { candidatesLoading.value = false; }
}
async function loadInterviews() {
  interviewsLoading.value = true;
  try {
    const res = await api.get('/api/hiring/interviews');
    if (res.success) interviews.value = res.data;
  } catch (e) { ElMessage.error('加载面试失败'); } finally { interviewsLoading.value = false; }
}
async function approveOffer(id: string) {
  try {
    const res = await api.post(`/api/hiring/approvals/${id}/approve`);
    if (res.success) {
      ElMessage.success('已批准');
      await loadApprovals();
      await loadOverview();
    }
  } catch (e) { ElMessage.error('审批失败'); }
}

onMounted(async () => {
  await loadOverview();
  await loadApprovals();
  await loadCandidates();
  await loadInterviews();
});
</script>
```

## 禁止事项

- ❌ 不要给 hiring_manager 添加候选人增删改能力（权限矩阵不含）
- ❌ 不要修改 P-1 的 `role-permission.service.ts`（本任务不改权限）
- ❌ 不要修改 `candidate-visibility.service.ts`（hiring_manager 沿用 P-1 的可见性）
- ❌ 不要在前端新增路由（`/api/hiring/*` 已在 P-1 注册）
- ❌ 不要触碰 HR 工作台的现有页面（`/jobs` 等）

## 必须新增的测试

文件 1：`server/tests/integration/hiring-dashboard.test.ts`
1. `admin` 访问 5 个端点都返回 200
2. `hiring_manager` 有 department 时只看到本部门数据
3. `hiring_manager` 无 department（`null`）时返回空数据
4. `hr` / `interviewer` 访问 `/api/hiring/*` 返回 403
5. `hiring_manager` 审批 Offer 后 status = `approved`

文件 2：`server/tests/unit/hiring-department-filter.test.ts`（纯函数测试）
1. `isAdmin('admin')` 返回 true
2. `isAdmin('hr')` 返回 false
3. `isAdmin('hiring_manager')` 返回 false
4. `isAdmin('interviewer')` 返回 false

（`isAdmin` 辅助函数应从 `routes/hiring.ts` 抽出来供测试）

## 完成后请按这个格式输出实施备注

```
## 实施备注

- 实际改动：[routes/hiring.ts 行数 + views/hiring/index.vue 行数 + 2 测试]
- 推荐方案预估：[1 route 文件扩展 + 1 view 文件改写 + 2 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不给 hiring_manager 添加候选人增删改能力
  - [✅/❌] 不修改 P-1 的 role-permission.service.ts
  - [✅/❌] 不修改 candidate-visibility.service.ts
  - [✅/❌] 不在前端新增路由
  - [✅/❌] 不触碰 HR 工作台的现有页面
  - [✅/❌] 抽出 isAdmin 辅助函数供测试
```

## 验收条件

1. ✅ `pnpm test` 全部通过（380 + 新增 6 ≈ 386）
2. ✅ `hiring_manager` 登录后访问 `/hiring` 看到 4 个 Tab
3. ✅ `hiring_manager` 在 `/hiring/approvals` 看到本部门待审批 Offer
4. ✅ `hiring_manager` 点"批准"后 Offer status 变 `approved`
5. ✅ `hr` / `interviewer` 访问 `/api/hiring/*` 返回 403
6. ✅ admin 看到全公司数据

## 回滚预案

```bash
git revert HEAD
# 已有 routes/hiring.ts 仍可保留骨架版，前端回退到占位
```
```

# 第 3 个：PROMPT-P3 面试官工作台 - interviewer（4 天）

> **前置**：P-1 已完成（interviewer 权限矩阵 + 候选人可见性 JS 过滤）
> **依赖**：P-1 的 `candidate-visibility.service.ts`（interviewer 只看自己面试的候选人）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：面试官工作台（interviewer）

## Context
- P-1 已完成：interviewer 角色权限 + `buildCandidateVisibilityWhere` 用 JS 过滤 `Interview.interviewers` JSON
- 现有 `server/src/routes/interview.ts` 只有骨架 `GET /my` 返回 `[]`
- 现有 `client/src/views/hiring/index.vue` 是 hiring_manager 工作台，P-3 需要**新建** `client/src/views/interview/index.vue`
- 现有 `client/src/router/index.ts` 还没 `/interview` 路由

## 设计原则
1. **最小可见性**：interviewer **只**看自己被指派的面试（`Interview.interviewers JSON 含 userId`）
2. **核心场景**：今日面试 / 待填评估 / 历史面试 3 个 Tab
3. **填评估是核心操作**：interviewer 必须能填 / 改自己的评估
4. **不触碰候选人**：interviewer 看 `candidate:read:limited`（service 层强校验）

## Phase 1：扩展 interview 路由

**修改** `server/src/routes/interview.ts`：

```ts
import { Router, type Router as RouterType } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';

const router: RouterType = Router();

/**
 * 面试官可见面试：自己被指派的 Interview
 * interviewers 字段是 JSON `[{id, name}]`，JS 过滤
 */
async function getVisibleInterviewIds(userId: string): Promise<string[]> {
  const interviews = await prisma.interview.findMany({ select: { id: true, interviewers: true } });
  const ids = new Set<string>();
  for (const i of interviews) {
    const list = Array.isArray(i.interviewers) ? (i.interviewers as Array<{ id: string }>) : [];
    if (list.some((u) => u.id === userId)) ids.add(i.id);
  }
  return Array.from(ids);
}

// 今日面试
router.get('/today', authenticate, requireRole('admin', 'interviewer'), async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const where: any = {
      status: 'scheduled',
      scheduledAt: { gte: todayStart, lte: todayEnd },
    };
    if (!isAdmin) {
      where.id = { in: await getVisibleInterviewIds(userId) };
    }

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        candidate: { select: { id: true, name: true } },
        job: { select: { id: true, title: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    res.json({ success: true, data: interviews });
  } catch (err) { next(err); }
});

// 待填评估：面试已结束但还没填评估
router.get('/pending-evaluations', authenticate, requireRole('admin', 'interviewer'), async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    const now = new Date();
    const where: any = { status: 'completed' };
    if (!isAdmin) {
      where.id = { in: await getVisibleInterviewIds(userId) };
    }

    // 找面试 + 该面试官对它的 evaluation（如果没填则 pending）
    const interviews = await prisma.interview.findMany({
      where,
      include: {
        candidate: { select: { id: true, name: true } },
        job: { select: { id: true, title: true } },
        evaluations: { where: { interviewerId: userId } },
      },
      orderBy: { scheduledAt: 'desc' },
    });

    // 过滤出"还没填"的
    const pending = interviews.filter((i) => i.evaluations.length === 0);
    res.json({ success: true, data: pending });
  } catch (err) { next(err); }
});

// 历史面试（已填评估）
router.get('/history', authenticate, requireRole('admin', 'interviewer'), async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    const where: any = { status: 'completed' };
    if (!isAdmin) {
      where.id = { in: await getVisibleInterviewIds(userId) };
    }

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        candidate: { select: { id: true, name: true } },
        job: { select: { id: true, title: true } },
        evaluations: { where: { interviewerId: userId } },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });

    // 只保留已填评估的
    const evaluated = interviews.filter((i) => i.evaluations.length > 0);
    res.json({ success: true, data: evaluated });
  } catch (err) { next(err); }
});

// 填 / 改评估
router.put('/:id/evaluation',
  authenticate,
  requireRole('admin', 'interviewer'),
  async (req, res, next) => {
    try {
      const interviewId = req.params.id;
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';

      // admin 可填任何面试，interviewer 只能填自己被指派的
      if (!isAdmin) {
        const visibleIds = await getVisibleInterviewIds(userId);
        if (!visibleIds.includes(interviewId)) {
          throw new AppError('无权评估此面试', 403);
        }
      }

      const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
      if (!interview) throw new AppError('面试不存在', 404);
      if (interview.status !== 'completed') {
        throw new AppError('面试未完成，无法评估', 400);
      }

      const { dimensions, overallScore, conclusion } = req.body;
      if (!dimensions || !overallScore || !conclusion) {
        throw new AppError('缺少必填字段', 400);
      }

      const evaluation = await prisma.interviewEvaluation.upsert({
        where: { interviewId_interviewerId: { interviewId, interviewerId: userId } },
        create: {
          interviewId,
          interviewerId: userId,
          dimensions,
          overallScore,
          conclusion,
          submittedAt: new Date(),
        },
        update: {
          dimensions,
          overallScore,
          conclusion,
          submittedAt: new Date(),
        },
      });

      res.json({ success: true, data: evaluation, message: '评估已提交' });
    } catch (err) { next(err); }
  }
);

export default router;
```

## Phase 2：前端新建面试官工作台

**新建** `client/src/views/interview/index.vue`：

```vue
<template>
  <div class="interviewer-page">
    <h2>面试官工作台</h2>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="今日面试" name="today">
        <el-table v-loading="todayLoading" :data="todayInterviews">
          <el-table-column label="候选人"><template #default="{ row }">{{ row.candidate?.name }}</template></el-table-column>
          <el-table-column label="职位"><template #default="{ row }">{{ row.job?.title }}</template></el-table-column>
          <el-table-column label="时间"><template #default="{ row }">{{ new Date(row.scheduledAt).toLocaleString() }}</template></el-table-column>
          <el-table-column label="时长"><template #default="{ row }">{{ row.duration }} 分钟</template></el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" @click="openEvaluationDialog(row)">填评估</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="待填评估" name="pending">
        <el-table v-loading="pendingLoading" :data="pendingEvaluations">
          <el-table-column label="候选人"><template #default="{ row }">{{ row.candidate?.name }}</template></el-table-column>
          <el-table-column label="职位"><template #default="{ row }">{{ row.job?.title }}</template></el-table-column>
          <el-table-column label="完成时间"><template #default="{ row }">{{ new Date(row.scheduledAt).toLocaleDateString() }}</template></el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openEvaluationDialog(row)">立即填评估</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="历史" name="history">
        <el-table v-loading="historyLoading" :data="historyInterviews">
          <el-table-column label="候选人"><template #default="{ row }">{{ row.candidate?.name }}</template></el-table-column>
          <el-table-column label="职位"><template #default="{ row }">{{ row.job?.title }}</template></el-table-column>
          <el-table-column label="面试时间"><template #default="{ row }">{{ new Date(row.scheduledAt).toLocaleDateString() }}</template></el-table-column>
          <el-table-column label="结论"><template #default="{ row }">{{ row.evaluations?.[0]?.conclusion }}</template></el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" @click="openEvaluationDialog(row, true)">查看</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 评估弹窗 -->
    <el-dialog v-model="evalDialogVisible" title="面试评估" width="600px">
      <el-form :model="evalForm" label-width="100px">
        <el-form-item label="候选人">
          <span>{{ currentInterview?.candidate?.name }}</span>
        </el-form-item>
        <el-form-item label="维度评分">
          <div v-for="dim in evalForm.dimensions" :key="dim.name" style="margin-bottom: 8px;">
            <span style="display: inline-block; width: 100px;">{{ dim.name }}：</span>
            <el-rate v-model="dim.score" :max="5" :disabled="readonly"></el-rate>
            <el-input v-model="dim.comment" placeholder="评语（可选）" :disabled="readonly" style="margin-top: 4px;" />
          </div>
        </el-form-item>
        <el-form-item label="综合评分">
          <el-rate v-model="evalForm.overallScore" :max="5" :disabled="readonly"></el-rate>
        </el-form-item>
        <el-form-item label="结论">
          <el-radio-group v-model="evalForm.conclusion" :disabled="readonly">
            <el-radio value="pass">通过</el-radio>
            <el-radio value="reject">淘汰</el-radio>
            <el-radio value="pending">待定</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="evalDialogVisible = false">关闭</el-button>
        <el-button v-if="!readonly" type="primary" @click="submitEvaluation">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import api from '@/utils/request';

const activeTab = ref('today');
const todayLoading = ref(false);
const todayInterviews = ref<any[]>([]);
const pendingLoading = ref(false);
const pendingEvaluations = ref<any[]>([]);
const historyLoading = ref(false);
const historyInterviews = ref<any[]>([]);

const evalDialogVisible = ref(false);
const readonly = ref(false);
const currentInterview = ref<any>(null);
const evalForm = reactive({
  dimensions: [
    { name: '技术能力', score: 0, comment: '' },
    { name: '沟通能力', score: 0, comment: '' },
    { name: '工作经验', score: 0, comment: '' },
  ],
  overallScore: 0,
  conclusion: 'pending',
});

async function loadToday() {
  todayLoading.value = true;
  try {
    const res = await api.get('/api/interview/today');
    if (res.success) todayInterviews.value = res.data;
  } finally { todayLoading.value = false; }
}
async function loadPending() {
  pendingLoading.value = true;
  try {
    const res = await api.get('/api/interview/pending-evaluations');
    if (res.success) pendingEvaluations.value = res.data;
  } finally { pendingLoading.value = false; }
}
async function loadHistory() {
  historyLoading.value = true;
  try {
    const res = await api.get('/api/interview/history');
    if (res.success) historyInterviews.value = res.data;
  } finally { historyLoading.value = false; }
}

function openEvaluationDialog(interview: any, isReadonly = false) {
  currentInterview.value = interview;
  readonly.value = isReadonly;
  const existing = interview.evaluations?.[0];
  if (existing) {
    evalForm.dimensions = existing.dimensions || evalForm.dimensions;
    evalForm.overallScore = existing.overallScore;
    evalForm.conclusion = existing.conclusion;
  } else {
    evalForm.dimensions = [
      { name: '技术能力', score: 0, comment: '' },
      { name: '沟通能力', score: 0, comment: '' },
      { name: '工作经验', score: 0, comment: '' },
    ];
    evalForm.overallScore = 0;
    evalForm.conclusion = 'pending';
  }
  evalDialogVisible.value = true;
}

async function submitEvaluation() {
  try {
    const res = await api.put(`/api/interview/${currentInterview.value.id}/evaluation`, evalForm);
    if (res.success) {
      ElMessage.success('评估已提交');
      evalDialogVisible.value = false;
      await loadToday();
      await loadPending();
      await loadHistory();
    }
  } catch (e) { ElMessage.error('提交失败'); }
}

onMounted(async () => {
  await loadToday();
  await loadPending();
  await loadHistory();
});
</script>
```

## Phase 3：前端路由注册

**修改** `client/src/router/index.ts`，加：

```ts
{
  path: '/interview',
  name: 'Interview',
  component: () => import('@/views/interview/index.vue'),
  meta: { title: '面试官工作台', icon: User, role: ['admin', 'interviewer'] },
},
```

## 禁止事项

- ❌ 不要修改 `role-permission.service.ts`（P-1 已固化权限矩阵）
- ❌ 不要修改 `candidate-visibility.service.ts`（interviewer 沿用 P-1 的 JS 过滤）
- ❌ 不要给 interviewer 增加候选人读权限（仍用 `:limited`）
- ❌ 不要触碰 hiring_manager 工作台（`/hiring`，P-2 已落地）
- ❌ 不要修改 `client/src/views/hiring/index.vue`

## 必须新增的测试

文件 1：`server/tests/integration/interviewer-dashboard.test.ts`
1. `interviewer` 访问 4 个端点都返回 200
2. `interviewer` 只能看到自己被指派的面试（不被指派 → 空数组）
3. `hr` / `hiring_manager` 访问 `/api/interview/*` 返回 403
4. `interviewer` 试图评估不被指派的面试返回 403
5. `interviewer` 评估后，pending 列表少一条、history 多一条
6. `interviewer` 改自己已填的评估，overallScore 更新

文件 2：`server/tests/unit/get-visible-interview-ids.test.ts`（纯函数测试）
1. userId 在 interviewers JSON 中 → 返回该 interview id
2. userId 不在 → 不返回
3. interviewers 字段为 null → 不返回
4. interviewers 字段为 `[]` → 不返回
5. 多面试 + 多面试官 → 只返回匹配的

（`getVisibleInterviewIds` 应从 `routes/interview.ts` 抽出来供测试）

## 完成后请按这个格式输出实施备注

```
## 实施备注

- 实际改动：[routes/interview.ts 行数 + views/interview/index.vue 行数 + 2 测试]
- 推荐方案预估：[1 route 文件扩展 + 1 view 新建 + 1 router 追加 + 2 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不修改 P-1 role-permission.service.ts
  - [✅/❌] 不修改 P-1 candidate-visibility.service.ts
  - [✅/❌] 不给 interviewer 增加候选人读权限
  - [✅/❌] 不触碰 hiring_manager 工作台
  - [✅/❌] 不修改 views/hiring/index.vue
  - [✅/❌] 抽出 getVisibleInterviewIds 供测试
```

## 验收条件

1. ✅ `pnpm test` 全部通过（386 + 新增 11 ≈ 397）
2. ✅ `interviewer` 登录后访问 `/interview` 看到 3 个 Tab
3. ✅ `interviewer` 在"今日面试"看到自己的面试（不被指派的不出现）
4. ✅ `interviewer` 在"待填评估"看到未填的面试
5. ✅ `interviewer` 点"立即填评估"弹窗提交后，移到"历史"
6. ✅ `hr` / `hiring_manager` 访问 `/api/interview/*` 返回 403

## 回滚预案

```bash
git revert HEAD
# 已有 routes/interview.ts 保留骨架，前端回退到无 /interview 路由
```
```

# 第 4 个：PROMPT-P4 通知 cron 扩展（3 天）

> **前置**：P-1 已完成（4 角色 + 权限矩阵）
> **依赖**：P-2 / P-3 已完成（工作台 + visibility 落地）
> **关联**：现有 3 个 cron（anonymize / evaluation-reminder / reminder）已存在，本任务**只追加** 1 个新 cron + 2 个 helper 通知

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：通知 cron 扩展（hiring_manager / interviewer）

## Context
- P-1 已完成：4 角色权限矩阵已落地
- P-2 已完成：hiring_manager 工作台已能用
- P-3 已完成：interviewer 工作台已能用
- 现有 cron（`server/src/lib/cron.ts`）：
  - `registerAnonymizeCron`：候选人匿名化
  - `registerEvaluationReminderCron`：面试评估催收
  - `registerReminderScan`：跟进 / 面试前 2h / 阶段超时
- **本任务**：加 1 个新 cron + 2 个 helper 通知（针对新角色）

## 设计原则
1. **最小侵入**：只追加，不修改现有 cron 逻辑
2. **复用 Notification 模型**：用现有 `notification.service.ts.createNotification`
3. **去重靠 Notification.dedupeKey**：每条通知用 `(role, userId, type, businessId, dateKey)` 做幂等键
4. **降级友好**：没有新角色用户时不报错

## Phase 1：新建 hiring_manager 日报

**新建** `server/src/services/hiring-manager-digest.service.ts`：

```ts
import prisma from '../lib/prisma';
import * as notificationService from './notification.service';
import { logger } from '../lib/logger';

interface DigestMetrics {
  openJobs: number;
  activeCandidates: number;
  pendingOffers: number;
  scheduledInterviewsToday: number;
  overdueStages: number;
}

/**
 * 给所有 hiring_manager + admin 发部门日报
 * 每天早上 9 点执行
 */
export async function sendHiringManagerDailyDigest(now: Date = new Date()): Promise<number> {
  // 找所有 hiring_manager + admin
  const recipients = await prisma.user.findMany({
    where: { role: { in: ['admin', 'hiring_manager'] }, enabled: true } as any },
    select: { id: true, role: true, department: true },
  });

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  let sent = 0;
  for (const recipient of recipients) {
    const isAdmin = recipient.role === 'admin';
    const jobFilter = isAdmin ? {} : { departments: { array_contains: recipient.department } };

    const metrics: DigestMetrics = {
      openJobs: await prisma.job.count({ where: { ...jobFilter, status: 'open' } }),
      activeCandidates: await prisma.candidateJob.count({
        where: { job: jobFilter, candidate: { deletedAt: null } },
      }),
      pendingOffers: await prisma.offer.count({
        where: { status: 'pending_approval', job: jobFilter },
      }),
      scheduledInterviewsToday: await prisma.interview.count({
        where: {
          status: 'scheduled',
          scheduledAt: { gte: todayStart, lte: todayEnd },
          job: jobFilter,
        },
      }),
      overdueStages: await prisma.stageRecord.count({
        where: {
          status: 'in_progress',
          enteredAt: { lte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    };

    const dateKey = now.toISOString().split('T')[0];
    const dedupeKey = `hiring_digest:${recipient.id}:${dateKey}`;

    try {
      const created = await notificationService.createNotificationSafe({
        dedupeKey,
        recipientId: recipient.id,
        title: `招聘日报 ${dateKey}`,
        content: formatDigest(metrics, recipient.department),
        type: 'hiring_digest',
        businessId: recipient.id,
        businessType: 'user',
      });
      if (created) sent += 1;
    } catch (e) {
      logger.error({ err: e, userId: recipient.id }, 'hiring digest failed');
    }
  }
  return sent;
}

function formatDigest(m: DigestMetrics, dept: string | null): string {
  const scope = dept ? `部门 ${dept}` : '全公司';
  return [
    `数据范围：${scope}`,
    `- 开放职位：${m.openJobs}`,
    `- 活跃候选人：${m.activeCandidates}`,
    `- 待审批 Offer：${m.pendingOffers}`,
    `- 今日面试：${m.scheduledInterviewsToday}`,
    `- 阶段超时（7+ 天）：${m.overdueStages}`,
  ].join('\n');
}
```

> 注：`createNotificationSafe` 是 `notification.service.ts` 的可选 helper（已存在 + 幂等 dedupeKey）。如果不存在，改用 `createNotification` 包 try/catch。

## Phase 2：新建 interviewer 面试前 24h 提醒

**新建** `server/src/services/interviewer-reminder.service.ts`：

```ts
import prisma from '../lib/prisma';
import * as notificationService from './notification.service';
import { logger } from '../lib/logger';

/**
 * 给面试官发"面试前 24h"提醒
 * 与现有"面试前 2h"互补，不重复（24h 提前通知 + 2h 紧急通知）
 * dedupeKey 用 hour 精度，避免重复
 */
export async function sendInterviewer24hReminder(now: Date = new Date()): Promise<number> {
  const start = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const interviews = await prisma.interview.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { gte: start, lte: end },
    },
    select: { id: true, candidateId: true, candidate: { select: { name: true } }, interviewers: true, scheduledAt: true },
  });

  let sent = 0;
  for (const interview of interviews) {
    const interviewerList = Array.isArray(interview.interviewers) ? (interview.interviewers as Array<{ id: string; name?: string }>) : [];
    const hourKey = new Date(interview.scheduledAt).toISOString().slice(0, 13);

    for (const interviewer of interviewerList) {
      if (!interviewer.id) continue;
      try {
        const created = await notificationService.createNotificationSafe({
          dedupeKey: `interview_24h:${interview.id}:${interviewer.id}:${hourKey}`,
          recipientId: interviewer.id,
          title: `面试提醒：${interview.candidate.name}`,
          content: `您明天有面试安排：${new Date(interview.scheduledAt).toLocaleString('zh-CN')}，请提前准备。`,
          type: 'interview_24h_reminder',
          businessId: interview.id,
          businessType: 'interview',
        });
        if (created) sent += 1;
      } catch (e) {
        logger.error({ err: e, interviewId: interview.id }, 'interviewer 24h reminder failed');
      }
    }
  }
  return sent;
}
```

## Phase 3：注册新 cron

**修改** `server/src/lib/cron.ts`，追加 2 个函数并注册到 `index.ts`：

```ts
// 在 server/src/lib/cron.ts 末尾追加

import { sendHiringManagerDailyDigest } from '../services/hiring-manager-digest.service';
import { sendInterviewer24hReminder } from '../services/interviewer-reminder.service';

/**
 * 注册 hiring_manager 日报
 * 每天早上 9 点（北京时间）
 */
export function registerHiringDigestCron(): void {
  if (env.HIRING_DIGEST_CRON === false) return;
  cron.schedule('0 9 * * *', async () => {
    try {
      const count = await sendHiringManagerDailyDigest();
      logger.info({ sent: count }, '[招聘日报] 执行完成');
    } catch (e) {
      logger.error({ err: e }, '[招聘日报] 执行失败');
    }
  });
}

/**
 * 注册 interviewer 面试前 24h 提醒
 * 每小时执行一次
 */
export function registerInterviewerReminderCron(): void {
  if (env.INTERVIEWER_REMINDER_CRON === false) return;
  cron.schedule('0 * * * *', async () => {
    try {
      const count = await sendInterviewer24hReminder();
      logger.info({ sent: count }, '[面试前 24h 提醒] 执行完成');
    } catch (e) {
      logger.error({ err: e }, '[面试前 24h 提醒] 执行失败');
    }
  });
}
```

**修改** `server/src/lib/env.ts`，追加：

```ts
HIRING_DIGEST_CRON: z.union([z.string(), z.boolean()]).optional(),
INTERVIEWER_REMINDER_CRON: z.union([z.string(), z.boolean()]).optional(),
```

**修改** `server/src/index.ts`（启动 cron）：

```ts
// 在现有 registerXxxCron() 调用后追加：
registerHiringDigestCron();
registerInterviewerReminderCron();
```

**修改** `.env.example`（**仅追加，不动其他**）：

```bash
# hiring_manager 日报（每天早上 9 点发送本部门招聘概览）
HIRING_DIGEST_CRON=0 9 * * *
# 设为 false 或留空则关闭

# interviewer 面试前 24h 提醒（每小时扫描）
INTERVIEWER_REMINDER_CRON=0 * * * *
# 设为 false 或留空则关闭
```

## Phase 4：Notification 新增 type 枚举

**修改** `Notification.type` 字段允许值（如果有 enum schema）：

检查 `server/prisma/schema.prisma` 看 Notification.type 是 String 还是 enum。如果是 String，不需要改。

如果是 enum（如 PROMPT 阶段 1 加的），追加 2 个值：

```prisma
enum NotificationType {
  // ... 现有值
  hiring_digest
  interview_24h_reminder
}
```

迁移类似 P-1：`ALTER TYPE ... ADD VALUE`

> **如果 Notification.type 是 String，跳过此 Phase。**

## 禁止事项

- ❌ 不要修改现有 cron（anonymize / evaluation-reminder / reminder）
- ❌ 不要修改现有 notification.service.ts（只调用其公开方法）
- ❌ 不要给 hiring_manager 发重复日报（dedupeKey 用日期）
- ❌ 不要给 interviewer 发 24h + 2h 同一条通知（两个 cron 独立，dedupeKey 不同）
- ❌ 不要修改 P-1 / P-2 / P-3 的代码
- ❌ 不要加新 npm 包

## 必须新增的测试

文件 1：`server/tests/unit/hiring-manager-digest.service.test.ts`
1. admin 收到 1 条日报（scope = company）
2. hiring_manager 有 department 收到 1 条（scope = department）
3. hiring_manager 无 department（null）收到 1 条（metrics 全为 0）
4. 同一天同一人不重复发送（dedupeKey 幂等）
5. 第二天同一用户能收到新日报（新 dedupeKey）

文件 2：`server/tests/unit/interviewer-reminder.service.test.ts`
1. 24 小时窗口内的面试，每个 interviewer 收到 1 条
2. 不在窗口内的面试不发
3. status != 'scheduled' 的不发
4. 同面试同一 interviewer 同一小时不重复（dedupeKey 包含 hour）
5. interviewers JSON 为 null 的面试不发

文件 3：`server/tests/integration/cron-registration.test.ts`
1. `HIRING_DIGEST_CRON` 为 false 时 `registerHiringDigestCron` 不注册
2. `INTERVIEWER_REMINDER_CRON` 为 false 时 `registerInterviewerReminderCron` 不注册
3. 正常配置时两个 cron 都能注册成功

## 完成后请按这个格式输出实施备注

```
## 实施备注

- 实际改动：[2 新 service + cron.ts 追加 + env.ts 追加 + index.ts 追加 + .env.example 追加 + 3 测试]
- 推荐方案预估：[2 新 service + 1 cron 文件追加 + 1 env 追加 + 3 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不修改现有 cron
  - [✅/❌] 不修改 notification.service.ts
  - [✅/❌] dedupeKey 包含日期 / 小时避免重复
  - [✅/❌] 不修改 P-1 / P-2 / P-3 代码
  - [✅/❌] 不加新 npm 包
```

## 验收条件

1. ✅ `pnpm test` 全部通过（397 + 新增 13 ≈ 410）
2. ✅ 手动测试：admin 登录 1 天后收到 1 条 hiring_digest 通知
3. ✅ 手动测试：interviewer 在面试前 24h 收到提醒
4. ✅ 关闭 env 变量后 cron 不注册
5. ✅ dedupeKey 工作正常（同天不重复）

## 回滚预案

```bash
git revert HEAD
# cron.ts 恢复原状，env.ts 移除新增变量
# 新 service 文件保留（不影响，但不再被调用）
```
```

# 第 5 个：PROMPT-P5 数据迁移 + seed 脚本 + 文档（3 天）

> **前置**：P-1 已完成（4 角色 enum 扩展已部署）
> **关联**：现有 `server/prisma/seed.ts` 用 `member`，**不**改它；新增独立 `seed-test-users.ts`
> **迁移策略**：现有 `member` → `hr`（rename，不拆分）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：数据迁移 + 4 角色 seed 脚本 + 文档更新

## Context
- P-1 已完成：`UserRole` enum 扩展（4 角色）
- 现有 `role-permission.service.ts` 已用 `normalizeUserRole` 函数把 `member` 归一成 `hr`
- 现有 `server/prisma/seed.ts` 仍用 `member`（demo 数据）
- 真实用户数据中可能有 `member` 用户（P-1 实战后，迁移前）

## 设计原则
1. **不改现有 seed.ts**：那是 demo 数据，按需使用
2. **新 seed-test-users.ts**：4 角色测试用户，**upsert**（可重复执行）
3. **数据迁移幂等**：migration 检查后再 UPDATE，避免重复
4. **不回滚数据**：P-5 不可逆（迁移后无法恢复 member）

## ⚠️ 数据库 schema 变更
本任务写一个**纯 SQL 数据 migration**（不涉及 schema），用 `prisma migrate` 机制。
**严格按通用 Guard 流程执行**（类似 P-1 的 9 步），但只迁移数据不改结构。

### Step 1：创建 migration 文件
手动创建（不用 `prisma migrate dev`）：

```bash
mkdir -p server/prisma/migrations/20260901000000_rename_member_to_hr
```

新建文件 `server/prisma/migrations/20260901000000_rename_member_to_hr/migration.sql`：

```sql
-- 成员角色重命名为 hr
-- 幂等：只更新仍为 member 的行（重复执行安全）

UPDATE "user"
SET role = 'hr'
WHERE role = 'member';
```

### Step 2：应用 migration

```bash
cd server
npx prisma migrate deploy
npx prisma generate
```

**重要**：
- 不需要 `--create-only`（这是纯 SQL migration，不是 schema diff）
- 写完后**立刻 deploy**，然后看效果

### Step 3：验证迁移效果

```bash
# 查 user 表的 role 分布
psql -U postgres -d recruitment_system -c "SELECT role, COUNT(*) FROM \"user\" GROUP BY role;"

# 应该看到：
#   role         | count
# --------------+-------
#  admin        |     1
#  hr           |     N (原本是 member 的数量)
#  hiring_manager | 0
#  interviewer  | 0
```

## Phase 1：新建 4 角色 seed 脚本

**新建** `server/prisma/seed-test-users.ts`：

```ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// 4 角色测试账号
const TEST_USERS = [
  {
    email: 'admin@test.local',
    name: '管理员测试',
    role: 'admin',
    department: null,
    password: 'admin123',
  },
  {
    email: 'hr@test.local',
    name: 'HR 测试',
    role: 'hr',
    department: null,
    password: 'hr123',
  },
  {
    email: 'hiring@test.local',
    name: '业务经理测试',
    role: 'hiring_manager',
    department: '研发部',
    password: 'hiring123',
  },
  {
    email: 'interviewer@test.local',
    name: '面试官测试',
    role: 'interviewer',
    department: '研发部',
    password: 'interview123',
  },
];

async function main() {
  console.log('开始创建 4 角色测试用户...\n');

  for (const user of TEST_USERS) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    const existing = await prisma.user.findUnique({ where: { email: user.email } });

    if (existing) {
      console.log(`⏭️  用户已存在，跳过: ${user.email}`);
      continue;
    }

    await prisma.user.create({
      data: {
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        password: hashedPassword,
        tokenVersion: 0,
      },
    });
    console.log(`✅ 创建用户: ${user.email} (${user.role}) / 密码: ${user.password}`);
  }

  console.log('\n🎉 4 角色测试用户创建完成！');
  console.log('\n📋 登录账号:');
  console.log('   admin        : admin@test.local        / admin123');
  console.log('   hr           : hr@test.local           / hr123');
  console.log('   hiring_manager: hiring@test.local       / hiring123');
  console.log('   interviewer  : interviewer@test.local   / interview123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**修改** `server/package.json`，添加 script：

```json
{
  "scripts": {
    // ... 现有 scripts
    "db:seed:test-users": "tsx prisma/seed-test-users.ts"
  }
}
```

## Phase 2：运行 seed 脚本

```bash
cd server
pnpm db:seed:test-users
```

应该看到 4 个 `✅` 输出，dev 库多了 4 个测试用户。

## Phase 3：文档更新

**修改** `README.md`，加"角色与权限"章节：

```markdown
## 角色与权限（阶段 3 后）

系统支持 4 种角色，由 `server/src/services/role-permission.service.ts` 中央管理：

| 角色 | 用途 | 关键权限 |
|------|------|---------|
| `admin` | 系统管理员 | 全部权限（`['*']`） |
| `hr` | HR 招聘专员 | 完整 HR 权限（看 + 增删改 + 审批 + 触发 HC） |
| `hiring_manager` | 业务经理（用人部门） | 看本部门 + 审批 Offer + 发起 HC + 填评估 |
| `interviewer` | 面试官 | 只看自己被指派的面试 + 填评估 |

权限矩阵详见 [`server/src/services/role-permission.service.ts`](server/src/services/role-permission.service.ts)。

### 4 角色登录测试

dev 库跑 `pnpm db:seed:test-users` 可创建 4 个测试账号：

| 账号 | 密码 | 测试场景 |
|------|------|---------|
| admin@test.local | admin123 | 全部功能 |
| hr@test.local | hr123 | HR 工作台 |
| hiring@test.local | hiring123 | 业务经理工作台（部门数据） |
| interviewer@test.local | interview123 | 面试官工作台（自己的面试） |

### 数据迁移说明

P-5 之前用 `member` 角色的用户，**自动迁移到 `hr`**。
迁移 SQL 在 `server/prisma/migrations/<timestamp>_rename_member_to_hr/migration.sql`，幂等可重复。

如果新部署的库没有 member 用户，迁移 no-op，安全。
```

## 禁止事项

- ❌ 不要修改 `server/prisma/seed.ts`（demo 数据保留）
- ❌ 不要在 `seed-test-users.ts` 里 delete 任何用户
- ❌ 不要在 migration 里删 user 数据
- ❌ 不要写 `prisma migrate dev`（用 `migrate deploy`，因为是纯 SQL migration）
- ❌ 不要给 `member` 角色留后路（迁移后 member 应该不存在）
- ❌ 不要在 P-5 修改 P-1 / P-2 / P-3 / P-4 的代码

## 必须新增的测试

文件 1：`server/tests/integration/migration-member-to-hr.test.ts`
1. migration SQL 是幂等的（重复执行不会报错或重复 UPDATE）
2. member → hr 转换正确
3. 已经有 hr 用户的不会受影响
4. 已经迁移过的库再次跑 migration 结果一致

文件 2：`server/tests/integration/seed-test-users.test.ts`
1. 重复执行 seed 不会创建重复用户（upsert 语义）
2. 4 个测试用户都能用 bcrypt 密码登录
3. role / department 字段都正确

## 完成后请按这个格式输出实施备注

```
## 实施备注

- 实际改动：[1 SQL migration + 1 新 seed 脚本 + 1 package.json 追加 + README 更新 + 2 测试]
- 推荐方案预估：[1 migration + 1 seed 脚本 + 1 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不修改 server/prisma/seed.ts
  - [✅/❌] 不在 seed-test-users.ts 里 delete 用户
  - [✅/❌] migration 幂等可重复
  - [✅/❌] 不在 P-5 修改其他 prompt 的代码
```

## 验收条件

1. ✅ `pnpm test` 全部通过（410 + 新增 6 ≈ 416）
2. ✅ `pnpm db:seed:test-users` 成功创建 4 个测试用户
3. ✅ migration 执行后 `SELECT role, COUNT(*) FROM "user" GROUP BY role` 显示：
   - `admin` ≥ 1
   - `hr` = 原 member 数量（如果 seed.ts 跑过，至少 1）
   - `hiring_manager` ≥ 1（seed-test-users）
   - `interviewer` ≥ 1（seed-test-users）
   - **`member` = 0**（关键，全部迁移）
4. ✅ 4 个测试账号都能登录

## 回滚预案

⚠️ **数据迁移不可逆**。如果迁移出错：

```sql
-- 把 hr 回退为 member（仅用于回滚）
UPDATE "user" SET role = 'member' WHERE role = 'hr';
```

但这是**降级回滚**，不是"撤销迁移"。
P-5 真正的撤销：删除 migration 文件 + git revert。
```

## 🎯 P-5 完成标志

5 个 prompt 全部完成 = **阶段 3 角色化工作台完整落地**。
接下来只剩：
- 手工验证 4 角色登录看不同菜单
- 把所有 commit push 到 origin
- 团队 review
```

---

## 📊 阶段 3 进度

- ✅ P-1 v1.2 已写 + 实战完成
- ✅ P-2 v1.2 已写（业务人员工作台 - hiring_manager）
- ✅ P-3 v1.2 已写（面试官工作台 - interviewer）
- ✅ P-4 v1.2 已写（hiring_manager 日报 + interviewer 24h 提醒）
- ✅ P-5 v1.2 已写（数据迁移 + seed + 文档）

## 🎯 下一步

实战 P-2 → P-3 → P-4 → P-5，每完成一个让我 review + commit。

最终 5 个 commit：
```
1. feat(server): P-1 角色化扩展
2. feat(server): P-2 业务人员工作台
3. feat(server): P-3 面试官工作台
4. feat(server): P-4 通知 cron 扩展
5. feat(server): P-5 数据迁移 + seed + 文档
```
