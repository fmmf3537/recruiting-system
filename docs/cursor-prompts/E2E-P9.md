# E2E-P9 helpers.ts 改造为 storageState 模式 执行提示词（staging 模式）

> **staging 模式**：所有产出写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P9\`。
> **不要直接修改仓库任何文件**。完成后生成 `apply-e2e-p9.ps1`/`.cmd`（幂等、排除自身/README/REPORT）。

## ⚠️ 强约束（最优先阅读）

1. **staging 模式**：所有文件写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P9\`（保留相对路径）。
2. **本切片只动 1 个文件 + 0 个 spec**：不动 10 个老 spec（保持 API 兼容），只重写 helpers.ts。
   - `e2e/tests/helpers.ts`：覆盖稿（用 storageState 而非硬编码 JWT）
   - 其余一行不动
3. **API 兼容**：`login(page)`、`login(page, role)` 签名保持不变。所有 21 个老调用点无需修改。
4. **不跑验收命令**（DSH 审核后人工跑：`cd e2e && npx playwright test tests/auth.spec.ts` 等）。
5. 编码红线：新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释；ps1 脚本 UTF-8 带 BOM + 尽量 ASCII 注释。
6. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
`E2E-P9`

### 1.2 任务目标

1. **重写 `e2e/tests/helpers.ts`**：从硬编码 JWT 改为读取 `.auth/<role>.json`（与 P0 的 global-setup 产出对齐）。
2. **API 兼容**：所有 21 个老调用点（`await login(page)`）无需修改即可切换到 storageState。
3. **支持多角色**：`login(page, role)` 已存在签名，扩展支持 admin/hr/hiring_manager/interviewer。
4. **向后兼容**：`TEST_EMAIL` 常量保留（auth.spec.ts 用了它）。

### 1.3 为什么

`helpers.ts` 当前用硬编码 JWT（email `admin@example.com` + id `cmnsaxyb800008rut1pl69rcz`），但 seed-test-users 改用 `admin@test.local` + cuid `cmtvlgcmf0000st38ncxpsrhg`。JWT 已过期，10 个老 e2e spec 实际跑时会失败。

## 2. 上下文（已实读源码）

### 2.1 当前 helpers.ts

```ts
import type { Page } from '@playwright/test';

export const TEST_EMAIL = 'admin@example.com';

const TEST_TOKEN = 'eyJ...'; // 30 天有效期硬编码

export async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.evaluate((token) => {
    localStorage.setItem('ats_token', token);
    localStorage.setItem('ats_user', JSON.stringify({
      id: 'cmnsaxyb800008rut1pl69rcz',
      email: TEST_EMAIL,
      name: '系统管理员',
      role: 'admin',
      department: null,
      createdAt: '2026-04-10T02:43:57.044Z',
    }));
  }, TEST_TOKEN);

  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
}
```

### 2.2 storageState 格式（global-setup 产出）

```json
{
  "cookies": [],
  "origins": [{
    "origin": "http://localhost:5174",
    "localStorage": [
      { "name": "ats_token", "value": "<JWT>" },
      { "name": "ats_user", "value": "<user JSON>" }
    ]
  }]
}
```

`.auth/` 目录有 4 个：`admin.json` / `hr.json` / `hiring_manager.json` / `interviewer.json`。

### 2.3 当前调用点

- 10 个老 spec + auth.spec 共 21 个 `await login(page)` 调用
- 都在 `test.beforeEach` 或 `it` 开头

### 2.4 Playwright 风格

- `page.addInitScript()` 在每次页面加载前注入 localStorage（推荐方式）
- 或 `page.context().storageState()` 复用 storageState

## 3. 必读约束

### 3.1 反直觉点

1. **`addInitScript` vs `evaluate`**：`addInitScript` 在每次 page.goto 前自动注入，比手动 evaluate 更稳定（避免 race condition）。
2. **localStorage 在跨页面导航时保留**：但 page.goto 重新加载后 localStorage 会被清除（除非是同源）。`addInitScript` 在每次 navigation 前执行，确保 storage 存在。
3. **`storageState` 加载方式**：playwright 提供 `page.context().storageState()` API，但需要先创建 context 时指定。本测试用 `addInitScript` 更简单（直接注入 localStorage）。
4. **role 参数化**：保持 `login(page, role='admin')` 签名。auth.spec.ts 也用 `login(page)`，需要默认 admin 兼容。

### 3.2 API 兼容性

```ts
// 现有签名（保持）
export async function login(page: Page): Promise<void>
export async function login(page: Page, role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer'): Promise<void>

// 现有常量（保持）
export const TEST_EMAIL: string;
```

> 保持 export 的常量名（auth.spec.ts 用 `TEST_EMAIL` 做断言）。

## 4. 实施任务

### 4.1 ✱ `staging/E2E-P9/e2e/tests/helpers.ts`

完整覆盖稿（约 80 行），关键逻辑：

```ts
import type { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const AUTH_DIR = path.join(__dirname, '..', '..', '.auth');

interface StorageState {
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

function loadStorageState(role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer'): StorageState {
  const file = path.join(AUTH_DIR, `${role}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`storageState 缺失: ${file}（请先跑 global-setup）`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as StorageState;
}

/** 默认 admin（兼容老调用点） */
export async function login(page: Page): Promise<void>;
/** 多角色登录（auth.spec 也能用） */
export async function login(
  page: Page,
  role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer'
): Promise<void>;
export async function login(
  page: Page,
  role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer' = 'admin'
): Promise<void> {
  const state = loadStorageState(role);
  // 取 ats_token 和 ats_user 的 value，注入 localStorage
  const tokenEntry = state.origins[0]?.localStorage.find((x) => x.name === 'ats_token');
  const userEntry = state.origins[0]?.localStorage.find((x) => x.name === 'ats_user');
  if (!tokenEntry || !userEntry) {
    throw new Error(`${role}.json 缺少 ats_token / ats_user entry`);
  }

  // 用 addInitScript 在每次 page.goto 前注入 localStorage（最稳）
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('ats_token', token);
      localStorage.setItem('ats_user', user);
    },
    { token: tokenEntry.value, user: userEntry.value }
  );

  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
}

/**
 * 兼容旧 TEST_EMAIL 常量（auth.spec.ts 用）
 * 从 storageState 读取真实 email
 */
export const TEST_EMAIL = 'admin@test.local'; // 与 seed-test-users 对齐
```

> **注意**：删掉旧 `TEST_TOKEN` 常量（不再需要）。保留 `TEST_EMAIL` 常量。

### 4.2 ✱ apply 脚本 `apply-e2e-p9.ps1` / `.cmd`

照抄之前模式（Copy-Item 覆盖稿，幂等）。

### 4.3 ✱ `README.md` + `STAGING_REPORT.md`

模板与之前相同。

## 5. 关键决策点

### 5.1 为什么用 addInitScript 而非 evaluate
- `evaluate` 在 page.goto 后执行，可能错过首次 navigation 的 localStorage 检查
- `addInitScript` 在每次 navigation 前自动注入（最稳）

### 5.2 为什么保持 API 兼容
- 21 个老调用点无需修改（节省 diff 风险）
- 10 个老 spec 自动从硬编码 JWT 切换到 storageState（无需逐个 spec 改）

### 5.3 为什么保留 TEST_EMAIL 常量
- auth.spec.ts:2 `import { TEST_EMAIL }` 用作断言（与登录页对照）
- 改成 `admin@test.local`（seed-test-users 的真实 email）

### 5.4 不做的
- 不改 10 个老 spec 的 `await login(page)` 调用（API 兼容）
- 不改 `global-setup.ts`（已在 P0 落地）
- 不改 `.auth/*.json` 文件（由 seed/global-setup 产出）
- 不跑验收命令

## 6. 修改文件清单

### 6.1 staging 产出（4 个）

1. ✱ `e2e/tests/helpers.ts`（完整覆盖稿）
2. ✱ `apply-e2e-p9.ps1` / `apply-e2e-p9.cmd`
3. ✱ `README.md` + `STAGING_REPORT.md`

### 6.2 禁止修改

- `client/**`
- `server/**`
- `e2e/global-setup.ts`
- `e2e/playwright.config.ts`
- `e2e/.auth/*.json`
- 10 个老 `*.spec.ts`（API 兼容无需改）
- 所有 `_*.spec.ts`（P0-P8 产出）

### 6.3 越界检测

- staging 目录只允许 §6.1 路径
- apply 后 `git diff --stat -- client server e2e/global-setup.ts e2e/playwright.config.ts e2e/.auth e2e/tests/_*.spec.ts` 必须 **0 行**
- 仅允许 `e2e/tests/helpers.ts` 1 个文件被覆盖

## 7. 验收标准

### 7.1 硬性验收（DSH 审核方）

| 检查 | 通过标准 |
|---|---|
| `cd e2e && npx tsc --noEmit`（如适用） | 0 错 |
| `cd e2e && npx playwright test tests/auth.spec.ts` | 老 spec 用新 helpers 仍能跑 |
| `cd e2e && npx playwright test tests/candidates.spec.ts` | 闭环（admin login + UI 跳转）|
| `cd e2e && npx playwright test tests/_users-crud.spec.ts` | P2.5 产出（用 loadAdminToken）不破 |
| 越界 | client / server / 其它 e2e 文件 0 行 |

### 7.2 交付报告模板（STAGING_REPORT.md）

1. 完成范围（1 个文件 + apply/说明）
2. 修改前/后对比（API 兼容证明）
3. 越界自检
4. 已知风险（`.auth/*.json` 必须由 global-setup 产出）
5. 回退方式
6. 红线自检确认

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手到 staging/E2E-P9/。**不要写到仓库根！** 最终回复给出完整交付报告。
