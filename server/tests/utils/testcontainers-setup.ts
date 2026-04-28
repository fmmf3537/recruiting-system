import { GenericContainer, Wait } from 'testcontainers';
import { execSync } from 'child_process';
import path from 'path';

let container: any;

/**
 * 启动 PostgreSQL 测试容器
 */
export async function startPostgresContainer() {
  container = await new GenericContainer('postgres:15-alpine')
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'test_db',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const databaseUrl = `postgresql://test:test@${host}:${port}/test_db`;

  // 设置环境变量
  process.env.DATABASE_URL = databaseUrl;

  // 运行 Prisma migrate
  const prismaBinary = path.resolve(process.cwd(), 'node_modules', '.bin', 'prisma');
  execSync(`${prismaBinary} migrate deploy`, {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  return { container, databaseUrl };
}

/**
 * 停止 PostgreSQL 测试容器
 */
export async function stopPostgresContainer() {
  if (container) {
    await container.stop();
    container = undefined;
  }
}
