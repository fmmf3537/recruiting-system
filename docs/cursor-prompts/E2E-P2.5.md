# E2E-P2.5 E2E 后端管理 CRUD：修 POST /api/users + 用户全流程 执行提示词（staging 模式）

> **staging 模式**：所有产出写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P2.5\`。
> **不要直接修改仓库任何文件**。完成后生成 `apply-e2e-p2.5.ps1`/`.cmd`（幂等、排除自身/README/REPORT）。

## ⚠️ 强约束（最优先阅读）

1. **staging 模式**：产出写 `staging/E2E-P2.5/`（保留相对路径），apply 脚本负责落盘。
2. **本切片是「后端补接口 + 集成测试 + e2e 用例」三件套**，改动范围：
   - `server/src/routes/users.ts`：**加 `POST /api/users` 创建用户接口**（这是本次要修的核心 bug —— 前端 `createUser` 调 `POST /api/users` 但后端只有 `/api/auth/register`，导致「后台添加用户报错 404」）
   - `server/tests/integration/*.test.ts`：加创建用户集成测试（成功 + 重复邮箱 409 + 非 admin 403）
   - `e2e/tests/_users-crud.spec.ts`（新增）：e2e 全流程（API 层）
   - **其余一行不动**：`client/**`、`e2e/helpers.ts`、现有 13 个 `*.spec.ts`、`global-setup.ts`、package.json、CI、docker-compose。
3. **不跑验收命令**（DSH 审核后人工跑：`server npx vitest run` / `server npx tsc --noEmit` / `cd e2e && npx playwright test --project=admin tests/_users-crud.spec.ts`）。
4. 编码红线：新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释；ps1 脚本 UTF-8 带 BOM + 尽量 ASCII 注释。
5. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
`E2E-P2.5`

### 1.2 任务目标
1. **修复 bug**：后端 `server/src/routes/users.ts` 增加 `POST /api/users`，使前端成员管理「新增成员」可用（当前 404）。
2. **集成测试**：覆盖创建用户（admin 成功 / 重复邮箱 409 / 非 admin 403 / 密码策略 400）。
3. **E2E 冒烟**：`_users-crud.spec.ts`（admin project，API 层验证创建→列表出现→删除闭环）作为回归哨兵。

### 1.3 为什么
你实测「后台添加用户报错」：前端 `client/src/api/user.ts:122` `createUser` → `POST /api/users`，后端 `users.ts` 只有 GET / PUT / DELETE / reset-password，**没有 POST /** → Express 404 → 前端 `ElMessage.error('操作失败')`。修复后该 bug 自动消失，且有测试长期守护。

## 2. 上下文（已实读源码，可直接采信）

### 2.1 前端契约（`client/src/api/user.ts`，只读不改）
- `CreateUserParams`（line 11-17）：
  ```ts
  { email: string; password: string; name: string; role: 'admin' | 'member'; department?: string | null }
  ```
- `createUser`（line 121-122）：`request.post('/users', data)`
- 响应期望：`success: true` + `data: UserItem`（id/email/name/role/department/createdAt/updatedAt）
- 前端表单字段（`client/src/views/users/index.vue`）：name/email/password/role(admin|member)/department（可为 `''` 表示不限部门）

### 2.2 后端现状（`server/src/routes/users.ts`，386 行）
- 已有：GET `/`（列表，admin）、GET `/approver-options`、GET `/interviewer-options`、GET `/:id`、PUT `/:id`、POST `/:id/reset-password`、DELETE `/:id`
- **缺 `POST /`（创建）** ← 本次补
- 文件顶部已有 import：`bcrypt`、`z`、`prisma`、`passwordSchema`（line 8）、`AppError`（line 9）、`redis`（line 6 的 `clearListCache`）—— 直接复用，不要重复 import

### 2.3 参考实现（`server/src/routes/auth.ts` POST /register，line 124-176）
- admin 校验：`req.user?.role !== 'admin'` → 403
- 邮箱查重：`prisma.user.findUnique({ where: { email } })` → 409 '该邮箱已被注册'
- 密码：`bcrypt.hash(password, 10)`；`tokenVersion` 默认 0（schema 默认值）
- 创建：`prisma.user.create({ data: { email, password: hashedPassword, name, role } })`（register 无 department）

### 2.4 校验 schema（`server/src/middleware/validate.ts`）
- `passwordSchema`（line 91-94）：`z.string().min(8).regex(/^(?=.*[A-Za-z])(?=.*\d)/)` —— 至少 8 位 + 字母和数字
- `commonSchemas.idParam`（line 99-101）：cuid id

### 2.5 User schema（`server/prisma/schema.prisma` line 53-63）
- `id` cuid 主键 / `email` @unique / `password` / `name` / `role` UserRole（admin|member）/ `department` String? / `tokenVersion` Int @default(0) / createdAt / updatedAt
- OperationLog 表：`userId`（操作者）/ `targetType` / `targetId` / `action` / `detail`（Json）—— 参照 reset-password（users.ts line 329-337）写 `action: 'user_create'`

## 3. 必读约束

### 3.1 反直觉点
1. **前端 role 只有 'admin' | 'member'**（UI 下拉），UserRole enum 也是这两值 —— 创建接口 schema 用 `z.enum(['admin', 'member'])`，**不要引入 hr/hiring_manager/interviewer**（系统角色演进留给后续切片，非本切片范围）。
2. **department 约定**：`undefined` → 存 null；`''`（空串）→ 存 null；其它字符串 → 原样存。前端空串表示"不限部门"。
3. **密码策略用 `passwordSchema`**（validate.ts line 91），创建用户属于"设置新密码"场景 —— 必须用它（不要用弱校验）。
4. **响应 201** 创建成功（对照 register 用 `res.status(201)`），前端只看 `res.success` 不挑 status，但保持 REST 语义。
5. **成功响应结构**：`{ success: true, message: '用户创建成功', data: { id, email, name, role, department, createdAt, updatedAt } }` —— 字段对齐 `UserItem`（前端 `UserDetailData`）。

### 3.2 权限矩阵
| 场景 | admin | member |
|---|---|---|
| POST /api/users 创建 | ✅ | ❌ 403 |

### 3.3 审计/日志约定
- 创建成功后写 `OperationLog`：`action: 'user_create'`，`targetType: 'User'`，`detail: { email, name, role }`（对照 reset-password 写法）
- 同时 `clearListCache('users:list:*')`（列表缓存失效，对照 PUT/DELETE 的 line 282/377）

## 4. 实施任务

### 4.1 ✱ `staging/E2E-P2.5/server/src/routes/users.ts`（条件修改 → 产出完整新文件 + patch 说明）

在 `GET /`（列表）与 `GET /approver-options` **之间**插入 `POST /`（放在动态路由 `/:id` 之前，避免被 id 捕获 — 实际上 POST 不会匹配 GET/:id，但保持路由顺序清晰）：

```ts
/**
 * POST /api/users
 * 创建成员（仅管理员）
 */
const createUserSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址').max(254),
  password: passwordSchema,
  name: z.string().min(2, '姓名至少2位字符').max(50, '姓名最多50位字符'),
  role: z.enum(['admin', 'member']),
  department: z.string().max(50).optional().nullable(),
});

router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const { email, password, name, role, department } = req.body;

    // 邮箱唯一校验
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppError('该邮箱已被注册', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        department: department === undefined || department === '' ? null : department,
      },
      select: {
        id: true, email: true, name: true, role: true, department: true, createdAt: true, updatedAt: true,
      },
    });

    // 操作日志 + 缓存失效（对照 reset-password / PUT）
    try {
      await prisma.operationLog.create({
        data: {
          userId: req.user!.userId,
          targetType: 'User',
          targetId: user.id,
          action: 'user_create',
          detail: { email: user.email, name: user.name, role: user.role },
        },
      });
    } catch (logErr) {
      console.error('用户创建 OperationLog 写入失败:', logErr);
    }
    await clearListCache('users:list:*');

    res.status(201).json({
      success: true,
      message: '用户创建成功',
      data: user,
    });
  })
);
```

> 注意：`req.user!.userId` 在 `authenticate` 中间件下必有值（对照 reset-password line 329）。若 lint 报 `no-non-null-assertion` 风格问题，可改用 `req.user?.userId` + `if` 守卫（参照 register 的方式，register 用 `req.user?.role` 判断后 return，这里由于已过 authorize('admin')，用非空断言或守卫均可，**以仓库 lint 兼容为准**）。

### 4.2 ✱ 集成测试 `staging/E2E-P2.5/server/tests/integration/users-create.test.ts`（新增）

参照 `server/tests/integration/auth.test.ts` 的 mock 模式（vi.mock prisma + supertest + app.use('/api/users', usersRoutes)）。覆盖：
1. **admin 创建成功** → 201 + `success:true` + 返回 data 含 id/email（mock `prisma.user.findUnique` 返回 null → `create` 返回新用户）
2. **重复邮箱 → 409**（mock findUnique 返回已存在用户）
3. **非 admin → 403**（mock `authenticate` 注入 role='member'；对照 auth.test.ts 的 `x-test-role` header 模式）
4. **密码不满足策略 → 400**（password 只有数字/不足 8 位 → validate 抛错）
5. **department 空串 → null**（断言 create 调用 data.department === null）
6. **OperationLog 写入**（mock operationLog.create 断言 action==='user_create'）

> mock 关键点：`prisma.user.findUnique` / `prisma.user.create` / `prisma.operationLog.create` / `prisma.user.count`（列表示例可能触发）—— 全 mock。参照 auth.test.ts line 6-67 的 mock 结构与 `authorize` mock。

### 4.3 ✱ e2e 用例 `staging/E2E-P2.5/e2e/tests/_users-crud.spec.ts`（新增，admin project）

```ts
import { test, expect } from '@playwright/test';

/**
 * E2E-P2.5 用户管理 CRUD 冒烟（admin project，API 层）
 * 回归哨兵：确保「后台添加用户」可用（曾因缺 POST /api/users 404）。
 */
test.describe('用户管理 CRUD @admin', () => {
  test('admin 创建 → 列表出现 → 删除 闭环', async ({ request }) => {
    const suffix = Date.now().toString().slice(-8);
    const email = `e2e-user-${suffix}@test.local`;
    const payload = {
      email,
      password: 'E2ePass123',   // 满足 8 位 + 字母数字
      name: `E2E用户-${suffix}`,
      role: 'member',
      department: '研发部',
    };

    // 创建（无障碍：request fixture 自动带 admin storageState 的 auth？——需确认）
    const createRes = await request.post('/api/users', { data: payload });
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()).data;
    expect(created.id).toBeTruthy();

    // 列表出现
    const listRes = await request.get('/api/users?page=1&limit=50');
    const list = (await listRes.json()).data;
    expect(list.some((u: { email: string }) => u.email === email)).toBeTruthy();

    // 重复邮箱 → 409
    const dupRes = await request.post('/api/users', { data: payload });
    expect(dupRes.status()).toBe(409);

    // 删除（清理数据）
    const delRes = await request.delete(`/api/users/${created.id}`);
    expect(delRes.ok()).toBeTruthy();
  });

  test('密码不满足策略 → 400', async ({ request }) => {
    const res = await request.post('/api/users', {
      data: {
        email: `bad-pass-${Date.now()}@test.local`,
        password: '12345678',   // 只有数字
        name: '坏密码用户',
        role: 'member',
      },
    });
    expect(res.status()).toBe(400);
  });
});
```

> ⚠️ **关键待验证**：`request` fixture 是否自动携带 storageState 的 auth？Playwright 的 `request` fixture 默认**不带**浏览器上下文 cookie/localStorage —— 需要显式带 token。**正确做法**：在测试内读 `.auth/admin.json` 的 `ats_token`，或改用 `request.newContext({ storageState })`。请在实现时**实测**（跑一次看 201 还是 401），**若 401 则改为**：
> ```ts
> const { request: baseRequest } = await ... // 或用 test.use({ }) 
> ```
> 最稳方案（推荐）：
> ```ts
> import { test, expect } from '@playwright/test';
> import fs from 'fs';
> import path from 'path';
> const auth = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.auth', 'admin.json'), 'utf8'));
> const token = auth.origins[0].localStorage.find((x) => x.name === 'ats_token').value;
> // axios/fetch 带 Authorization: Bearer <token>
> ```
> 或更简单：`await page.request.post('/api/users', { data, headers: { Authorization: `Bearer ${token}` } })` —— page 的 request 会带 storageState？**page.request 会携带 context 的 cookies 但 localStorage 不是 header**。**结论**：用显式 `headers: { Authorization: 'Bearer ' + token }` 最可靠。实现时以实测通过为准。

### 4.4 ✱ apply 脚本 `apply-e2e-p2.5.ps1` / `.cmd`（照抄 E2E-P1 模式，改切片名；ps1 带 BOM）

### 4.5 ✱ `README.md` + `STAGING_REPORT.md`（交付报告，模板见 §7.2）

## 5. 关键决策点

### 5.1 为什么在 /users 加接口，而不是前端改调 /auth/register
REST 语义 + 前端已就绪（createUser → POST /users），后端补齐接口改动最小、职责更清晰（users 路由管用户 CRUD）。register 保留兼容历史调用。

### 5.2 为什么 role 只支持 admin|member
UserRole enum 与前端 UI 下拉均只有这两值。hr/hiring_manager/interviewer 角色演进（已有 seed-test-users 用了它们）属后续切片。

### 5.3 为什么集成测试放新文件而非并入 auth.test.ts
auth.test.ts 已 600+ 行且 focus 认证；用户管理独立测试文件便于维护（对齐 server/tests 组织）。

### 5.4 不做的
- 不改 client（前端已就绪，无需改）
- 不改 register（保留兼容）
- 不扩角色枚举
- 不加 migration（User 表无需变更）
- 不改现有 13 spec / helpers / global-setup

## 6. 修改文件清单

### 6.1 staging 产出（5-6 个）
1. `server/src/routes/users.ts`（补 POST / —— 建议完整新文件 + 交付报告给 diff 说明）
2. ✱ `server/tests/integration/users-create.test.ts`
3. ✱ `e2e/tests/_users-crud.spec.ts`
4. ✱ `apply-e2e-p2.5.ps1` / `apply-e2e-p2.5.cmd`
5. ✱ `README.md` + `STAGING_REPORT.md`

### 6.2 禁止修改
- `client/**`、`server/prisma/**`（schema/migrations）、`server/src/**` 除 users.ts、`server/tests/**` 除新增文件
- `e2e/helpers.ts`、现有 13 spec、`global-setup.ts`、`e2e/package.json`、`.github/**`、`docker-compose.e2e.yml`

### 6.3 越界检测
- staging 目录只允许 §6.1 路径
- apply 后 `git diff --stat -- client server/prisma e2e/tests/helpers.ts` 必须 0 行（users.ts + 新测试文件除外）

## 7. 验收标准

### 7.1 硬性验收（DSH 人工）
| 检查 | 标准 |
|---|---|
| `cd server && npx tsc --noEmit` | 0 错 |
| `cd server && npx vitest run tests/integration/users-create.test.ts` | 新测试全过 |
| `cd server && npx vitest run` | 基线 627 + 新增全过（无回归） |
| `cd e2e && npx playwright test --project=admin tests/_users-crud.spec.ts` | 2 用例全过 |
| 越界 | client/prisma/helpers 0 行 |

### 7.2 交付报告模板（STAGING_REPORT.md）
1. 完成范围（3 业务文件 + apply/说明）
2. users.ts diff（插入 POST / 的 before→after，行号）
3. 集成测试用例清单（6 条）+ 覆盖矩阵
4. e2e _users-crud.spec.ts 实现说明（**重点：request auth 怎么解决的** —— 实测 201 还是 401 → 用什么方案）
5. 越界自检
6. 已知风险（如 register 与 POST /users 并存是否冲突、role 演进）
7. 回退方式（apply -R + 删新增文件）
8. 红线自检（强约束 1-5）

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手到 staging/E2E-P2.5/。**不要写仓库根！** 最终回复给出完整交付报告。