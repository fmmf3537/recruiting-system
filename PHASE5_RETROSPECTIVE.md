# 阶段 5 复盘 —— 实战踩坑与经验沉淀

> **复盘时间**：2026-09-03
> **覆盖**：阶段 5 AI 招聘增强 + HR 考核（S0 → F1/F2/F3/F4/F5 → M6，14 个切片全部完成）
> **配套**：[PHASE5_SUMMARY.md](./PHASE5_SUMMARY.md)（成果总结）+ [服务器部署提示词方案_阶段5_20260903.md](./服务器部署提示词方案_阶段5_20260903.md)（部署）

---

## 🎯 一句话复盘

阶段 5 是本项目**第一次大规模 AI 功能 + 异步队列 + 公开无鉴权接口 + 混合切片流水线**的实战，工程上整体顺利（14 切片全部过审、0 生产事故），但暴露了 **4 类可复用的坑**：测试同步滞后、CRLF 行尾污染、验收基线漂移、公开接口细节反直觉。

---

## 📊 数字总览

| 指标 | 值 |
|------|-----|
| 切片数 | 14（S0 + F2/F1/F3/F5/F4 前后端 + M6）|
| 新增表 | 6（ai_match_score / interview_question_outline / agency / agency_link / hr_score_event / hr_score_snapshot）|
| 新增迁移 | 6（角色 2 + AI 4）|
| 新增 service | ~20（match-score / jd-assist / interview-outline / hr-score×3 / referral / agency 等）|
| 新增权限点 | 5（ai:match-score / ai:jd-assist / ai:interview-outline / hr-score:read / agency:manage）|
| 测试增长 | 427 → 561（+134 后端）；client 22 持平 |
| lint 基线漂移 | server 15567e/240w → 15600e/253w（+33e/+13w）；client 137e/231w 持平 |
| type-check 漂移 | client 78 → 90（+12 存量，非本次引入）|
| 修复轮 | F2-S-fix1 / F3-C-fix1 / F5-C-fix1 / F4-C（3 warning）/ M6（2 处）共 ~6 轮 |

---

## 🪤 踩过的坑（按严重度排序）

### 坑 1：`llm.ts` 被写成 CRLF 行尾（编码红线违规）

- **现象**：M6 改 `llm.ts` 后，全仓 lint 从 15567e 涨到 15753e（+186），排查发现该文件 CRLF=153/LF=153（全文件 CRLF），而其他 7 个改动文件都是 LF。
- **根因**：opencode 生成 prompt 字符串修改时用了 CRLF 行尾（Windows 编辑器 / 模板字符串拼接带 `\r\n`），覆盖了原本 LF 的文件。
- **影响**：CRLF 触发多个 lint 规则（import/order 等）→ 大量假阳性增量。
- **教训**：
  1. **交付审核必须先查行尾**：`[System.IO.File]::ReadAllBytes` 数 CRLF，发现 ≠ 0 立即转 LF（`-replace "\`r\`n", "\`n"`）。
  2. 提示词红线里写「新文件 LF 行尾」**不够**——既有文件的**修改行**也可能带 CRLF，审核要覆盖「修改文件」而不只是「新文件」。
  3. git 配 `core.autocrlf=false` + `.gitattributes` 强制 `*.ts eol=lf`，从源头断掉。

### 坑 2：测试断言没同步业务文案变更（M6）

- **现象**：M6 改 `referral.service.ts` 的 consentNote（合规文案），但 `referral.service.test.ts` 第 217 行断言还是旧文案 → 1 个用例挂。
- **根因**：M6 提示词要求「改 service 文案」，但没明确要求「同步更新测试断言」。
- **教训**：**改任何字符串/接口响应结构，提示词必须写「同步更新涉及该字段的测试断言」**。M6 这种纯字符串改动最容易漏。

### 坑 3：接口契约草拟与真实后端不一致（前端切片）

- **现象**：F4-C 提示词草稿里 `/my.pagination`、`team.score`、`report.trend` 的字段结构，与 F4-S2 真实实现不一致。
- **处理**：Cursor 主动识别并适配真实契约（`/my.pagination` 在根上、team 无 `score` 字段用 `totalScore:null`、report 趋势 `{date,value}`）。
- **教训**：**前端切片提示词不应该"猜"接口字段**——要么先让后端切片输出真实 DTO，要么在前端提示词里写「以服务端实际返回为准，交付报告列出适配差异」。这次 Cursor 做对了，但下次建议更早对齐。

### 坑 4：公开接口细节反直觉（F5）

- **现象**：猎头公开页 `/referral/:token` 有多个反直觉点，F5-C 提示词专门列了 6 条（410 双表现 / 来源精确匹配 / 固定成功文案 / 无鉴权 / zod 严格 / 疑似重复不回显）。
- **处理**：F5-S 提示词里写了「安全红线 8 条」+ 前置「威胁模型复核简报」，opencode 首跑 0 修订轮。
- **教训**：**公开无鉴权写接口，前置安全设计复核（威胁模型）非常值**——9 项威胁核对 + 4 个拍板取舍，把最容易出错的部分前置到提示词里，节省了整个切片的重做成本。

### 坑 5：验收基线漂移（AGENTS.md 过时）

- **现象**：AGENTS.md 基线写 `server lint 15567e/240w` / `client type-check 78`，实测已是 `15600e/253w` / `90`。
- **根因**：多个切片累积（F4-S1 修 CRLF 后下降过一次，F4-S2/C/M6 又新增了一些存量债），但没人更新 AGENTS.md。
- **教训**：
  1. **每个切片完成后应同步更新 AGENTS.md 基线**（不是只在切片内"不得新增"，要定期刷新绝对值）。
  2. 审核时发现基线漂移，第一件事 `git stash` 对比「改动前 vs 改动后」，确认增量是否真的 0——**不要被绝对值的漂移误导判 fail**。

### 坑 6：执行器权限拒绝崩溃（F4-S1）

- **现象**：F4-S1 执行「上一轮执行器权限拒绝崩溃，已清理残骸后重新启动本跑」。
- **教训**：slice-run 后台执行遇到权限拒绝（如 `openfile` 权限 / buildx lock），**不是代码问题**，是执行器环境问题。处理：清理残骸（`Get-Process opencode` / 删 logs）+ 换 model 重跑，不重做提示词。

### 坑 7：opencode 不跑验收（设计如此，但要配合）

- **现象**：每个切片 opencode 都「不跑验收命令（test/build/lint）」，由审核方重跑 → 交付报告里出现「引用旧基线」的错觉（如 F4-C 报告说 client test 4/22，实际跑是 22 全过）。
- **教训**：**审核方必须亲手重跑全部验收**，不能只信交付报告。这次所有切片都重跑了，没有一次"信了报告漏了 check"。

---

## ✅ 做得好的（值得保持）

### 1. 服务器部署方案分层清晰（⓪-⑧）
上个阶段沉淀的「全局安全规则 + 8 阶段」模板非常好用——本次阶段 5 部署提示词**完全复用**，只需改迁移清单/结构验证/冒烟项。**这是团队的可复用资产，别丢。**

### 2. 字典种子放 service 常量而非 migration
`matching_dimension` / `interview_focus_type` 用 `dictionary.service.ts` 的 `DEFAULT_DICTIONARIES` + `ensureDefaults` 自动初始化，**杜绝了 SQL 种子迁移的重复执行问题**。而 `hr_score_rule` 8 条是放 migration INSERT（F4-S1），两者都 OK，但前者更灵活（改权重不用迁移）。

### 3. fail-safe 双层 + P2002 幂等
- 业务分 `emitScoreEvent`：try/catch + P2002 静默
- 过程分 cron：4 维独立 try/catch + 动态 import 失败 return
- 日快照：单用户 try/catch + upsert
这套「事件发射永不阻塞主流程」的设计，直接决定了 6 个切片能无痛联动。

### 4. 公开接口安全前置（威胁模型）
F5 的先写安全复核简报再写提示词，是本次最大的流程亮点。——建议写进 PHASE2_IMPL_PITFALLS 或 reviewer guide 作为「公开接口必走流程」。

### 5. 契约对齐的主动修正
F4-C / F3-C 前端切片 Cursor 都主动「以真实后端为准」修了提示词草稿的字段错误。**提示词不要写死契约，写「以服务端返回为准 + 列出差异」更好。**

---

## 🧭 给下一阶段（如果还有）的改进清单

| # | 改进 | 说明 |
|---|------|------|
| 1 | **提示词加「同步更新测试断言」** | 改字符串/响应结构时必写这句 |
| 2 | **审核先查 CRLF** | 所有修改文件都要查行尾，不只新文件 |
| 3 | **切片完成后更新 AGENTS.md 基线** | 不让绝对值漂移累积过头 |
| 4 | **前端提示词不写死契约** | 写「以服务端返回为准」 |
| 5 | **公开接口先出威胁模型** | 写进 reviewer guide 流程 |
| 6 | **gitattributes 强制 LF** | `*.ts eol=lf` 从源头防 CRLF |
| 7 | **执行器崩溃处理标准化** | 权限拒绝 ≠ 重做提示词，清残骸重跑 |

---

## 📌 经验沉淀（可写入 PHASE2_IMPL_PITFALLS）

1. **行尾检查**：`git show HEAD:file | Select-String "`r"` 或 ReadAllBytes 数 CRLF；任何非 0 → 转 LF。
2. **基线漂移处理**：`git stash` 对比改动前后 lint/type-check，确认增量 0；绝对值漂移记入 AGENTS 不判 fail。
3. **consentNote 类合规字段**：只改新增，历史不回溯；提示词必带「同步测试断言」。
4. **字典种子优先 service 常量**：`ensureDefaults` 自动初始化优于 migration INSERT（重复执行安全）。
5. **公开接口 token 失效统一 410**：不泄露细分原因；校验「zod 严格 + 限流 + magic bytes」全套。
6. **AI 打分服务端重算**：不信任 LLM 自报的 overallScore，按字典权重重算（防幻觉）。
7. **伏笔：hash 去重省 LLM 费**：resumeHash + jdHash 双 hash，命中复用旧记录，实测能显著降成本。
8. **owned 结构**：todo 表更新了，但某些实用 skill 没进 AGENTS——本次复盘文档本身就是可沉淀物。

---

## 🔧 工具链现状（适合留存）

```
scripts/{oc,codex,dsh}-run.ps1      # runner（后台 + exec.cmd）
docs/cursor-prompts/<切片ID>.md     # 提示词放这里（先提交再启动执行器）
logs/<工具>/                        # 日志（已 gitignore）
docs/切片自动化接力使用手册.md       # 启停 / 边界 / 故障速查
PHASE{3,4,5}_SUMMARY.md             # 阶段总结（含本复盘）
服务器部署提示词方案_{日期}.md       # 生产部署分阶段提示词（可复用模板）
```

---

*复盘完。阶段 5 全部 14 个切片 + M6 收尾 + 部署方案已在工作中完成，全部 push 到 origin/master。*