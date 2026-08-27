# 阶段 2 业务功能增强 - Cursor Vibe Coding 提示词集

> **目标读者**：Cursor Composer / Cursor Agent
> **使用方式**：每次打开一个新的 Composer 会话，**只粘贴一个提示词**
> **原则**：单一变更 + 测试先行 + 禁止越界
> **范围**：阶段 2「业务功能增强」6 个任务中的 5 个（AI 视频面试不在本批）
> **前置条件**：阶段 0 + 阶段 1 全部完成

---

## 📋 提示词索引

| # | 修复项 | 复杂度 | 估时 | 提示词锚点 |
|---|--------|--------|------|------------|
| 13 | 候选人软删除 + 回收站 | 🟢 低 | 3 天 | [PROMPT-13](#prompt-13-候选人软删除--回收站) |
| 14 | RBAC 权限系统骨架 | 🟡 中 | 5 天 | [PROMPT-14](#prompt-14-rbac-权限系统骨架) |
| 15a | 候选人门户：DB + Magic Link | 🔴 高 | 3 天 | [PROMPT-15a](#prompt-15a-候选人自助门户-db--magic-link) |
| 15b | 候选人门户：公开 API | 🔴 高 | 4 天 | [PROMPT-15b](#prompt-15b-候选人门户公开-api) |
| 15c | 候选人门户：前端 Portal 页面 | 🔴 高 | 3 天 | [PROMPT-15c](#prompt-15c-候选人门户前端-portal-页面) |
| 16a | Chatbot：基础架构 + SQL Agent | 🔴 高 | 4 天 | [PROMPT-16a](#prompt-16a-智能问答-chatbot-基础架构--sql-agent) |
| 16b | Chatbot：LLM 集成 + 前端 | 🟡 中 | 3 天 | [PROMPT-16b](#prompt-16b-chatbot-llm-集成--前端) |
| 17 | 飞书日历 / Google Calendar 集成 | 🟡 中 | 5 天 | [PROMPT-17](#prompt-17-飞书日历集成) |

### ⏭️ 不在本批的任务

**AI 视频面试**：审计报告估时 15 天，建议**外采**而非自研。可选供应商：
- HireVue（国际，成熟）
- 猎聘·八爪鱼 AI 面试
- 自研（需要 ASR/TTS/视觉/语义 4 个模型团队，3-6 个月起步）

如果决定自研，需要单独写一份"AI 视频面试技术选型 + PoC"文档，超出 vibe coding 范围。

---

## ⚙️ 阶段 2 通用约束（每次粘贴前先看）

```
🚨 通用铁律：
1. 必须先完成阶段 0 + 阶段 1（pino + OTel + Prometheus + Sentry 都已就位）
2. 涉及数据库 schema 变更的提示词（13、14、15a），必须配套 migration
3. 涉及公开 API（15b）的提示词，必须独立 review 安全（认证、限流、防滥用）
4. 涉及 LLM 调用（16a、16b）的提示词，必须有 token 用量监控 + cost 控制
5. 不要触碰已有 service / controller 的实现逻辑
6. 不要修改现有的 admin / member 角色判断（PROMPT-14 会引入新机制，但旧的兼容）
```

### 📐 v1.1 元规则：当"行数约束"与"功能完整性"冲突时

> **本节基于 PROMPT-01 实战反馈编写**：用户指出"1-3 行"约束与推荐方案的 try/catch 块本身冲突。

当提示词中"X 行变更" / "Y 个文件"等量化约束与标准做法（try/catch、空值检查、错误传播）冲突时，按以下优先级处理：

| 优先级 | 约束类型 | 处理方式 |
|--------|---------|---------|
| 🔴 硬 | 功能完整性 / 安全校验 / 错误处理 | **不可妥协**，允许行数膨胀 |
| 🔴 硬 | "禁止做的事"清单 | 不可触碰 |
| 🟡 软 | "X 行 / Y 文件"等量化指标 | **允许 ±50% 偏差**，前提是偏差由标准错误处理导致 |
| 🟢 软 | 代码风格（命名、注释位置） | 与现有风格一致即可 |

**Cursor 自我 review 时**，如果实际行数超出预期，必须在末尾"实施备注"中说明。

**禁止的偏差**：删除 try/catch、删除空值检查、删除错误传播以"凑行数"。这会被视为引入新 bug。

### 📋 Cursor 完成后必须输出"实施备注"模板

每个提示词任务完成后，Cursor 必须输出以下 5 行小节（便于人工 review）：

```markdown
## 实施备注

- 实际改动：[实际行数 / 文件数]
- 推荐方案预估：[预估行数 / 文件数]
- 偏差原因：[解释多了什么 / 少了什么；如无偏差填"无"]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项逐条勾选：[✅/❌] × 4-5 条
```

---

<a id="prompt-13"></a>
## PROMPT-13：候选人软删除 + 回收站

### Cursor 提示词

```markdown
# 任务：候选人软删除 + 回收站

## Context
- 项目后端：Express 4 + Prisma + PostgreSQL
- 现状：`candidate.service.ts:1119-1142` 的 `deleteCandidate` 走 `prisma.candidate.delete`，**硬删除**会级联删 stage_record / interview_feedback / offer 等
- 问题：
  1. 不可恢复（误删后无法找回）
  2. 违反个保法要求（应留存操作日志的可追溯证据）
- 目标：
  1. 软删除（设 `deletedAt`）
  2. 列表默认过滤已删除
  3. admin 可在"回收站"查看并恢复

## 设计原则
1. **破坏性最小**：保留现有硬删除行为为"管理员强删"（仅 admin）
2. **默认过滤**：所有 `candidate` 查询默认加 `deletedAt: null`
3. **回收站**：admin 专用接口，可列出 + 恢复 + 真删
4. **匿名化兼容**：已软删的候选人不进入匿名化候选范围
5. **AuditLog 不可删**：即使候选人软删，对应的 OperationLog 必须保留

## Phase 1：修改 schema.prisma
在 `Candidate` 模型加字段：
```prisma
model Candidate {
  // ... 现有字段
  deletedAt   DateTime?
  deletedById String?
  deletedBy   User?    @relation("DeletedCandidates", fields: [deletedById], references: [id])

  // 在 User 模型加反向关系（**只追加**，不改其他）
  deletedCandidates Candidate[] @relation("DeletedCandidates")

  // 加索引
  @@index([deletedAt])
  // ... 现有索引不动
}
```

## Phase 2：生成 migration
```bash
cd server
npx prisma migrate dev --name add_candidate_soft_delete
```

## Phase 3：修改 candidate.service.ts
**只改这 4 个方法，其他不动**：
1. `getCandidates`（行号 269）：所有 Prisma where 默认追加 `deletedAt: null`
2. `getCandidateById`（行号 524）：追加 `deletedAt: null` 过滤；如已删除抛 404
3. `deleteCandidate`（行号 1119）：**改为软删除**
   ```ts
   async deleteCandidate(id: string, userId: string, isAdmin: boolean): Promise<void> {
     // 现有权限校验保持
     // 现有"是否存在"校验保持
     await prisma.candidate.update({
       where: { id },
       data: { deletedAt: new Date(), deletedById: userId },
     });
     // 不删关联数据，但缓存清空
     await clearStatsCache();
     await clearListCache('candidates:list:*');
   }
   ```
4. **新增** `restoreCandidate(id, userId)`：admin only
   ```ts
   async restoreCandidate(id: string): Promise<Candidate> {
     return prisma.candidate.update({
       where: { id },
       data: { deletedAt: null, deletedById: null },
     });
   }
   ```

## Phase 4：新增 controller 方法
**追加**到 `candidate.controller.ts`：
```ts
async getRecycleBin(req, res, next) { /* admin only */ }
async restoreCandidate(req, res, next) { /* admin only */ }
async purgeCandidate(req, res, next) { /* admin only，真删 */ }
```

## Phase 5：新增路由
**追加**到 `routes/candidates.ts`：
```ts
router.get('/recycle-bin', authenticate, authorize('admin'), candidateController.getRecycleBin);
router.post('/:id/restore', authenticate, authorize('admin'), candidateController.restoreCandidate);
router.delete('/:id/purge', authenticate, authorize('admin'), candidateController.purgeCandidate);
```

## Phase 6：可见性服务联动
`candidate-visibility.service.ts` 的 `buildCandidateVisibilityWhere` 不用改（软删过滤在 service 单独加）。但要在所有 `scope?.isAdmin` 的分支中**额外加** `deletedAt: null` 过滤。

## Phase 7：匿名化任务联动
`anonymize.service.ts` 加过滤：`anonymizedAt: null` 已有，无需改。

## 禁止事项
- ❌ 不要在 `getCandidates` 的 OR 搜索中保留已删除候选人（隐私 + 体验都不好）
- ❌ 不要在 stageRecord / offer 等子表加 deletedAt（用外键级联即可）
- ❌ 不要改 `OperationLog`（审计日志永不被删）
- ❌ 不要把现有的 `deleteCandidate` 行为改为"硬删 + 软删同时记录"（二选一即可）
- ❌ 不要在 member 角色下显示回收站入口
- ❌ 不要在软删除后保留候选人简历物理文件（匿名化时处理）

## 必须新增的测试
文件：`server/tests/unit/candidate-soft-delete.test.ts`
测试用例：
1. `deleteCandidate` 后 `deletedAt` 被设置，记录被软删除（DB 中仍存在）
2. 软删除后 `getCandidates` 不返回该候选人（默认过滤）
3. 软删除后 `getCandidateById` 抛 404
4. admin 调用 `restoreCandidate` 后 `deletedAt` 被清空，候选人重新可见
5. non-admin 调用 `restoreCandidate` 抛 403
6. 软删除的候选人不会出现在 `anonymize.service` 的候选名单中
7. `purgeCandidate` 真删候选人（DB 中不存在）

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ 手动测试：软删一个候选人 → 列表看不到 → admin 回收站能看到 → 恢复 → 列表重新出现
3. ✅ `git diff` 触及文件：`schema.prisma` + 1 个 migration + `candidate.service.ts`（限定 4 个方法）+ `candidate.controller.ts`（追加）+ `routes/candidates.ts`（追加）+ `anonymize.service.ts`（追加一行过滤）+ 1 个测试文件
4. ✅ `pnpm prisma migrate deploy` 在生产数据库成功应用

## 回滚预案
```bash
cd server
npx prisma migrate resolve --rolled-back add_candidate_soft_delete
```

## 完成后请输出
1. migration SQL 内容
2. 修改文件清单（如 [文件 A, B, C]，**清单不变**）+ diff 行数汇总
3. 测试文件
4. 手动验证截图或日志

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[migration SQL 行数 + service 行数差 + 新增文件数]
- 推荐方案预估：[1 schema 追加 + 1 migration + 1 service 多方法改 + 1 controller 追加 + 1 route 追加 + 1 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不在 getCandidates OR 搜索保留已删除候选人
  - [✅/❌] 不给子表加 deletedAt
  - [✅/❌] 不改 OperationLog
  - [✅/❌] 不让 deleteCandidate 同时软删+硬删
  - [✅/❌] 不给 member 显示回收站
  - [✅/❌] 不在软删除后保留简历物理文件
```

---

<a id="prompt-14"></a>
## PROMPT-14：RBAC 权限系统骨架

### Cursor 提示词

```markdown
# 任务：实现 RBAC 权限系统骨架（角色 + 权限 + 中间件）

## Context
- 现状：仅 `User.role` 字段，值是 `'admin'` 或 `'member'`，权限判断硬编码在 `authorize('admin')`
- 目标：支持细粒度权限（`offer:approve`、`candidate:delete` 等）
- 阶段：本次只做**骨架** + **2 个示范权限**（offer:approve / candidate:export），其他权限后续渐进式迁移

## 设计原则
1. **向后兼容**：保留 `User.role`，新系统并行存在；旧代码可平滑迁移
2. **权限码规范**：`资源:动作` 格式，如 `offer:approve`、`candidate:export`、`job:create`
3. **角色继承**：admin 角色默认拥有所有权限（无需显式分配）
4. **可缓存**：用户的权限列表缓存 60 秒（与 JWT 缓存策略一致）
5. **优雅降级**：权限表缺失时只读不写，应用仍可用

## Phase 1：schema.prisma 新增 3 个模型
在末尾追加：
```prisma
model Role {
  id          String   @id @default(cuid())
  code        String   @unique  // 'admin', 'member', 'hiring_manager'
  name        String              // 显示名
  description String?
  isSystem    Boolean  @default(false)  // 系统角色不可删
  enabled     Boolean  @default(true)

  rolePermissions RolePermission[]
  userRoles       UserRole[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("role")
}

model Permission {
  id          String   @id @default(cuid())
  code        String   @unique  // 'offer:approve'
  resource    String              // 'offer'
  action      String              // 'approve'
  description String?

  rolePermissions RolePermission[]

  createdAt DateTime @default(now())

  @@index([resource, action])
  @@map("permission")
}

model RolePermission {
  id           String     @id @default(cuid())
  roleId       String
  role         Role       @relation(fields: [roleId], references: [id], on_delete: Cascade)
  permissionId String
  permission   Permission @relation(fields: [permissionId], references: [id], on_delete: Cascade)

  @@unique([roleId, permissionId])
  @@map("role_permission")
}

model UserRole {
  id     String @id @default(cuid())
  userId String
  roleId String
  role   Role   @relation(fields: [roleId], references: [id], on_delete: Cascade)

  @@unique([userId, roleId])
  @@index([userId])
  @@map("user_role")
}
```

注意 Prisma schema 中 `@relation` 的 `on_delete` 写法：用下划线（`on_delete`）而非驼峰，这是 Prisma 5 的属性映射。

## Phase 2：生成 migration
```bash
cd server
npx prisma migrate dev --name add_rbac_tables
```

## Phase 3：seed 默认数据
**新建文件** `server/prisma/seed-rbac.ts`：
```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ROLES = [
  { code: 'admin', name: '管理员', isSystem: true, description: '系统管理员，拥有所有权限' },
  { code: 'member', name: '普通成员', isSystem: true, description: '普通 HR 成员' },
  { code: 'hiring_manager', name: '用人经理', isSystem: false, description: '用人部门经理' },
];

const PERMISSIONS = [
  { code: 'offer:approve', resource: 'offer', action: 'approve', description: '审批 Offer' },
  { code: 'offer:create', resource: 'offer', action: 'create', description: '创建 Offer' },
  { code: 'offer:reject', resource: 'offer', action: 'reject', description: '驳回 Offer' },
  { code: 'candidate:export', resource: 'candidate', action: 'export', description: '导出候选人数据' },
  { code: 'candidate:delete', resource: 'candidate', action: 'delete', description: '删除候选人' },
  { code: 'candidate:restore', resource: 'candidate', action: 'restore', description: '恢复候选人' },
  { code: 'job:create', resource: 'job', action: 'create', description: '创建职位' },
  // ... 按需扩展
];

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }

  // admin 角色绑定所有权限
  const adminRole = await prisma.role.findUnique({ where: { code: 'admin' } });
  const allPerms = await prisma.permission.findMany();
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole!.id, permissionId: perm.id } },
      update: {},
      create: { roleId: adminRole!.id, permissionId: perm.id },
    });
  }

  // member 角色绑定基础权限
  const memberRole = await prisma.role.findUnique({ where: { code: 'member' } });
  const memberPerms = allPerms.filter(p => p.code !== 'offer:approve' && p.code !== 'candidate:restore');
  for (const perm of memberPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: memberRole!.id, permissionId: perm.id } },
      update: {},
      create: { roleId: memberRole!.id, permissionId: perm.id },
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

## Phase 4：新建 RBAC 服务
**新建** `server/src/services/rbac.service.ts`：
```ts
import { redis, getFromCache, setCache } from '../lib/redis';
import prisma from '../lib/prisma';

const CACHE_TTL = 60;
const CACHE_KEY_PREFIX = 'rbac:perms:';

export async function getUserPermissions(userId: string, isAdmin: boolean): Promise<string[]> {
  // admin 拥有所有权限，无需查 DB
  if (isAdmin) return ['*'];

  const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
  const cached = await getFromCache<string[]>(cacheKey);
  if (cached) return cached;

  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  const enabledRoles = userRoles.filter((ur) => ur.role.enabled);
  const perms = new Set<string>();
  for (const ur of enabledRoles) {
    for (const rp of ur.role.rolePermissions) {
      perms.add(rp.permission.code);
    }
  }

  const result = Array.from(perms);
  await setCache(cacheKey, result, CACHE_TTL);
  return result;
}

export async function hasPermission(userId: string, isAdmin: boolean, code: string): Promise<boolean> {
  const perms = await getUserPermissions(userId, isAdmin);
  return perms.includes('*') || perms.includes(code);
}

export async function invalidateUserPermissions(userId: string): Promise<void> {
  await redis.del(`${CACHE_KEY_PREFIX}${userId}`);
}
```

## Phase 5：新增中间件
**新建** `server/src/middleware/permission.ts`：
```ts
import type { Request, Response, NextFunction } from 'express';
import { hasPermission } from '../services/rbac.service';
import { AppError } from './errorHandler';

/**
 * 用法：router.post('/offers/:id/approve', authenticate, requirePermission('offer:approve'), controller.approve)
 */
export function requirePermission(code: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('未认证', 401);
      }
      const allowed = await hasPermission(req.user.userId, req.user.role === 'admin', code);
      if (!allowed) {
        throw new AppError(`没有权限：${code}`, 403);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

## Phase 6：示范迁移（2 个权限）
**只改这 2 个路由**作为示范：

`server/src/routes/offers.ts`：
```ts
import { requirePermission } from '../middleware/permission';
// 把原来的 authorize('admin') 改为：
router.post('/:candidateId/approve', authenticate, requirePermission('offer:approve'), offerController.approveOffer);
```

`server/src/routes/candidates.ts`：
```ts
// 导出接口作为新权限（同时支持 admin 和有权限的 member）
router.get('/export', authenticate, requirePermission('candidate:export'), candidateController.exportCandidates);
```

**注意**：现有 `authorize('admin')` 调用**不要批量替换**，只示范 2 个。

## 禁止事项
- ❌ 不要删除现有的 `User.role` 字段（旧代码还用）
- ❌ 不要批量替换所有 `authorize('admin')` 为 `requirePermission(...)`（会扩散越界）
- ❌ 不要在 `requirePermission` 中改成同步（DB 查询必须异步）
- ❌ 不要修改 `auth.ts` 的 JWT payload（保持兼容）
- ❌ 不要新增独立的权限管理 UI（后续单独做）
- ❌ 不要触碰其他 service

## 必须新增的测试
文件 1：`server/tests/unit/rbac.service.test.ts`
测试用例：
1. admin 用户获取权限返回 `['*']`（无需查 DB）
2. 普通用户有 3 个权限时，DB 查询 1 次 + 缓存命中
3. 普通用户无任何角色时返回 `[]`
4. `hasPermission` 对 admin 永远返回 true
5. `invalidateUserPermissions` 能正确清缓存

文件 2：`server/tests/integration/permission-middleware.test.ts`（supertest）
测试用例：
1. member 用户访问 `POST /api/offers/:id/approve` 返回 403
2. admin 用户访问同样接口返回 200（或业务正常返回）
3. 无 token 访问返回 401

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ `pnpm prisma migrate dev` 成功
3. ✅ 手动测试：现有所有功能照常使用（admin/member 权限判断未被破坏）
4. ✅ seed 数据可重复执行（upsert 而非 create）
5. ✅ `git diff` 涉及文件：
   > v1.1 提醒：下列文件清单是硬约束（不要增减），每个文件内的行数是软目标。
   - schema.prisma（追加 4 个模型）
   - 1 个 migration
   - 1 个新 seed 文件
   - 1 个新 service 文件
   - 1 个新 middleware 文件
   - 2 个 route 文件（清单不变，行数 [软目标 ±50%]）
   - 2 个测试文件

## 回滚预案
```bash
cd server
npx prisma migrate resolve --rolled-back add_rbac_tables
```

## 完成后请输出
1. migration SQL
2. seed-rbac.ts 完整代码
3. 新增的 service / middleware 完整代码
4. 2 个 route 文件的 diff
5. 测试文件
6. **重要**：明确列出哪些旧 `authorize('admin')` 调用没改（留给后续任务）

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[列出每个文件的具体改动]
- 推荐方案预估：[4 模型 + 1 migration + 1 seed + 1 service + 1 middleware + 2 route + 2 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不删 User.role 字段
  - [✅/❌] 不批量替换 authorize('admin')
  - [✅/❌] 不把 requirePermission 改同步
  - [✅/❌] 不改 auth.ts JWT payload
  - [✅/❌] 不新增权限管理 UI
  - [✅/❌] 不触碰其他 service
```

---

<a id="prompt-15a"></a>
## PROMPT-15a：候选人自助门户（DB + Magic Link）

### Cursor 提示词

```markdown
# 任务：候选人自助门户（一）—— DB 模型 + Magic Link 邮件

## Context
- 现状：候选人完全被动，所有操作（上传简历、查进度、接受 Offer）由 HR 代劳
- 目标：候选人收到邮件 → 点击链接 → 进入 portal → 自助操作
- 本提示词**只做后端基础**：DB 模型 + Magic Link 生成 / 校验 / 邮件发送
- 候选人门户的 API 在 PROMPT-15b，前端在 PROMPT-15c

## 设计原则
1. **安全第一**：
   - Magic Link 一次有效（消费后失效）
   - 默认 24 小时过期
   - token 必须足够随机（32 字节）
2. **无密码登录**：候选人 portal 不走传统 JWT，凭 magic token
3. **可追溯**：每次登录、每次操作写 OperationLog
4. **限流**：同一邮箱 1 小时内最多发 3 封邮件

## Phase 1：schema.prisma 新增 2 个模型
```prisma
model CandidatePortalSession {
  id           String   @id @default(cuid())
  candidateId  String
  candidate    Candidate @relation(fields: [candidateId], references: [id], on_delete: Cascade)
  tokenHash    String   @unique  // SHA256(token)，不存明文
  expiresAt    DateTime
  consumedAt   DateTime?  // null = 未消费
  ipAddress    String?
  userAgent    String?

  createdAt    DateTime @default(now())

  @@index([candidateId])
  @@index([expiresAt])
  @@map("candidate_portal_session")
}

model CandidatePortalActivity {
  id           String   @id @default(cuid())
  sessionId    String
  candidateId  String
  action       String   // 'login', 'view_status', 'upload_resume', 'sign_offer'
  detail       Json?

  createdAt    DateTime @default(now())

  @@index([sessionId])
  @@index([candidateId, createdAt])
  @@map("candidate_portal_activity")
}
```

在 `Candidate` 模型追加关系（**只追加，不删**）：
```prisma
portalSessions CandidatePortalSession[]
```

## Phase 2：生成 migration
```bash
cd server
npx prisma migrate dev --name add_candidate_portal
```

## Phase 3：新建 service
**新建** `server/src/services/portal-session.service.ts`：
```ts
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { sendEmail } from './mail.service';
import { AppError } from '../middleware/errorHandler';
import { env } from '../lib/env';

const TOKEN_BYTES = 32;
const TOKEN_TTL_HOURS = 24;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createMagicLink(
  candidateId: string,
  baseUrl: string,
  ipAddress?: string
): Promise<void> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, name: true, email: true },
  });
  if (!candidate) throw new AppError('候选人不存在', 404);
  if (!candidate.email) throw new AppError('候选人无邮箱', 400);

  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600 * 1000);

  await prisma.candidatePortalSession.create({
    data: {
      candidateId,
      tokenHash,
      expiresAt,
      ipAddress,
    },
  });

  const link = `${baseUrl}/portal/login?token=${rawToken}`;

  await sendEmail({
    to: candidate.email,
    subject: `【招聘系统】候选人自助门户登录链接`,
    html: `
      <p>${candidate.name} 您好，</p>
      <p>请点击以下链接登录候选人自助门户（24 小时内有效）：</p>
      <p><a href="${link}">${link}</a></p>
      <p>如非本人操作，请忽略此邮件。</p>
    `,
  });
}

/**
 * 消费 token，返回 candidateId 或抛错
 */
export async function consumeMagicLink(
  rawToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ sessionId: string; candidateId: string }> {
  const tokenHash = hashToken(rawToken);
  const session = await prisma.candidatePortalSession.findUnique({
    where: { tokenHash },
  });
  if (!session) throw new AppError('链接无效', 401);
  if (session.consumedAt) throw new AppError('链接已被使用', 401);
  if (session.expiresAt < new Date()) throw new AppError('链接已过期', 401);

  // 标记消费
  await prisma.candidatePortalSession.update({
    where: { id: session.id },
    data: {
      consumedAt: new Date(),
      ipAddress: ipAddress || session.ipAddress,
      userAgent: userAgent || session.userAgent,
    },
  });

  // 记录活动
  await prisma.candidatePortalActivity.create({
    data: {
      sessionId: session.id,
      candidateId: session.candidateId,
      action: 'login',
      detail: { ipAddress, userAgent },
    },
  });

  return { sessionId: session.id, candidateId: session.candidateId };
}
```

## Phase 4：HR 端触发接口（admin/HR 操作）
**追加**到 `server/src/routes/candidates.ts`（注意权限）：
```ts
import { createMagicLink } from '../services/portal-session.service';

router.post(
  '/:id/send-portal-link',
  authenticate,
  authorize('admin'),  // 仅 admin 可代发
  asyncHandler(async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await createMagicLink(req.params.id, baseUrl, req.ip);
    res.json({ success: true, message: '登录链接已发送至候选人邮箱' });
  })
);
```

## Phase 5：限流
**新建** `server/src/middleware/rate-limit.ts` 追加（或复用现有）：
```ts
/** 候选人 portal 邮件发送：同一候选人 1 小时内最多 3 次 */
export const portalLinkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => `portal-link:${req.params.id}`,
  // ... 其他配置
});
```

## 禁止事项
- ❌ 不要把 token 存明文（必须 hash）
- ❌ 不要让 magic link 可重复使用（消费后立即失效）
- ❌ 不要在邮件中暴露候选人手机号等额外 PII（只发链接）
- ❌ 不要让 token TTL 长于 48 小时
- ❌ 不要触碰现有 mail.service（除非 mail.service 还不存在 sendEmail，需先确认）
- ❌ 不要做候选人门户的 API（PROMPT-15b 范围）
- ❌ 不要做候选人门户的前端（PROMPT-15c 范围）

## 必须新增的测试
文件：`server/tests/unit/portal-session.service.test.ts`
测试用例：
1. `createMagicLink` 生成 token，DB 存 hash 而非明文
2. `consumeMagicLink` 第一次调用成功，第二次抛 401（已消费）
3. `consumeMagicLink` token 过期时抛 401
4. `consumeMagicLink` token 不存在时抛 401
5. `consumeMagicLink` 在活动日志中写入 `login` action
6. `sendEmail` 被调用 1 次，邮件含 magic link URL

邮件发送用 mock（参考 `mail.service.ts` 现有 mock 风格）。

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ `pnpm prisma migrate dev` 成功
3. ✅ 手动测试：HR 调用 `POST /api/candidates/:id/send-portal-link` 后，候选人邮箱收到邮件，链接形如 `https://xxx/portal/login?token=xxxxx`
4. ✅ 用相同 token 第二次登录返回 401
5. ✅ 等 24 小时（或人为改 expiresAt）后用 token 登录返回 401
6. ✅ `git diff` 涉及（**文件清单严格不变**，行数 [软目标 ±50%]）：
   - schema.prisma（追加）
   - 1 个新 migration
   - 1 个新 service
   - 1 个 route 文件（追加）
   - 1 个测试文件

## 回滚预案
```bash
cd server
npx prisma migrate resolve --rolled-back add_candidate_portal
```

## 完成后请输出
1. migration SQL
2. `portal-session.service.ts` 完整代码
3. 邮件样例（截图或 HTML 源）
4. 测试文件
```

---

<a id="prompt-15b"></a>
## PROMPT-15b：候选人门户公开 API

### Cursor 提示词

```markdown
# 任务：候选人自助门户（二）—— 公开 API

## Context
- PROMPT-15a 已完成：DB 模型 + Magic Link 邮件已就位
- 当前任务：候选人点击邮件链接后，能调用以下 API：
  1. `POST /api/portal/auth/verify` — 验证 token，返回候选人基本信息
  2. `GET /api/portal/me` — 获取候选人当前信息（不含敏感字段）
  3. `GET /api/portal/me/stage-history` — 查看流程进度
  4. `POST /api/portal/me/upload-resume` — 上传新简历
  5. `POST /api/portal/me/accept-offer` — 接受 Offer
  6. `GET /api/portal/me/communications` — 查看沟通记录
- 后续 PROMPT-15c 做前端页面

## 设计原则
1. **独立路由前缀**：所有 portal API 走 `/api/portal/*`，**不走**全局 JWT `authenticate` 中间件
2. **独立认证中间件**：`portalAuth` 中间件校验 magic token sessionId（从 header 读取）
3. **不可越权**：候选人只能访问自己的数据，绝对隔离
4. **响应裁剪**：候选人看不到薪资明细、内部备注、淘汰原因（个保法 + 体验）
5. **活动日志**：所有操作写 `CandidatePortalActivity`

## Phase 1：新建认证中间件
**新建** `server/src/middleware/portal-auth.ts`：
```ts
import type { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AppError } from './errorHandler';

declare global {
  namespace Express {
    interface Request {
      portalSession?: {
        sessionId: string;
        candidateId: string;
      };
    }
  }
}

/**
 * 候选人 portal 专用认证：读取 header `X-Portal-Token: <sessionId>`
 * 不依赖 JWT
 */
export async function portalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = req.header('X-Portal-Token');
    if (!sessionId) throw new AppError('缺少 portal token', 401);

    const session = await prisma.candidatePortalSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new AppError('无效的 portal session', 401);
    if (!session.consumedAt) throw new AppError('session 未完成登录', 401);
    if (session.expiresAt < new Date()) throw new AppError('session 已过期', 401);

    req.portalSession = {
      sessionId: session.id,
      candidateId: session.candidateId,
    };
    next();
  } catch (err) {
    next(err);
  }
}
```

## Phase 2：新建 portal service
**新建** `server/src/services/portal.service.ts`：
- `getCandidateSelfView(candidateId)`：返回脱敏后的候选人信息（无手机、无邮箱、无 referrer、无内部备注）
- `getCandidateStageHistory(candidateId)`：返回公开的阶段时间线（不含 rejectReason）
- `getCandidateCommunications(candidateId)`：返回沟通记录（不含内部备注）
- `uploadResume(candidateId, file)`：复用现有上传逻辑
- `acceptOffer(candidateId)`：调用 `offerService.updateOfferResult`

## Phase 3：新建 controller
**新建** `server/src/controllers/portal.controller.ts`，含 6 个方法对应 6 个 API

## Phase 4：新建路由
**新建** `server/src/routes/portal.ts`：
```ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { portalAuth } from '../middleware/portal-auth';
import { verifyMagicLink, ... } from '../controllers/portal.controller';

const router = Router();

// 公开端点（不需要 portal session）
router.post('/auth/verify', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), verifyMagicLink);

// 受保护端点
router.use(portalAuth);
router.get('/me', ...);
router.get('/me/stage-history', ...);
// ... 其他
```

**修改** `server/src/routes/index.ts`，注册 portal 路由：
```ts
import portalRoutes from './portal';
router.use('/portal', portalRoutes);
```

## Phase 5：响应裁剪（关键！）
**候选人 portal 看到的字段** vs **HR 看到的字段**：

| 字段 | HR 端 | Portal 端 |
|------|-------|----------|
| name | ✅ | ✅ |
| email | ✅ | ❌（自己填的，无需再看） |
| phone | ✅ | ❌ |
| gender | ✅ | ✅（候选人自己填） |
| age | ✅ | ✅ |
| education | ✅ | ✅ |
| skills | ✅ | ✅ |
| resumeUrl | ✅（HR 视角） | ✅（候选人看到下载自己简历的链接） |
| source | ✅ | ❌（内部信息） |
| referrer | ✅ | ❌（内部信息） |
| intro | ✅ | ❌（内部备注） |
| stageRecords.rejectReason | ✅ | ❌ |
| communications.note | ✅ | ❌（仅 type + content） |

**实现方式**：在 portal service 层做字段过滤，不要直接复用 HR 端 service。

## 禁止事项
- ❌ 不要让候选人 portal 调用 HR 端 service 后返回（必须 portal service 单独裁剪）
- ❌ 不要在 portal 端返回候选人内部备注、淘汰原因、薪资明细
- ❌ 不要让 portal token 长期有效（沿用 PROMPT-15a 的 24 小时策略）
- ❌ 不要在 portal 路由上挂全局 `authenticate` 中间件
- ❌ 不要让 portal API 暴露其他候选人的任何信息
- ❌ 不要触碰 HR 端的现有 controller / service
- ❌ 不要做 portal 前端（PROMPT-15c 范围）

## 必须新增的测试
文件 1：`server/tests/unit/portal.service.test.ts`（10+ 用例）
1. `getCandidateSelfView` 不含 email / phone / source / referrer / intro
2. `getCandidateSelfView` 不含 `stageRecords[].rejectReason`
3. `getCandidateStageHistory` 仅返回 stage + status + enteredAt，不含 rejectReason
4. `getCandidateCommunications` 仅返回 type + content + createdAt，不含 note
5. `acceptOffer` 仅允许 result 在 [accepted, rejected]（不允许 draft 等内部状态）
6. `acceptOffer` 越权测试：候选人 A 不能调用候选人 B 的 offer

文件 2：`server/tests/integration/portal-api.test.ts`（supertest）
1. 无 token 调用受保护接口返回 401
2. 有效 token 调用 `/me` 返回脱敏字段
3. `/me/stage-history` 不含 rejectReason
4. `accept-offer` 后，offer.result = accepted

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ 手动测试：用真 token 调用 portal API，确认响应中**绝对不含** email / phone / source / referrer / rejectReason
3. ✅ 候选人 A 的 token 不能查候选人 B 的任何数据
4. ✅ portal API 不影响 HR 端 API（用 postman 并行测两组）
5. ✅ `git diff` 涉及：1 个新 middleware + 1 个新 service + 1 个新 controller + 1 个新 route + 1 处 routes/index.ts 追加 + 2 个测试文件

## 完成后请输出
1. portal-auth.ts 完整代码
2. portal.service.ts 关键方法（getCandidateSelfView + acceptOffer）
3. portal.controller.ts 6 个方法
4. portal.ts 路由完整配置
5. 测试文件
6. 手动验证截图：候选人 portal 调用 `/me` 的响应 JSON

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[4 新文件行数 + routes/index.ts diff 行数]
- 推荐方案预估：[1 middleware + 1 service + 1 controller + 1 route + 1 处 routes/index.ts 追加 + 2 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不让候选人 portal 调 HR 端 service
  - [✅/❌] 不在 portal 端返回内部备注/淘汰原因/薪资
  - [✅/❌] 不让 portal token 长期有效
  - [✅/❌] 不在 portal 路由挂全局 authenticate
  - [✅/❌] 不让 portal API 暴露其他候选人
  - [✅/❌] 不触碰 HR 端 controller / service
```

---

<a id="prompt-15c"></a>
## PROMPT-15c：候选人门户前端 Portal 页面

### Cursor 提示词

```markdown
# 任务：候选人自助门户（三）—— 前端 Portal 页面

## Context
- PROMPT-15a + PROMPT-15b 已完成：DB + 后端 API 就位
- 现有前端是 PC 端 Vue 3 SPA（Element Plus），端口 5173
- 新增 portal 是**独立的前端子应用**：轻量、独立、无侧边栏、适合候选人体验
- 设计原则：候选人可能不熟悉 HR 系统，UI 要极简、清晰、有引导

## 设计原则
1. **独立子项目**：在 `client/` 下新建 `client/src/portal/`，与现有业务页面平级但**不冲突**
2. **极简 UI**：用 Element Plus 组件但**减少密度**，避免侧边栏、表格等复杂组件
3. **关键路径**：
   - 入口：候选人点邮件链接 → `/portal/login?token=xxx` → 跳转 `/portal/dashboard`
   - 流程：登录 → 看进度 → 接受 Offer → 退出
4. **路由独立**：portal 路由全部 `/portal/*` 前缀，与 HR 端 `/dashboard` 等不冲突
5. **样式隔离**：portal 用独立 SCSS 变量，避免污染

## Phase 1：新建 portal 路由模块
**新建** `client/src/portal/router/index.ts`：
```ts
import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/portal/login', component: () => import('./views/Login.vue'), meta: { public: true } },
  { path: '/portal/dashboard', component: () => import('./views/Dashboard.vue') },
  { path: '/portal/stage-history', component: () => import('./views/StageHistory.vue') },
  { path: '/portal/offer', component: () => import('./views/Offer.vue') },
  { path: '/portal/communications', component: () => import('./views/Communications.vue') },
  { path: '/portal/', redirect: '/portal/dashboard' },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
```

## Phase 2：portal 认证 store
**新建** `client/src/portal/stores/session.ts`（用 Pinia）：
- state: `sessionId: string | null`、`candidate: PartialCandidate | null`
- actions: `verifyToken(token)` / `loadProfile()` / `logout()`

**核心逻辑**：
```ts
async function verifyToken(token: string) {
  const res = await portalApi.verifyMagicLink(token);
  sessionId.value = res.data.sessionId;
  localStorage.setItem('portal_session', sessionId.value);
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// 注入 portal token
api.interceptors.request.use((config) => {
  const sid = sessionId.value || localStorage.getItem('portal_session');
  if (sid) config.headers['X-Portal-Token'] = sid;
  return config;
});
```

## Phase 3：5 个页面
| 路径 | 组件 | 功能 |
|------|------|------|
| `/portal/login` | `Login.vue` | 从 URL 取 `token`，调 verify，跳 dashboard |
| `/portal/dashboard` | `Dashboard.vue` | 展示欢迎语 + 当前阶段 + 快捷入口 |
| `/portal/stage-history` | `StageHistory.vue` | 时间线展示各阶段 |
| `/portal/offer` | `Offer.vue` | Offer 详情 + "接受 Offer" 按钮 |
| `/portal/communications` | `Communications.vue` | 沟通记录列表 |

## Phase 4：portal 入口（HR 端）
**修改** `client/src/views/candidates/CandidateDetail.vue`：
- 加一个按钮：「发送候选人自助门户链接」
- 点击调用 `POST /api/candidates/:id/send-portal-link`（已在 PROMPT-15a 加）
- 成功后 `ElMessage.success('链接已发送至候选人邮箱')`

## Phase 5：登录后 token 注入
所有 portal 页面的 API 调用统一通过 `client/src/portal/api/index.ts`，自动注入 `X-Portal-Token` header。

## Phase 6：UI 风格
- 顶部：简单的 banner（公司 logo + 候选人姓名 + 退出）
- 主体：单一卡片容器，最大宽度 800px，居中
- 颜色：用 Element Plus 主色，但降低饱和度
- 字体：稍大（base 16px），适合不熟悉系统的候选人

## 禁止事项
- ❌ 不要在 portal 页面集成现有 HR 端的导航 / 侧边栏
- ❌ 不要在 portal 页面调用 HR 端 API
- ❌ 不要在 portal 复用 HR 端 store（auth / user / dictionary 等）
- ❌ 不要在 portal 引入额外的 UI 库（用 Element Plus 即可）
- ❌ 不要在 portal 显示候选人看不到的字段（即使后端返回了，前端也要过滤显示）
- ❌ 不要触碰 HR 端现有路由 / 组件
- ❌ 不要做"忘记密码"流程（portal 不支持密码登录）

## 必须新增的测试
文件：`client/tests/portal/session.test.ts`（vitest + happy-dom）
测试用例：
1. `verifyToken` 成功后 sessionId 写入 localStorage
2. `logout` 后 sessionId 被清空
3. API 拦截器在有 sessionId 时注入 `X-Portal-Token` header
4. 无 sessionId 时不注入 header（也不报错）

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ 手动测试：候选人点邮件链接 → 进入 portal → 看进度 → 接受 Offer → 退出
3. ✅ portal 页面**不显示**任何 HR 端导航 / 侧边栏
4. ✅ portal 的 API 调用**自动注入** X-Portal-Token
5. ✅ 候选人退出后，再次访问 `/portal/dashboard` 应跳转登录页
6. ✅ `git diff` 涉及：1 个新 portal 目录（含 6 个 vue 文件 + 1 个 router + 1 个 store + 1 个 api）+ CandidateDetail.vue 追加 1 个按钮 + 1 个测试文件

## 完成后请输出
1. 目录结构（`tree client/src/portal/ -L 2`）
2. 关键文件：session store + 路由
3. Login.vue + Dashboard.vue 完整代码
4. 测试文件
5. 手动验证截图（候选人视角的 dashboard）

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[portal/ 目录新增文件数 + CandidateDetail.vue diff]
- 推荐方案预估：[1 目录（含 6 vue + 1 router + 1 store + 1 api）+ CandidateDetail 1 按钮 + 1 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不在 portal 集成 HR 端导航/侧边栏
  - [✅/❌] 不在 portal 调 HR 端 API
  - [✅/❌] 不复用 HR 端 store
  - [✅/❌] 不引入额外 UI 库
  - [✅/❌] 不显示候选人看不到的字段
  - [✅/❌] 不触碰 HR 端路由
```

---

<a id="prompt-16a"></a>
## PROMPT-16a：智能问答 Chatbot - 基础架构 + SQL Agent

### Cursor 提示词

```markdown
# 任务：智能问答 Chatbot（一）—— 基础架构 + 自然语言→统计查询

## Context
- 现状：HR 看数据需要点多个菜单 / 填筛选条件
- 目标：HR 输入"上个月招了几个人？"→ 自动返回答案
- 本提示词**只做后端**：自然语言 → SQL → 执行 → 自然语言答复
- 前端聊天 UI 在 PROMPT-16b

## 设计原则
1. **读 only**：Chatbot 只支持查询（SELECT），绝对不允许 UPDATE / DELETE
2. **白名单表**：只允许查询 `candidate` / `offer` / `job` / `stage_record` / `user`
3. **行数限制**：单查询最多返回 1000 行
4. **超时控制**：单查询 5 秒超时
5. **用量监控**：每次 LLM 调用记录 token 用量、成本
6. **优雅降级**：LLM 不可用时返回"暂时无法回答"

## Phase 1：新建 ChatSession 模型
**追加**到 `schema.prisma`：
```prisma
model ChatSession {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], on_delete: Cascade)
  title       String?  // 首条消息自动生成
  messages    ChatMessage[]
  totalTokens Int      @default(0)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId, updatedAt])
  @@map("chat_session")
}

model ChatMessage {
  id          String   @id @default(cuid())
  sessionId   String
  session     ChatSession @relation(fields: [sessionId], references: [id], on_delete: Cascade)
  role        String   // 'user', 'assistant', 'system'
  content     String   @db.Text
  // 助手消息额外字段
  sqlQuery    String?  @db.Text
  sqlResult   Json?
  tokenUsage  Json?    // {prompt, completion, total}

  createdAt   DateTime @default(now())

  @@index([sessionId, createdAt])
  @@map("chat_message")
}
```

User 模型追加反向关系（**只追加**）。

```bash
cd server
npx prisma migrate dev --name add_chat_tables
```

## Phase 2：新建 chatbot service
**新建** `server/src/services/chatbot.service.ts`：

核心流程：
```
用户问题
  ↓
[1] LLM 生成 SQL（使用 schema 白名单 + few-shot examples）
  ↓
[2] SQL 安全检查（仅 SELECT、仅白名单表、行数限制）
  ↓
[3] 执行 SQL（pg 中执行，记录耗时）
  ↓
[4] LLM 把 SQL 结果转成自然语言答复
  ↓
[5] 写 ChatMessage + 更新 ChatSession.totalTokens
  ↓
返回 { answer, sql, rawData, tokenUsage }
```

骨架：
```ts
import { callLLM } from '../lib/llm';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

const ALLOWED_TABLES = ['candidate', 'offer', 'job', 'stage_record', '"user"'];
const MAX_RESULT_ROWS = 1000;
const QUERY_TIMEOUT_MS = 5000;

export interface ChatRequest {
  question: string;
  sessionId?: string;
}

export interface ChatResponse {
  sessionId: string;
  messageId: string;
  answer: string;
  sql?: string;
  rawData?: unknown[];
  tokenUsage: { prompt: number; completion: number; total: number };
}

export async function askChatbot(userId: string, req: ChatRequest): Promise<ChatResponse> {
  // 1. 创建或获取 session
  const session = req.sessionId
    ? await prisma.chatSession.findUnique({ where: { id: req.sessionId } })
    : await prisma.chatSession.create({ data: { userId, title: req.question.slice(0, 30) } });
  if (!session || session.userId !== userId) {
    throw new AppError('session 无效', 403);
  }

  // 2. 保存用户消息
  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: 'user', content: req.question },
  });

  // 3. 生成 SQL
  const sqlPrompt = buildSqlPrompt(req.question);
  const sqlResult = await callLLM(sqlPrompt.prompt, sqlPrompt.system);
  const sql = extractSql(sqlResult.content);

  // 4. 安全检查
  validateSql(sql);  // 仅 SELECT、仅白名单表

  // 5. 执行
  const rawData = await executeSqlWithTimeout(sql, QUERY_TIMEOUT_MS);
  const truncated = rawData.slice(0, MAX_RESULT_ROWS);

  // 6. 生成自然语言答复
  const answerPrompt = buildAnswerPrompt(req.question, sql, truncated);
  const answerResult = await callLLM(answerPrompt.prompt, answerPrompt.system);

  // 7. 保存助手消息
  const assistantMsg = await prisma.chatMessage.create({
    data: {
      sessionId: session.id,
      role: 'assistant',
      content: answerResult.content,
      sqlQuery: sql,
      sqlResult: truncated,
      tokenUsage: {
        prompt: sqlResult.usage?.promptTokens + answerResult.usage?.promptTokens,
        completion: sqlResult.usage?.completionTokens + answerResult.usage?.completionTokens,
        total: sqlResult.usage?.totalTokens + answerResult.usage?.totalTokens,
      },
    },
  });

  // 8. 更新 session
  await prisma.chatSession.update({
    where: { id: session.id },
    data: {
      totalTokens: { increment: assistantMsg.tokenUsage?.total || 0 },
      updatedAt: new Date(),
    },
  });

  return {
    sessionId: session.id,
    messageId: assistantMsg.id,
    answer: answerResult.content,
    sql,
    rawData: truncated,
    tokenUsage: assistantMsg.tokenUsage as any,
  };
}
```

需要实现的关键函数：
- `buildSqlPrompt(question)` — few-shot prompt with schema
- `extractSql(llmOutput)` — 提取 SQL（去除 markdown 标记）
- `validateSql(sql)` — 拒绝非 SELECT / 含 INSERT/UPDATE/DELETE / 含白名单外表
- `executeSqlWithTimeout(sql, ms)` — 用 `prisma.$queryRawUnsafe` + Promise.race 超时

## Phase 3：新增 controller + route
**新建** `server/src/controllers/chatbot.controller.ts`（3 个方法）：
- `POST /api/chatbot/ask` — 提问
- `GET /api/chatbot/sessions` — 获取会话列表
- `GET /api/chatbot/sessions/:id/messages` — 获取某会话消息

**新建** `server/src/routes/chatbot.ts`，挂到 `/api/chatbot`。

## Phase 4：限流 + 用量
- 限流：单用户 1 分钟最多 10 次提问
- 用量：累计 `totalTokens`，超出阈值（如 100k / 天）返回 429

## Phase 5：SQL Agent 安全核心
`validateSql` 必须严格：
```ts
function validateSql(sql: string): void {
  const normalized = sql.trim().toLowerCase();
  if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
    throw new AppError('仅支持 SELECT 查询', 400);
  }
  // 拒绝危险关键字
  const dangerous = ['insert', 'update', 'delete', 'drop', 'alter', 'truncate', 'grant', 'revoke'];
  for (const kw of dangerous) {
    if (new RegExp(`\\b${kw}\\b`).test(normalized)) {
      throw new AppError(`禁止 ${kw.toUpperCase()} 操作`, 400);
    }
  }
  // 仅允许白名单表
  for (const tableMatch of normalized.matchAll(/(?:from|join)\s+([a-z_"]+)/gi)) {
    const table = tableMatch[1].replace(/"/g, '').toLowerCase();
    if (!ALLOWED_TABLES.map(t => t.replace(/"/g, '')).includes(table)) {
      throw new AppError(`禁止访问表：${table}`, 400);
    }
  }
}
```

## 禁止事项
- ❌ 不要让 LLM 生成的 SQL 直接执行（必须 validateSql）
- ❌ 不要让 chatbot 写入业务表（仅允许 ChatSession / ChatMessage）
- ❌ 不要在 chatbot 中暴露候选人手机/邮箱（即使 SQL 返回了，LLM 答复时也必须过滤）
- ❌ 不要触碰现有 LLM 调用方（resume-parser / ai-matcher）
- ❌ 不要做 chatbot 前端（PROMPT-16b 范围）
- ❌ 不要超过 1000 行返回（性能 + token）

## 必须新增的测试
文件：`server/tests/unit/chatbot.service.test.ts`
测试用例：
1. `validateSql` 通过正常 SELECT
2. `validateSql` 拒绝 INSERT / UPDATE / DELETE
3. `validateSql` 拒绝非白名单表（`SELECT * FROM secret_table`）
4. `validateSql` 拒绝 `DROP TABLE`
5. `extractSql` 能去除 markdown ```sql 标记
6. 超时 SQL 在 5 秒后被拒
7. 用量累计：连续 3 次提问后 `totalTokens` 增加
8. 用户越权：用户 A 不能读取用户 B 的 session

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ `POST /api/chatbot/ask` 调用 LLM 并返回结果（用真实 LLM 测试 1 次）
3. ✅ 故意问"删除所有候选人"，SQL 应被 validateSql 拦截
4. ✅ 故意问"所有候选人的手机号"，LLM 应回答"抱歉，无法查询敏感信息"（需在 prompt 中明确）
5. ✅ 单次查询响应时间 < 10 秒
6. ✅ `git diff` 涉及：schema 追加 + 1 个 migration + 1 个新 service + 1 个新 controller + 1 个新 route + 1 处 routes/index.ts 追加 + 1 个测试文件

## 完成后请输出
1. migration SQL
2. chatbot.service.ts 完整代码
3. validateSql 单元测试输出
4. 真实问答样例（"上个月招了几个人"）

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[migration SQL + chatbot.service.ts 行数 + 1 controller + 1 route + 1 处 routes/index.ts 追加 + 1 测试]
- 推荐方案预估：[1 schema 追加 + 1 migration + 1 service + 1 controller + 1 route + 1 处追加 + 1 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不让 LLM 生成的 SQL 直接执行
  - [✅/❌] 不让 chatbot 写入业务表
  - [✅/❌] 不在 chatbot 暴露候选人手机/邮箱
  - [✅/❌] 不触碰现有 LLM 调用方
  - [✅/❌] 不做 chatbot 前端
  - [✅/❌] 不超过 1000 行返回
```

---

<a id="prompt-16b"></a>
## PROMPT-16b：Chatbot - LLM 集成 + 前端

### Cursor 提示词

```markdown
# 任务：智能问答 Chatbot（二）—— 前端聊天界面 + LLM 流式输出

## Context
- PROMPT-16a 已完成：后端 chatbot service 就位
- 当前任务：
  1. 前端聊天 UI（PC 端 + 飞书 H5）
  2. 流式响应（SSE）
  3. 用量提示 + 限流提示

## 设计原则
1. **主流聊天 UI 风格**：左侧会话列表 + 右侧消息流
2. **流式输出**：LLM 生成的内容用 SSE 实时显示（不等全部生成完）
3. **代码块高亮**：SQL 自动检测 + 语法高亮
4. **移动端兼容**：飞书 H5 也要能用
5. **错误友好**：LLM 失败时显示明确错误，不静默

## Phase 1：后端 SSE 端点
**追加**到 `server/src/routes/chatbot.ts`：
```ts
router.post('/ask/stream', authenticate, async (req, res) => {
  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const { question, sessionId } = req.body;
  // ... 复用 askChatbot 但改为流式
  // 每个阶段发送 SSE 事件
  // 'sql_generated': { sql }
  // 'sql_executed': { rowCount, sample }
  // 'answer_chunk': { text }
  // 'done': { messageId, tokenUsage }
});
```

## Phase 2：前端 chatbot store
**新建** `client/src/stores/chatbot.ts`（Pinia）：
- state: `sessions`, `currentSession`, `streamingContent`, `isStreaming`
- actions: `createSession()`, `sendMessage(question, sessionId)`, `abortStream()`

```ts
async function sendMessage(question: string, sessionId?: string) {
  isStreaming.value = true;
  streamingContent.value = '';

  const eventSource = new EventSource(
    `/api/chatbot/ask/stream?question=${encodeURIComponent(question)}&sessionId=${sessionId || ''}`,
    { withCredentials: true }  // 带 JWT
  );

  eventSource.addEventListener('sql_generated', (e) => {
    // 显示 SQL
  });
  eventSource.addEventListener('answer_chunk', (e) => {
    streamingContent.value += e.data;
  });
  eventSource.addEventListener('done', (e) => {
    isStreaming.value = false;
    eventSource.close();
    // 刷新会话列表
  });
  eventSource.addEventListener('error', (e) => {
    ElMessage.error('LLM 调用失败');
    isStreaming.value = false;
    eventSource.close();
  });
}
```

## Phase 3：聊天 UI 页面
**新建** `client/src/views/chatbot/index.vue`（PC 端）：
- 左侧：会话列表 + "新建对话"按钮
- 右侧：消息流 + 输入框（自动 resize textarea）
- SQL 高亮：用 prismjs 或 highlight.js
- 用户消息右对齐气泡，助手消息左对齐

## Phase 4：移动端兼容
**新建** `mobile/src/views/chatbot/index.vue`：
- 简化版：单列（无会话列表），仅显示当前会话
- 飞书环境：用 `tt.setNavigationBarTitle` 设标题

## Phase 5：限流 + 错误提示
- 单用户 1 分钟最多 10 次（后端 + 前端双重校验）
- Token 用量超额：显示"今日用量已达上限"
- LLM 不可用：显示"智能助手暂时不可用"

## 禁止事项
- ❌ 不要用 WebSocket（增加复杂度，SSE 够用）
- ❌ 不要在 chatbot 页面显示候选人手机/邮箱等敏感信息（即使 LLM 返回了，也要 redact）
- ❌ 不要让未登录用户访问 chatbot
- ❌ 不要在前端缓存历史会话超过 50 条（防止 localStorage 爆炸）
- ❌ 不要修改 PROMPT-16a 的后端 service（只追加 SSE 端点）
- ❌ 不要在 chatbot 页面引入新的 UI 库

## 必须新增的测试
文件 1：`client/tests/stores/chatbot.test.ts`
1. `sendMessage` 启动后 `isStreaming.value = true`
2. 收到 `done` 事件后 `isStreaming.value = false`
3. 收到 `error` 事件后显示错误

文件 2：`e2e/tests/chatbot.spec.ts`（Playwright）
1. 用户打开 chatbot 页面
2. 输入"本月招了几个人？"并发送
3. 等待响应（最长 30 秒）
4. 断言页面有助手消息气泡

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ 手动测试：浏览器打开 chatbot 页面，提问后看到流式输出（不是一次性显示）
3. ✅ SQL 自动高亮（语法高亮库生效）
4. ✅ 移动端 chatbot 页面在飞书 H5 内可用
5. ✅ `git diff` 涉及：
   - chatbot.ts 后端 route 追加
   - client/src/stores/chatbot.ts 新增
   - client/src/views/chatbot/index.vue 新增
   - mobile/src/views/chatbot/index.vue 新增
   - 2 个测试文件

## 完成后请输出
1. 流式响应截图（打字机效果）
2. SQL 高亮截图
3. 测试输出
4. **重要**：评估 LLM 调用成本（如 1000 次问答 ≈ X 元），给团队决策参考
```

---

<a id="prompt-17"></a>
## PROMPT-17：飞书日历集成

### Cursor 提示词

```markdown
# 任务：飞书日历集成（读取面试官空闲时段）

## Context
- 现状：`interview-scheduler.service.ts:116-131` 仅做应用内的"面试冲突"检测
- 痛点：HR 不知道面试官外部日程，可能排了冲突面试
- 目标：HR 安排面试时，能看到面试官飞书日历的忙/闲
- 本提示词只做**读取飞书日历空闲时段**，不做写入（避免误操作）

## 设计原则
1. **OAuth 2.0 一次性授权**：每个面试官首次使用时授权一次
2. **token 加密存储**：refresh_token 用 AES-256-GCM 加密落库
3. **缓存空闲时段**：5 分钟 TTL（避免频繁调飞书 API）
4. **降级友好**：用户未授权飞书时，UI 显示"未连接飞书日历"，不阻塞安排面试
5. **范围最小**：只申请 `calendar:calendar:readonly` 权限，不申请写权限

## Phase 1：新建 FeishuCalendarBinding 模型
**追加**到 `schema.prisma`：
```prisma
model FeishuCalendarBinding {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id], on_delete: Cascade)
  feishuUserId    String   // 飞书 user_id（open_id 或 union_id）
  accessToken     String   @db.Text  // 加密
  refreshToken    String   @db.Text  // 加密
  expiresAt       DateTime
  scope           String   // 'calendar:calendar:readonly'
  enabled         Boolean  @default(true)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("feishu_calendar_binding")
}
```

```bash
cd server
npx prisma migrate dev --name add_feishu_calendar_binding
```

## Phase 2：token 加密工具
**新建** `server/src/lib/crypto.ts`：
```ts
import crypto from 'crypto';
import { env } from './env';

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(env.FEISHU_TOKEN_ENCRYPTION_KEY, 'hex');  // 32 字节

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(cipherText: string): string {
  const buf = Buffer.from(cipherText, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
```

**修改** `server/src/lib/env.ts` 追加：
```ts
FEISHU_TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'FEISHU_TOKEN_ENCRYPTION_KEY 必须为 64 字符 hex（32 字节）'),
```

## Phase 3：飞书日历 API 封装
**新建** `server/src/lib/feishu-calendar.ts`：
- `getUserCalendarBinding(userId)` — 查 binding
- `refreshAccessToken(binding)` — 用 refresh_token 换新 access_token
- `getFreeBusy(userId, startTime, endTime)` — 调飞书 calendar.v4.freebusy.list

骨架：
```ts
const FEISHU_API = 'https://open.feishu.cn/open-apis';

export async function getFreeBusy(userId: string, start: Date, end: Date): Promise<Array<{ start: Date; end: Date }>> {
  const binding = await prisma.feishuCalendarBinding.findUnique({
    where: { userId, enabled: true },
  });
  if (!binding) return [];

  let accessToken = decrypt(binding.accessToken);
  if (binding.expiresAt < new Date()) {
    // refresh
    const refreshed = await refreshFeishuToken(binding);
    accessToken = refreshed.accessToken;
  }

  const res = await fetch(`${FEISHU_API}/calendar/v4/freebusy/list?user_id=${encodeURIComponent(binding.feishuUserId)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      time_min: start.toISOString(),
      time_max: end.toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  });

  const data = await res.json();
  if (data.code !== 0) throw new Error(`飞书日历失败: ${data.msg}`);

  return data.data.busy_times.map((b: any) => ({
    start: new Date(b.start_time),
    end: new Date(b.end_time),
  }));
}
```

## Phase 4：OAuth 授权端点
**新建** `server/src/routes/feishu-calendar.ts`：
- `GET /api/feishu-calendar/authorize` — 返回飞书 OAuth URL
- `GET /api/feishu-calendar/callback` — 接收 code，换 token，存 binding
- `GET /api/feishu-calendar/status` — 当前用户绑定状态
- `DELETE /api/feishu-calendar/binding` — 解除绑定

## Phase 5：集成到面试安排
**修改** `server/src/services/interview-scheduler.service.ts`：

`createInterview` 之前增加步骤：
```ts
async function checkFeishuConflicts(
  interviewerIds: string[],
  scheduledAt: Date,
  duration: number
): Promise<string[]> {
  // 仅 admin 开启时检查（避免增加接口延迟）
  if (process.env.FEISHU_CALENDAR_CHECK_ENABLED !== 'true') return [];

  const endTime = new Date(scheduledAt.getTime() + duration * 60000);
  const conflicting: string[] = [];

  for (const interviewerId of interviewerIds) {
    const busyTimes = await getFreeBusy(interviewerId, scheduledAt, endTime);
    const hasConflict = busyTimes.some(b =>
      b.start < endTime && b.end > scheduledAt
    );
    if (hasConflict) {
      const user = await prisma.user.findUnique({
        where: { id: interviewerId },
        select: { name: true },
      });
      conflicting.push(user?.name || interviewerId);
    }
  }
  return conflicting;
}
```

`createInterview` 调用前增加警告（不阻塞，因为可能有未同步的外部事件）：
```ts
const conflicts = await checkFeishuConflicts(data.interviewers, scheduledAt, duration);
if (conflicts.length > 0) {
  // 写入 notes，提示 HR
  data.notes = `${data.notes || ''}\n[飞书日历冲突提示] ${conflicts.join('、')} 在该时段有日程，请确认。`.trim();
}
```

## 禁止事项
- ❌ 不要让 chatbot / 飞书日历调用写接口（避免误操作）
- ❌ 不要把 access_token / refresh_token 在 API 响应中返回
- ❌ 不要在数据库存明文 token
- ❌ 不要修改现有的 `feishu-auth.ts`（那是登录用，本提示词是日历用）
- ❌ 不要触碰 `interview-scheduler.service.ts` 的 `createInterview` 主体逻辑（只在前面加冲突检测）
- ❌ 不要在前端 UI 强制要求连接飞书日历（必须有降级"未连接"提示）

## 必须新增的测试
文件 1：`server/tests/unit/feishu-calendar.test.ts`
1. `encrypt` + `decrypt` 往返一致
2. token 过期时自动 refresh
3. 用户未绑定时 `getFreeBusy` 返回 `[]`（不报错）
4. 飞书 API 返回 code !== 0 时抛错
5. 飞书 API 超时时抛错

文件 2：`server/tests/integration/feishu-calendar-api.test.ts`
1. `GET /status` 未绑定时返回 `{ bound: false }`
2. `DELETE /binding` 成功删除 binding
3. 不存在的 callback code 返回 400

## 验收条件
1. ✅ `pnpm test` 全部通过
2. ✅ `pnpm prisma migrate dev` 成功
3. ✅ 手动测试：在飞书环境触发 OAuth 流程，能完成授权并存 binding
4. ✅ 安排面试时，连接了飞书的面试官冲突能被检测到
5. ✅ 未连接飞书的面试官不会报错
6. ✅ `git diff` 涉及（**文件清单严格不变**）：
   - schema.prisma（追加）
   - 1 个新 migration
   - 1 个新 crypto lib
   - 1 个新 feishu-calendar lib
   - 1 个新 route 文件
   - interview-scheduler.service.ts（**新增** ~20 行函数，行数 [软目标 ±50%]）
   - 2 个测试文件

## 完成后请输出
1. migration SQL
2. crypto.ts + feishu-calendar.ts 完整代码
3. OAuth 流程截图
4. 冲突检测效果截图（HR 安排面试时看到提示）
```

---

## 📌 阶段 2 执行总结

### 推荐执行顺序

| 周 | 任务 | 理由 |
|----|------|------|
| W1 | PROMPT-13 → PROMPT-14 | 都是 DB 变更 + 基础功能，独立 commit |
| W2-W3 | PROMPT-15a → 15b → 15c | 候选人门户 3 段，**严格按顺序**，前段是后段前置 |
| W4 | PROMPT-17（飞书日历） | 与候选人门户并行可行 |
| W5-W6 | PROMPT-16a → 16b | Chatbot 后端 + 前端 |

### 每个提示词的"打开方式"
同阶段 0 / 1：单会话、单提示词、人工 review。

### 阶段 2 vs 之前的差异

| 维度 | 阶段 0 | 阶段 1 | 阶段 2 |
|------|--------|--------|--------|
| 涉及 schema 变更 | ❌ | ✅（PROMPT-11） | ✅✅（多个） |
| 涉及公开 API | ❌ | ❌ | ✅（PROMPT-15b） |
| 涉及 LLM | ❌ | ❌ | ✅✅（PROMPT-16ab） |
| 需要新依赖 | 偶尔 | 多 | 偶尔 |
| 业务复杂度 | 低 | 中 | 高 |

### 跳过任务的说明

**AI 视频面试**：
- 难度：🔴🔴🔴（需要 ASR + TTS + 视觉分析 + 语义理解 4 个模型）
- 建议：直接外采（HireVue、猎聘 AI 面试、ShowMeBug 等）
- 自研投入：3-6 个月 + 模型团队 + 数据标注，ROI 极低
- 决策点：仅当企业有 10 万+ 候选人 / 月 且 极度在意数据隐私 时考虑自研

如果团队决定自研，**不要直接进入 vibe coding**，应先做技术选型 PoC（独立项目）。

---

> **生成时间**：基于阶段 0 + 1 完成后的项目状态
> **前置依赖**：所有阶段 0、阶段 1 提示词都已执行
> **可演进**：完成后按相同模板继续生成阶段 3（智能化深度）的提示词
