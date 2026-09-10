import { defineConfig, devices } from '@playwright/test';

/**
 * E2E Playwright 配置（P0 地基）
 * - globalSetup：起 e2e 容器 / migrate / seed / 写 .auth/*.json
 * - 4 角色 project 仅跑 _smoke；chromium 跑现有 13 个 spec（helpers 硬编码 JWT）
 * - webServer.env 注入覆盖 dotenv（dotenv 不覆盖已设变量）
 */
const E2E_DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:e2e_only_pw@localhost:5433/e2e_test?schema=public';
const E2E_REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6381';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    // 现有 13 个 spec 仍走 helpers 硬编码 JWT，不挂 storageState；忽略 _*.spec.ts（role project 专用）
    {
      name: 'chromium',
      testIgnore: ['**/_*.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin',
      testMatch: ['**/_*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/admin.json',
      },
    },
    {
      name: 'hr',
      testMatch: ['**/_*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/hr.json',
      },
    },
    {
      name: 'hiring_manager',
      testMatch: ['**/_*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/hiring_manager.json',
      },
    },
    {
      name: 'interviewer',
      testMatch: ['**/_*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/interviewer.json',
      },
    },
  ],
  webServer: [
    {
      command: 'cd ../server && pnpm dev:e2e',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        NODE_ENV: 'test',
        PORT: '3001',
        DATABASE_URL: E2E_DATABASE_URL,
        REDIS_URL: E2E_REDIS_URL,
        JWT_SECRET: 'e2e-only-secret-must-be-at-least-32-chars',
        CORS_ORIGIN: 'http://localhost:5174',
        // 邮件：留空 → mail.service 自动跳过发信
        SMTP_HOST: '',
        SMTP_USER: '',
        SMTP_PASS: '',
        // 关闭所有定时任务
        ANONYMIZE_CRON: '',
        EVALUATION_REMINDER_CRON: '',
        REMINDER_CRON_ENABLED: 'false',
        HIRING_DIGEST_CRON: '',
        INTERVIEWER_REMINDER_CRON: '',
        HR_SCORE_CRON: '',
      },
    },
    {
      command: 'cd ../client && pnpm dev --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
