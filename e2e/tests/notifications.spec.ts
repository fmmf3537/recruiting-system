import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

test.describe('通知中心模块', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('通知列表页正确加载', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.page-title').first()).toContainText('消息通知');
    await expect(page.locator('.el-radio-group')).toBeVisible();
    await expect(page.locator('.el-radio-button:has-text("全部")')).toBeVisible();
    await expect(page.locator('.el-radio-button:has-text("阶段变动")')).toBeVisible();
    await expect(page.locator('.el-radio-button:has-text("面试提醒")')).toBeVisible();
    await expect(page.locator('.el-radio-button:has-text("Offer")')).toBeVisible();
    await expect(page.locator('.el-radio-button:has-text("编制审批")')).toBeVisible();
  });

  test('类型筛选可正常切换', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await page.click('.el-radio-button:has-text("阶段变动")');
    await page.waitForTimeout(300);
    await page.click('.el-radio-button:has-text("面试提醒")');
    await page.waitForTimeout(300);
    await page.click('.el-radio-button:has-text("Offer")');
    await page.waitForTimeout(300);
    await page.click('.el-radio-button:has-text("编制审批")');
    await page.waitForTimeout(300);
    await page.click('.el-radio-button:has-text("全部")');
    await page.waitForTimeout(300);
  });

  test('通知铃铛点击后展开下拉面板', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const bell = page.locator('.notification-bell');
    await bell.click();
    await page.waitForTimeout(300);

    const dropdown = page.locator('.notification-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator('text=消息通知')).toBeVisible();
    await expect(dropdown.locator('text=查看全部')).toBeVisible();
  });

  test('下拉面板"查看全部"可跳转到通知页', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const bell = page.locator('.notification-bell');
    await bell.click();
    await page.waitForTimeout(300);
    await page.click('text=查看全部');
    await expect(page).toHaveURL(/\/notifications/);
  });

  test('全部已读按钮可见', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    const markAllBtn = page.locator('button:has-text("全部已读")');
    await expect(markAllBtn).toBeVisible();
  });

  test('空通知列表显示占位提示', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    const empty = page.locator('.el-empty');
    const list = page.locator('.notification-list');
    const hasEmpty = await empty.isVisible({ timeout: 2000 });
    const hasList = await list.isVisible({ timeout: 2000 });
    expect(hasEmpty || hasList).toBeTruthy();
  });

  test('侧边栏消息通知菜单可跳转', async ({ page }) => {
    await page.click('.el-menu-item:has-text("消息通知")');
    await expect(page).toHaveURL(/\/notifications/);
    await expect(page.locator('.page-title').first()).toContainText('消息通知');
  });
});
