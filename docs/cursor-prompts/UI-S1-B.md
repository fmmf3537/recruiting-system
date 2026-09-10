# UI-S1-B：导航分组 + 面包屑（修正版，**取代 UI-S1.md**）

> **重要前提修正**（2026-09-10 核实）：原 `UI-S1.md` 针对 `client/src/components/layout/Sidebar.vue` + `Navbar.vue`，
> 但这两个文件是**死代码**——只被 `components/layout/index.vue` 引用，而后者在 `client/src` 内**零外部引用**。
> 线上真正生效的是 `client/src/layouts/DefaultLayout.vue`（501 行，router/index.ts:41 挂载）。
> **本切片只改 `DefaultLayout.vue` 一个文件，不动 Sidebar.vue / Navbar.vue / components/layout/ / router/index.ts。**

---

## 1. 目标（本切片要什么）

1. 侧边栏 19 个菜单项按职能分组，减少平铺带来的视觉噪音
2. 顶栏补**真实面包屑**（当前只有 `route.meta.title` 一个页面标题，无层级）
3. **不动通知铃铛**——DefaultLayout 已有完整实现（未读 badge + 下拉面板 + `notificationStore` 轮询 + 跳 `/notifications`），再加第二个铃铛是重复入口

---

## 2. 允许改动的文件（**严格 1 个**）

| 文件 | 允许 |
|---|---|
| `client/src/layouts/DefaultLayout.vue` | ✅ 唯一可改 |
| `client/src/components/layout/**` | ❌ 死代码，本切片不碰 |
| `client/src/router/index.ts` | ❌ 不改（分组映射写在本文件内，不写 `meta.group`） |
| `server/**` `e2e/**` `mobile/**` `client/src/api/**` | ❌ 越界 |

---

## 3. 现状事实（已核实，作为实现依据）

- 菜单**不是**从 `router.meta` 过滤出来的，而是 `menuItems` computed（第 180–241 行）里按角色 `push` 出来的
- 角色归一化：`rawRole === 'member' ? 'hr' : rawRole`（第 185–186 行），**必须原样保留**
- 现有 19 个菜单项（**顺序即现有顺序，改造后分组内保持此顺序**）：

| # | path | title | 角色条件（逐条保留） |
|---|---|---|---|
| 1 | `/dashboard` | 仪表盘 | 无（所有人） |
| 2 | `/hiring` | 招聘工作台 | admin / hiring_manager |
| 3 | `/jobs` | 职位管理 | admin / hr |
| 4 | `/settings/agencies` | 猎头机构 | admin / hr |
| 5 | `/candidates` | 候选人管理 | role !== 'interviewer' |
| 6 | `/interview` | 面试官工作台 | admin / interviewer / hiring_manager |
| 7 | `/interviews` | 面试管理 | admin / hr / hiring_manager |
| 8 | `/offers` | Offer管理 | role !== 'interviewer' |
| 9 | `/stats` | 数据统计 | role !== 'interviewer' |
| 10 | `/hr-score/my` | 我的积分 | admin / hr |
| 11 | `/hr-score/team` | 团队考核 | （按源码条件保留） |
| 12 | `/notifications` | 消息通知 | （按源码条件保留） |
| 13 | `/hc-requests` | 编制管理 | （按源码条件保留） |
| 14 | `/users` | 成员管理 | （按源码条件保留） |
| 15 | `/settings/dictionary` | 字典管理 | （按源码条件保留） |
| 16 | `/settings/tags` | 标签管理 | （按源码条件保留） |
| 17 | `/settings/pipeline-templates` | 流程模板 | （按源码条件保留） |
| 18 | `/settings/ai` | AI 设置 | （按源码条件保留） |
| 19 | `/settings/automation-rules` | 自动化邮件 | （按源码条件保留） |

> 第 11–19 项的角色条件以**源码原文为准**，不要凭猜测改写。

---

## 4. 实现要求

### 4.1 分组映射（写在本文件内，不写进 router）

在 `DefaultLayout.vue` 的 `<script setup>` 内新增一个**常量映射表**（中文注释：`UI-S1：菜单分组映射（与 router 解耦，不改路由文件）`）：

```ts
const MENU_GROUPS: { title: string; paths: string[] }[] = [
  { title: '招聘作业', paths: ['/dashboard', '/hiring', '/jobs', '/candidates', '/offers'] },
  { title: '面试',     paths: ['/interview', '/interviews'] },
  { title: '数据与考核', paths: ['/stats', '/hr-score/my', '/hr-score/team'] },
  { title: '设置与管理', paths: ['/hc-requests', '/users', '/settings/agencies',
                                '/settings/dictionary', '/settings/tags',
                                '/settings/pipeline-templates', '/settings/ai',
                                '/settings/automation-rules', '/notifications'] },
];
```

**分组必须满足**：
1. **19 个 path 一个不多、一个不少**；映射表里出现任何源码没有的 path（例如 `/interviews/my`）都是错误
2. 若某个 path 因角色过滤后不存在于 `menuItems`，该组**不渲染**（空组隐藏）
3. 分组内顺序 = 上表顺序
4. 兜底：任何未在映射表中的 path（未来新增菜单）**必须归入末尾的「其他」组并显示**，不得被丢弃——
   实现时先算出 `groupedPaths` 集合，剩下的 push 进「其他」

### 4.2 双轨渲染（开关）

- 开关名：`uiNewNavLayout`，localStorage 键 `ui:new-layout:UI-S1`
- **默认必须为 `false`（灰度）**：

```ts
const uiNewNavLayout = ref(localStorage.getItem('ui:new-layout:UI-S1') === 'true');
```

> ⚠️ **UI-S1 是唯一保持灰度的切片**：它改变所有人找菜单的路径，影响面大于 S2/S4/S5。
> **不要写成 `!== 'false'`**（那会导致键缺失时默认开启）。

- 开关关闭时：`v-else` 分支渲染**与现在完全一致的扁平 `<el-menu-item v-for>`**（第 24 行原写法原样保留）
- 开关打开时：用 `el-sub-menu` 渲染分组；`el-menu` 的 `default-openeds` 建议全部展开，避免用户找不到

### 4.3 面包屑

- 仅**开关打开**时渲染，放在顶栏 `page-title`（第 44 行）位置
- 关闭时仍只显示 `{{ route.meta.title }}`，保持现状
- 层级 = **分组名 / 当前页名**（`MENU_GROUPS` 里查当前 path 所属分组 + `route.meta.title`）
- 若当前页不在任何分组（兜底「其他」），只显示页面名，不显示分组名
- 不要用 `route.matched`——所有子路由都平铺在 `/` 下（全文件仅 1 处 `children:`），matched 拿不到有意义的层级

### 4.4 明确禁止

1. ❌ 删除/改名/隐藏任何菜单项（19 项必须全部可达）
2. ❌ 改动任何角色过滤条件（含 `member → hr` 归一化）
3. ❌ 新增第二个通知铃铛、红点、badge
4. ❌ 动 `components/layout/`（死代码）或 `router/index.ts`
5. ❌ 整文件重写（501 行）；只做局部插入 + `v-if/v-else`
6. ❌ 新增依赖（图标用已导入的 Element Plus icons）
7. ❌ 跑 type-check / lint / test / build（审核方重跑；基线 type-check 88、lint 137e/224w、client test 4 文件 / 22 用例，只许少不许多）

### 4.5 编码规范

- UTF-8 无 BOM / LF / 单引号 / 中文注释
- `$ui-*` 变量只能出现在 `<style scoped lang="scss">` 内（**红线 7.5**）

---

## 5. 交付报告必须包含

1. 逐个文件的改动说明（before → after）
2. **菜单项守恒对照表**：19 项逐条列出「path / title / 改造前后所在分组 / 角色条件是否变化」
3. 分组映射表实际落地内容（贴代码）
4. 面包屑渲染示例（至少 2 个页面：如 `/candidates` → 招聘作业 / 候选人管理；`/settings/ai` → 设置与管理 / AI 设置）
5. 功能零回归自检表（菜单项、路由 path、角色可见性、通知铃铛、开关回退）
6. 越界自检：`git status --short` + `git diff --stat -- server e2e mobile client/src/api client/src/router`（必须 0 行）
7. 已知问题与遗留风险
8. 红线自检逐条确认（含 7.5）
9. 回退方式：`localStorage.setItem('ui:new-layout:UI-S1','false')` 后刷新

> ⚠️ 每个切片的 git 命令必须**重新执行**，不要复用上一份报告的输出。

---

## 6. 若发现与本文档描述不符

**停下来报告，不要自行折中。** 特别是：
- 若第 11–19 项菜单的实际角色条件与上表占位描述不同 → 按源码原文实现，并在报告中说明
- 若 `DefaultLayout.vue` 的行号与本文描述的 180–241 / 24 / 44 行有偏差 → 以实际内容为准，报告里注明实际行号
