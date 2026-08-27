# 阶段 1 执行指南（怎么用 PHASE 1 v1.1）

> **这个文件的用途**：告诉你**打开哪个文件 → 复制哪段 → 粘贴到 Cursor**
> **如果你只想知道"现在该做什么"**：看下面的"3 步走流程"

---

## 🚀 3 步走流程（每次做新 prompt 都这样）

```
第 1 步：打开 VIBE_CODING_PROMPTS_PHASE1_v1.1.md
第 2 步：按下面的"执行清单"找到对应 prompt 编号
第 3 步：复制从"### Cursor 提示词"到下一个 prompt 之前的所有内容
        粘贴到 Cursor Composer
```

**就这么简单。** 不需要理解元规则、不需要看完整文件。

---

## 📋 阶段 1 执行清单（按推荐顺序）

| 顺序 | Prompt | 难度 | 文件位置 | 你要做什么 |
|------|--------|------|---------|-----------|
| 第 1 个 | **PROMPT-10** 健康检查 | 🟢 简单 | v1.1.md 第 [PROMPT-10](#) 段 | 直接复制粘贴 |
| 第 2 个 | **PROMPT-12** CI 门槛 | 🟢 简单 | v1.1.md 第 [PROMPT-12](#) 段 | 直接复制粘贴 |
| 第 3 个 | **PROMPT-11** SQL 索引 | 🟡 中 | v1.1.md 第 [PROMPT-11](#) 段 | **先粘贴 Migration Guard** |
| 第 4 个 | **PROMPT-07** OTel | 🟡 中 | v1.1.md 第 [PROMPT-07](#) 段 | 直接复制粘贴 |
| 第 5 个 | **PROMPT-08** Prometheus | 🟡 中 | v1.1.md 第 [PROMPT-08](#) 段 | 直接复制粘贴 |
| 第 6 个 | **PROMPT-09** Sentry | 🟡 中 | v1.1.md 第 [PROMPT-09](#) 段 | 直接复制粘贴 |

---

## 📋 第 1 个：PROMPT-10 健康检查（现在做这个）

**复制这段（v1.1.md 中的 PROMPT-10 完整 Cursor 提示词）：**

```
# 任务：增强 /api/health 端点（检查 DB / Redis / BullMQ）
...
（中间内容一直到）
## 实施备注（必填）
...
（结束在最后的"禁止事项勾选"列表）
```

**实际操作**：

```
1. 打开 VIBE_CODING_PROMPTS_PHASE1_v1.1.md
2. 搜索 "PROMPT-10：增强"
3. 找到 ```markdown 开始到下一个 ``` 结束的所有内容
4. 选中整段 markdown 代码块里的文字
5. 复制
6. 打开 Cursor Composer（新会话）
7. 粘贴
8. 按 Enter / 等 Cursor 跑
9. 完成后 Cursor 会输出"实施备注"
10. 你 review 后让我帮你 commit
```

---

## 📋 第 3 个特别说明：PROMPT-11 SQL 索引（需要先粘 Guard）

PROMPT-11 涉及数据库 schema 变更，**必须先用 Migration Guard**。

**步骤**：

```
第 1 步：先打开 VIBE_CODING_MIGRATION_GUARD.md
第 2 步：找到 "Migration Guard Prompt（v1.1）" 段
        （从 "# ⚠️ 数据库变更流程硬规则" 开始）
第 3 步：复制从 ```markdown 到下一个 ``` 的所有内容
        粘贴到 Cursor Composer
        让 Cursor "消化"这个 Guard 规则

第 4 步：再打开 VIBE_CODING_PROMPTS_PHASE1_v1.1.md
第 5 步：找到 PROMPT-11 的 Cursor 提示词
第 6 步：复制粘贴
```

**或者更简单**：把 Guard 全部内容**粘贴到 Cursor 后**，再粘 PROMPT-11。Cursor 会同时看到两个。

---

## 📋 每个 prompt 的"完成后要做什么"

不管做哪个 prompt，Cursor 完成后：

```
1. 跑 pnpm test 确认全绿
2. 看 Cursor 的"实施备注"5 行
3. 把改动 git add + commit
4. 告诉我 commit 完成，我帮你 push 或进入下一个 prompt
```

**commit message 模板**（我会帮你准备好）：

```
feat(server): PROMPT-XX 任务名

[Cursor 给的改动摘要]
[Cursor 给的实施备注]

Refs: 审计报告阶段 1 任务 N
```

---

## 📋 遇到问题怎么办

| 现象 | 你做这个 |
|------|---------|
| Cursor 输出看不懂 | 整段贴给我，我帮你 review |
| 跑测试挂了 | 贴报错给我，我看是 prompt 问题还是环境问题 |
| "agent execution provider timeout" | 重启 Cursor 重试（之前遇到过） |
| Cursor 想"顺手改"提示词外的文件 | 喊停它，发"禁止事项逐条勾选"要求 |
| schema 变更没经过 Guard | 立即 rollback，让 Cursor 重做 |
| 不确定 commit message 怎么写 | 跑过来问我，我给你准备 |

---

## 📋 你**不需要**读的文件

为了减少认知负担，这些文件你**不需要读**：

- ❌ 元规则段（v1.1 改进说明、实施备注模板）—— Cursor 会自己看
- ❌ 关联文档链接区 —— 仅供参考
- ❌ 推荐执行顺序的"理由"列 —— 知道顺序即可，理由是给我看的

**你只需要**：

- ✅ 知道现在做哪个 prompt（看上面的执行清单）
- ✅ 复制粘贴对应的 markdown 代码块
- ✅ 跑测试 + commit

---

## 📋 一句话总结

> **打开 v1.1.md → 找 PROMPT-XX → 复制 ```markdown 代码块里的内容 → 粘贴到 Cursor → 等 Cursor 输出实施备注 → 我帮你 review + commit**

---

## ❓ 现在开始

按上面的清单，第 1 个是 **PROMPT-10 健康检查**。

如果你准备好了：
1. 打开 `VIBE_CODING_PROMPTS_PHASE1_v1.1.md`
2. 搜索 `PROMPT-10`
3. 找到 ```markdown 包裹的内容
4. 全部复制
5. 粘贴到 Cursor Composer
6. 等 Cursor 输出实施备注

Cursor 跑完后，把"实施备注"贴给我，我帮你：
- 验证改动是否越界
- 写 commit message
- 帮你 commit

**你准备好了就说一声**，或者直接开始粘都行。如果遇到问题随时叫我。
