import { expect, type Page } from '@playwright/test';

/** E2E 四角色 */
export const ROLES = ['admin', 'hr', 'hiring_manager', 'interviewer'] as const;
export type Role = (typeof ROLES)[number];

/** 与 server/prisma/seed-test-users.ts 对齐（不得改账号） */
export const CREDENTIALS: Record<Role, { email: string; password: string }> = {
  admin: { email: 'admin@test.local', password: 'admin123' },
  hr: { email: 'hr@test.local', password: 'hr123456' },
  hiring_manager: { email: 'hiring@test.local', password: 'hiring123' },
  interviewer: { email: 'interviewer@test.local', password: 'interview123' },
};

/**
 * UI 登录（P0 不依赖 data-testid，用原生选择器）
 * web-first 断言，禁止 sleep
 */
export async function loginViaUI(page: Page, role: Role): Promise<void> {
  const { email, password } = CREDENTIALS[role];
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

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}
