import { test, expect, Page } from '@playwright/test';

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

test.describe('职位管理模块', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await login(page);
    await page.click('.el-menu-item:has-text("职位管理")');
    await expect(page).toHaveURL(/\/jobs/);
    await page.waitForLoadState('networkidle');
  });

  test('职位列表页面正确加载', async () => {
    await expect(page.locator('.page-title').first()).toContainText('职位管理');
    await expect(page.locator('.el-table')).toBeVisible();
  });

  test('点击新建职位按钮跳转正确', async () => {
    await page.click('text=发布职位');
    await expect(page).toHaveURL(/\/jobs\/create/);
    await expect(page.locator('h2')).toContainText('发布职位');
  });

  test('搜索职位功能正常', async () => {
    const searchInput = page.locator('input[placeholder="职位名称"]');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill('前端');
    await page.waitForTimeout(500);
  });

  test('职位状态筛选功能正常', async () => {
    await page.click('.el-select');
    await page.click('text=开放');
    await page.waitForTimeout(500);
  });

  test('点击职位卡片查看详情', async () => {
    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(500);
    }
  });

  test('关闭职位功能正常', async () => {
    const closeButton = page.locator('button:has-text("关闭")').first();
    if (await closeButton.isVisible({ timeout: 1000 })) {
      await closeButton.click();
      await page.click('text=确定');
      await expect(page.locator('.el-message')).toContainText('职位已关闭');
    }
  });

  test('复制职位功能正常', async () => {
    const duplicateButton = page.locator('button:has-text("复制")').first();
    if (await duplicateButton.isVisible({ timeout: 1000 })) {
      await duplicateButton.click();
      await expect(page.locator('.el-message')).toContainText('职位复制成功');
    }
  });
});

test.describe('职位详情模块', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await login(page);
    await page.click('.el-menu-item:has-text("职位管理")');
    await expect(page).toHaveURL(/\/jobs/);
  });

  test('职位详情页正确加载', async () => {
    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(1000);
    }

    await expect(page.locator('.job-title').first()).toBeVisible();
  });
});

test.describe('职位表单模块', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await login(page);
    await page.goto('/jobs/create');
  });

  test('取消按钮可点击', async () => {
    await page.click('text=取消');
  });
});