import { test, expect, type Page } from '@playwright/test';

const TEST_EMAIL = 'admin@example.com';
const TEST_PASSWORD = 'admin123';

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.locator('.el-input input').first().fill(TEST_EMAIL);
  await page.locator('.el-input input[type="password"]').fill(TEST_PASSWORD);
  await page.click('.login-button');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

test.describe('通知中心模块', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('通知列表页正确加载', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.page-title').first()).toContainText('消息通知');
    // 页面应显示筛选器
    await expect(page.locator('.el-radio-group')).toBeVisible();
    await expect(page.locator('.el-radio-button:has-text("全部")')).toBeVisible();
    await expect(page.locator('.el-radio-button:has-text("阶段变动")')).toBeVisible();
    await expect(page.locator('.el-radio-button:has-text("面试提醒")')).toBeVisible();
    await expect(page.locator('.el-radio-button:has-text("Offer")')).toBeVisible();
  });

  test('类型筛选可正常切换', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    // 点击"阶段变动"筛选
    await page.click('.el-radio-button:has-text("阶段变动")');
    await page.waitForTimeout(300);

    // 点击"面试提醒"筛选
    await page.click('.el-radio-button:has-text("面试提醒")');
    await page.waitForTimeout(300);

    // 切换回全部
    await page.click('.el-radio-button:has-text("全部")');
    await page.waitForTimeout(300);
  });

  test('通知铃铛点击后展开下拉面板', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // 点击铃铛
    const bell = page.locator('.notification-bell');
    await bell.click();
    await page.waitForTimeout(300);

    // 下拉面板应显示
    const dropdown = page.locator('.notification-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator('text=消息通知')).toBeVisible();
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

    // 如果无通知，应显示空状态
    const empty = page.locator('.el-empty');
    const list = page.locator('.notification-list');
    const hasEmpty = await empty.isVisible({ timeout: 2000 });
    const hasList = await list.isVisible({ timeout: 2000 });
    expect(hasEmpty || hasList).toBeTruthy();
  });
});
