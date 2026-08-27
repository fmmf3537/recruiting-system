# Vibe Coding 提示词集 - v1.2 实战案例（数据库 Migration）

> **本文件是 v1.1 的补充，专门记录 PROMPT-05 实战中 Migration Guard 第一次发挥作用的完整过程**
> **配合阅读**：[VIBE_CODING_PROMPTS_UPDATE_v1.1.md](./VIBE_CODING_PROMPTS_UPDATE_v1.1.md)、[VIBE_CODING_MIGRATION_GUARD.md](./VIBE_CODING_MIGRATION_GUARD.md)

---

## 📅 事件背景

### 任务
**PROMPT-05：Prisma enum 改造**（阶段 0 P1 任务）

把以下字符串字段改为 Postgres enum：
- `User.role`（admin / member）
- `StageRecord.status`（in_progress / passed / rejected）
- `InterviewFeedback.conclusion`（pass / reject / pending）
- `Offer.result`（pending / accepted / rejected）
- `Offer.status`（draft / pending_approval / approved / rejected / sent）
- `Interview.status`（scheduled / completed / cancelled / no_show）

### 时间线

```
[T1] 团队生成 VIBE_CODING_MIGRATION_GUARD.md，强制 Cursor 用 --create-only + 人工 review
[T2] Cursor 开始执行 PROMPT-05
[T3] Cursor 修改 schema.prisma（按预期）
[T4] Cursor 运行 prisma generate（成功，仅生成 client）
[T5] Cursor 尝试 prisma migrate dev --create-only → ❌ 失败（无 TTY）
[T6] Cursor 改用 prisma migrate diff 生成 SQL（只读，未 apply，未写文件）✅
[T7] Cursor 自检发现 SQL 异常 → 🛑 按 Guard 设计主动停止
[T8] Cursor 等待人工 review 指令
```

---

## 🛡️ Guard 起作用的时刻（Step 5 触发）

### Cursor 自检结果（5 项中 1 通过 + 4 失败）

```
- [❌] USING 子句：没有。Prisma 用了 DROP COLUMN + ADD COLUMN，不是 ALTER COLUMN ... TYPE ... USING ...
- [❌] 没有意外 DROP：对 user.role、stage_record.status、interview_feedback.conclusion、
       offer.result、offer.status、interview.status 都是 DROP 再 ADD，**现有值会丢**
- [❌] 索引/约束保留：列被 DROP 时原索引一并没了，后面再 CREATE INDEX；数据已经没了
- [❌] 大表 ALTER 安全：DROP/ADD 会清空数据。user.role 无 DEFAULT，表里有行时
       ADD COLUMN ... NOT NULL 会直接失败；有 DEFAULT 的列会全部变成默认值
       （例如面试全变成 scheduled）
- [✅] SQL 无乱码
```

### Cursor 给出的中断提示

```
🛑 已生成 migration SQL，请人工 review：
文件路径：尚未落盘（因自检失败）

📋 Review 检查清单：
1. [❌] USING 子句存在（字符串 → enum）
2. [❌] 没有 DROP 关键表/列
3. [❌] 索引/约束保留
4. [❌] 大表 ALTER 安全（不阻塞）
5. [✅] SQL 字符编码无乱码

请回复以下任一指令：
- "apply" → 不建议。当前 SQL 会丢数据；我不会按这份去 deploy
- "rollback" → 我会还原 schema.prisma 并停止
- "fix <说明>" → 我会改 SQL 后重新展示，仍等你 apply 才部署
```

**关键观察**：Cursor 不仅停止了，还主动拒绝了 `apply` 指令，明确说"不建议"。这是 Guard 设计超出预期的表现。

---

## 💡 SQL 错误的本质分析

### Prisma 的默认行为

```sql
-- Prisma 默认生成的（不安全）
ALTER TABLE "user" DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL;
```

**为什么 Prisma 这样做**：
- `ALTER COLUMN ... TYPE ... USING` 只对**纯类型变更**有效（如 `varchar → text`）
- 对**字符串 → enum** 这种语义变更，Prisma 默认采用"DROP + ADD"模式
- 理由：新建一个类型安全的列比"勉强转换"更安全（避免脏数据带进 enum）

**为什么这有问题**：
- 现有数据**全部丢失**
- 依赖默认值的列（interview.status、offer.status）全部被重置为默认值
- 原索引随列 DROP 一起消失
- 如果表里有数据且 `NOT NULL` 无 DEFAULT，ADD COLUMN 直接失败

### 正确写法（人工 fix）

```sql
-- 应该这样（保留数据）
ALTER TABLE "user" 
  ALTER COLUMN "role" TYPE "UserRole" 
  USING COALESCE(NULLIF("role", ''), 'member')::"UserRole";
```

要点：
- 必须有 `USING 'old_value'::"EnumName"`
- NULL 或未知字符串需要 `COALESCE` 兜底
- 不重建列，原索引保留

### 兜底策略表

| 字段 | 当前可能的值 | 兜底写法 |
|------|-------------|---------|
| `user.role` | `'admin'`、`'member'`、可能 NULL | `COALESCE(NULLIF("role", ''), 'member')::"UserRole"` |
| `stage_record.status` | `'in_progress'`、`'passed'`、`'rejected'`、可能 NULL | `COALESCE(NULLIF("status", ''), 'in_progress')::"StageStatus"` |
| `interview.status` | `'scheduled'` 等 + DEFAULT | `COALESCE("status", 'scheduled')::"InterviewStatus"` |
| `interview_feedback.conclusion` | 可能 NULL（草稿状态） | `COALESCE("conclusion", 'pending')::"InterviewConclusion"` |
| `offer.result` | `'pending'` 等 | `COALESCE(NULLIF("result", ''), 'pending')::"OfferResult"` |
| `offer.status` | `'draft'` 等 + DEFAULT | `COALESCE(NULLIF("status", ''), 'draft')::"OfferStatus"` |

---

## 🎓 本次实战的关键教训

### 教训 1：`migrate diff` 是 `--create-only` 的合法替代

当遇到：
```
prisma migrate dev --create-only
# → 失败（无 TTY）
```

**Cursor 的解决方案**：
```bash
prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script
```

这个命令：
- 只生成 SQL，不写文件
- 不触碰数据库
- 输出到 stdout 便于 review

**结论**：Guard Prompt 应该增加这个 fallback 说明，避免 Cursor 卡住。

### 教训 2：Prisma 默认行为需要 fix 指令纠正

PROMPT-05 提示词里写了：

> ALTER TABLE 用了 USING 子句把字符串映射到 enum：
> ```sql
> ALTER TABLE "user" ALTER COLUMN "role" TYPE "UserRole" USING "role"::"UserRole";
> ```

但这只是"建议写法"，**Cursor 不知道 Prisma 默认不会这么做**。

**结论**：需要在 prompt 里加显式警告：

```markdown
⚠️ Prisma 默认会用 DROP+ADD 而非 ALTER+USING。
如果 Cursor 生成的 SQL 出现 DROP COLUMN，必须发 fix 指令纠正。
```

### 教训 3：NULL 字段处理必须显式兜底

即使改对了 USING 写法，如果旧数据有 NULL，转换仍会失败：

```sql
-- 报错：invalid input value for enum: "null"
ALTER COLUMN "conclusion" TYPE "InterviewConclusion" USING "conclusion"::"InterviewConclusion";

-- 必须这样：
ALTER COLUMN "conclusion" TYPE "InterviewConclusion" 
  USING COALESCE("conclusion", 'pending')::"InterviewConclusion";
```

**结论**：Guard 的 fix 指令模板里要包含每个字段的 COALESCE 兜底写法。

### 教训 4：Cursor 主动拒绝 apply，超出预期

按 Guard 设计，Cursor 只应该"停下来等指令"。但它更进一步：

```
请回复以下任一指令：
- "apply" → **不建议**。当前 SQL 会丢数据；我不会按这份去 deploy
```

这是 Guard 设计的副产物，但效果非常好 —— Cursor 评估后**主动拒绝**了危险操作，给人类明确的拒绝理由。

---

## 📐 v1.2 改进：Guard Prompt 应该补什么

### 改进 A：增加 TTY 缺失时的 fallback

在 Guard 的 Step 3 中，**预先告知 Cursor 可以用 `migrate diff`**：

```markdown
### Step 3：生成 migration SQL（不 apply）⚠️ 关键

**优先**使用：
```bash
npx prisma migrate dev --create-only --name <任务名>
```

**如果失败（无 TTY）**，fallback 到：
```bash
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma \
  --script
```

**禁止**：
- ❌ `npx prisma migrate dev`（默认会自动 apply）
- ❌ `npx prisma migrate deploy`（直接应用到 DB）
- ❌ 直接连数据库跑 SQL
```

### 改进 B：增加"Prisma 默认行为"警告

```markdown
### ⚠️ Prisma 默认 SQL 可能不安全

字符串 → enum 转换时，Prisma 默认生成 `DROP COLUMN + ADD COLUMN`，
**会导致现有数据丢失**。

正确写法应该是：
```sql
ALTER COLUMN "xxx" TYPE "EnumName" USING 'old_value'::"EnumName";
```

如果生成的 SQL 出现 DROP COLUMN，**立即停止，发 fix 指令**。
```

### 改进 C：fix 指令模板

```markdown
## Fix 指令模板（供人类 reviewer 参考）

如果 SQL 不安全，发以下指令：

```
fix 按以下要求重写 SQL（保留现有数据）：

1. 必须使用 ALTER COLUMN ... TYPE ... USING，不允许 DROP COLUMN
2. 处理 NULL 和未知字符串（COALESCE + NULLIF）：
   - user.role: COALESCE(NULLIF("role", ''), 'member')::"UserRole"
   - stage_record.status: COALESCE(NULLIF("status", ''), 'in_progress')::"StageStatus"
   - interview.status: COALESCE("status", 'scheduled')::"InterviewStatus"
   - interview_feedback.conclusion: COALESCE("conclusion", 'pending')::"InterviewConclusion"
   - offer.result: COALESCE(NULLIF("result", ''), 'pending')::"OfferResult"
   - offer.status: COALESCE(NULLIF("status", ''), 'draft')::"OfferStatus"
3. 不需要 CREATE INDEX（列不重建，原索引保留）
4. 重新生成后再次走 Guard 自检，未通过继续停止
5. apply 前必须等我明确回复 "apply"
```
```

### 改进 D：实施备注必填项调整

在 Guard Prompt 的"实施备注必填"段，新增：

```markdown
- **本次 migration 的人工 review 反馈**（apply / rollback / fix ...）
- **SQL 是否有 DROP COLUMN**（是 / 否）
- **USING 子句是否存在**（是 / 否）
- **NULL 兜底是否完整**（是 / 否）
```

---

## ✅ PROMPT-05 实战是否合规

| Guard 检查项 | 实际表现 | 合规 |
|--------------|---------|------|
| 使用 `--create-only` 或 fallback | `migrate diff`（fallback） | ✅ |
| 完整展示 SQL 内容 | 完整粘贴 | ✅ |
| 等人类 review 后才 apply | 主动停止等待 | ✅ |
| apply 成功后才改 service | service 未改 | ✅ |
| 修改的 schema 与 migration 一致 | 一致 | ✅ |
| **额外：主动拒绝不安全 apply** | Cursor 主动拒绝 apply | ✅⭐ |

**结论**：Cursor 在 PROMPT-05 实战中**完美执行** Guard 设计，未触碰数据库、未丢失数据、未越界。
**建议**：将 Guard Prompt 按 v1.2 改进更新。

---

## 📌 给用户的后续建议

### 1. 立即行动
回复 Cursor `fix` 指令（按改进 C 的模板），让它重新生成安全 SQL。

### 2. 在 dev 库跑一次数据现状查询
让 Cursor 生成 SELECT 语句查询现有数据分布，验证 COALESCE 兜底是否覆盖所有情况：

```sql
SELECT 'user.role' AS col, role AS val, COUNT(*) FROM "user" GROUP BY role;
SELECT 'stage_record.status' AS col, status AS val, COUNT(*) FROM "stage_record" GROUP BY status;
SELECT 'interview.status' AS col, status AS val, COUNT(*) FROM "interview" GROUP BY status;
SELECT 'interview_feedback.conclusion' AS col, conclusion AS val, COUNT(*) FROM "interview_feedback" GROUP BY conclusion;
SELECT 'offer.result' AS col, result AS val, COUNT(*) FROM "offer" GROUP BY result;
SELECT 'offer.status' AS col, status AS val, COUNT(*) FROM "offer" GROUP BY status;
```

### 3. Guard Prompt 升级
按 v1.2 改进的 A/B/C/D 四点，升级 `VIBE_CODING_MIGRATION_GUARD.md`。

### 4. 暂缓执行
如果不想现在冒险，可以：
- 选 `rollback`，暂缓 PROMPT-05
- 先做 PROMPT-06（Zod max 限制，不涉及 schema）
- 等精力更好时再回头处理 PROMPT-05

---

## 🗺️ 版本演进时间线

| 版本 | 触发事件 | 关键改进 |
|------|---------|---------|
| v1.0 | 初始生成 PHASE 0/1/2 prompt 集 | 单一变更 + 测试先行 + 禁止越界 |
| **v1.1** | PROMPT-01 实战：`upload.ts` 修复时 "1-3 行"约束与 try/catch 冲突 | 行数变软目标 + Cursor 实施备注模板 |
| **v1.2** | PROMPT-05 实战：Migration Guard 第一次发挥作用 | Guard 增加 TTY fallback + Prisma 默认警告 + fix 模板 + 实施备注增强 |

---

> **创建时间**：基于 PROMPT-05 实战（Migration Guard 第一次成功阻止数据丢失）
> **影响范围**：所有涉及 schema 变更的 prompt（PROMPT-05/11/13/14/15a/17）
> **建议行动**：升级 `VIBE_CODING_MIGRATION_GUARD.md` 到 v1.2
> **Guard 设计验证**：✅ 实战证明 Guard 能有效拦截危险 migration

---

## 📎 附录：PROMPT-05 完整 SQL（不安全版本，留档参考）

```sql
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'member');
CREATE TYPE "StageStatus" AS ENUM ('in_progress', 'passed', 'rejected');
CREATE TYPE "InterviewConclusion" AS ENUM ('pass', 'reject', 'pending');
CREATE TYPE "OfferResult" AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE "OfferStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'sent');
CREATE TYPE "InterviewStatus" AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

-- ⚠️ 以下 ALTER 会丢数据
ALTER TABLE "interview" DROP COLUMN "status", ADD COLUMN "status" "InterviewStatus" NOT NULL DEFAULT 'scheduled';
ALTER TABLE "interview_feedback" DROP COLUMN "conclusion", ADD COLUMN "conclusion" "InterviewConclusion" NOT NULL;
ALTER TABLE "offer" DROP COLUMN "result", ADD COLUMN "result" "OfferResult" NOT NULL, DROP COLUMN "status", ADD COLUMN "status" "OfferStatus" NOT NULL DEFAULT 'draft';
ALTER TABLE "stage_record" DROP COLUMN "status", ADD COLUMN "status" "StageStatus" NOT NULL;
ALTER TABLE "user" DROP COLUMN "role", ADD COLUMN "role" "UserRole" NOT NULL;

-- CreateIndex（列被 DROP 时原索引也消失，这里重建）
CREATE INDEX "interview_status_idx" ON "interview"("status");
CREATE INDEX "interview_scheduledAt_status_idx" ON "interview"("scheduledAt", "status");
CREATE INDEX "interview_feedback_conclusion_idx" ON "interview_feedback"("conclusion");
CREATE INDEX "offer_result_idx" ON "offer"("result");
CREATE INDEX "offer_status_idx" ON "offer"("status");
CREATE INDEX "stage_record_status_idx" ON "stage_record"("status");
CREATE INDEX "stage_record_status_enteredAt_idx" ON "stage_record"("status", "enteredAt");
CREATE INDEX "user_role_idx" ON "user"("role");
```

**这份 SQL 不应被执行**。仅留作 v1.2 实战记录。
