# 服务端测试

## 分类

| 目录 / 文件 | 说明 |
| --- | --- |
| `tests/unit/` | 针对 `src/services/` 的单元测试，Prisma / Redis 均 mock |
| `tests/integration/` | 基于 supertest 的接口测试，同样 mock Prisma |
| `tests/smoke.test.ts` | 基础设施冒烟：确认 Vitest 能跑 |

覆盖率只统计 `src/services/**/*.ts`（不排除 service 文件）。门槛取当前基线减 5%，配置见 `vitest.config.ts`。

## 本地运行

在 `server/` 目录：

```bash
pnpm test            # 单测 + 集成测试
pnpm test:coverage   # 同上，并输出覆盖率（text / json / html / lcov）
```

HTML 报告：`server/coverage/index.html`。

门槛未达标时，终端会打印完整覆盖率表（含每个文件的 `% Lines` / `% Branch` 与未覆盖行号），以及 `ERROR: Coverage for … does not meet global threshold`。

## CI

工作流：`.github/workflows/ci.yml`（仓库根目录）。

1. 启动 PostgreSQL 18、Redis 7 容器，**healthcheck 就绪后**再跑后续步骤
2. `pnpm install --frozen-lockfile`
3. `prisma generate` + `prisma migrate deploy`
4. `pnpm test:coverage`（低于门槛则 job 失败，阻止合并）
5. 上传 `server/coverage` 到 Codecov（上传失败不卡 CI）

需要在仓库 Settings → Secrets and variables → Actions 配置：

| Secret | 用途 |
| --- | --- |
| `CI_POSTGRES_PASSWORD` | CI Postgres 密码，同时写入 `DATABASE_URL` |
| `CI_JWT_SECRET` | 至少 32 字符，供 `env.ts` 校验 |

不要在 workflow 文件里写死数据库密码。
