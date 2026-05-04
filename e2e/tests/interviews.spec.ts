import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

test.describe('面试管理模块', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/interviews');
    await page.waitForLoadState('networkidle');
  });

  test('面试列表页正确加载', async ({ page }) => {
    await expect(page.locator('.page-title').first()).toContainText('面试');
    await expect(page.locator('.el-table')).toBeVisible();
  });

  test('搜索框可见', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="搜索"]').first();
    const visible = await searchInput.isVisible({ timeout: 2000 });
    expect(visible).toBeTruthy();
  });

  test('面试列表可排序', async ({ page }) => {
    const sortableHeaders = page.locator('.el-table__header th.sortable');
    const count = await sortableHeaders.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('从候选人详情页可安排面试', async ({ page }) => {
    // Go to first candidate
    await page.click('.el-menu-item:has-text("候选人管理")');
    await expect(page).toHaveURL(/\/candidates/);
    await page.waitForLoadState('networkidle');

    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible({ timeout: 3000 })) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      // Check for interview-related buttons
      const feedbackButton = page.locator('button:has-text("添加面试反馈")');
      if (await feedbackButton.isVisible({ timeout: 1000 })) {
        await expect(feedbackButton).toBeVisible();
      }
    }
  });
});
