# 运维备忘录：生产环境简历解析报 "deepseek API key not configured"

> 记录时间：2026-09-01
> 影响范围：生产环境所有简历解析任务（BullMQ job 5/6/7/8 连续失败）
> 状态：✅ 已修复并验证通过（2026-09-01 17:38，job 9 解析成功，key 报错清零）
>
> 修复结果：根目录 `.env` 追加 minimax 两行 + `docker-compose.yml` environment 透传两行 + 仅重建 server 容器。
> 备份文件（生产服务器项目根目录）：`.env.bak.20260901173131`、`docker-compose.yml.bak.20260901173131`。
> 遗留：job 5/6/7/8 无自动重试，相关人员需在前端重新上传这 4 份简历。

---

## 1. 故障现象

- 生产环境上传简历后解析失败，前端轮询 `parse-resume/:id` 拿到失败状态。
- 后端日志反复出现：

  ```
  Resume parse job N failed: Error: deepseek API key not configured
      at callLLM (/app/src/lib/llm.ts:48:11)
      at extractResumeInfo (/app/src/lib/llm.ts:122:24)
      at parseResume (/app/src/services/resume-parser.service.ts:67:24)
      at async Worker.processFn (/app/src/workers/resume-parser.worker.ts:11:20)
  ```

- 本地开发环境解析正常。

## 2. 根因（三层叠加）

1. **compose 未透传（主因）**：`docker-compose.yml`（生产实际使用，容器名 `ats_server`）与 `docker-compose.prod.yml` 的 server 服务 `environment:` 段均未声明任何 LLM 相关变量，也无 `env_file` 指令；volumes 仅挂载 `./server/uploads`，未挂载 `.env`。
2. **根目录 .env 未配置（叠加因）**：compose 插值来源的根目录 `.env` 中没有 `LLM_PROVIDER` / `MINIMAX_API_KEY` / `DEEPSEEK_API_KEY` 任何一行，即使 compose 加了引用也插不到值。
3. **容器内无 .env 兜底**：`server/src/lib/env.ts:5` 的 `dotenv.config()` 在容器工作目录 `/app` 下找不到 `.env` 文件。

**报错文案的误导性**：本地实际使用的是 minimax（`server/.env` 中 `LLM_PROVIDER=minimax` + `MINIMAX_API_KEY`）。容器内 `LLM_PROVIDER` 缺失 → `env.ts:36` 默认值 `deepseek` 生效 → `llm.ts:48` 检查 `DEEPSEEK_API_KEY` 为空 → 抛出 "deepseek API key not configured"。**报错里的 deepseek 并非实际想用的 provider。**

本地正常的原因：`tsx dev` 在 `server/` 目录运行，`dotenv.config()` 读到了 `server/.env` 的 minimax 配置。

## 3. 修复内容

### 3.1 仓库配置（已完成，2026-09-01）

`docker-compose.yml` 与 `docker-compose.prod.yml` 的 server 服务 `environment:` 段（`STAGE_OVERDUE_DAYS` 之后）新增透传：

```yaml
# LLM 简历解析配置（容器内无 .env，必须显式透传；缺省时代码默认 deepseek 会因无 key 报错）
LLM_PROVIDER: ${LLM_PROVIDER:-}
DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:-}
ZHIPU_API_KEY: ${ZHIPU_API_KEY:-}
KIMI_API_KEY: ${KIMI_API_KEY:-}
MINIMAX_API_KEY: ${MINIMAX_API_KEY:-}
```

`.env.example` 已包含 4 家 provider 的配置项，无需改动。

### 3.2 生产环境（待执行）

1. 根目录 `.env` 追加（值从 `server/.env` 复制）：
   ```
   LLM_PROVIDER=minimax
   MINIMAX_API_KEY=<server/.env 中现有值>
   ```
2. `docker-compose.yml` 同步 3.1 的修改（或 git pull 最新仓库代码）。
3. 仅重建 server 容器：`docker-compose up -d server`。
   - postgres / redis / nginx 不动；数据库与 uploads 数据卷不受影响。
   - 仅有 server 重启期间几秒的服务中断。

### 3.3 修复后验证

```bash
# 1. 确认变量已注入（注意脱敏，不打印完整 key）
docker exec ats_server sh -c 'echo "LLM_PROVIDER=$LLM_PROVIDER"; [ -n "$MINIMAX_API_KEY" ] && echo "MINIMAX_API_KEY 已注入，前缀=${MINIMAX_API_KEY:0:4}***" || echo "未注入"'

# 2. 确认服务正常启动
docker logs ats_server --since 5m
```

3. 前端重新上传一份简历，日志不再出现 "API key not configured"，`parse-resume/:id` 返回解析结果。
4. 故障期间失败的 job（本次为 job 5/6/7/8）不会自动重试，需对对应候选人重新上传简历触发解析。

## 4. 经验教训 / 排查套路

**"本地正常、生产报错" 类问题的固定排查顺序：**

1. 先在代码里定位报错抛出点（本次：`server/src/lib/llm.ts:48`），确认它检查的是哪个环境变量。
2. 确认该变量在本地如何生效（`server/.env` + dotenv），在生产如何注入（compose `environment:` / `env_file` / 挂载 .env）。
3. `docker inspect <容器> --format '{{json .Config.Env}}'` 直接看运行中容器的真实环境变量，与代码期望逐项对比。
4. 注意报错文案可能来自**默认值兜底逻辑**，不一定是实际配置意图（本次 deepseek ≠ 实际使用的 minimax）。

**防复发措施：**

- 新增环境变量时，必须同步改 4 个地方：`server/src/lib/env.ts`（schema）、`.env.example`、`docker-compose.yml`、`docker-compose.prod.yml`。
- compose 中可选变量用 `${VAR:-}` 形式透传，避免缺省值在代码和部署两处不一致。
- 生产诊断遵守只读原则：密钥一律脱敏（前 4 位 + 长度），改动前先备份 `.env` 和 compose 文件，重建容器只动目标服务。
