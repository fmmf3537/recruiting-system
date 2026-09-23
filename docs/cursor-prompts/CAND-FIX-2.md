# CAND-FIX-2 候选人相关 lint 收口 执行提示词

## ⚠️ 强约束（最优先阅读）
1. **只收候选人相关 lint**：优先只改 `client/src/views/candidates/index.vue`；如确属本次候选人改动引入，才可改 `client/src/views/candidates/CandidateDetail.vue`、`client/src/components/candidates/detail/**`、`client/src/utils/candidate-next-step.ts`。
2. **禁改** `server/**`、`e2e/**`、`client/src/views/candidates/CandidateForm.vue`、`client/src/views/candidates/ResumeUpload.vue`、dashboard、tests、配置文件。那些是存量债，不在本切片。
3. **禁止全局 `eslint --fix`**；只手工修本切片文件里的确定问题，避免大面积格式漂移。
4. **文件预算 ≤ 4 个**；不跑验收命令；不要 git commit / push。
5. 目标不是把全仓 lint 变 0，而是把总数拉回基线：**errors ≤ 137，warnings ≤ 221**，并保持 `vue-tsc = 0`。

## 1. 任务 ID + 目标
### 1.1 任务 ID
CAND-FIX-2

### 1.2 目标
修复候选人列表/详情本轮改动引入的 lint 回退，尤其是 `views/candidates/index.vue` 的超长行、`no-shadow`、`no-use-before-define`，让 lint 回到基线内。

## 2. 上下文
### 2.1 已核实事实
- 当前 `client pnpm lint:check` 为 **162 errors / 209 warnings**；上一基线为 **137 errors / 221 warnings**。
- `client vue-tsc --noEmit` 当前已回到 **0**，不要破坏。
- `views/candidates/index.vue` 当前错误包括：
  - 多条 `max-len`（含第 20、246、322、359、888、973、997、1002、1003、1004 行附近）
  - `no-restricted-globals`：`isNaN` 应改 `Number.isNaN`
  - 多处 `no-shadow`：内层 `catch (error)` 与外层 `error` 重名
  - `no-use-before-define`：`handleDetail / handleAdvance / handleReject`
- `CandidateDetail.vue` 当前只有若干 `no-explicit-any` warning，不要为了消 warning 大改类型；本切片以 errors 收口为主。

### 2.2 边界
- 不改业务逻辑，只改格式、命名、声明顺序、局部变量名、必要的类型收窄。
- 如果某个 error 属于存量且不在本轮改动文件里，**不要修**，在报告里标注为存量。

## 3. 必读约束
### 3.1 反直觉点
1. warnings 现在已经低于旧基线（209 < 221），不要为了继续降 warnings 引入新风险；重点是把 errors 从 162 拉回 ≤137。
2. `max-len` 只折行，不改文案、不改接口字段、不改样式变量名。
3. `no-use-before-define` 优先调整函数声明顺序；若会导致逻辑变化，则在报告说明并选择最小安全移动。
4. `no-shadow` 只改内层 catch 变量名（如 `err`），不改外层 catch 语义。

## 4. 实施任务（逐文件）
1. `client/src/views/candidates/index.vue`
   - 修复 `max-len`：只折行，不改字符串内容。
   - `isNaN` → `Number.isNaN`。
   - 内层 `catch (error)` 与外层重名处改为 `catch (err)`。
   - 解决 `handleDetail / handleAdvance / handleReject` 的 `no-use-before-define`：移动到使用前，或改为函数声明提升安全的写法；不得改变调用时机。
2. `client/src/views/candidates/CandidateDetail.vue`（仅当出现本轮新增 error 时）
   - 默认不动；当前已知主要是 warning，不作为本切片主目标。
3. `client/src/components/candidates/detail/**`（仅当出现 error 时）
   - 默认不动；若 lint 输出指向本目录 error，按同规则最小修。
4. `client/src/utils/candidate-next-step.ts`（仅当出现 error 时）
   - 默认不动。

## 5. 关键决策点（默认方案 + 理由）
- **只修 errors，不追 warnings**：当前目标是回到基线，不是清零存量债。
- **index.vue 优先**：本轮回退主要由它贡献；先修它再复测，不够再碰 detail/components。
- **手工修而非 --fix**：避免 Prettier/ESLint 大面积改写最近刚重构的页面。

## 6. 修改文件清单
### 6.1 必改文件
1. `client/src/views/candidates/index.vue`
2. `client/src/views/candidates/CandidateDetail.vue`（仅必要时）
3. `client/src/components/candidates/detail/**`（仅必要时）
4. `client/src/utils/candidate-next-step.ts`（仅必要时）

### 6.2 禁止修改文件
- `server/**`
- `e2e/**`
- `client/src/views/candidates/CandidateForm.vue`
- `client/src/views/candidates/ResumeUpload.vue`
- `client/src/views/dashboard/**`
- `client/tests/**`
- `client/vite.config.ts`、`client/vitest.config.ts`

### 6.3 越界检测（交付报告贴结果）
```bash
git status --short -- client server e2e
git diff --stat -- server e2e client/src/views/candidates/CandidateForm.vue client/src/views/candidates/ResumeUpload.vue client/src/views/dashboard client/tests client/vite.config.ts client/vitest.config.ts
```
要求：禁止修改文件为 0 行。

## 7. 验收标准
### 7.1 硬性验收（审核方执行，你不跑）
- `cd client && npx vue-tsc --noEmit`：保持 0 错。
- `cd client && pnpm lint:check`：总数回到 **errors ≤ 137，warnings ≤ 221**。
- `git diff --stat -- client/src/views/candidates/index.vue` 存在；禁止修改文件为 0 行。
- 手工抽查：候选人列表「下一步」徽标仍正常显示，页面无文案/样式意外变化。

### 7.2 交付报告模板（最终回复必须包含）
1. 实施计划摘要（≤8 行）
2. 实际修改文件列表
3. 每类 lint 问题的修复方式（max-len / no-shadow / no-use-before-define / isNaN）
4. 修复前后 lint 总数对比（若未跑，写“由审核方复测”）
5. 未实现项与原因（若有）
6. 风险点
7. 越界自检命令输出
8. 给审核方的复测命令

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手，最终回复给出完整交付报告。
