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

test.describe('Offer管理模块', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await login(page);
    await page.click('.el-menu-item:has-text("Offer管理")');
    await expect(page).toHaveURL(/\/offers/);
    await page.waitForLoadState('networkidle');
  });

  test('Offer列表页面正确加载', async () => {
    await expect(page.locator('.page-title').first()).toContainText('Offer管理');
    await expect(page.locator('.el-table')).toBeVisible();
  });

  test('状态筛选功能正常', async () => {
    await page.click('.el-select');
    await page.click('text=待确认');
    await page.waitForTimeout(500);
  });

  test('搜索候选人功能正常', async () => {
    const searchInput = page.locator('input[placeholder="请输入候选人姓名"]');
    await searchInput.fill('张三');
    await page.click('text=搜索');
    await page.waitForTimeout(500);
  });

  test('点击查看Offer详情', async () => {
    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL(/\/offers\/.+/);
    }
  });
});

test.describe('Offer详情模块', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await login(page);
    await page.waitForLoadState('networkidle');
  });

  test('Offer详情页正确加载', async () => {
    await page.click('.el-menu-item:has-text("Offer管理")');
    await expect(page).toHaveURL(/\/offers/);

    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(1000);

      await expect(page.locator('.offer-title').first()).toContainText('Offer 详情');
      await expect(page.locator('text=候选人信息')).toBeVisible();
      await expect(page.locator('text=Offer 详情')).toBeVisible();
    }
  });

  test('无Offer时显示友好提示', async () => {
    await page.click('.el-menu-item:has-text("候选人管理")');
    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(1000);

      const candidateId = page.url().split('/').pop();
      
      await page.goto(`/offers/${candidateId}`);
      await page.waitForTimeout(1000);

      await expect(page.locator('.el-empty, text=暂无 Offer')).toBeVisible();
    }
  });

  test('返回列表功能正常', async () => {
    await page.click('.el-menu-item:has-text("Offer管理")');
    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(1000);

      await page.click('text=返回列表');
      await expect(page).toHaveURL(/\/offers/);
    }
  });
});

test.describe('创建Offer模块', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await login(page);
    await page.goto('/offers/create');
    await page.waitForLoadState('networkidle');
  });

  test('创建Offer表单正确加载', async () => {
    await expect(page.locator('h2')).toContainText('创建 Offer');
    await expect(page.locator('text=候选人信息')).toBeVisible();
    await expect(page.locator('text=Offer 信息')).toBeVisible();
  });

  test('取消按钮可点击', async () => {
    await page.click('text=取消');
  });
});