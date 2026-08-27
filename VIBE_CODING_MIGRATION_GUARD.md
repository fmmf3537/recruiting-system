# 数据库 Migration Guard Prompt

> **用途**：在跑 PROMPT-05、PROMPT-13、PROMPT-14、PROMPT-15a、PROMPT-17 这类涉及数据库 schema 变更的 prompt 时，**先粘贴这个**到 Cursor Composer，作为前置规则
> **目标**：强制 Cursor 用 `--create-only` 模式生成 SQL，apply 前停下来等人工 review

---

## 🛡️ Migration Guard Prompt（v1.1）

```markdown
# ⚠️ 数据库变更流程硬规则（本任务前置）

## 适用范围
本次任务涉及数据库 schema 变更（`schema.prisma` 新增字段 / enum / 关联）。
下面 7 条规则必须遵守，**违反任何一条立即停止**。

## 强制流程（按顺序执行）

### Step 1：修改 schema.prisma
按任务要求修改 `server/prisma/schema.prisma`。

### Step 2：仅生成 client（不动 DB）
```bash
cd server
npx prisma generate
```
这一步只更新 TypeScript 类型，**不触碰数据库**。

### Step 3：生成 migration SQL（不 apply）⚠️ 关键
**必须**使用 `--create-only` 标志：
```bash
npx prisma migrate dev --create-only --name <任务名>
```

**禁止**使用：
- ❌ `npx prisma migrate dev`（默认会自动 apply）
- ❌ `npx prisma migrate deploy`（直接应用到 DB）
- ❌ 直接连数据库跑 SQL

**理由**：`--create-only` 只在 `server/prisma/migrations/` 下生成 `.sql` 文件，
不会触碰数据库，给人工 review 留出窗口。

### Step 4：完整展示 SQL 文件内容
把生成的 `server/prisma/migrations/<timestamp>_<name>/migration.sql`
**完整内容**粘贴到对话里，让人类 review。

**SQL 必须包含以下检查项**（Cursor 自检）：
- [ ] ALTER TABLE ... TYPE ... USING ...（字符串转 enum 必须有 USING）
- [ ] 没有意外 DROP TABLE / DROP COLUMN
- [ ] 索引 / 外键 / 唯一约束完整保留
- [ ] 涉及大表的 ALTER 没有阻塞操作（如 `ALTER TABLE ADD COLUMN ... DEFAULT ...`）

**如果自检发现任何异常**：立即停止，告诉人类，不要继续。

### Step 5：🛑 停下来等人类 review
输出以下明确的中断提示：

```
🛑 已生成 migration SQL，请人工 review：

文件路径：server/prisma/migrations/<timestamp>_<name>/migration.sql

📋 Review 检查清单：
1. [✅/❌] USING 子句存在（字符串 → enum）
2. [✅/❌] 没有 DROP 关键表/列
3. [✅/❌] 索引/约束保留
4. [✅/❌] 大表 ALTER 安全（不阻塞）
5. [✅/❌] SQL 字符编码无乱码

请回复以下任一指令：
- "apply" → 我会执行 `npx prisma migrate deploy` 并继续后续步骤
- "rollback" → 我会 `git checkout -- server/prisma/migrations/` 并停止
- "fix <说明>" → 我会按你的指示修改 migration SQL 后重新展示
```

**未收到人类指令前，禁止执行 apply**。

### Step 6：收到 apply 指令后
```bash
npx prisma migrate deploy
npx prisma generate  # 再次确认 client 最新
```

### Step 7：替换代码中的魔法字符串（如果有）
仅在 migration apply 成功、TypeScript 编译通过后，才开始修改 service 文件。

### Step 8：跑测试 + smoke test
- `pnpm test`
- 至少手动测一次：登录 → 创建候选人 / 创建 job 等核心路径

### Step 9：提交
```bash
git add server/prisma/schema.prisma \
        server/prisma/migrations/ \
        <修改的 service 文件>

git commit -m "feat(server): ..."
```

## 绝对禁止

1. ❌ **跳过 Step 3 直接 apply**：用 `npx prisma migrate dev` 不带 `--create-only`
2. ❌ **跳过 Step 5 直接继续**：生成 SQL 后不展示、不等 review 就跑后续
3. ❌ **自作主张 roll forward**：发现 SQL 有问题时不告诉人类，自己重写
4. ❌ **修改 schema 不生成 migration**：改完 schema 后只跑 `prisma generate` 不 `migrate dev`
5. ❌ **同时改多个表的 schema**：一次 prompt 只动一张表（或一组强相关表）

## 为什么要这样

- 数据库 migration 是**不可逆的复杂变更**，失败影响生产
- `prisma migrate dev` 默认会 apply，等于"边写边跑"
- `--create-only` 是 Prisma 官方提供的"先看 SQL"开关
- 人工 review SQL 是发现 schema 设计 bug 的最后窗口
- 出问题回滚需要 `migrate resolve --rolled-back`，比 git revert 麻烦得多

## 实施备注必填

按 v1.1 元规则，完成后必须输出：
- 实际改动：[修改的 schema 行数 / 生成的 migration SQL 行数 / service 改动文件数]
- 推荐方案预估：[预估 schema / migration / service 各多少]
- 偏差原因：[无 / 解释]
- 是否属于标准做法的合理膨胀：[是 / 否]
- **额外必填**：本次 migration apply 的人工 review 反馈（如"apply" / "rollback" / "fix ..."）
- 禁止事项勾选：
  - [✅/❌] 使用了 --create-only
  - [✅/❌] 完整展示了 SQL 内容
  - [✅/❌] 等人类 review 后才 apply
  - [✅/❌] apply 成功后才改 service
  - [✅/❌] 修改的 schema 与 migration 一致
```

---

## 📋 使用方法

### 方式 A：单独 Composer 会话（推荐）

新开一个 Composer 会话，**先粘贴 Guard Prompt，等 Cursor 回应"已加载"后，再粘贴 PROMPT-05**：

```
【第 1 轮】粘贴本文件中的 "Migration Guard Prompt（v1.1）" 内容
【第 2 轮】Cursor 确认后，粘贴 PROMPT-05 的完整内容
```

### 方式 B：合并到 PROMPT 顶部

把 Guard Prompt 的"强制流程"段直接加在 PROMPT-05 顶部，作为前置章节：

```markdown
# [Guard Prompt 的强制流程 9 步]

---

# [原 PROMPT-05 的所有内容]
```

这样 Cursor 一次性看到两套规则。

### 方式 C：写入 `.cursorrules` 文件（全局生效）

在项目根目录创建 `.cursorrules` 文件，写入 Guard Prompt 的关键规则：

```markdown
# Database Migration Rules (项目级硬规则)

## 强制流程
1. 修改 schema.prisma 后必须先 `prisma generate`
2. 生成 migration 必须用 `--create-only`
3. 展示完整 SQL 给人类 review
4. 收到 "apply" 指令后才能 `migrate deploy`
5. apply 成功后才改 service 代码

## 绝对禁止
- 不带 `--create-only` 跑 `migrate dev`
- 不展示 SQL 就直接 apply
- 修改 schema 不生成 migration
```

---

## 🎯 适用 Prompt 清单

| Prompt | 涉及 schema 变更 | 必须用 Guard |
|--------|----------------|------------|
| PROMPT-05（Prisma enum） | ✅ 6 字段改 enum | **必须** |
| PROMPT-11（SQL 索引） | ✅ 新增复合索引 | **必须** |
| PROMPT-13（候选人软删除） | ✅ 新增 deletedAt/deletedById | **必须** |
| PROMPT-14（RBAC） | ✅ 新增 4 张表 | **必须** |
| PROMPT-15a（候选人门户） | ✅ 新增 2 张表 | **必须** |
| PROMPT-17（飞书日历） | ✅ 新增 1 张表 | **必须** |

---

## 💡 额外的小技巧

### 1. 如果你想"加速"，可以选 apply 后自动继续
给 Cursor 一个明确的指令：
> "apply 后无需等我，自动继续后续 service 改造"

但**默认建议不要这么做**，保留人工介入。

### 2. migration 失败时的应急指令
- `rollback` → 自动 `git checkout -- server/prisma/migrations/` 并停止
- `fix <说明>` → 按你的指示改 SQL，重新展示

### 3. 大表的特殊处理
如果 Cursor 检测到某个表行数 > 10 万，会自动加 `CONCURRENTLY`：
```sql
CREATE INDEX CONCURRENTLY ...;
```
**不需要你额外干预**，Cursor 会根据 schema 的索引声明自动判断。

### 4. 不涉及 schema 变更的 prompt 不需要 Guard
例如 PROMPT-01（仅改 upload.ts）、PROMPT-02（仅加 logger）、PROMPT-03（仅改 auth 中间件），
**不需要**这个 Guard。

---

## ⚠️ Guard Prompt 的限制

这个 Guard 是**约定**，不是技术限制。如果 Cursor "理性判断"认为你的指令不合理，
它可能：
- 提示风险但仍继续
- 给出不同方案让你选

**你作为人类 reviewer 是最后一道防线**：
- 即使 Cursor 输出 SQL 后说"看起来没问题"也要自己 review
- 不要被"AI 已经检查过了"这种话术说服
- 任何看不懂的 SQL，立刻问 Cursor 或自己 Google

---

> **生成时间**：基于 PROMPT-04 完成后的安全意识
> **配合使用**：VIBE_CODING_PROMPTS_PHASE0/1/2.md 中的 schema 变更 prompt
> **可演进**：使用中发现 Guard 不够严格的地方，回来补充
