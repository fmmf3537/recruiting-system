# HRW-S HR 工作负载监控服务端 执行提示词

## ⚠️ 强约束（最优先阅读）
1. **纯服务端切片**：只允许改 `server/src/**`、`server/tests/**`；**禁改** `client/**`、`e2e/**`、`server/prisma/**`、根配置、CI/部署文件。
2. **文件预算 ≤ 8 个**；既有文件最小 diff；新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释。
3. **禁 prisma migrate / schema 变更**；不新增依赖（`xlsx` 已存在，可复用；若实际未安装则报告并退化 CSV）。
4. **不跑验收命令**（test/build/lint 由审核方重跑）；**不要 git commit / push**。
5. 必须先读 `docs/PRD_HR工作监控_20260928.md`，口径不一致时以 PRD 为准并在报告说明。
6. headless 无人工确认：先输出实施计划，然后直接动手，最终按 §7.2 交付报告。

## 1. 任务 ID + 目标
### 1.1 任务 ID
HRW-S

### 1.2 目标
实现 admin 专用 HR 工作负载监控服务端：按日/周/月输出每个 HR 的过程量、结果量、漏斗转化率、薄弱环节标记，并支持导出 Excel/CSV。

### 1.3 端点清单（权限表）
| 端点 | 权限 | 说明 |
|---|---|---|
| `GET /api/hr-workload/overview` | admin（`hr_workload:read`） | 总览 summary + rows |
| `GET /api/hr-workload/users/:hrId` | admin | 单 HR 详情/趋势/时间线 |
| `GET /api/hr-workload/export` | admin | 导出，写 OperationLog |

## 2. 上下文
### 2.1 已确认口径
- 过程+结果都要；按操作人归属；薄弱环节按招聘漏斗转化率；第一期仅 admin 可见。
- 第一期实时计算 + 缓存；不做快照表；不做 KPI 配置。

### 2.2 关键已核实事实
- 统计服务在 `server/src/services/stats.service.ts`，已有 `getWorkloadStats` / `getFunnelStats` / 缓存模式（`CACHE_TTL=300`）。
- 路由在 `server/src/routes/index.ts` 注册；`stats.ts` 已有 CSV 导出与日期范围 schema 可参考。
- 权限中间件：`server/src/middleware/role.ts` 的 `requireMatrixPermission`；admin 为 `*`。不要给 hr 增加 `hr_workload:read`。
- 数据可见性：admin 全量；本功能 admin-only，不需要对 rows 做 member 可见范围过滤，但候选人明细下钻仍需排除软删/匿名敏感字段。
- 现有导出多为 CSV（带 BOM）；PRD 写 xlsx。若实现 xlsx，用 `xlsx` 包；否则 CSV 并在报告说明。

## 3. 必读约束
### 3.1 反直觉点
1. **按操作人归属**，不是按候选人创建人兜底所有结果；无操作日志的历史结果可标 `approximate=true`。
2. **分母为 0 时转化率为 null**，前端显示 `—`，禁止返回 NaN/Infinity。
3. **样本量 < 5 不判强弱**，只标 `insufficient_sample`。
4. 导出必须写 `OperationLog`（`hr_workload_export`），失败不阻断下载。
5. 不回刷历史 OperationLog；只保证新链路补齐日志。

### 3.2 指标口径（固定）
- 过程量：新增候选人、沟通次数、安排面试、完成面试、Offer 动作次数、阶段推进次数。
- 结果漏斗：新增候选人 → 初筛通过 → 面试完成 → Offer 发送 → Offer 接受 → 入职。
- 转化率：当前环节 / 上一环节；分母 <5 不判定。
- 薄弱：`hrRate < teamAvgRate * 0.8`；忙碌低效：过程量 > 团队均值*1.2 且入职率 < 团队均值*0.8。

### 3.3 审计/日志约定
- `OperationLog.targetType='HRWorkload'`。
- action：`hr_workload_export`；详情含 period/date/department/hrId/rowsCount。

## 4. 实施任务（逐文件）
1. `server/src/services/hr-workload.service.ts`（✱新增）
   - 提供 `getOverview(query)`、`getUserDetail(hrId, query)`、`exportOverview(query)`。
   - 统一 `resolveRange(period,date)`：日/自然周（周一到周日）/自然月。
   - 使用 Prisma + 必要 `$queryRaw`；排除软删候选人；所有 SQL 参数化。
   - overview 缓存 60 秒；详情缓存 60 秒；导出不缓存。
2. `server/src/controllers/hr-workload.controller.ts`（✱新增）
   - controller 只取参、调 service、格式化响应；不写业务逻辑。
3. `server/src/routes/hr-workload.ts`（✱新增）
   - zod schema：`period enum day|week|month`，`date YYYY-MM-DD`，`department optional`，`hrId cuid optional`。
   - 全部挂 `authenticate + requireMatrixPermission('hr_workload:read')`。
4. `server/src/routes/index.ts`（条件修改）
   - 注册 `router.use('/hr-workload', hrWorkloadRoutes)`。
5. `server/src/services/role-permission.service.ts`（条件修改）
   - 只在权限常量注释中补充 `hr_workload:read` 为 admin-only；不要把该权限加入 hr/hiring_manager/interviewer 列表。
6. `server/tests/unit/hr-workload.service.test.ts`（✱新增）
   - 覆盖：日/周/月范围、分母 0、样本不足、薄弱标记、忙碌低效、按操作人归属。
7. `server/tests/integration/hr-workload.test.ts`（✱新增）
   - 覆盖：admin 200；hr/hiring_manager/interviewer 403；overview/users/export 基础契约；导出写 OperationLog。
8. 视情况补 `server/src/services/*` 的 OperationLog action 缺口（仅当现有代码确实缺；不得大范围改动）。

## 5. 关键决策点（默认方案 + 理由）
- **admin-only 用矩阵权限但不授权 HR**：满足 PRD，同时保留未来授权入口。
- **实时计算 + 60s 缓存**：第一期最快落地；月维度如性能不足再二期快照。
- **历史数据允许 approximate**：不回刷日志，避免高 risk migration；新动作补日志。
- **导出优先 xlsx**：PRD 要 xlsx 且依赖已存在；失败时 CSV 是降级不是默认。

## 6. 修改文件清单
### 6.1 必改文件（✱=新增）
1. `server/src/services/hr-workload.service.ts` ✱
2. `server/src/controllers/hr-workload.controller.ts` ✱
3. `server/src/routes/hr-workload.ts` ✱
4. `server/src/routes/index.ts`
5. `server/src/services/role-permission.service.ts`
6. `server/tests/unit/hr-workload.service.test.ts` ✱
7. `server/tests/integration/hr-workload.test.ts` ✱
8. `server/src/services/<已有业务服务>.ts`（仅在补 OperationLog 缺口时，报告必须说明）

### 6.2 禁止修改文件
- `server/prisma/**`
- `client/**`
- `e2e/**`
- `.env*`、CI、部署文件

### 6.3 越界检测（交付报告贴结果）
```bash
git status --short -- server client e2e
git diff --stat -- server/prisma client e2e
```
要求：`server/prisma`、`client`、`e2e` 为 0 行。

## 7. 验收标准
### 7.1 硬性验收（审核方执行，你不跑）
- `cd server && npx tsc --noEmit`：0 错。
- `cd server && npx vitest run`：全过，且新增 HRW 测试通过。
- `cd server && pnpm lint:check`：不超过当前基线（本切片不得新增非 CRLF lint）。
- 手工 curl：admin token 调 overview/users/export 200；hr token 403；export 响应非空且写 OperationLog。

### 7.2 交付报告模板（最终回复必须包含）
1. 实施计划摘要（≤8 行）
2. 实际修改文件列表（对应 §6.1）
3. 每个文件 before→after / 新增职责
4. 指标口径与 SQL/Prisma 数据来源映射
5. 未实现项与原因（若有）
6. 风险点（性能、近似口径、日志缺口）
7. 越界自检命令输出
8. 给审核方的 curl 验证命令

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手，最终回复给出完整交付报告。
