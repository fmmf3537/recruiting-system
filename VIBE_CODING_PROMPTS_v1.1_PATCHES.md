# Vibe Coding 提示词集 v1.1 修订补丁

> **用途**：把 PHASE 0 / PHASE 1 / PHASE 2 三个提示词集按 v1.1 元规则修订
> **应用方式**：手工 patch（或在 Cursor 里逐处编辑）
> **改动原则**：保留所有内容，只调整"行数/文件数"硬约束 + 加 Cursor 输出模板

---

## 🪛 修订总览

| 文件 | 修订数 | 类型 |
|------|--------|------|
| PHASE 0 | 9 处 | 1 个元规则段 + 6 个 prompt 末尾模板 + 2 处硬约束调整 |
| PHASE 1 | 8 处 | 类似 |
| PHASE 2 | 10 处 | 类似 |

每个修订都是**添加或改 1-5 行**，不动结构。

---

## 📝 PHASE 0 修订

### 修订 1/9：顶部加 v1.1 元规则段

**位置**：`VIBE_CODING_PROMPTS_PHASE0.md` 第 33 行之后（在 `---` 分隔符之前）

**新增内容**：

```markdown
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

---

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
```

---

### 修订 2/9：PROMPT-01 验收条件"1-3 行"放宽

**位置**：PHASE 0 第 108 行

**原内容**：
```
5. ✅ `git diff server/src/routes/upload.ts` 只显示 1-3 行变更
```

**新内容**：
```
5. ✅ `git diff server/src/routes/upload.ts` 行数与推荐方案伪代码大致一致（约 5-10 行，[软目标]）
```

---

### 修订 3/9：PROMPT-01 末尾加 Cursor 输出模板

**位置**：PHASE 0 第 113 行（在 ` ``` ` 闭合前）

**在"完成后请输出"部分加**：

```markdown
## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[行数]
- 推荐方案预估：[7-10 行]
- 偏差原因：[无 / 解释多了什么]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不修改 multer limits / fileFilter
  - [✅/❌] 不改动 router.post 逻辑
  - [✅/❌] 不把 uploadDir 改成类/单例
  - [✅/❌] 不新增 npm 依赖
  - [✅/❌] 不触碰 files.ts / file.service.ts
```

---

### 修订 4/9：PROMPT-04 验收"减少 ~120 行"加 v1.1 注释

**位置**：PHASE 0 第 415 行附近（在 PROMPT-04 验收 2 中）

**原内容**：
```
   - `candidate.service.ts` 减少 ~120 行
```

**新内容**：
```
   - `candidate.service.ts` 减少与移出方法对应的行数（含方法签名、注释）[软目标：±30%]
```

---

### 修订 5/9：PROMPT-04 末尾加 Cursor 输出模板

**位置**：PHASE 0 PROMPT-04 末尾

**新增段**：

```markdown
## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[列出 candidate.service.ts 减少行数 + work-history.service.ts 新增行数 + 其他改动]
- 推荐方案预估：[对应 ~120 行迁移]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不合并/简化 WorkHistory 方法
  - [✅/❌] 不调换参数顺序
  - [✅/❌] 不修改可见性校验逻辑
  - [✅/❌] 不顺手拆分其他模块
  - [✅/❌] 不修改 Prisma schema
  - [✅/❌] 不新增 npm 依赖
```

---

### 修订 6/9：PROMPT-05 验收"5 个 service 文件"加 v1.1 注释

**位置**：PHASE 0 第 542 行附近

**原内容**：
```
**只改 5 个文件**：
```

**新内容**：
```
**只改这 5 个文件（清单不变）**：
```

文件清单照旧，不动。

---

### 修订 7/9：PROMPT-05 末尾加 Cursor 输出模板

**位置**：PHASE 0 PROMPT-05 末尾

**新增段**：

```markdown
## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[行数]
- 推荐方案预估：[枚举字段数量 + service 替换 console.log 数量]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不新增 enum 类型
  - [✅/❌] 不修改模型关系/索引/字段名
  - [✅/❌] 不触碰 Job.departments / PipelineTemplate.stages
  - [✅/❌] 不触碰测试 snapshot
  - [✅/❌] 不在 migration 中加 seed 数据修改
  - [✅/❌] 不硬删除 enum 值
```

---

### 修订 8/9：PROMPT-06 范围描述加 v1.1 注释

**位置**：PHASE 0 PROMPT-06 验收条件

**在每个"修改文件数"附近加**：

```markdown
> 注：v1.1 元规则 —— "X 行 / Y 文件"是软目标，允许 ±50% 偏差（前提是标准错误处理）。
```

---

### 修订 9/9：PROMPT-06 末尾加 Cursor 输出模板

**位置**：PHASE 0 PROMPT-06 末尾

**新增段**：

```markdown
## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[routes/ 下文件改动行数]
- 推荐方案预估：[N 个 z.string() → z.string().max(N) 替换]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不修改 .min() 下限
  - [✅/❌] 不改 z.string() → z.coerce.string()
  - [✅/❌] 不动 passwordSchema
  - [✅/❌] 不触碰 enum 字段
  - [✅/❌] 不新增正则校验
  - [✅/❌] 不修改 Prisma schema
```

---

## 📝 PHASE 1 修订

### 修订 1/8：PHASE 1 顶部加 v1.1 元规则 + Cursor 输出模板

**位置**：`VIBE_CODING_PROMPTS_PHASE1.md` 全局约束段后

**新增**：复制 PHASE 0 的"v1.1 元规则段"和"实施备注模板"两段（内容相同）。

---

### 修订 2/8：PROMPT-07 末尾加 Cursor 输出模板

**新增段**：

```markdown
## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[新文件 tracing.ts 行数 + logger.ts/env.ts diff + package.json 变更]
- 推荐方案预估：[1 新文件 + 3 文件小改]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不修改任何 service / controller / middleware 业务实现
  - [✅/❌] 不在 service 里 import OTel
  - [✅/❌] 不修改中间件顺序
  - [✅/❌] 不触碰 prisma.ts
  - [✅/❌] 不触碰前端
  - [✅/❌] 不把 trace 数据持久化到 DB
```

---

### 修订 3/8：PROMPT-08 "4 个文件"放宽

**位置**：PHASE 1 第 368 行附近

**原内容**：
```
2. 修改的 4 个文件的 diff（`app.ts` / `routes/index.ts` / 3 个 service）
```

**新内容**：
```
2. 修改的文件 diff（清单：app.ts / routes/index.ts / candidate.service.ts / offer.service.ts / interview-scheduler.service.ts / interview-evaluation.service.ts / anonymize.service.ts；[软目标：清单不变]）
```

---

### 修订 4/8：PROMPT-08 末尾加 Cursor 输出模板

**新增段**：

```markdown
## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[metrics.ts 行数 + 修改文件数]
- 推荐方案预估：[2 新文件 + 4-7 文件小改]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不把 userId/candidateId/email/phone 当 label
  - [✅/❌] 不在 metrics 端点强制 JWT
  - [✅/❌] 不替换 express-rate-limit
  - [✅/❌] 不修改 metrics 之外的中间件
  - [✅/❌] 不修改 lib/prisma.ts
  - [✅/❌] 不给 /api/metrics 单写新服务
```

---

### 修订 5/8：PROMPT-09 末尾加 Cursor 输出模板

**新增段**：

```markdown
## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[sentry.ts 行数 + 3 文件 diff]
- 推荐方案预估：[1 新文件 + 3 文件小改]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不在 service/controller 手动调 Sentry.captureException
  - [✅/❌] 不上报 req.body
  - [✅/❌] 不上报 4xx 错误
  - [✅/❌] 不替换 pino 日志
  - [✅/❌] 不触碰 OTel trace
  - [✅/❌] 不修改 Prisma 错误处理
```

---

### 修订 6/8：PROMPT-10 末尾加 Cursor 输出模板

**新增段**：

```markdown
## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[health.service.ts 行数 + routes/index.ts diff]
- 推荐方案预估：[1 新文件 + 1 文件小改]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不修改 /api/health 路径
  - [✅/❌] 不把健康检查塞进全局 rate-limit
  - [✅/❌] 不把缓存时间设短于 3 秒
  - [✅/❌] 不让 BullMQ 失败影响整体 HTTP 状态
  - [✅/❌] 不触碰其他 service
  - [✅/❌] 不在 health 检查里调 process.exit
```

---

### 修订 7/8：PROMPT-11 验收"service 代码无变更" 明确保留

**位置**：PHASE 1 PROMPT-11 验收第 5 条

**原内容**：
```
5. 应用的 service 代码无变更（git diff 中无 `src/` 改动）
```

**新内容**：
```
5. 应用的 service 代码无变更（git diff 中无 `src/` 改动）—— **本条是硬约束**（schema-only 改动）
```

---

### 修订 8/8：PROMPT-12 末尾加 Cursor 输出模板

**新增段**：

```markdown
## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[vitest.config.ts diff + CI 文件行数 + tests/README.md 行数]
- 推荐方案预估：[3 文件：vitest.config + CI 配置 + README]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不把门槛一开始就设 80%
  - [✅/❌] 不排除 service 文件
  - [✅/❌] 不在 CI 跑 pnpm dev
  - [✅/❌] 不在 CI hardcode 数据库密码
  - [✅/❌] 不把 CI 文件放进 server/ 目录
  - [✅/❌] 不修改 package.json 的 scripts
```

---

## 📝 PHASE 2 修订

### 修订 1/10：PHASE 2 顶部加 v1.1 元规则 + Cursor 输出模板

**位置**：`VIBE_CODING_PROMPTS_PHASE2.md` 全局约束段后

**新增**：复制 PHASE 0 的两段（内容相同）。

---

### 修订 2/10：PROMPT-13 行数约束放宽

**位置**：PHASE 2 第 182 行附近

**原内容**：
```
2. 修改文件列表 + 每个文件的 diff 行数
```

**新内容**：
```
2. 修改文件清单（如 [文件 A, B, C]，**清单不变**）+ diff 行数汇总
```

---

### 修订 3/10：PROMPT-13 末尾加输出模板

**新增段**：

```markdown
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

### 修订 4/10：PROMPT-14 "7 个文件"放宽

**位置**：PHASE 2 第 473 行附近

**原内容**：
```
   - 2 个 route 文件（仅 2-3 行变更）
```

**新内容**：
```
   - 2 个 route 文件（清单不变，行数 [软目标 ±50%]）
```

并在 PROMPT-14 整体"涉及文件清单"列表顶部加：

```markdown
> v1.1 提醒：下列文件清单是硬约束（不要增减），每个文件内的行数是软目标。
```

---

### 修订 5/10：PROMPT-14 末尾加输出模板

**新增段**：

```markdown
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

### 修订 6/10：PROMPT-15a "git diff 涉及"放宽

**位置**：PHASE 2 PROMPT-15a 验收 6

**原内容**：
```
6. ✅ `git diff` 涉及：schema + 1 个 migration + 1 个新 service + 1 个 route 追加 + 1 个测试文件
```

**新内容**：
```
6. ✅ `git diff` 涉及（**文件清单严格不变**，行数 [软目标 ±50%]）：
   - schema.prisma（追加）
   - 1 个新 migration
   - 1 个新 service
   - 1 个 route 文件（追加）
   - 1 个测试文件
```

---

### 修订 7/10：PROMPT-15b 末尾加输出模板

**新增段**：

```markdown
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

### 修订 8/10：PROMPT-15c 末尾加输出模板

**新增段**：

```markdown
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

### 修订 9/10：PROMPT-16a 末尾加输出模板

**新增段**：

```markdown
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

### 修订 10/10：PROMPT-17 "~20 行"放宽

**位置**：PHASE 2 第 1617 行

**原内容**：
```
6. ✅ `git diff` 涉及：schema 追加 + 1 migration + 1 新 crypto lib + 1 新 feishu-calendar lib + 1 新 route + interview-scheduler 加 ~20 行 + 2 个测试文件
```

**新内容**：
```
6. ✅ `git diff` 涉及（**文件清单严格不变**）：
   - schema.prisma（追加）
   - 1 个新 migration
   - 1 个新 crypto lib
   - 1 个新 feishu-calendar lib
   - 1 个新 route 文件
   - interview-scheduler.service.ts（**新增** ~20 行函数，行数 [软目标 ±50%]）
   - 2 个测试文件
```

---

## ✅ 应用完所有补丁后的最终效果

每个 prompt 的结构会变成：

```
# 任务：[标题]

## Context
（不变）

## Phase 1-N
（不变）

## 禁止事项
（不变）

## 验收条件（v1.1：硬约束 vs 软目标明确标注）
- [🔴 硬] 安全/功能约束
- [🟡 软] 行数/文件数约束

## 实施备注（必填）
5 行小节模板
```

---

## 🔧 怎么应用这些补丁

### 方式 A：手工 patch（推荐，可控）

1. 打开 `VIBE_CODING_PROMPTS_PHASE0.md`
2. 按本文件的"修订 N"逐处编辑
3. PHASE 1 / PHASE 2 同理

### 方式 B：在 Cursor 里批量替换

每个文件的"修订 1"是新增一段。可以在 Cursor Composer 里用：

```
按 @VIBE_CODING_PROMPTS_v1.1_PATCHES.md 的"修订 1/N"指示，
修改 @VIBE_CODING_PROMPTS_PHASE0.md 对应位置。
每改一处 diff 显示给我看。
```

### 方式 C：让我重写整个文件

如果你的 Cursor 已经关掉了 3 个 markdown 文件的句柄，告诉我，我可以一次性 write 完整的 v1.1 版本（每个 ~1000 行）。

---

## 📊 修订前后对比

| 维度 | v1.0 | v1.1 |
|------|------|------|
| 硬约束冲突风险 | 🔴 高 | 🟢 低 |
| Cursor 输出格式 | ❌ 不统一 | ✅ 5 行小节 |
| 团队 review 效率 | 🟡 中 | 🟢 高 |
| 实施差异化空间 | ❌ 几乎为零 | ✅ 标准错误处理允许 |
| 是否引入新 bug 风险 | 🟡 中 | 🟢 低（明确禁止"凑行数"） |

---

> **生成时间**：基于 PROMPT-01 实战反馈（用户指出"1-3 行"与 try/catch 冲突）
> **影响**：PHASE 0 / 1 / 2 共 27 处补丁
> **建议应用顺序**：PHASE 0 → PHASE 1 → PHASE 2（PHASE 0 实战最多，优先级最高）
