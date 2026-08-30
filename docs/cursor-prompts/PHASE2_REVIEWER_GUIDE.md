# Phase 2 审核员手册

> **适用对象**：Mavis（我）作为 Cursor 实施代码的审核者
> **配套文件**：
> - [VIBE_CODING_PROMPTS_PHASE2_v1.3.md](../../VIBE_CODING_PROMPTS_PHASE2_v1.3.md) — Cursor 看的提示词
> - [PHASE2_IMPL_PITFALLS.md](./PHASE2_IMPL_PITFALLS.md) — 32 个实施陷阱
> - [PHASE2_REVIEWER_GUIDE.md](./PHASE2_REVIEWER_GUIDE.md) — 本文件（审核员用）
>
> **工作流**：用户把 Cursor diff 贴给我 → 我按本手册逐项审 → 输出标准化审核报告
> **核心原则**：本手册**不给 Cursor 看**，单一职责 = 工具分离

---

## 📑 目录

1. [工作流总览](#1-工作流总览)
2. [4 标尺审核框架](#2-4-标尺审核框架)
3. [工具门禁清单](#3-工具门禁清单)
4. [三档决策树](#4-三档决策树)
5. [审核输出格式模板](#5-审核输出格式模板)
6. [修改指令格式](#6-修改指令格式)
7. [失败模式 + 回滚预案](#7-失败模式--回滚预案)
8. [跨 prompt 衔接检查](#8-跨-prompt-衔接检查)
9. [关键基础设施依赖检查](#9-关键基础设施依赖检查)
10. [典型 review 案例](#10-典型-review-案例)

---

## 1. 工作流总览

```
┌──────────────────────────────────────────────────────┐
│                  阶段 2 单个 PROMPT 闭环               │
└──────────────────────────────────────────────────────┘

[用户] 从 v1.3 复制 prompt → Cursor Composer
   ↓
[Cursor] 实施 → 输出 git diff + 实施备注
   ↓
[用户] 把 diff + 实施备注粘贴给 Mavis
   ↓
[Mavis] 按 4 标尺 + 工具门禁 + 32 坑对照审核
   ↓
   ├── ✅ 通过 → [用户] 跑 pnpm test/lint/type-check → git commit
   │                                                  ↓
   │                                          下一个 PROMPT
   │
   ├── 🟡 小修 → [用户] 把"修改指令"给 Cursor → Cursor 改 → [Mavis] 复审
   │
   └── 🔴 打回 → [用户] 把"完整打回指令"给 Cursor → Cursor 重做

每 PROMPT 约 15-30 分钟（Mavis 审核 5-10 分钟 + 用户 commit 1-2 分钟 + 跑测试 3-5 分钟）
```

### 三方职责划分

| 角色 | 职责 | **不能**做的事 |
|---|---|---|
| **Cursor** | 写代码 + 输出 diff + 实施备注 | 自审、自评测试、自报"已完成" |
| **Mavis（我）** | 严格对照本手册审核 + 出修改指令 | 自己写代码、自己跑测试（除非有明确工具调用） |
| **用户** | 把 Cursor 输出转给我、看 Mavis 审核意见、跑工具门禁、commit | 跳过 Mavis 审核直接 commit（除非紧急 hotfix） |

---

## 2. 4 标尺审核框架

**每个 PROMPT 审核必须按这 4 个标尺逐项过**，缺一不可。

### 标尺 1：是否越界（user memory 强约束）

**这是最关键的标尺**。Cursor 经常"顺手"做超出 prompt 范围的事。

#### 1.1 修改文件清单比对
- 把 v1.3 prompt 中**明确列出**的"输出/修改文件清单"段摘出来
- 对比 git diff 的实际修改文件
- **任何不在清单中的文件** → 越界

#### 1.2 越界 4 大类型
- ❌ 改了 prompt 没要求改的 service / controller
- ❌ 改了 prompt 没要求改的现有测试
- ❌ 实施了 prompt 没要求的功能（"顺便"做的）
- ❌ 删了 prompt 没要求删的代码

#### 1.3 越界判定口诀
> **prompt 没说的，一律不做**。即使"看起来应该做"。

#### 1.4 越界例外（用户明确授权）
- 用户在 prompt 中显式说"可顺手修 X bug" → 允许
- 用户在传递 diff 时单独说"顺便改 X" → 允许（且必须记录在实施备注）

#### 1.5 工具检查命令
```bash
# 列出本次 diff 修改的所有文件
git diff --name-only HEAD

# 列出新增文件
git status --short | Select-String '^\?\?'

# 对照 v1.3 prompt 中的"输出/修改文件清单"段
```

---

### 标尺 2：32 坑对照（PHASE2_IMPL_PITFALLS.md）

**逐项对照 32 个坑**——这是 v1.3 没标但 v1.4 候选的内容。

#### 2.1 适用 32 坑的 prompt
| Prompt | 相关坑数 | 必看坑 |
|---|---|---|
| PROMPT-13 | 0 | （无专属坑，但看标尺 1 + 3） |
| PROMPT-14 | 0 | （同上） |
| PROMPT-15a | 3 | 15a-1 邮箱冒用、15a-2 事务、15a-3 限流 |
| PROMPT-15b | 5 | 15b-1 限流、15b-2 enum、15b-3 multer、15b-4 越权、15b-5 字段裁剪 |
| PROMPT-15c | 2 | 15c-1 独立 router 误用、15c-2 mobile 误用 Element Plus |
| PROMPT-16a | 12 | 全部 16a-X |
| PROMPT-16b | 10 | 全部 16b-X |
| PROMPT-17 | 10 | 全部 17-X |

#### 2.2 检查方法
```bash
# 每个 PROMPT 审核前先 read 一次 PHASE2_IMPL_PITFALLS.md 对应章节
# 然后对 diff 逐行检查是否踩坑
```

#### 2.3 漏检的"自检信号"
- Cursor 实施备注里**没主动提**这个坑 → 50% 概率已踩
- Cursor 主动提"我处理了 XX 坑" → 70% 概率真的处理了
- Cursor 用了**你没在 prompt 里见过的库** → 90% 概率越界或用了错误方案

---

### 标尺 3：错误码覆盖（v1.3 通用块 D）

#### 3.1 检查方法
- v1.3 每个 prompt 末尾都有"错误码表"
- 对比 Cursor 实际写的 controller / service 中的 `throw new AppError(...)`
- **表里 N 个错误码，代码里必须 ≥N-1 个**（允许 1 个省略，要说明理由）

#### 3.2 错误码合规清单
| 项 | 必须 |
|---|---|
| 401 未认证 | ✅ 必出现（除非公开端点） |
| 403 无权限 | ✅ 必出现（admin-only 端点） |
| 404 资源不存在 | ✅ 必出现 |
| 422 参数校验 | ✅ 必出现（Zod 校验失败） |
| 业务错误（400/409） | ✅ 按错误码表覆盖 |
| 文案中文 | ✅ 全部用中文（"请先登录" / "没有权限：xxx"） |
| 错误码一致 | ✅ 同一类错误用同一文案 |

#### 3.3 易漏场景
- 资源存在但已软删 → 410（Cursor 容易忘记 410 vs 404）
- 跨用户越权 → 403（Cursor 容易 200 空数据）
- 状态冲突（如 Offer 已 accepted）→ 409
- 限流触发 → 429（Cursor 容易 throw 500）

---

### 标尺 4：项目规范对齐

#### 4.1 必须符合的 10 条项目硬规范

| # | 规范 | 检查方法 |
|---|---|---|
| 1 | **3 层架构**（route → controller → service） | service 不 import controller；controller 不写业务逻辑 |
| 2 | **统一 AppError**（不用 `throw new Error`） | grep "throw new Error" 必为空 |
| 3 | **统一路径别名**（`@services/` `@controllers/` 等） | 不写 `../../../` |
| 4 | **Zod 校验在 route 层** | 路由文件有 Zod schema，service 不重复校验 |
| 5 | **Prisma 用 `findFirst` / `findUnique` 而不是 `findMany({ where: { id: X } })`** | grep 检查 |
| 6 | **候选人可见性走 `scopeFromUser` + `buildCandidateVisibilityWhere`** | 候选人列表/详情必须用 |
| 7 | **RBAC 走 `requirePermission` 中间件**（PROMPT-14 之后） | 业务路由不直接用 `authorize('admin')` |
| 8 | **操作日志走 `writeOperationLog`**（关键变更） | 软删除 / 状态变更 / 审批结果 必写 |
| 9 | **响应格式统一**（`{ success, data?, error?, code? }`） | controller 不返回 `res.json({ data: ... })` |
| 10 | **中英文**：注释中文，错误文案中文，变量名英文 | grep "// 业务" 必出现 |

#### 4.2 工具检查命令

```powershell
# 1. 3 层架构
Select-String -Path "server\src\services\*.ts" -Pattern "from '\.\./controllers" -SimpleMatch

# 2. 统一 AppError
Select-String -Path "server\src\**\*.ts" -Pattern "throw new Error" -SimpleMatch

# 3. 路径别名
Select-String -Path "server\src\**\*.ts" -Pattern "from '\.\.\/\.\.\/\.\." -SimpleMatch

# 4. 候选人可见性（PROMPT-14 后）
Select-String -Path "server\src\controllers\candidate.controller.ts" -Pattern "scopeFromUser|buildCandidateVisibilityWhere" -SimpleMatch

# 5. 中文注释
Select-String -Path "server\src\**\*.ts" -Pattern "^//\s*[\u4e00-\u9fa5]" -SimpleMatch
```

---

## 3. 工具门禁清单

**Cursor 实施后，用户必须跑这套命令，全部通过才能 commit**。任一失败 → 必打回。

### 3.1 通用门禁（所有 PROMPT）

```powershell
# 安装（如果 node_modules 缺失）
pnpm install

# Lint
pnpm lint
# 期望：errors = 0
# 允许：warnings（但要看是否新引入的）

# Type check
pnpm type-check
# 服务端
cd server; pnpm build
# 客户端
cd client; pnpm type-check
# 移动端
cd mobile; pnpm type-check
```

### 3.2 服务端测试（涉及 service 修改的 PROMPT）

```powershell
cd server
pnpm test
# 期望：all tests passed
# 覆盖率：lines ≥ 80%, branches ≥ 75%

pnpm test:coverage
# 看 coverage 报告，确认新增的 service 被覆盖
```

### 3.3 Schema 变更门禁（PROMPT-13/14/15a/16a/17 共 5 个）

```powershell
# 1. 客户端生成
cd server
npx prisma generate

# 2. 生成 migration（必须 --create-only）
npx prisma migrate dev --create-only --name <prompt_name>

# 3. 人工 review SQL（关键步骤，绝对不能跳过）
# 看 server/prisma/migrations/<timestamp>_<name>/migration.sql
# 对照 PHASE2_IMPL_PITFALLS 32 坑 + v1.3 通用块 A 的 5 项检查清单

# 4. Apply
npx prisma migrate deploy

# 5. 再次 generate
npx prisma generate
```

### 3.4 集成测试门禁（涉及 API 修改的 PROMPT）

```powershell
cd server
pnpm test
# 重点看 integration test
pnpm test -- tests/integration/<new_api>.test.ts
```

### 3.5 E2E 门禁（涉及前端页面的 PROMPT）

```powershell
cd e2e
pnpm test
# 期望：所有 spec 通过
# 重点看是否 mock 了外部依赖（LLM、飞书、Redis）
```

### 3.6 门禁失败处理

| 失败 | 处理 |
|---|---|
| `pnpm install` 失败 | 检查 pnpm 版本（>= 8）+ node 版本（>= 18） |
| `pnpm lint` 新增 errors | 打回 Cursor 修 |
| `pnpm test` 失败 | 必打回；区分"Cursor 改坏了"vs"现有测试本就有问题" |
| `prisma migrate dev --create-only` 失败 | 重新生成（Cursor 可能没改对 schema） |
| `prisma migrate deploy` 失败 | **数据事故** — 立即停，回滚（见 7.2） |
| `pnpm build` 失败 | TypeScript 类型错误，打回 Cursor |
| `pnpm type-check` 失败 | 同上 |

---

## 4. 三档决策树

### 4.1 决策流程

```
[开始审核]
   ↓
[标尺 1 越界检查]
   ↓
   ├── 有越界 → 🔴 打回
   ↓
[标尺 2 32 坑对照]
   ↓
   ├── 踩坑数 ≥ 3 → 🔴 打回
   ├── 踩坑数 1-2 → 🟡 小修
   ↓
[标尺 3 错误码覆盖]
   ↓
   ├── 缺失 ≥ 2 → 🟡 小修
   ├── 缺失 1 → 🟡 小修
   ↓
[标尺 4 项目规范]
   ↓
   ├── 违规 ≥ 2 → 🟡 小修
   ↓
[工具门禁结果]
   ↓
   ├── 任一失败 → 🔴 打回
   ↓
[综合判断]
   ├── 业务正确性 ⚠️ → 留给用户判断
   ↓
[输出]
   ├── ✅ 通过 / 🟡 小修 / 🔴 打回
```

### 4.2 三档详细标准

#### ✅ 通过
- 越界：无
- 32 坑：无踩
- 错误码：全覆盖
- 项目规范：全部对齐
- 工具门禁：全通过
- 业务正确性：用户人工确认（30 秒 spot-check）

#### 🟡 小修后通过
- 越界：无
- 32 坑：1-2 个踩坑（非安全致命）
- 错误码：缺 1-2 个
- 项目规范：1-2 条小违规
- 工具门禁：全通过
- 业务正确性：用户人工确认

**修复要求**：列出具体行号 + 改法（≤3 条），给 Cursor 重做

#### 🔴 打回
任一条件触发：
- 越界（任何类型）
- 32 坑 ≥ 3 个
- 关键安全洞（如 IDOR、SQL 注入、token 明文存储）
- 工具门禁任一失败
- 错误码严重缺失（≥ 3）
- 项目规范严重违反（如用 `throw new Error` 而非 `AppError`）
- 测试覆盖率显著下降
- 业务正确性严重存疑

**修复要求**：完整打回指令，Cursor 重做整个 PROMPT

---

## 5. 审核输出格式模板

**每次审核必须用这个格式输出**，不模糊。

```markdown
## 🔍 审核报告：PROMPT-XX（<任务名>）

**审核时间**：YYYY-MM-DD HH:mm
**审核对象**：git diff <commit_hash 或 working tree>
**审核依据**：v1.3 提示词 + PHASE2_IMPL_PITFALLS 32 坑 + 本手册 4 标尺

---

### 结论：✅ 通过 / 🟡 小修后通过 / 🔴 打回

---

### 标尺 1：是否越界

**修改文件清单**（与 v1.3 prompt 要求对比）：
- 新增：<文件 1>、<文件 2>
- 修改：<文件 3>、<文件 4>
- 删除：<文件 5>（如无，填"无"）

**对照 v1.3 输出/修改文件清单**：
- [✅/❌] 所有修改都在清单内
- [✅/❌] 没有顺手改其他文件
- [✅/❌] 没有改旧测试文件
- [✅/❌] 没有实施未要求功能

**如有越界**：
- <文件>:<行号> 改了什么 → 为什么越界

---

### 标尺 2：32 坑对照

#### 16a 章节（如适用）
- [✅/❌] 16a-1 normalizeUsage 适配：<具体行号>
- [✅/❌] 16a-2 few-shot token 控制：<判断>
- [✅/❌] 16a-3 validateSql 去注释：<具体行号>
- ... 全部 12 项

#### 16b 章节（如适用）
- [✅/❌] 16b-1 fetch+ReadableStream（非 EventSource）：<具体行号>
- ... 全部 10 项

#### 17 章节（如适用）
- [✅/❌] 17-1 加密 key 长度/格式：<具体行号>
- ... 全部 10 项

**踩坑汇总**：X 个（列具体坑号 + 行号）

---

### 标尺 3：错误码覆盖

**v1.3 错误码表 N 个错误码**

| 错误码 | 触发条件 | v1.3 列出 | 代码中实现 | 缺失 |
|---|---|---|---|---|
| 401 | 未认证 | ✅ | ✅/❌ <行号> | <如有> |
| 403 | 无权限 | ✅ | ✅/❌ | <如有> |
| ... | ... | ... | ... | ... |

**缺失错误码**：<列出未实现的错误码 + 哪个接口需要>

---

### 标尺 4：项目规范对齐

- [✅/❌] 3 层架构
- [✅/❌] 统一 AppError（无 `throw new Error`）
- [✅/❌] 路径别名（无 `../../../`）
- [✅/❌] Zod 校验在 route 层
- [✅/❌] Prisma findFirst/findUnique
- [✅/❌] 候选人可见性走 `scopeFromUser`
- [✅/❌] RBAC 走 `requirePermission`（PROMPT-14 后）
- [✅/❌] 操作日志走 `writeOperationLog`
- [✅/❌] 响应格式统一
- [✅/❌] 注释中文、错误文案中文

---

### 工具门禁

- [✅/❌] pnpm install
- [✅/❌] pnpm lint
- [✅/❌] pnpm type-check / pnpm build
- [✅/❌] pnpm test（含 integration）
- [✅/❌] prisma generate（schema 变更 PROMPT）
- [✅/❌] prisma migrate dev --create-only（schema 变更 PROMPT）
- [✅/❌] 人工 review SQL（schema 变更 PROMPT）
- [✅/❌] prisma migrate deploy（schema 变更 PROMPT）
- [✅/❌] pnpm test:coverage ≥ 80%

---

### 业务正确性（⚠️ 留给用户）

- 用户名（招聘运营 / HR / 开发）：请判断以下是否正确
  - <业务规则 1>
  - <业务规则 2>

---

### 修改建议（按优先级）

🔴 **必改**（如适用）：
1. <文件>:<行号> 改法：<具体代码片段>
2. ...

🟡 **建议改**（如适用）：
1. <文件>:<行号> 改法：<具体代码片段>
2. ...

💡 **可选改**（如适用）：
1. <优化建议>
2. ...

---

### 复审检查点（小修后）

- [ ] 必改项 1 改了
- [ ] 必改项 2 改了
- [ ] 跑过 `pnpm test` 验证未破其他
- [ ] 实施备注更新了
```

---

## 6. 修改指令格式

**审核不通过时，把"修改指令"给 Cursor，让它重做。** 必须用此格式，Cursor 才能直接吃。

### 6.1 🟡 小修指令格式

```markdown
## PROMPT-XX 审核：🟡 小修后通过

请按以下修改建议重做（仅改必改项，建议改和可选改可一并处理）：

### 必改（3 条以内）

1. **<文件路径>:<行号>**
   - 当前代码：\`\`\`<贴出当前代码 1-3 行>\`\`\`
   - 改为：\`\`\`<贴出改后代码 1-3 行>\`\`\`
   - 原因：<为什么改>

2. **<文件路径>:<行号>**
   - 同上格式

3. **<文件路径>:<行号>**
   - 同上格式

### 建议改（如有）

1. **<文件路径>:<行号>** — <说明>

### 修改后请

- 重新输出 git diff（仅修改部分）
- 重新输出实施备注（按 v1.3 通用块 B 格式）
- 不要改必改项之外的文件
```

### 6.2 🔴 打回指令格式

```markdown
## PROMPT-XX 审核：🔴 打回

实施存在严重问题，必须重做。重做前请先看以下问题：

### 🔴 严重问题（必须修复）

1. **<问题标题 1>**：<文件>:<行号>
   - 当前：\`\`\`<代码>\`\`\`
   - 问题：<具体说明>
   - 必须改为：<方向或代码示例>

2. **<问题标题 2>**：<文件>:<行号>
   - 同上格式

3. **<问题标题 3>**：<文件>:<行号>
   - 同上格式

### 🟡 顺带检查

- 错误码表里 N 个错误码，代码只实现了 M 个，缺 K 个：<列出>
- 32 坑对照踩了 X 个：<列出>
- 项目规范违规：<列出>

### 重新实施要求

- 必须重新读 v1.3 的本 PROMPT 全文
- 重点看 PHASE2_IMPL_PITFALLS 对应章节
- 实施完成后重新输出 diff + 实施备注
- 不要再做越界的事
```

---

## 7. 失败模式 + 回滚预案

### 7.1 实施过程失败

| 失败点 | 现象 | 处置 |
|---|---|---|
| Cursor 实施中挂掉 | 输出截断/无实施备注 | 重新开启 Composer 会话，再次粘 prompt |
| prisma generate 报错 | TypeScript 类型不匹配 | 检查 schema.prisma 是否有 typo，回 Cursor 修 |
| migrate --create-only 失败 | "drift detected" 等 | DB 状态与 schema 不一致，先 `migrate reset`（**仅 dev 库**） |
| 测试覆盖率掉到 80% 以下 | coverage 报告 | 必打回，让 Cursor 补测试 |
| 用户 commit 后发现漏改 | git log 发现 prompt 没全部完成 | git revert HEAD，重做 |

### 7.2 数据事故（最严重）

**触发条件**：`prisma migrate deploy` 失败 / 应用了不安全的 migration SQL

**处置流程**：

```powershell
# 1. 立即停止所有写入
cd server
npx prisma migrate resolve --rolled-back <migration_name>

# 2. 检查 DB 当前状态
# 用 prisma studio 看实际表结构

# 3. 备份当前状态
pg_dump -h localhost -U postgres recruiting_dev > backup_<timestamp>.sql

# 4. 恢复上一个正常 migration
# 找出上一个成功的 migration name
npx prisma migrate resolve --applied <previous_migration_name>

# 5. 检查 service 代码是否需要回滚
git log --oneline -5
# 找到变更前 commit
git revert <bad_commit_hash>
```

### 7.3 Cursor 改坏了其他模块

**触发条件**：跑 `pnpm test` 发现非本 PROMPT 范围的测试挂了

**处置**：

```powershell
# 1. 确认是 Cursor 改坏的
git stash
pnpm test
# 如果还挂 → 不是 Cursor 改的（基线问题）
# 如果不挂 → 是 Cursor 改的

# 2. 找到具体的破坏点
git stash pop
# 用 git diff 看 Cursor 改了什么
# 重点看是否改了 service 层公共方法签名、是否改了 schema、是否改了 middleware

# 3. 让 Cursor 修，或自己 git checkout 改坏的文件
```

### 7.4 我的审核输出有错

**触发条件**：用户照我的"修改指令"实施后，反而引入新 bug

**处置**：
- 我承认错误，重新审
- 但用户必须先保留现场（git stash 改动），不要 commit
- 重审后再决定改法

---

## 8. 跨 prompt 衔接检查

**每个 PROMPT 完成后，必须检查"对下游 PROMPT 的影响"**。这是 v1.3 定位卡提了但没说怎么验证的部分。

### 8.1 衔接检查表

| 上游完成 | 下游必须验证 | 验证方法 |
|---|---|---|
| PROMPT-13（软删除） | PROMPT-15a/15b/16a/17 不能误用已软删候选人 | 候选人查询都加 `deletedAt: null` |
| PROMPT-14（RBAC） | PROMPT-15a/15b/16a/17 的路由必须用 `requirePermission` | grep 新增路由 |
| PROMPT-15a（Magic Link） | PROMPT-15b/15c 必须用 tokenHash 不是明文 | grep "tokenHash" |
| PROMPT-15b（Portal API） | PROMPT-15c 前端必须用 X-Portal-Token 不带 JWT | grep "X-Portal-Token" |
| PROMPT-16a（Chatbot 后端） | PROMPT-16b 必须用 fetch+ReadableStream 非 EventSource | grep "EventSource" 必为空 |
| PROMPT-17（飞书日历） | 面试安排必须能调 `checkFeishuConflicts` | grep "checkFeishuConflicts" |

### 8.2 衔接检查命令

```powershell
# 在每个 PROMPT 完成后跑

# 检查 1：软删除过滤
Select-String -Path "server\src\services\candidate*.ts" -Pattern "deletedAt: null" -SimpleMatch

# 检查 2：RBAC 强制（PROMPT-14 后所有新增路由）
Select-String -Path "server\src\routes\*.ts" -Pattern "requirePermission" -SimpleMatch

# 检查 3：Portal token 命名
Select-String -Path "client\src\portal\**\*.ts" -Pattern "X-Portal-Token" -SimpleMatch

# 检查 4：SSE 用 fetch 非 EventSource
Select-String -Path "client\src\**\*.ts" -Pattern "EventSource" -SimpleMatch
# 期望：找不到任何匹配
```

### 8.3 衔接失败处置

- 立即打回当前 PROMPT（衔接是必须项）
- 不要等下一个 PROMPT 才发现

---

## 9. 关键基础设施依赖检查

**在 PROMPT-16a 之前必须就位**。否则 chatbot / 飞书日历都会失败。

### 9.1 依赖清单

| 依赖 | 验证命令 | 失败处理 |
|---|---|---|
| `server/src/lib/llm.ts` 含 `callLLM` | `Select-String "callLLM" server\src\lib\llm.ts` | 提示用户先跑"基础设施"prompt |
| `server/src/lib/llm.ts` 含 `callLLMStream` | `Select-String "callLLMStream" server\src\lib\llm.ts` | 同上（PROMPT-16b 必需） |
| `server/src/lib/crypto.ts` | `Test-Path "server\src\lib\crypto.ts"` | 提示用户先跑"基础设施"prompt |
| `server/src/lib/redis.ts` 含 `getFromCache/setCache` | grep 检查 | 提示用户先跑"基础设施"prompt |
| Redis 进程运行 | `redis-cli ping` | 启动 Redis |
| `.env` 中 LLM_* 配置 | `Test-Path ".env"` + grep "LLM_" | 配置 .env |
| `.env` 中 FEISHU_* 配置 | grep "FEISHU_" | 配置 .env（PROMPT-17 必需） |
| 飞书开发者后台配置 calendar 权限 | 手动确认 | 提示用户去飞书后台 |

### 9.2 启动前 checklist

```powershell
# 在第一次跑 v1.3 PROMPT 之前
[ ] pnpm install（root + server + client + mobile）
[ ] docker compose up -d postgres redis
[ ] cd server; npx prisma migrate dev
[ ] pnpm dev 启动一次，确认能跑
[ ] .env 配置好 LLM_* / FEISHU_*
[ ] lib/llm.ts 存在并导出 callLLM
[ ] lib/crypto.ts 存在（PROMPT-17 用）
[ ] lib/redis.ts 存在
[ ] 手动登录一次，确认能拿到 token
```

---

## 10. 典型 review 案例

### 案例 1：PROMPT-13 软删除 ✅ 通过

**Cursor 实施概要**：
- schema.prisma 新增 deletedAt/deletedById/deletedBy 字段
- candidate.service.ts 修改 5 个方法
- candidate.controller.ts 新增 3 个方法
- routes/candidates.ts 新增 3 个路由
- tests/unit/candidate-soft-delete.test.ts 新增 7 个测试

**Mavis 审核**：

```
结论：✅ 通过

标尺 1 越界：
- 修改文件清单与 v1.3 输出/修改文件清单完全一致 ✅
- 无越界

标尺 2 32 坑：
- PROMPT-13 不在 32 坑清单内，N/A

标尺 3 错误码：
- 6 个错误码全部实现（400/400/403/403/404/410）✅

标尺 4 项目规范：
- 3 层架构 ✅
- 统一 AppError ✅
- 写操作日志 ✅
- 中文错误文案 ✅

工具门禁：
- pnpm test 通过（覆盖原 5 测试 + 新 7 测试）✅
- prisma migration SQL 人工 review 过 ✅

业务正确性：
- 用户 spot-check：30 秒，确认软删 / 恢复 / purge 行为正确
```

---

### 案例 2：PROMPT-16a Chatbot 🔴 打回

**Cursor 实施概要**：
- schema.prisma 新增 ChatSession/ChatMessage + ChatMessageRole enum
- chatbot.service.ts 完整实现
- chatbot-quota.service.ts 限流
- chatbot-few-shot.ts 5 个 example
- chatbot.controller.ts / route.ts / routes/index.ts

**Mavis 审核**：

```
结论：🔴 打回

标尺 1 越界：
- ❌ Cursor 改了 existing 邮件 service（mail.service.ts），原 prompt 没要求
- ❌ Cursor 把 candidate.service.ts 里的某个方法重命名了

标尺 2 32 坑：
- ❌ 16a-1：未做 usage 字段 normalize（直接用 usage.totalTokens）
- ❌ 16a-4：限流 redis.incr 后没设 EXPIRE
- ❌ 16a-9：title 用 question.slice(0,30)，未做中文安全截断
- ❌ 16a-11：越权检查把 404/403 顺序弄反
共 4 个踩坑 → 🔴 打回

标尺 3 错误码：
- 错误码表 11 个，实现 7 个，缺 4 个

标尺 4 项目规范：
- ❌ 用了 throw new Error 而非 AppError（chatbot-quota.service.ts:42）

工具门禁：
- ✅ pnpm test 通过
- ✅ pnpm lint 通过
- ❌ prisma migration SQL 没用 --create-only，直接跑 migrate deploy

→ 🔴 打回（多重严重问题）
```

**修改指令**（给 Cursor）：

```markdown
## PROMPT-16a 审核：🔴 打回

### 🔴 严重问题（必须修复）

1. **越界改 mail.service.ts**
   - 当前：mail.service.ts 第 88 行被改
   - 问题：v1.3 没要求改这个文件
   - 必须：git checkout HEAD -- server/src/services/mail.service.ts

2. **未做 usage 字段 normalize（坑 16a-1）**
   - 当前：chatbot.service.ts:142 直接用 sqlResult.usage?.totalTokens
   - 必须：定义 normalizeUsage 适配 snake_case

3. **限流 redis.incr 没设 EXPIRE（坑 16a-4）**
   - 当前：chatbot-quota.service.ts:15 调 redis.incr 但没设 TTL
   - 必须：在 count === 1 时 redis.expire(key, 60)

4. **越权 404/403 顺序错（坑 16a-11）**
   - 当前：chatbot.service.ts:128 if (!session || session.userId !== userId)
   - 必须：先 404 再 403

5. **prisma migrate 直接 deploy 没用 --create-only**
   - 违反通用块 A Guard 流程
   - 必须：用 migrate dev --create-only 生成 SQL 让人工 review

### 修改后请

- git checkout 越界改的文件
- 按 v1.3 完整重做
- 重新输出 diff
```

---

### 案例 3：PROMPT-15b Portal API 🟡 小修

**Cursor 实施概要**：8 个文件改动，大致符合要求

**Mavis 审核**：

```
结论：🟡 小修后通过

标尺 1 越界：无 ✅

标尺 2 32 坑：
- ❌ 15b-3：multer 没设 fileFilter（允许所有类型）
- ❌ 15b-5：getCandidateSelfView 用了 omit 而非 select（容易漏字段）
共 2 个踩坑 → 🟡

标尺 3 错误码：
- 10 个错误码，实现 8 个，缺 2 个（400 文件超大、429 已登录态限流）

标尺 4 项目规范：全部对齐 ✅

工具门禁：全通过 ✅
```

**修改指令**（给 Cursor）：

```markdown
## PROMPT-15b 审核：🟡 小修后通过

请按以下 2 条必改 + 2 条建议改重做：

### 必改

1. **multer fileFilter 缺失（坑 15b-3）**
   - 当前：portal-upload.ts:18 multer({ storage, limits }) 无 fileFilter
   - 改为：加 fileFilter 校验 mimetype 为 PDF/DOCX

2. **getCandidateSelfView 用 omit 而非 select（坑 15b-5）**
   - 当前：portal.service.ts:21 用 omit: { phone: true, email: true, ... }
   - 改为：用 select 字段白名单，删除 omit

### 建议改

1. 错误码 400 文件超大未实现：upload-resume 路由加 multer file size limit catch
2. 错误码 429 已登录态限流未明确：portal.controller.ts 加 try-catch 限流错误
```

---

## 📌 附：本手册的演进规则

**每踩一个新坑，按以下流程加入本手册**：

1. **新坑出现**（PHASE2_IMPL_PITFALLS 已记录，或审核时新发现）
2. **更新标尺 2 章节**（适用 prompt 列表 + 必看坑）
3. **更新第 10 章节**（追加新案例）
4. **更新第 8 章节**（如涉及跨 prompt 衔接）

**不更新 v1.3**。v1.3 是给 Cursor 的，本手册是给审核者的，分工明确。

---

> **配套文件**：
> - [VIBE_CODING_PROMPTS_PHASE2_v1.3.md](../../VIBE_CODING_PROMPTS_PHASE2_v1.3.md)
> - [PHASE2_IMPL_PITFALLS.md](./PHASE2_IMPL_PITFALLS.md)
> - [PHASE2_REVIEWER_GUIDE.md](./PHASE2_REVIEWER_GUIDE.md) ← 本文件
>
> **使用顺序**：
> 1. 用户复制 v1.3 prompt 给 Cursor
> 2. Cursor 实施 → 输出 diff + 实施备注
> 3. 用户粘贴给我
> 4. 我按本手册 4 标尺 + 工具门禁 + 32 坑对照审
> 5. 输出第 5 章节格式的审核报告
> 6. 通过/小修/打回 → 流转到第 4 章决策
