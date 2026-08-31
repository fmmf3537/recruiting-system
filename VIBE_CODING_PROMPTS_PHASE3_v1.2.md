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

> 📝 待写：根据 P-1 反馈调整。

# 第 3 个：PROMPT-P3 面试官工作台 - interviewer（4 天）

> 📝 待写：根据 P-1 反馈调整。

# 第 4 个：PROMPT-P4 通知 cron 扩展（3 天）

> 📝 待写：根据 P-1 反馈调整。

# 第 5 个：PROMPT-P5 数据迁移 + seed 脚本 + 文档（3 天）

> 📝 待写：根据 P-1 反馈调整。

---

## 📊 阶段 3 进度

- ✅ P-1 v1.2 已写
- ⏳ P-2 / P-3 / P-4 / P-5 待写

## 🎯 下一步

你实战 P-1 后告诉我反馈（哪里要调整），我再写 P-2/3/4/5。
