# E2E-P1 E2E 广度：L1 菜单可见性矩阵 执行提示词（staging 模式）

> **staging 模式**：所有产出写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P1\`。
> **不要直接修改仓库任何文件**（包括 `e2e/`、`client/`、`server/`）。
> 完成后必须生成 `apply-e2e-p1.ps1` 与 `apply-e2e-p1.cmd`（位于 staging 目录），
> 作用：把 staging 下文件复制/合并到仓库根。apply 脚本必须**幂等**，且**排除自身**
> （不复制 apply-*.ps1、apply-*.cmd、README.md、STAGING_REPORT.md）。

## ⚠️ 强约束（最优先阅读）

1. **staging 模式**：所有文件写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P1\`（保留相对路径）。
2. **本切片只改 e2e 内 3 个文件**：填充 `e2e/fixtures/menu-matrix.ts` + 新增 `e2e/tests/_menu-matrix.spec.ts` + 修改 `e2e/playwright.config.ts`（仅调 testMatch/testIgnore，追加 2 行）。**其余文件一行不动**。
   - 禁止改：`client/**`、`server/**`、`e2e/tests/helpers.ts`、现有 13 个 `*.spec.ts`、`e2e/global-setup.ts`、`docker-compose.e2e.yml`、`.github/**`、`package.json`（e2e 与根）。
3. **L1 矩阵是固定事实**（已实测核对 DefaultLayout.vue 代码，直接采信 §2.2）——**不要自己另猜角色可见性**。
4. **断言策略**：用「菜单文本」定位（Element Plus `.el-menu-item` 文本稳定），**不补 data-testid**（那是 P2 的事）。
5. **不跑验收命令**（DSH 审核后人工跑：`cd e2e && npx playwright test --project=admin --project=hr --project=hiring_manager --project=interviewer tests/_menu-matrix.spec.ts`）。
6. 编码红线：新文件 UTF-8 无 BOM、LF、2 空格缩进、单引号、行尾分号、中文注释。
7. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
`E2E-P1`

### 1.2 任务目标
搭好 L1 菜单可见性矩阵的**测试数据（fixture）**与**测试用例**，断言「该可见的必须可见 + 该隐藏的必须隐藏」，共 76 个断言（41 可见 + 35 隐藏），覆盖 4 角色 × 19 菜单。

### 1.3 为什么价值高
- 这张矩阵同时是**回归哨兵**：谁改了 `DefaultLayout.vue` 的角色条件却忘了同步测试，立刻红。
- 维护成本 = 一张表（`menu-matrix.ts` 里的 `MENU_MATRIX`），新增菜单只改表，不改用例。

## 2. 上下文

### 2.1 项目位置
- 仓库根：`D:\kimi\recruiting-system\`（注意：**不是** `C:\Users\fmmf\kimi\recruiting-system`！以 `git rev-parse --show-toplevel` 实际解析为准）
- e2e 基线（P0 已跑通）：`e2e/playwright.config.ts`（4 role project + chromium）；`e2e/global-setup.ts`（已写好 .auth/*.json）；`e2e/fixtures/auth.ts`（ROLES/CREDENTIALS）；`e2e/tests/_smoke.spec.ts`（P0 冒烟）。
- 已存在 `e2e/fixtures/menu-matrix.ts`（骨架：三个空数组）。**填充它**。

### 2.2 关键已核实事实（可直接采信，已逐行读 DefaultLayout.vue）

**渲染结构**（`client/src/layouts/DefaultLayout.vue`）：
- 新布局默认开（`uiNewNavLayout = localStorage !== 'false'`，DefaultLayout.vue:216）
- 菜单按 `MENU_GROUPS` 分组，`el-sub-menu` 用 `:default-openeds="groupedMenuOpenedIndexes"`（line 18）**默认全展开** → 菜单项 `.el-menu-item` 直接可见，**无需点击展开**。
- 菜单项：`<el-menu-item :index="item.path"> <el-icon>..</el-icon> <template #title>{{ item.title }}</template> </el-menu-item>`（line 38-47）
- 回退布局（`ui:new-layout:UI-S1=false`）：平铺 `menuItems` 的 `.el-menu-item`（line 51-56）——同样文本可见。
- **两种布局的菜单项 DOM 都是 `.el-menu-item`**，用文本断言即可，不区分布局。

**菜单可见性事实**（`menuItems` 计算属性，DefaultLayout.vue:242-304，member 已归一为 hr）：
| path | title | admin | hr | hiring_manager | interviewer |
|---|---|---|---|---|---|
| /dashboard | 仪表盘 | ✅ | ✅ | ✅ | ✅ |
| /hiring | 招聘工作台 | ✅ | ❌ | ✅ | ❌ |
| /jobs | 职位管理 | ✅ | ✅ | ❌ | ❌ |
| /settings/agencies | 猎头机构 | ✅ | ✅ | ❌ | ❌ |
| /candidates | 候选人管理 | ✅ | ✅ | ✅ | ❌ |
| /interview | 面试官工作台 | ✅ | ❌ | ✅ | ✅ |
| /interviews | 面试管理 | ✅ | ✅ | ✅ | ❌ |
| /offers | Offer管理 | ✅ | ✅ | ✅ | ❌ |
| /stats | 数据统计 | ✅ | ✅ | ✅ | ❌ |
| /hr-score/my | 我的积分 | ✅ | ✅ | ❌ | ❌ |
| /hr-score/team | 团队考核 | ✅ | ❌ | ❌ | ❌ |
| /notifications | 消息通知 | ✅ | ✅ | ✅ | ✅ |
| /hc-requests | 编制管理 | ✅ | ✅ | ✅ | ❌ |
| /users | 成员管理 | ✅ | ❌ | ❌ | ❌ |
| /settings/dictionary | 字典管理 | ✅ | ❌ | ❌ | ❌ |
| /settings/tags | 标签管理 | ✅ | ❌ | ❌ | ❌ |
| /settings/pipeline-templates | 流程模板 | ✅ | ❌ | ❌ | ❌ |
| /settings/ai | AI 设置 | ✅ | ❌ | ❌ | ❌ |
| /settings/automation-rules | 自动化邮件 | ✅ | ❌ | ❌ | ❌ |

**断言统计**：可见总 41（19+10+9+3），隐藏总 35 → 76 断言。

**current router path**：菜单断言在 `/dashboard` 页面进行（登录后默认路由），侧边栏始终渲染，不影响断言。

## 3. 必读约束

### 3.1 反直觉点

1. **菜单项 DOM 是 `.el-menu-item`，但分组名是 `.el-sub-menu__title`**——断言菜单项时用 `.el-menu-item:has-text("职位管理")` 即可，**不要**用 `el-sub-menu` 的文本（分组名如「招聘作业」「设置与管理」**不是菜单**，不要断言它们）。
2. **登录用 P0 的 storageState（不重新登录）**：本切片依赖 `global-setup.ts` 已生成 `.auth/<role>.json`。用例直接 `page.goto('/dashboard')` 即可。
3. **不要点击菜单**：只断言**可见性**（toHaveCount / toBeVisible），不导航。
4. **`admin` 角色 19 项全可见**；`interviewer` 只有 3 项可见（仪表盘/面试官工作台/消息通知）——矩阵别写反。
5. **矩阵 fixture 是「预期值」来源**：`MENU_MATRIX` 用 `visibleTo: Role[]` 声明，测试用例从它推导 `EXPECTED_VISIBLE` / `EXPECTED_HIDDEN`（或直接读表），**禁止**在用例里硬编码另一份矩阵（会漂移）。

### 3.2 权限矩阵
见 §2.2 表格（唯一事实源）。

### 3.3 审计/日志约定
- 无业务日志写入。测试失败自动留 trace/screenshot（config 已配 `trace: on-first-retry` / `screenshot: only-on-failure`）。

## 4. 实施任务

### 4.1 ✱ 填充 `staging/E2E-P1/e2e/fixtures/menu-matrix.ts`

```ts
import type { Role } from './auth';

/** 19 菜单 × 4 角色可见性矩阵（唯一事实源；改动 DefaultLayout.vue 时同步本表） */
export const MENU_MATRIX: ReadonlyArray<{
  path: string;
  title: string;
  visibleTo: ReadonlyArray<Role>;
}> = [
  { path: '/dashboard',              title: '仪表盘',     visibleTo: ['admin', 'hr', 'hiring_manager', 'interviewer'] },
  { path: '/hiring',                 title: '招聘工作台', visibleTo: ['admin', 'hiring_manager'] },
  { path: '/jobs',                   title: '职位管理',   visibleTo: ['admin', 'hr'] },
  { path: '/settings/agencies',      title: '猎头机构',   visibleTo: ['admin', 'hr'] },
  { path: '/candidates',             title: '候选人管理', visibleTo: ['admin', 'hr', 'hiring_manager'] },
  { path: '/interview',              title: '面试官工作台', visibleTo: ['admin', 'hiring_manager', 'interviewer'] },
  { path: '/interviews',             title: '面试管理',   visibleTo: ['admin', 'hr', 'hiring_manager'] },
  { path: '/offers',                 title: 'Offer管理',  visibleTo: ['admin', 'hr', 'hiring_manager'] },
  { path: '/stats',                  title: '数据统计',   visibleTo: ['admin', 'hr', 'hiring_manager'] },
  { path: '/hr-score/my',            title: '我的积分',   visibleTo: ['admin', 'hr'] },
  { path: '/hr-score/team',          title: '团队考核',   visibleTo: ['admin'] },
  { path: '/notifications',          title: '消息通知',   visibleTo: ['admin', 'hr', 'hiring_manager', 'interviewer'] },
  { path: '/hc-requests',            title: '编制管理',   visibleTo: ['admin', 'hr', 'hiring_manager'] },
  { path: '/users',                  title: '成员管理',   visibleTo: ['admin'] },
  { path: '/settings/dictionary',    title: '字典管理',   visibleTo: ['admin'] },
  { path: '/settings/tags',          title: '标签管理',   visibleTo: ['admin'] },
  { path: '/settings/pipeline-templates', title: '流程模板', visibleTo: ['admin'] },
  { path: '/settings/ai',            title: 'AI 设置',    visibleTo: ['admin'] },
  { path: '/settings/automation-rules', title: '自动化邮件', visibleTo: ['admin'] },
];

/** 按角色展开可见菜单 title（测试用例用） */
export const EXPECTED_VISIBLE: Record<Role, string[]> = (() => {
  const map = { admin: [], hr: [], hiring_manager: [], interviewer: [] } as Record<Role, string[]>;
  for (const item of MENU_MATRIX) {
    for (const role of item.visibleTo) map[role].push(item.title);
  }
  return map;
})();

/** 按角色展开隐藏菜单 title（测试用例用） */
export const EXPECTED_HIDDEN: Record<Role, string[]> = (() => {
  const map = { admin: [], hr: [], hiring_manager: [], interviewer: [] } as Record<Role, string[]>;
  for (const item of MENU_MATRIX) {
    for (const role of ALL_ROLES) {
      if (!item.visibleTo.includes(role)) map[role].push(item.title);
    }
  }
  return map;
})();

const ALL_ROLES: Role[] = ['admin', 'hr', 'hiring_manager', 'interviewer'];
```

> ⚠️ 上面的 `ALL_ROLES` 定义在 EXPECTED_HIDDEN 回调之后使用是**标量提升陷阱**——请自行把 `ALL_ROLES` 提升到文件顶部（const 声明在 IIFE 之前），或直接用 `ROLES`（从 `./auth` 导入）。

### 4.2 ✱ 新增 `staging/E2E-P1/e2e/tests/_menu-matrix.spec.ts`

```ts
import { test, expect } from '@playwright/test';
import { EXPECTED_VISIBLE, EXPECTED_HIDDEN } from '../fixtures/menu-matrix';
import { ROLES, type Role } from '../fixtures/auth';

/**
 * L1 菜单可见性矩阵：4 角色 × 19 菜单 = 76 断言（41 可见 + 35 隐藏）。
 * 由 4 个 role project 各跑一次，每次用对应 storageState。
 */
for (const role of ROLES) {
  test.describe(`L1 菜单矩阵 @${role}`, () => {
    // 过滤：只有当前 project 的 role 才真正执行（其它 project 跳过）
    test.skip(({ }, testInfo) => testInfo.project.name !== role, '仅对应 role project 执行');

    test('可见菜单必须可见', async ({ page }) => {
      await page.goto('/dashboard');
      for (const title of EXPECTED_VISIBLE[role]) {
        await expect(page.locator(`.el-menu-item:has-text("${title}")`).first()).toBeVisible({
          timeout: 5000,
        });
      }
    });

    test('隐藏菜单必须不可见', async ({ page }) => {
      await page.goto('/dashboard');
      for (const title of EXPECTED_HIDDEN[role]) {
        await expect(page.locator(`.el-menu-item:has-text("${title}")`)).toHaveCount(0);
      }
    });
  });
}
```

> 说明：`.el-menu-item:has-text("X")` 若误配了其它角色看不到的文本（如「团队考核」对 hr 隐藏），`toHaveCount(0)` 断言菜单项数量为 0。注意 `:has-text` 是**包含匹配**（"Offer内容"也会命中"Offer管理"文本），但菜单标题固定且页面 body 无这些文本时安全。若担心误命中，可改用精确匹配：`page.locator('.el-menu-item')` 遍历断言文本集合——两种写法任选，**只要 76 断言可重跑**。

### 4.3 ✱ 修改 `staging/E2E-P1/e2e/playwright.config.ts`（最小 diff，仅 2 行）

当前（P0）：
```ts
projects: [
  { name: 'chromium', testIgnore: ['**/_smoke.spec.ts'], ... },
  { name: 'admin', testMatch: ['**/_smoke.spec.ts'], ... },
  { name: 'hr', testMatch: ['**/_smoke.spec.ts'], ... },
  { name: 'hiring_manager', testMatch: ['**/_smoke.spec.ts'], ... },
  { name: 'interviewer', testMatch: ['**/_smoke.spec.ts'], ... },
],
```

改为**通配**（未来 P2/P3 直接加 `_*.spec.ts` 自动归 role project）：
```ts
{ name: 'chromium', testIgnore: ['**/_*.spec.ts'], ... },
{ name: 'admin', testMatch: ['**/_*.spec.ts'], ... },
{ name: 'hr', testMatch: ['**/_*.spec.ts'], ... },
{ name: 'hiring_manager', testMatch: ['**/_*.spec.ts'], ... },
{ name: 'interviewer', testMatch: ['**/_*.spec.ts'], ... },
```
> 其它内容（globalSetup、webServer、use）**一行不动**。chromium 仍跑存量非下划线 spec（helpers 硬编码 JWT）。

### 4.4 ✱ 新增 `staging/E2E-P1/apply-e2e-p1.ps1` / `apply-e2e-p1.cmd`

照抄 E2E-P0 的 apply 脚本模式（可复制 `apply-e2e-p0.ps1` 改名为 `apply-e2e-p1.ps1`），
但注意：
- 排除名：`apply-e2e-p1.ps1` / `apply-e2e-p1.cmd` / `README.md` / `STAGING_REPORT.md`
- TargetDir 向上 5 级解析仓库根（`staging/E2E-P1` → `.dsh/skills/slice-cursor-dev/staging/E2E-P1` → 根）
- **ps1 必须 UTF-8 带 BOM**（PowerShell 5.1 读无 BOM 中文乱码）；注释尽量 ASCII

### 4.5 ✱ 新增 `staging/E2E-P1/README.md`（staging 说明）+ `STAGING_REPORT.md`（交付报告，模板见 §7.2）

## 5. 关键决策点

### 5.1 为什么菜单用文本断言而非 testid
P0/P2 分批决策：L1 菜单文本稳定（Element Plus 渲染），`data-testid` 留给 P2 交互控件。一次全加改动面太大。

### 5.2 为什么把 testMatch 改为 `_*.spec.ts` 通配
下划线前缀是「role project 专用」约定：P0 的 `_smoke`、P1 的 `_menu-matrix`、后续 P2/P3 的 `_xxx` 都归 role project 跑；chromium 只跑存量 13 spec。避免每次新 spec 都要改 config。

### 5.3 为什么 76 断言的两条用例分开
可见性反向断言（`toHaveCount(0)`）与正向（`toBeVisible`）语义不同，拆两条使失败定位清晰（谁漏渲染 / 谁越权可见）。

### 5.4 不做的
- 不改 `DefaultLayout.vue`（P1 是测试，不改产品代码；若矩阵与代码不符以代码为准并报告差异）
- 不补 data-testid
- 不改现有 13 个 spec / helpers
- 不新增依赖
- 不跑验收命令

## 6. 修改文件清单

### 6.1 staging 产出（6 个；✱=新增）
1. ✱ `e2e/fixtures/menu-matrix.ts`（填充完整矩阵 + EXPECTED_VISIBLE/HIDDEN）
2. ✱ `e2e/tests/_menu-matrix.spec.ts`
3. `e2e/playwright.config.ts`（testMatch/testIgnore 改 `_*.spec.ts`，2 处×2 行）
4. ✱ `apply-e2e-p1.ps1`
5. ✱ `apply-e2e-p1.cmd`
6. ✱ `README.md` + `STAGING_REPORT.md`

### 6.2 禁止修改文件
- `client/**`（尤其 `DefaultLayout.vue`）
- `server/**`
- `e2e/tests/helpers.ts`、现有 13 个 `*.spec.ts`（非下划线）
- `e2e/global-setup.ts`、`e2e/fixtures/auth.ts`、`e2e/package.json`
- `.github/**`、`docker-compose.e2e.yml`
- 任何 package.json / tsconfig / eslint

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 §6.1 的路径（staging 视角）
- `git diff --stat -- client server .github docker-compose.e2e.yml` 必须 **0 行**
- `e2e/playwright.config.ts` diff 只允许 testMatch/testIgnore 改动

## 7. 验收标准

### 7.1 硬性验收（DSH 人工 apply 后）
| 检查 | 通过标准 |
|---|---|
| `cd e2e && npx playwright test --project=admin --project=hr --project=hiring_manager --project=interviewer tests/_menu-matrix.spec.ts` | **8 用例全过**（4 角色 × 可见/隐藏）|
| 反向可重跑（flaky 检查） | `--repeat-each=2` 或连跑 2 次全绿 |
| 越界 | client/server/.github/docker-compose 0 行 |
| 存量回归 | `--project=chromium tests/candidates.spec.ts` 等存量 spec 仍绿（chromium testIgnore 未误伤） |

### 7.2 交付报告模板（STAGING_REPORT.md 必须完整包含）
1. 完成范围概述（3 个文件：menu-matrix 填充 / 新 spec / config 2 行）
2. 矩阵表（19 行）逐行 before→after
3. 断言统计：可见 41 + 隐藏 35 = 76（附计算方法）
4. `playwright.config.ts` diff 前后对照（仅 testMatch/testIgnore）
5. 越界自检（staging 目录全文 + git diff 预期 0 行）
6. 已知问题与遗留风险（如 `:has-text` 包含匹配的边界）
7. 回退方式（apply -R + 删新增文件）
8. 红线自检确认（强约束 1-7 逐条）

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手到 staging/E2E-P1/。**不要写到仓库根！** 最终回复给出完整交付报告。