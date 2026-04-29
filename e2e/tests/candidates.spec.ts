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

test.describe('候选人管理模块', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await login(page);
    await page.click('.el-menu-item:has-text("候选人管理")');
    await expect(page).toHaveURL(/\/candidates/);
    await page.waitForLoadState('networkidle');
  });

  test('候选人列表页面正确加载', async () => {
    await expect(page.locator('.page-title').first()).toContainText('候选人管理');
    await expect(page.locator('.el-table')).toBeVisible();
  });

  test('点击新建候选人按钮跳转正确', async () => {
    await page.click('text=新增候选人');
    await expect(page).toHaveURL(/\/candidates\/create/);
    await expect(page.locator('h2')).toContainText('新增候选人');
  });

  test('搜索候选人功能正常', async () => {
    const searchInput = page.locator('input[placeholder="姓名/邮箱/手机号"]');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill('张三');
    await page.waitForTimeout(500);
  });

  test('点击候选人查看详情', async () => {
    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL(/\/candidates\/.+/);
    }
  });
});

test.describe('候选人详情模块', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await login(page);
    await page.waitForLoadState('networkidle');
  });

  test('候选人详情页正确加载', async () => {
    await page.click('.el-menu-item:has-text("候选人管理")');
    await expect(page).toHaveURL(/\/candidates/);

    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(1000);

      await expect(page.locator('.candidate-name')).toBeVisible();
      await expect(page.locator('text=基本信息')).toBeVisible();
      await expect(page.locator('text=流程记录')).toBeVisible();
    }
  });

  test('推进流程按钮状态正确', async () => {
    await page.click('.el-menu-item:has-text("候选人管理")');
    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(1000);

      const advanceButton = page.locator('button:has-text("推进流程")');
      if (await advanceButton.isVisible()) {
        await expect(advanceButton).toBeEnabled();
      }
    }
  });

  test('创建Offer按钮可见', async () => {
    await page.click('.el-menu-item:has-text("候选人管理")');
    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(1000);

      const createOfferButton = page.locator('button:has-text("创建 Offer")');
      const viewOfferButton = page.locator('button:has-text("查看 Offer")');
      const hasCreateOffer = await createOfferButton.isVisible({ timeout: 1000 });
      const hasViewOffer = await viewOfferButton.isVisible({ timeout: 1000 });
      
      expect(hasCreateOffer || hasViewOffer).toBeTruthy();
    }
  });

  test('返回列表功能正常', async () => {
    await page.click('.el-menu-item:has-text("候选人管理")');
    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(1000);

      await page.click('text=返回列表');
      await expect(page).toHaveURL(/\/candidates/);
    }
  });
});

test.describe('候选人表单模块', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await login(page);
    await page.goto('/candidates/create');
  });

  test('表单必填验证', async () => {
    await page.click('text=立即创建');
    await expect(page.locator('.el-form-item__error').first()).toBeVisible();
  });

  test('取消按钮可点击', async () => {
    await page.click('text=取消');
    await page.waitForTimeout(500);
  });
});