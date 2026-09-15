# HRW-C HR 工作负载监控前端 执行提示词

## ⚠️ 强约束（最优先阅读）
1. **纯前端切片**：只允许改 `client/src/**`；**禁改** `server/**`、`e2e/**`、根配置、CI/部署文件。
2. **文件预算 ≤ 7 个**；既有文件最小 diff；新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释。
3. **禁新增依赖**；ECharts 已存在，复用 `vue-echarts` 与现有按需注册模式。
4. **不跑验收命令**（type-check/lint/build 由审核方重跑）；**不要 git commit / push**。
5. 必须先读 `docs/PRD_HR工作监控_20260928.md`；接口契约以后端 HRW-S 为准，如未定稿按本提示词 §2.3 实现并在报告标注假设。
6. headless 无人工确认：先输出实施计划，然后直接动手，最终按 §7.2 交付报告。

## 1. 任务 ID + 目标
### 1.1 任务 ID
HRW-C

### 1.2 目标
实现 admin 专用 `HR 工作监控` 页面：日/周/月筛选、总览卡片、HR 排行榜、过程量/转化率图、薄弱环节提示、个人下钻抽屉、导出。

## 2. 上下文
### 2.1 已确认口径
- 过程+结果都要；按操作人归属；薄弱环节按招聘漏斗转化率；第一期仅 admin 可见。
- 第一期不做 HR 自视图，不做 KPI 配置。

### 2.2 关键已核实事实
- 现有统计页：`client/src/views/stats/index.vue`，已用 ECharts + Element Plus，有工作量 Tab 可参考。
- 路由：`client/src/router/index.ts`；`meta.requireAdmin` 控制 admin-only。
- 菜单：`client/src/layouts/DefaultLayout.vue`；`MENU_GROUPS` 里 `数据与考核` paths 需加入新页面 path；`menuItems` admin 分支加菜单。
- API 封装目录：`client/src/api/`；统计 API 参考 `client/src/api/stats.ts`。

### 2.3 接口契约（若后端未合入，按此实现）
```ts
GET /api/hr-workload/overview?period=day|week|month&date=YYYY-MM-DD&department=&hrId=
GET /api/hr-workload/users/:hrId?period=...&date=...&includeTimeline=true&includeCandidates=true
GET /api/hr-workload/export?period=...&date=...&department=&hrId=
```
- 导出用 `responseType:'blob'` 下载。
- admin 以外角色 403；前端不显示菜单。

## 3. 必读约束
### 3.1 反直觉点
1. 转化率 `null` 必须显示 `—`，不要显示 `0%`。
2. 样本不足要显示标签，不参与薄弱排行。
3. 排行榜默认按入职数排序；可切换排序字段。
4. 下钻候选人列表默认脱敏：不显示手机号/邮箱明文，除非现有候选人详情接口已允许。
5. 导出按钮必须有 loading，避免重复点击。

### 3.2 权限/菜单
- 路由 meta：`requireAdmin: true`。
- 菜单：仅 `authStore.isAdmin` 显示。
- 页面直接访问时由路由守卫拦截；页面内部不再单独做假权限判断。

## 4. 实施任务（逐文件）
1. `client/src/api/hr-workload.ts`（✱新增）
   - 定义 `HrWorkloadQuery`、`HrWorkloadOverview`、`HrWorkloadRow`、`HrWorkloadDetail`。
   - `getHrWorkloadOverview` / `getHrWorkloadUserDetail` / `exportHrWorkload`。
2. `client/src/views/stats/HrWorkload.vue`（✱新增）
   - 页面结构按 PRD §5.2：筛选区、总览卡片、排行榜表格、图区、个人下钻抽屉。
   - 图表：过程量柱状图、入职率排行、团队漏斗、薄弱环节分布。
   - 状态标签：`正常 / 需关注转化 / 样本不足 / 忙碌但低效`。
   - 导出调用 blob 下载，文件名取后端 `Content-Disposition` 或默认 `HR工作监控_日期.xlsx/csv`。
3. `client/src/router/index.ts`（条件修改）
   - 新增 `/stats/hr-workload`，`name: 'HrWorkload'`，`meta.requireAdmin=true`，icon 用 `TrendCharts` 或现有图标。
4. `client/src/layouts/DefaultLayout.vue`（条件修改）
   - `MENU_GROUPS` 的 `数据与考核` paths 加 `/stats/hr-workload`。
   - admin 菜单加 `{ path: '/stats/hr-workload', title: 'HR 工作监控', icon: TrendCharts }`。
5. `client/src/api/stats.ts`（条件修改，可选）
   - 仅在需要复用/导出类型时最小修改；不要重构旧 API。
6. `client/src/views/hr-score/team.vue`（禁止改，仅参考样式）
7. 若需要公共小组件，优先内联在 `HrWorkload.vue`，不新增抽象。

## 5. 关键决策点（默认方案 + 理由）
- **独立页面而非塞进现有 stats Tab**：管理监控信息密度高，独立页更利于下钻与导出。
- **下钻用抽屉**：不离开监控上下文，符合“管理驾驶舱”使用方式。
- **图表复用现有 ECharts 模式**：避免新依赖与样式漂移。
- **第一期不接 hr-score**：避免把激励规则和管理监控耦合；后续三期再打通。

## 6. 修改文件清单
### 6.1 必改文件（✱=新增）
1. `client/src/api/hr-workload.ts` ✱
2. `client/src/views/stats/HrWorkload.vue` ✱
3. `client/src/router/index.ts`
4. `client/src/layouts/DefaultLayout.vue`
5. `client/src/api/stats.ts`（可选，最小）
6. `client/src/types/<如确需>`（不建议新增）
7. `client/src/utils/<如确需>`（不建议新增）

### 6.2 禁止修改文件
- `server/**`
- `e2e/**`
- `client/vite.config.ts`
- 任何 CI/部署文件

### 6.3 越界检测（交付报告贴结果）
```bash
git status --short -- client server e2e
git diff --stat -- server e2e client/vite.config.ts
```
要求：`server`、`e2e`、`client/vite.config.ts` 为 0 行。

## 7. 验收标准
### 7.1 硬性验收（审核方执行，你不跑）
- `cd client && npx vue-tsc --noEmit`：不超过存量 88 个 TS 错误。
- `cd client && pnpm lint:check`：不超过存量 137 errors / 224 warnings。
- 手工页面验证：admin 可见菜单；hr/interviewer 不可见；日/周/月切换刷新；点 HR 下钻；导出可下载；null 转化率显示 `—`。

### 7.2 交付报告模板（最终回复必须包含）
1. 实施计划摘要（≤8 行）
2. 实际修改文件列表（对应 §6.1）
3. 页面结构与接口字段映射
4. 权限/菜单/路由落实情况
5. 未实现项与原因（若有）
6. 风险点（后端契约假设、导出文件名、图表空态）
7. 越界自检命令输出
8. 给审核方的手工验证步骤

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手，最终回复给出完整交付报告。
