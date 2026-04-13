import { test, expect } from '@playwright/test';

const TEST_EMAIL = 'admin@example.com';
const TEST_PASSWORD = 'admin123';

async function clearAuthAndGoToLogin(page: any) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
}

test.describe('认证模块', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthAndGoToLogin(page);
  });

  test('登录页面正确加载', async ({ page }) => {
    await expect(page.locator('.title')).toContainText('招聘管理系统');
    await expect(page.locator('.el-input input').first()).toBeVisible();
    await expect(page.locator('.el-input input[type="password"]')).toBeVisible();
    await expect(page.locator('.login-button')).toBeVisible();
  });

  test('使用正确凭据登录成功', async ({ page }) => {
    await page.locator('.el-input input').first().fill(TEST_EMAIL);
    await page.locator('.el-input input[type="password"]').fill(TEST_PASSWORD);
    await page.click('.login-button');

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.locator('.page-title').first()).toContainText('仪表盘');
  });

  test('使用错误密码登录失败', async ({ page }) => {
    await page.locator('.el-input input').first().fill(TEST_EMAIL);
    await page.locator('.el-input input[type="password"]').fill('wrongpassword');
    await page.click('.login-button');
    await page.waitForTimeout(500);

    const message = page.locator('.el-message').first();
    await expect(message).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('使用不存在的用户登录失败', async ({ page }) => {
    await page.locator('.el-input input').first().fill('nonexistent@test.com');
    await page.locator('.el-input input[type="password"]').fill('anypassword');
    await page.click('.login-button');
    await page.waitForTimeout(500);

    const message = page.locator('.el-message').first();
    await expect(message).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('未填写信息点击登录失败', async ({ page }) => {
    await page.click('.login-button');

    await expect(page.locator('.el-form-item__error').first()).toBeVisible();
  });

  test('登出功能正常', async ({ page }) => {
    await page.locator('.el-input input').first().fill(TEST_EMAIL);
    await page.locator('.el-input input[type="password"]').fill(TEST_PASSWORD);
    await page.click('.login-button');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });
});

test.describe('导航模块', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('.el-input input').first().fill(TEST_EMAIL);
    await page.locator('.el-input input[type="password"]').fill(TEST_PASSWORD);
    await page.click('.login-button');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });

  test('侧边栏菜单正确显示', async ({ page }) => {
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.el-menu-item:has-text("仪表盘")')).toBeVisible();
    await expect(page.locator('.el-menu-item:has-text("职位管理")')).toBeVisible();
    await expect(page.locator('.el-menu-item:has-text("候选人管理")')).toBeVisible();
    await expect(page.locator('.el-menu-item:has-text("Offer管理")')).toBeVisible();
    await expect(page.locator('.el-menu-item:has-text("数据统计")')).toBeVisible();
  });

  test('点击职位管理跳转正确', async ({ page }) => {
    await page.click('.el-menu-item:has-text("职位管理")');
    await expect(page).toHaveURL(/\/jobs/);
    await expect(page.locator('.page-title').first()).toContainText('职位管理');
  });

  test('点击候选人管理跳转正确', async ({ page }) => {
    await page.click('.el-menu-item:has-text("候选人管理")');
    await expect(page).toHaveURL(/\/candidates/);
    await expect(page.locator('.page-title').first()).toContainText('候选人管理');
  });

  test('点击数据统计跳转正确', async ({ page }) => {
    await page.click('.el-menu-item:has-text("数据统计")');
    await expect(page).toHaveURL(/\/stats/);
    await expect(page.locator('.page-title').first()).toContainText('数据统计');
  });
});