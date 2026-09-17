import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * HRW-E2E HR 工作监控 UI（chromium project）
 *
 * 只断言页面可加载、筛选可切换、排行榜/下钻入口存在；
 * 不校验精确统计值（由 server 单测/集成测试保证）。
 */

test.describe('HR 工作监控页面', () => {
  test('admin 可见菜单、页面加载、筛选切换、下钻入口', async ({ page }) => {
    await login(page);

    const menuItem = page.locator('.el-menu-item:has-text("HR 工作监控")');
    if (!(await menuItem.isVisible().catch(() => false))) {
      await page.locator('.el-sub-menu:has-text("数据与考核")').click();
    }
    await expect(menuItem).toBeVisible({ timeout: 8000 });
    await menuItem.click();
    await expect(page).toHaveURL(/\/stats\/hr-workload/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h2.page-title:has-text("HR 工作监控")')).toBeVisible();
    await expect(page.getByRole('radio', { name: '日', exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: '周', exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: '月', exact: true })).toBeVisible();
    await expect(page.locator('.el-date-editor').first()).toBeVisible();
    await expect(page.locator('.stat-card').first()).toBeVisible();
    await expect(page.locator('button:has-text("导出 Excel")')).toBeVisible();

    await page.locator('.el-radio-button').filter({ hasText: /^日$/ }).click();
    await page.waitForLoadState('networkidle');
    await page.locator('.el-radio-button').filter({ hasText: /^月$/ }).click();
    await page.waitForLoadState('networkidle');
    await page.locator('.el-radio-button').filter({ hasText: /^周$/ }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h2.page-title:has-text("HR 工作监控")')).toBeVisible();

    const empty = page.locator('.el-empty');
    const table = page.locator('.table-card .el-table');
    await expect(empty.or(table).first()).toBeVisible({ timeout: 10000 });

    const detailBtn = page.locator('button:has-text("查看详情")');
    if ((await detailBtn.count()) > 0) {
      await detailBtn.first().click();
      await expect(page.locator('.el-drawer')).toBeVisible({ timeout: 10000 });
    }
  });

  test('hr 无菜单入口，直链重定向 dashboard', async ({ page }) => {
    await login(page, 'hr');
    await expect(page.locator('.el-menu-item:has-text("HR 工作监控")')).toHaveCount(0);

    await page.goto('/stats/hr-workload');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
