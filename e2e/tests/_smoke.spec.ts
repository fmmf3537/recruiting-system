import { test, expect } from '@playwright/test';

/**
 * P0 smoke：验证各角色 storageState 可用。
 * 用 admin/hr/hiring_manager/interviewer 四个 project 各跑 1 次 = 4 用例。
 * 不修改现有 13 个 spec。
 */
test('@smoke 角色 storageState 验证', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('.page-title, h1, h2').first()).toBeVisible({
    timeout: 10000,
  });
});
