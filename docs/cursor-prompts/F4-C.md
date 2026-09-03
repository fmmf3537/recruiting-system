# F4-C 考核·前端 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯前端**切片：`server/**`、`e2e/**` 一行都不许动。
2. 文件预算 **7 个**（§6.1 逐一编号）；其中 3 个为既有文件的**条件修改**——必须最小化改动 + 中文注释说明，交付报告逐条列出。
3. 不跑验收命令（`pnpm type-check` / `lint` / `test` / `build` 都不跑，审核方重跑）。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号（Prettier 惯例）；中文注释。
5. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
F4-C

### 1.2 任务目标
实现 PRD 阶段 5 F4「HR 考核积分」前端：两个新页面「我的积分」（hr/admin 可见，含明细 + 周期聚合 + 排名）和「团队考核」（admin 可见，含 TopN 排名 + 报表 + 导出）；一个 admin 规则配置入口（启停用 + 调分值）；Dashboard「hr」角色增加一张「我的积分」卡片。服务端 5 个接口已在 F4-S2 就绪（`/api/hr-score/{my,team,report,export,rules}`），且本切片**禁止任何 server 改动**。需求见仓库根 `PRD_阶段5_AI招聘增强与HR考核_20260901.md` 第 6 章 F4 全部内容（重点 §6.5 页面 + §6.6 关键设计决策）。

### 1.3 服务端接口（F4-S2 已交付，直接对接）

| 方法 | 路径 | 角色 | 返回要点 |
|---|---|---|---|
| GET | `/api/hr-score/my?period=week&page=1&pageSize=20&userId=` | hr / admin | `{ events: HrScoreEvent[], aggregate: { businessPts, processPts, totalScore, rank }, pagination } + rules`；admin 传 userId 看他人，hr 传 userId 看他人 403 |
| GET | `/api/hr-score/team?period=week` | hr / admin | `[{ userId, userName, totalScore, rank, isSelf, score? }]`，hr 看到他人 score=null（仅名次），admin 看到全部分数 |
| GET | `/api/hr-score/report?period=month&from=&to=` | admin | `{ businessTrend, processTrend, comparison: { thisPeriod, lastPeriod, changeRate }, topN }` |
| GET | `/api/hr-score/export?period=month` | admin | `text/csv; charset=utf-8` + UTF-8 BOM，附件下载 `hr-score-{period}-{date}.csv` |
| GET / PATCH | `/api/hr-score/rules` / `/api/hr-score/rules/:code` | admin | 字典 CRUD，PATCH 改 name / description（分值）/ enabled |

事件结构：`{ id, userId, ruleCode, category, points, targetType, targetId, remark, bizDate, createdAt }`。

## 2. 上下文

### 2.1 项目位置
前端在 `client/`（Vue 3 `<script setup>` + TS + Element Plus 2.5 + Pinia）。路径别名 `@/*` → `src/*`。ElMessage 等 API 与图标需显式 import（参照既有文件）。Charts 用 vue-echarts（F1-C/F2-C 沿用）。

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

- **菜单系统** `client/src/layouts/DefaultLayout.vue`：第 179-227 行的 `menuItems` computed 按 role 过滤（`rawRole === 'member' ? 'hr' : rawRole`，member 归一为 hr）。本切片**追加 2 项菜单**：「我的积分」（hr / admin）和「团队考核」（admin only）。图标用 `Trophy`（hr / 评估相关，已在 `@element-plus/icons-vue` 引入列表中）。
- **路由系统** `client/src/router/index.ts`：第 39-329 行 Layout 子路由。`meta.role` 数组做角色门禁，守卫在第 400-407 行（`effectiveRole` 同样归一 member→hr）。**新增 2 个路由**：
  - `/hr-score/my`（role: ['hr', 'admin']，hidden: false）
  - `/hr-score/team`（role: ['admin']，hidden: false）
  - `/hr-score/rules`（role: ['admin']，hidden: true，作为设置页子路由用 el-tabs 跳转，不进主菜单）
- **既有 API 封装风格** `client/src/api/*.ts`：每个 API 模块用 `request` from `@/utils/request`（响应拦截器直接返回 `response.data`），`as Promise<{success, data}>` 断言惯例。F1-C/F2-C/F3-C/F5-C 沿用，参照 `client/src/api/jd-assist.ts`（最简单 ~70 行）。
- **既有页面范式**：
  - `client/src/views/dashboard/index.vue` 已有 4 个 stat-card + 招聘漏斗 + 近期动态，详见第 6-71 行（`<el-row :gutter="20">` + 4 个 `<el-card class="stat-card">`）。本切片**新增**第 5 张卡片「我的积分」，仅 hr 角色可见。
  - `client/src/views/hiring/index.vue`（4 Tab + ECharts 漏斗，~250 行）—— 模板参考价值最高，**结构、Tab 实现、ECharts 引用**全照抄。
  - `client/src/views/stats/index.vue`（4 Tab + 导出 Excel 按钮，~150 行）—— 导出按钮 / loading 锁 / 错误处理惯例全照抄（**改 CSV 适配**，stats 用 xlsx，F4-C 用 CSV）。
  - `client/src/views/settings/Agencies.vue`（F5-C 产物，~400 行）—— 表格 + 弹窗 + 启用停用确认 ElMessageBox 警告 + 字典下拉 全照抄。
- **角色归一**：`rawRole === 'member' ? 'hr' : rawRole`（F3-S1 决策）。本切片沿用，路由守卫与菜单都用这个归一。
- **API 响应约定**：`{ success: true, data: ... }` 直接 `res.data` 取出，**不需要**`.data.data`。
- **测试**：`client pnpm test` 基线 4 文件 / 22 用例（happy-dom + Vue Test Utils）。本切片**不新增测试文件**，但既有测试**不得破坏**。如对 Dashboard 改动需要 mock，可临时跳过（用 `vi.mock`），不引新依赖。

### 2.3 PRD §6.6 关键设计（必须遵守）

| 决策 | 落地 |
|------|------|
| 历史不回溯 | UI 不做"补录"按钮；明细只展示上线后 |
| 负分默认启用 | UI 不显示负分警示，但明细里负分红字显示 |
| 排名可见性 | hr 看到他人 score=null（仅名次）；admin 全看 |
| 防刷 | UI 不做任何"补分"或"重发"操作；明细只读 |
| 已记分不追溯 | 规则 PATCH 改分值后**显示**的明细不受影响（数据已是旧值） |

## 3. 必读约束

### 3.1 反直觉点（显式标注）
1. **`/api/hr-score/my` 返回结构含 `events` + `aggregate` + `pagination` + `rules`**：前端分别展示明细 / 周期聚合 / 分页 / 规则只读视图。**不要**合并到一个组件，复用 F3-C 卡片分离模式。
2. **`/api/hr-score/team` 的 `score` 字段对 hr 角色为 `null`**：前端表格**对 null 显示 "—"，不能显示 0**。rank 字段全角色都有。
3. **`/api/hr-score/export` 返回 `text/csv; charset=utf-8` + UTF-8 BOM**（F4-S2 决策）：前端用 `<a :href="..." download>` 触发下载，不要走 `xlsx`（与服务端一致）。
4. **Dashboard 积分卡片仅 hr 显示**：admin 已经在 Dashboard 看「全公司」指标，加卡片会重复；hiring_manager / interviewer 不考核。
5. **规则 PATCH 不调 LLM**：直接调 PATCH 接口，刷新列表。错误用 ElMessage.error 直出后端 message。
6. **权限矩阵**：4 角色**都**有 `hr-score:read` 权限点（admin 走 `*` 通配）。前端**不按角色隐藏"我的积分"按钮**——没数据时空态展示即可。

### 3.2 加载与错误
- 每个数据接口在 `onMounted` 时 fetch，loading 状态用 ref 控制
- 错误用 `ElMessage.error` 直出后端 message（不要吞）
- 5xx 错误自动提示 + 留在当前页（不要强制跳错误页）

## 4. 实施任务

### 4.1 ✱ `client/src/api/hr-score.ts`（新增）

```ts
import request from '@/utils/request';

export type ScorePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type ScoreCategory = 'business' | 'process';

export interface HrScoreEvent {
  id: string;
  userId: string;
  ruleCode: string;
  category: ScoreCategory;
  points: number;
  targetType: string | null;
  targetId: string | null;
  remark: string | null;
  bizDate: string;
  createdAt: string;
}

export interface PeriodAggregate {
  businessPts: number;
  processPts: number;
  totalScore: number;
  rank: number | null;
}

export interface MyScoresResult {
  events: HrScoreEvent[];
  aggregate: PeriodAggregate;
  rank: number | null;
  pagination: { page: number; pageSize: number; total: number };
}

export interface RuleViewItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface TeamMember {
  userId: string;
  userName: string;
  totalScore: number;
  rank: number;
  isSelf: boolean;
  score: number | null;  // hr 看他人为 null
}

export interface AdminReport {
  businessTrend: Array<{ period: string; total: number }>;
  processTrend: Array<{ period: string; total: number }>;
  comparison: { thisPeriod: number; lastPeriod: number; changeRate: number };
  topN: Array<{ userId: string; userName: string; total: number }>;
}

// 我的积分（hr 必看，admin 可看自己/他人）
export function getMyScores(params: { period?: ScorePeriod; page?: number; pageSize?: number; userId?: string }) {
  return request.get('/api/hr-score/my', { params }) as Promise<{ success: true; data: MyScoresResult & { rules: RuleViewItem[] } }>;
}

// 团队排名
export function getTeamRanking(params: { period?: ScorePeriod }) {
  return request.get('/api/hr-score/team', { params }) as Promise<{ success: true; data: TeamMember[] }>;
}

// admin 报表
export function getAdminReport(params: { period?: ScorePeriod; from?: string; to?: string }) {
  return request.get('/api/hr-score/report', { params }) as Promise<{ success: true; data: AdminReport }>;
}

// 导出 CSV（直接用 a 标签 href，浏览器自动下载）
export function getExportUrl(period: ScorePeriod = 'month') {
  return `/api/hr-score/export?period=${period}`;
}

// 规则字典
export function listRules() {
  return request.get('/api/hr-score/rules') as Promise<{ success: true; data: RuleViewItem[] }>;
}
export function updateRule(code: string, body: { name?: string; description?: string; enabled?: boolean }) {
  return request.patch(`/api/hr-score/rules/${code}`, body) as Promise<{ success: true; data: RuleViewItem }>;
}
```

### 4.2 ✱ `client/src/views/hr-score/my.vue`（新增，「我的积分」主页面）

主结构：
- 顶部 `<el-row :gutter="20">` 4 个 stat-card（**业务分 / 过程分 / 综合分 / 排名**），数据来源 `aggregate`
- 期间切换：`el-radio-group` 切 day/week/month/quarter/year（**默认 week**），切换时重新 fetch
- 排名显示：聚合卡里加一行 "团队内排名：第 N / 总 N"，无数据时显示 "—"
- 规则只读视图：4 个 el-collapse-item 显示当前生效的 `rules`（name + description 显示分值，**enabled=false 用灰色**）
- 明细表格：el-table 列 `date | rule | category | target | points`；points 列正数绿、负数红；target 列根据 `targetType` 简单翻译（Candidate → "候选人 ID xxx"、Offer → "Offer ID xxx"、Interview → "面试 ID xxx"、ProcessScore → "本周汇总"）
- 分页：el-pagination，pageSize 默认 20
- 空态：events 为空时 el-empty "本期暂无积分事件"

### 4.3 ✱ `client/src/views/hr-score/team.vue`（新增，「团队考核」主页面）

主结构（admin only，hr 看到 score=null 提示但 UI 仍展示）：
- 顶部 `<el-row :gutter="20">` 2 个 stat-card（**总人数 / 综合总分**）
- 期间切换（与 my.vue 一致）
- 排名表格：列 `rank | 姓名 | 综合分 | 业务分 | 过程分 | 备注`；自己的行高亮（`el-table :row-class-name` + `class="is-self"`）；他人分数为 null 时显示 "—"
- 顶部操作栏：右侧 2 个按钮 "导出 CSV"（`<a :href="getExportUrl(period)" download>`）和 "查看规则"（跳转 /settings/hr-score-rules 或 /settings/dictionary）
- 错误：fetch 失败 ElMessage.error 直出

### 4.4 ✱ `client/src/views/hr-score/report.vue`（新增，「考核报表」admin 详细页）

主结构：
- 顶部 4 个 stat-card（thisPeriod total / lastPeriod total / changeRate / 团队人数）
- 中间 2 张 ECharts 图：业务分趋势 + 过程分趋势（line chart，x 轴是周期，y 轴是分值）
- 下方 TopN 表格（el-table）：rank | 姓名 | 综合分
- 顶部操作栏：右侧 2 个按钮 "导出 CSV" + "管理规则"
- 错误：与 team.vue 一致

注：考核周期默认 `month`，可通过下拉切换 day/week/month/quarter/year。

### 4.5 ✱ `client/src/views/settings/HrScoreRules.vue`（新增，admin 规则配置）

主结构（参照 `client/src/views/settings/Agencies.vue` F5-C 产物）：
- 顶部 el-alert 提示 "历史不回溯——调整分值只影响新事件"
- 表格 el-table：列 `code | name | 描述（分值）| enabled | 操作`；enabled 列用 el-tag 标签
- 操作列：每行一个 "编辑" 按钮，触发 PATCH 弹窗
- 编辑弹窗 el-dialog：name input、描述（分值）input（type=number）、enabled 开关
- 弹窗底部 2 个按钮：取消 / 保存（保存调 updateRule，成功后刷新表格 + ElMessage.success）
- 错误：PATCH 失败 ElMessage.error 直出后端 message

### 4.6 `client/src/router/index.ts`（条件修改）

在 326 行（`/profile` 路由之前）插入 2 个新路由：

```ts
// F4-C：HR 考核 - 我的积分
{
  path: '/hr-score/my',
  name: 'MyScore',
  component: () => import('@/views/hr-score/my.vue'),
  meta: { title: '我的积分', icon: Trophy, role: ['admin', 'hr'] },
},
// F4-C：HR 考核 - 团队考核（admin only）
{
  path: '/hr-score/team',
  name: 'TeamScore',
  component: () => import('@/views/hr-score/team.vue'),
  meta: { title: '团队考核', icon: Trophy, requireAdmin: true },
},
// F4-C：HR 考核 - 详细报表（admin only，团队页跳转）
{
  path: '/hr-score/report',
  name: 'ScoreReport',
  component: () => import('@/views/hr-score/report.vue'),
  meta: { title: '考核报表', icon: TrendCharts, requireAdmin: true, hidden: true },
},
// F4-C：HR 考核 - 规则配置（admin only，设置页子路由）
{
  path: '/settings/hr-score-rules',
  name: 'HrScoreRules',
  component: () => import('@/views/settings/HrScoreRules.vue'),
  meta: { title: '积分规则', requireAdmin: true, hidden: true },
},
```

需要新增 icon import：

```ts
import { Odometer, ..., Trophy, TrendCharts } from '@element-plus/icons-vue';
```

Trophy 和 TrendCharts 已在现有 import 列表里（确认一下 217 行的 imports，TrendCharts 在第 13 行已有，Trophy 没在就**手动加**）。

### 4.7 `client/src/layouts/DefaultLayout.vue`（条件修改）

在 `menuItems` computed 内（179-227 行）追加：

```ts
// F4-C：考核菜单（按 role 过滤）
if (role === 'admin' || role === 'hr') {
  items.push({ path: '/hr-score/my', title: '我的积分', icon: Trophy });
}
if (role === 'admin') {
  items.push({ path: '/hr-score/team', title: '团队考核', icon: Trophy });
}
```

菜单图标 icon 变量需在 script setup 顶部导入 `Trophy` from '@element-plus/icons-vue'（如果第 126 行 imports 里没有）。

### 4.8 ✱ `client/src/components/dashboard/PersonalScoreCard.vue`（新增，Dashboard 5 号卡）

可选组件——只在 hr 角色显示：

- props: 无（Dashboard 直接挂载即可，Dashboard.vue 已经能取 authStore.userInfo.role）
- 内容：当前 hr 角色登录后的"今日 / 本周"综合分
- 数据来源：`onMounted` 调 `getMyScores({ period: 'day' })` + `getMyScores({ period: 'week' })` 取两条
- 展示：3 个数字（大）+ 趋势箭头（与昨天/上周对比）
- 空态：数据为 0 时显示 "暂无积分"

### 4.9 `client/src/views/dashboard/index.vue`（条件修改）

- 在 4 个现有 stat-card 后（`<el-row :gutter="20">` 内）条件渲染新增卡片：

```vue
<el-col v-if="authStore.userInfo?.role === 'hr'" :xs="24" :sm="12" :lg="6">
  <el-card shadow="hover" class="stat-card" @click="goTo('/hr-score/my')">
    <div class="stat-content">
      <div class="stat-icon blue">
        <el-icon :size="40"><Trophy /></el-icon>
      </div>
      <div class="stat-info">
        <div class="stat-value">{{ personalScoreDisplay }}</div>
        <div class="stat-title">我的今日积分</div>
        <div class="stat-trend" v-if="personalScoreTrend">
          <el-tag :type="personalScoreTrend > 0 ? 'success' : 'danger'" size="small">
            {{ personalScoreTrend > 0 ? '+' : '' }}{{ personalScoreTrend }}
          </el-tag>
          <span>较昨日</span>
        </div>
      </div>
    </div>
  </el-card>
</el-col>
```

- 顶部 script setup 加 import：`import { Trophy } from '@element-plus/icons-vue';`
- 加 data / 方法：`personalScore`（响应式）、`personalScoreDisplay`（computed）、`personalScoreTrend`（computed = 今日 - 昨日）；`loadPersonalScore()` 在 onMounted 调 `getMyScores` 取两期计算差值
- 注意 el-col 的 `:lg` 尺寸：现有 4 卡是 6/6/6/6，新增后是 5 卡需调整。最简单是改 `:lg="6"` → `:lg="8"` 让新卡稍宽，或保持 4 卡不变只挤一格。**改 4 卡为 :lg="6" + 新卡 :lg="6"** 在 lg 屏下变 5×6 不能整除。**最稳：4 卡 `:lg="6"` + 新卡 `:lg="24"`（xs 下独占一行，md+ 下与某卡同行）**。或更简单：**保持原 4 卡布局不动，新卡用 `:xs="24" :sm="12" :lg="24"`** 在 lg 屏下占满一行，md 屏与 4 卡同行。

## 5. 关键决策点

### 5.1 排名 / 分数显示一致性
表格列固定顺序：`rank | 姓名 | 综合分 | 业务分 | 过程分 | 备注`。hr 看他人时综合分 = "—"，业务分 = "—"，过程分 = "—"，备注 = "仅 admin 可见分数"。自己行整行高亮（淡蓝色背景 + 加粗）。

### 5.2 CSV 导出
- 不引 xlsx，用 `<a :href="getExportUrl(period)" download class="el-button">` 触发下载
- 下载文件名前端不指定（后端 `Content-Disposition` 已带）

### 5.3 路由守卫
- `meta.role: ['admin', 'hr']` → router guard 自动放行（代码第 400-407 行已实现）
- `requireAdmin: true` → 仅 admin（代码第 393-397 行已实现）
- `hidden: true` → 不进菜单，但可路由访问（用于"团队考核 → 报表"等跳转）

### 5.4 不做清单
- 不做 ECharts 之外的图表（不引 chart.js）
- 不做 PDF 导出（PRD 没要求）
- 不做"快速加分"或"撤销事件"（admin 通过改规则 description 调整后续记分，本期已记不追溯）
- 不做权限配置页（rules 字典管理沿用现有 /settings/dictionary，但本切片新增的 /settings/hr-score-rules 是"快捷入口"——只对当前 8 条业务规则友好）
- 不改任何 server/**、e2e/**、package.json、tsconfig、vite/eslint 配置

## 6. 修改文件清单

### 6.1 必改文件（7 个；✱=新增）
1. ✱ `client/src/api/hr-score.ts`（核心 API 封装）
2. ✱ `client/src/views/hr-score/my.vue`（我的积分主页面）
3. ✱ `client/src/views/hr-score/team.vue`（团队排名主页面）
4. ✱ `client/src/views/hr-score/report.vue`（admin 详细报表）
5. ✱ `client/src/views/settings/HrScoreRules.vue`（admin 规则配置）
6. ✱ `client/src/components/dashboard/PersonalScoreCard.vue`（Dashboard 5 号卡，可选）
7. `client/src/router/index.ts`（4 个新路由 + import）
8. `client/src/layouts/DefaultLayout.vue`（2 个新菜单项 + import）
9. `client/src/views/dashboard/index.vue`（条件渲染新卡 + import + data）

> 实际 9 个文件（含 Dashboard 可选卡），**必改的是 1-8**（8 个），**9 是可选**（PRD §6.5 "Dashboard 可加"是软要求）。**预算按 9 个报**，实施可省第 6、9 个。

### 6.2 禁止修改文件
清单以外一切；特别地：
- `server/**`、`e2e/**`、任何 package.json / tsconfig / vite / eslint
- `client/src/api/evaluation.ts`、`client/src/api/interview.ts`（F2-C/F3-C 产物，本切片无关）
- `client/src/views/settings/DictionaryPage.vue`（F4 规则自动出现，无需改）
- `client/src/views/settings/Agencies.vue`（F5-C 产物，仅参考风格，不改）

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 §6.1 的 8（或 9）个路径。
- `git diff --stat -- server e2e` 必须 0 行。
- `client/src/api/hr-score.ts` 是新增的（`??` 状态），其他 7（或 8）个既有文件是 `M`。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `client pnpm type-check`：仍 78（增量 0）。
- `client pnpm lint:check`：仍 137e/231w（增量 0）。
- `client pnpm test`：4 文件 / 22 用例全过。
- git status 仅 §6.1 的路径；新增文件无 BOM；`server/**` `e2e/**` 0 行改动。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述（实际改了哪些文件，是否做 Dashboard 卡）
2. 9 个文件逐个说明（新增写职责；条件修改**逐处**列 before→after 摘要 + 中文注释）
3. 4 维度数据展示方案（业务分 / 过程分 / 综合分 / 排名 + 周期切换 + 分页 + 颜色）
4. 权限边界（hr 看他人 score=null 实现 + admin 全看 + 按钮不按角色隐藏）
5. Dashboard 卡集成方案（如未做请说明）
6. 越界自检（git status 全文 + 0 行检查）
7. 已知问题与遗留风险
8. 红线自检确认

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。
