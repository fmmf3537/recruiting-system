import { execSync, spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

import { chromium, type FullConfig } from '@playwright/test';

import { CREDENTIALS, ROLES, type Role } from './fixtures/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const AUTH_DIR = path.join(__dirname, '.auth');
const SERVER_DIR = path.join(REPO_ROOT, 'server');
const CLIENT_DIR = path.join(REPO_ROOT, 'client');

const E2E_DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:e2e_only_pw@localhost:5433/e2e_test?schema=public';
const E2E_REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6381';
const IS_CI = !!process.env.CI;
const API_PORT = 3001;
const CLIENT_PORT = 5174;
const BASE_URL = `http://localhost:${CLIENT_PORT}`;

/** TCP 健康探测（不引入 pg 包） */
function waitForPort(host: string, port: number, timeoutMs = 90000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host, port });
      socket.on('connect', () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`等待 ${host}:${port} 超时（${timeoutMs}ms）`));
          return;
        }
        setTimeout(tryConnect, 500);
      });
    };
    tryConnect();
  });
}

function parsePort(url: string, fallback: number): number {
  try {
    const u = new URL(url);
    return u.port ? Number(u.port) : fallback;
  } catch {
    return fallback;
  }
}

function buildServerEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    DATABASE_URL: E2E_DATABASE_URL,
    REDIS_URL: E2E_REDIS_URL,
    JWT_SECRET: 'e2e-only-secret-must-be-at-least-32-chars',
    CORS_ORIGIN: BASE_URL,
    SMTP_HOST: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    ANONYMIZE_CRON: '',
    EVALUATION_REMINDER_CRON: '',
    REMINDER_CRON_ENABLED: 'false',
    HIRING_DIGEST_CRON: '',
    INTERVIEWER_REMINDER_CRON: '',
    HR_SCORE_CRON: '',
  };
}

async function ensureInfra(): Promise<void> {
  if (!IS_CI) {
    try {
      execSync('docker compose -f docker-compose.e2e.yml up -d', {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
    } catch (err) {
      // CI 模式无 docker 也能继续（GHA services 已起 PG/Redis）
      console.warn('[global-setup] docker compose 启动失败（可忽略）:', err);
    }
  }

  const pgPort = parsePort(E2E_DATABASE_URL, IS_CI ? 5432 : 5433);
  const redisPort = parsePort(E2E_REDIS_URL, IS_CI ? 6379 : 6381);
  console.log(`[global-setup] 等待 Postgres :${pgPort} / Redis :${redisPort} ...`);
  await waitForPort('127.0.0.1', pgPort);
  await waitForPort('127.0.0.1', redisPort);
  console.log('[global-setup] 基础设施已就绪');
}

function migrateAndSeed(): void {
  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };
  console.log('[global-setup] prisma migrate deploy ...');
  execSync('npx prisma migrate deploy', { cwd: SERVER_DIR, env, stdio: 'inherit' });

  // 走 minimal seed（内部复用 seedTestUsers + PipelineTemplate）
  console.log('[global-setup] pnpm db:seed:minimal ...');
  execSync('pnpm db:seed:minimal', { cwd: SERVER_DIR, env, stdio: 'inherit' });
}

function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // 忽略已退出
  }
}

async function startTempServers(): Promise<ChildProcess[]> {
  const children: ChildProcess[] = [];
  const serverEnv = buildServerEnv();

  const needServer = await waitForPort('127.0.0.1', API_PORT, 1500).then(
    () => false,
    () => true
  );
  const needClient = await waitForPort('127.0.0.1', CLIENT_PORT, 1500).then(
    () => false,
    () => true
  );

  if (needServer) {
    console.log('[global-setup] 临时启动 server :3001 ...');
    const server = spawn(
      'pnpm',
      ['exec', 'tsx', '--import', './src/lib/tracing.ts', 'src/index.ts'],
      { cwd: SERVER_DIR, env: serverEnv, stdio: 'ignore', shell: true }
    );
    children.push(server);
    await waitForPort('127.0.0.1', API_PORT);
  } else {
    console.log('[global-setup] 复用已有 server :3001');
  }

  if (needClient) {
    console.log('[global-setup] 临时启动 client :5174 ...');
    const client = spawn('pnpm', ['exec', 'vite', '--port', String(CLIENT_PORT)], {
      cwd: CLIENT_DIR,
      env: process.env,
      stdio: 'ignore',
      shell: true,
    });
    children.push(client);
    await waitForPort('127.0.0.1', CLIENT_PORT);
  } else {
    console.log('[global-setup] 复用已有 client :5174');
  }

  return children;
}

/** 4 角色 UI 登录，写入 e2e/.auth/<role>.json */
async function loginViaUIAndSave(role: Role): Promise<void> {
  const { email, password } = CREDENTIALS[role];
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  try {
    await page.goto('/login');

    const emailInput = page.locator('input[type="email"]');
    if ((await emailInput.count()) > 0) {
      await emailInput.first().fill(email);
    } else {
      await page.locator('input').first().fill(email);
    }

    await page.locator('input[type="password"]').fill(password);

    const submit = page.locator(
      'button[type="submit"], button:has-text("登录"), .login-button'
    );
    await submit.first().click();

    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 15000,
    });

    const outPath = path.join(AUTH_DIR, `${role}.json`);
    await context.storageState({ path: outPath });
    console.log(`[global-setup] 已写入 storageState: ${outPath}`);
  } finally {
    await browser.close();
  }
}

async function globalSetup(_config: FullConfig): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  await ensureInfra();
  migrateAndSeed();

  // Playwright 的 webServer 在 globalSetup 之后才启动，故此处临时拉起供 UI 登录
  const children = await startTempServers();
  try {
    for (const role of ROLES) {
      await loginViaUIAndSave(role);
    }
  } finally {
    for (const child of children) {
      killProcessTree(child);
    }
    if (children.length > 0) {
      console.log('[global-setup] 已关闭临时 server/client（正式 webServer 随后由 Playwright 拉起）');
    }
  }
}

export default globalSetup;
