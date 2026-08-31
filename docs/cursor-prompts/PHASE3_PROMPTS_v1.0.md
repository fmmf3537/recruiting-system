# 阶段 3 角色化工作台提示词集（v1.0）

> ⚠️ **本文件已废弃（2026-08-31）**
>
> - 原因：v1.0 采用"通用块 + 审核员手册"模式，需要 Mavis（我）作为审核员介入。实战证明这个流程对个人/小团队太重。
> - 替代：**[VIBE_CODING_PROMPTS_PHASE3_v1.2.md](../../VIBE_CODING_PROMPTS_PHASE3_v1.2.md)** —— 自包含可直接粘贴版，5 个 prompt 按顺序执行。
> - 保留原因：v1.0 里的 4 个通用块（Migration Guard / 实施备注 / 定位卡 / 错误码表）作为设计参考有保留价值。
>
> **如果你看到这个文件还在 git 里：不要用，按 v1.2 走。**

---

> **使用方式**（**仅 v1.0 模式**，v1.2 已弃用此模式）：打开 Cursor Composer 新会话，**从上到下按顺序复制粘贴**。每个 prompt 都是自包含的，**复制下面 ```markdown ... ``` 代码块里的全部内容**粘贴即可。
>
> **基于**：阶段 2 v1.3 + 8 个 prompt 实施经验 + Phase 3 设计总览
>
> **范围**：5 个 prompt（角色化扩展 / 业务工作台 / 面试官工作台 / 通知 cron / 数据迁移 + 测试）
>
> **重要变更**：
> 1. 5 个 prompt 按依赖顺序执行（P-1 必须先做）
> 2. 4 个通用块从 v1.3 复用（不再重复）
> 3. 错误码表 / 定位卡 / 实施备注模板统一

---

## 📋 v1.0 changelog（vs 阶段 2 v1.3）

| # | 改动 | 原因 |
|---|------|------|
| 1 | 抽离 4 个通用块到头部（不再每个 prompt 重复） | 减少 token 浪费 |
| 2 | 5 个 prompt 按依赖图严格排序 | P-1 是基础 |
| 3 | 角色化错误码统一 | hire_manager / interviewer 401/403 标准化 |
| 4 | 数据迁移 P-5 单独成节 | member 拆 hr/hiring_manager/interviewer 是破坏性变更 |
| 5 | 通知 cron P-4 独立 | 横切关注点，跨多个工作台 |

---

## 🧱 通用块 A：Migration Guard 流程（schema 变更 prompt 必走）

> **适用 prompt**：P-1, P-5（涉及 schema 变更）
> **使用方式**：每个 prompt 顶部用 `> 通用块 A 见文件头` 一行引用

```
### Step 1：修改 schema.prisma
按任务要求修改 server/prisma/schema.prisma，只追加，不动现有模型/字段。
⚠️ @relation 用 onDelete（camelCase，本项目统一风格），不要写 on_delete。

### Step 2：仅生成 client（不动 DB）
cd server
npx prisma generate

### Step 3：生成 migration SQL（不 apply）⚠️ 关键
优先：npx prisma migrate dev --create-only --name <任务名>
如果失败（无 TTY），fallback：
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script
禁止：prisma migrate dev（默认会自动 apply）、migrate deploy、连 DB 跑 SQL。

### Step 4：完整展示 SQL，等待人工 review
输出中断提示（用通用块 D 的错误码表检查）：
🛑 已生成 migration SQL，请人工 review
请回复 "apply" / "rollback" / "fix <说明>"。

### Step 5：收到 apply 指令后
npx prisma migrate deploy
npx prisma generate

### Step 6：替换代码中的魔法字符串（仅 apply 成功后）
涉及 enum 字段时：用 enum 常量代替字符串字面量。

### Step 7：跑测试 + smoke test
pnpm test
手动测一次：登录 / 角色切换 / 关键路径

### Step 8：提交
git add server/prisma/schema.prisma server/prisma/migrations/ <修改的 service 文件>
git commit -m "feat(server): ..."
```

---

## 📋 通用块 B：实施备注模板（每个 prompt 完成后必填）

```markdown
## 实施备注

- 实际改动：[实际行数 / 文件数；列出每个文件的具体改动]
- 推荐方案预估：[预估行数 / 文件数]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 本次 migration 的人工 review 反馈：[apply / rollback / fix <说明>]
- 禁止事项逐条勾选：[✅/❌] × N 条
```

---

## 🎯 通用块 C：定位卡模板（每个 prompt 顶部必填）

```markdown
## 定位卡
- 所属阶段：3 / 5
- 编号：PROMPT-Pn
- 风险等级：🟢 低 / 🟡 中 / 🔴 高
- 涉及 schema：✅ / ❌
- 前置依赖：[P-X 已完成 / 无]
- 下游使用：[P-Y 会引用本任务产出的 X]
- 涉及文件数：[N 新增 + M 修改]
- 关键风险点：[如"涉及破坏性数据迁移" / "涉及新角色权限矩阵"]
```

---

## ⚠️ 通用块 D：错误码触发条件表（涉及 HTTP 接口的 prompt 必填）

| 错误码 | HTTP | 触发条件 | 客户端处理 | 文案 |
|--------|------|----------|------------|------|
| 401 | 401 | 未认证 | 跳转登录页 | "请先登录" |
| 403 | 403 | 已认证但无权限（角色不符）| 跳工作台首页 | "您当前角色 [{role}] 无权访问" |
| 404 | 404 | 资源不存在 | 提示不存在 | "{资源}不存在" |
| 409 | 409 | 资源冲突 | 提示冲突 | "{冲突原因}" |
| 422 | 422 | 参数校验失败 | 展示字段错误 | "{字段}: {错误信息}" |
| 429 | 429 | 限流 | 稍后重试 | "{限流原因}" |
| 500 | 500 | 服务器错误 | 提示系统繁忙 | "系统繁忙，请稍后重试" |

> Phase 3 特有：403 文案要包含当前 role，方便定位。

---

<!-- ===== PROMPT-P1 START ===== -->

# 第 1 个：PROMPT-P1 角色化扩展 + 权限矩阵（4 天）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：角色化扩展 + 权限矩阵

## 定位卡
- 所属阶段：3 / 5
- 编号：PROMPT-P1
- 风险等级：🔴 高
- 涉及 schema：✅ 1 个 enum 扩展（UserRole）+ User.role 字段文档
- 前置依赖：无
- 下游使用：P-2 / P-3 / P-4 全部依赖此处的角色体系
- 涉及文件数：1 schema 修改 + 1 migration + 1 service（权限矩阵）+ 1 middleware（requireRole）+ 2 路由示范 + 2 测试
- 关键风险点：角色化是后续 4 个 prompt 的基础；权限矩阵定错会全盘错

## ⚠️ 数据库 schema 变更
本任务扩展 UserRole enum（加 hiring_manager / interviewer 2 个值）。
**严格按通用块 A 的 8 步 Guard 流程执行**（见文件头），不要跳步。

## 设计原则

1. **角色定义**（UserRole enum 扩展）：
   - `admin` — 系统管理员（不变）
   - `member` — 普通 HR（不变，覆盖数据迁移前的现有用户）
   - `hiring_manager` — 用人经理（新增，能看本部门招聘 + 审批 Offer + 发起 HC）
   - `interviewer` — 面试官（新增，**只**能看自己被指派的面试 + 填评估）

2. **登录后路由策略**（前端用 meta.role 决定菜单）：
   - admin / member → 完整 HR 菜单（现有）
   - hiring_manager → /hiring 工作台（4 页面：总览/审批/部门候选人/部门面试）
   - interviewer → /interview 工作台（3 页面：今日/评估/历史）

3. **权限矩阵**（中央化在 `auth.service.ts` 的 `getRolePermissions(role)`）：
   - admin: ['*']（通配符，与 PROMPT-14 RBAC 一致）
   - member: 现有所有权限（不变）
   - hiring_manager: 只能看 + 评估 + 审批 Offer + 发起 HC；不能增删改候选人
   - interviewer: 只能看自己被指派的面试 + 填评估；不能看候选人详情

4. **候选人可见性按角色收敛**（v1.3 已实现的 buildCandidateVisibilityWhere 扩展）：
   - admin: 全部
   - member: 本部门 + 自己创建 + assigneeId 自己（现有）
   - hiring_manager: 本部门（与现有 member 一样），**但**写操作（增删改）返回 403
   - interviewer: **只**看 Interview.interviewers JSON 含自己的候选人

5. **安全**：
   - 任何 controller 必带 `requireRole(role)` 或 `requirePermission(code)` 中间件
   - 不在 controller 内部做角色判断（容易漏）
   - 前端用 meta.role 控制菜单可见，但**前端只是 UX**，权限以 API 中间件为准

## Step 1：修改 schema.prisma

**重要**：v1.3 已有 `enum UserRole { admin member }`，本任务**扩展 enum**（不是改字段类型）。

```prisma
enum UserRole {
  admin
  member
  hiring_manager   // ← 新增
  interviewer      // ← 新增
}

// User 模型不动（role 字段已经是 UserRole 类型）
```

⚠️ Prisma 5 enum 扩展方式：
- 添加 enum 值不会丢失现有数据
- PostgreSQL 用 `ALTER TYPE ... ADD VALUE` 实现
- Prisma 自动生成对应 SQL

## Step 2-5：Guard 流程
按通用块 A 执行 generate → migrate --create-only → review → deploy。

## Step 6：新建角色权限矩阵

**新建** `server/src/services/role-permission.service.ts`：

```ts
import prisma from '../lib/prisma';

export type UserRoleType = 'admin' | 'member' | 'hiring_manager' | 'interviewer';

/**
 * 角色权限矩阵（v3.0）
 * admin: ['*'] 通配符
 * member: 全部 HR 权限
 * hiring_manager: 业务人员（看 + 评估 + 审批 + 发起 HC，无增删改）
 * interviewer: 面试官（看自己面试 + 填评估，最小可见性）
 */
export function getRolePermissions(role: UserRoleType): string[] {
  switch (role) {
    case 'admin':
      return ['*'];
    case 'member':
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
        'candidate:read',          // 只能读
        'job:read',
        'offer:read', 'offer:approve',  // 可审批
        'interview:read',
        'evaluation:read',
        'stage:read',
        'hc_request:read', 'hc_request:create',  // 可发起 HC
        'dictionary:read',
      ];
    case 'interviewer':
      return [
        'candidate:read:limited',   // 标记为限制读（service 层强校验只能看自己面试的）
        'interview:read:limited',
        'evaluation:read', 'evaluation:create', 'evaluation:update',  // 可填评估
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
import { hasPermission } from './auth';
import { AppError } from './errorHandler';
import { UserRoleType, getRolePermissions } from '../services/role-permission.service';

/**
 * 角色守卫：要求 user.role 在白名单内
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
 * 用法：requireRoleAndPermission('hiring_manager', 'offer:approve')
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
// 现有逻辑保留，但要加 role 判断
export function buildCandidateVisibilityWhere(user: AuthUser): Prisma.CandidateWhereInput {
  if (user.role === 'admin') return {};  // 看全部

  if (user.role === 'interviewer') {
    // 面试官：只看自己被指派的 Interview 对应的候选人
    return {
      interviews: {
        some: {
          interviewers: {
            array_contains: user.userId,  // PostgreSQL JSONB 包含
          },
        },
      },
    };
  }

  // member / hiring_manager 共享：本部门 + 自己创建 + assigneeId
  // （与 v1.3 一致）
  return {
    OR: [
      { createdById: user.userId },
      { stageRecords: { some: { assigneeId: user.userId } } },
      { jobs: { some: { departments: { array_contains: user.department } } } },
    ],
  };
}
```

**关键**：PostgreSQL JSONB `array_contains` 是 Prisma 5.0+ 的能力。`interviewers` 字段是 JSON `[{id, name}]`，需要写成：

```ts
interviews: {
  some: {
    // interviewers 字段在 schema 是 Json 类型
    // Prisma 用 path 语法查 JSONB
    // 实际推荐方案：用 raw SQL 或单独维护 InterviewInterviewer 关联表
  },
},
```

**v3.0 简化方案**：用 `Interview` 表的反向查询，在 service 层做：

```ts
export async function getVisibleCandidateIdsForInterviewer(userId: string): Promise<string[]> {
  const interviews = await prisma.interview.findMany({
    where: {
      // JSON contains 查询，Prisma 5 用 path 语法
      interviewers: { path: ['*'], array_contains: userId },
    },
    select: { candidateId: true },
    distinct: ['candidateId'],
  });
  return interviews.map((i) => i.candidateId);
}
```

⚠️ 如果 Prisma 5 不支持 JSON contains，**回退方案**：在 service 层把 JSON 解析后用 JS 过滤（性能差但简单）。

## Step 9：示范迁移 2 个新角色路由

**只改这 2 个路由**作为示范，其他不动：

`server/src/routes/hiring.ts`（**新建**）：
```ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';

const router = Router();

// 业务工作台：hiring_manager 或 admin 可访问
router.get('/overview',
  authenticate,
  requireRole('admin', 'hiring_manager'),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';
      // ... 返回部门招聘总览
      res.json({ success: true, data: {} });
    } catch (err) { next(err); }
  }
);

export default router;
```

`server/src/routes/interview.ts`（**新建**）：
```ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/role';

const router = Router();

router.get('/my',
  authenticate,
  requireRole('admin', 'interviewer'),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      // ... 返回面试官的面试列表
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

**修改** `client/src/router/index.ts`（仅加 meta.role 给现有路由，**不**加新页面）：

```ts
// 现有路由加 meta.role（不破坏现有结构）
{
  path: '/jobs',
  name: 'Jobs',
  component: () => import('@/views/jobs/index.vue'),
  meta: { title: '职位管理', icon: Briefcase, role: ['admin', 'member'] },  // ← 新增
},
{
  path: '/hiring',  // P-2 会真正实施
  name: 'Hiring',
  component: () => import('@/views/hiring/index.vue'),
  meta: { title: '招聘工作台', icon: Briefcase, role: ['admin', 'hiring_manager'] },
},
```

**修改** `client/src/router/index.ts` 的路由守卫，根据 meta.role 过滤：
```ts
// 在 beforeEach 内
if (to.meta.role && Array.isArray(to.meta.role)) {
  if (!to.meta.role.includes(authStore.userInfo?.role)) {
    ElMessage.error('您当前角色无权访问该页面');
    next('/dashboard');
    return;
  }
}
```

## 错误码表（参考通用块 D）

| 错误码 | 触发条件 | 文案 |
|--------|----------|------|
| 401 | 未认证 | "请先登录" |
| 403 | 角色不符 | "您当前角色 [{role}] 无权访问，需要 [{allowedRoles}]" |
| 404 | 资源不存在 | "{资源}不存在" |
| 422 | 参数校验失败 | "{字段}: {错误信息}" |

## 禁止事项

- ❌ 不要删除现有 `User.role` 字段
- ❌ 不要改 UserRole enum 的现有值（只追加 hiring_manager / interviewer）
- ❌ 不要批量修改现有 controller 加 requireRole（只示范 2 个新路由）
- ❌ 不要在 controller 内部做角色判断（用 middleware）
- ❌ 不要让 hiring_manager 增删改候选人（permission matrix 不含 candidate:create/update/delete）
- ❌ 不要让 interviewer 看到非自己面试的候选人（visible 强制约束）
- ❌ 不要在面试官路由用 `getCandidates` 通用接口（要写专门的 getMyInterviewCandidates）
- ❌ 不要省略 Guard 流程
- ❌ 不要用 `any` 类型
- ❌ 不要改 `auth.ts` JWT payload

## 必须新增的测试

文件 1：`server/tests/unit/role-permission.service.test.ts`
1. admin 角色返回 ['*'] 通配符
2. member 角色返回完整 HR 权限列表
3. hiring_manager 角色**不**含 candidate:create/update/delete
4. hiring_manager 角色**含** offer:approve
5. interviewer 角色只含 interview + evaluation 权限
6. 角色权限矩阵与 v1.3 PROMPT-14 RBAC 兼容

文件 2：`server/tests/integration/role-middleware.test.ts`
1. member 访问 /api/hiring/overview 返回 403
2. hiring_manager 访问 /api/hiring/overview 返回 200
3. interviewer 访问 /api/hiring/overview 返回 403
4. interviewer 访问 /api/interview/my 返回 200
5. member 访问 /api/interview/my 返回 403（面试官专属）
6. admin 访问任何路由都通过

文件 3：`server/tests/integration/candidate-visibility.test.ts`（扩展现有）
1. hiring_manager 登录后只能看本部门候选人
2. hiring_manager 试图 PATCH 候选人返回 403
3. interviewer 登录后只能看自己被指派的候选人
4. interviewer 试图 GET 不相关候选人详情返回 403

## 实施备注
按通用块 B 的格式输出。

## 验收条件
1. ✅ `pnpm test` 全部通过（预期 362 + 新 13 测试 ≈ 375）
2. ✅ 手动测试：4 种角色登录看到不同菜单（admin 全功能 / hiring_manager / interviewer / member）
3. ✅ hiring_manager 试图 PATCH 候选人返回 403
4. ✅ interviewer 看到候选人列表只有自己面试相关的
5. ✅ 错误码表 4 个错误码全部实现

## 回滚预案
```bash
cd server
npx prisma migrate resolve --rolled-back add_user_role_hiring_manager_interviewer
git revert HEAD
```
```

---

<!-- ===== PROMPT-P1 END ===== -->

---

## 🎯 Phase 3 v1.0 范围说明

**已写**：P-1（角色化扩展 + 权限矩阵）— 4 天

**待写**（按你 review P-1 后再开）：
- P-2 业务人员工作台（5 天）
- P-3 面试官工作台（4 天）
- P-4 通知 cron 扩展（3 天）
- P-5 数据迁移 + 集成测试 + 文档（3 天）

P-1 是基础，**必须先 review 通过**再写后续 4 个 prompt。
```

---

# ✅ 暂停：等 P-1 review

P-1 写完了，但**只写了 1/5**。按纪律，先把 P-1 给你 review：

1. **检查范围**：是否覆盖你的需求（角色化 + 权限矩阵 + 中间件）？
2. **检查 schema 变更**：UserRole enum 扩展 +2 个值（hiring_manager / interviewer）是否符合你预期？
3. **检查权限矩阵**：hiring_manager 能审批 Offer + 发起 HC + 看本部门；interviewer 只能看自己面试 + 填评估 — 跟你想的对齐吗？
4. **检查可见性**：interviewer 只能看自己被指派的候选人 — 这个"最小可见性"是不是过严？

如果 P-1 通过，我接着写 P-2（业务工作台）。如果有问题，按你的修改意见调整。

另外，**P-1 落地后还需要你做**：
```powershell
# dev 库跑 migration（user 自己保护）
cd server
npx prisma migrate deploy
npx prisma generate

# 创建测试用户（手动）
# 在 prisma studio 里创建 1 个 hiring_manager 和 1 个 interviewer 用户
```

P-1 要不要现在 commit 进 docs/，还是先放这不动？