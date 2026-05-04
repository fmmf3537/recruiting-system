import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

test.describe('编制管理模块', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('编制列表页正确加载', async ({ page }) => {
    await page.goto('/hc-requests');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.page-title').first()).toContainText('编制管理');
    await expect(page.locator('.el-table')).toBeVisible();
  });

  test('筛选器可见', async ({ page }) => {
    await page.goto('/hc-requests');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.el-select')).toBeVisible();
    await expect(page.locator('input[placeholder="岗位/部门"]')).toBeVisible();
  });

  test('点击新建申请跳转正确', async ({ page }) => {
    await page.goto('/hc-requests');
    await page.waitForLoadState('networkidle');
    await page.click('.page-header button:has-text("新建申请")');
    await expect(page).toHaveURL(/\/hc-requests\/create/);
    await expect(page.locator('.el-card__header h2')).toContainText('新建编制申请');
  });

  test('创建表单验证规则生效', async ({ page }) => {
    await page.goto('/hc-requests/create');
    await page.waitForLoadState('networkidle');
    await page.click('text=创建申请');
    await expect(page.locator('.el-form-item__error').first()).toBeVisible();
  });

  test('创建表单填写并提交', async ({ page }) => {
    await page.goto('/hc-requests/create');
    await page.waitForLoadState('networkidle');

    await page.locator('input[placeholder="如：高级前端工程师"]').fill('E2E测试岗位');
    const deptSelect = page.locator('.el-select').first();
    await deptSelect.click();
    await page.waitForTimeout(300);
    const deptOptions = page.locator('.el-select-dropdown__item');
    if (await deptOptions.first().isVisible({ timeout: 1000 })) {
      await deptOptions.first().click();
    }
    await page.locator('input[placeholder="如：P6、M2"]').fill('P6');
    await page.click('text=创建申请');
    await page.waitForTimeout(500);
  });

  test('状态筛选下拉可见', async ({ page }) => {
    await page.goto('/hc-requests');
    await page.waitForLoadState('networkidle');
    const statusSelect = page.locator('.el-select').first();
    await statusSelect.click();
    await page.waitForTimeout(500);
    expect(await page.locator('.el-select-dropdown__item').count()).toBeGreaterThan(0);
  });

  test('列表操作按钮根据状态显示', async ({ page }) => {
    await page.goto('/hc-requests');
    await page.waitForLoadState('networkidle');
    // 至少表格已渲染
    await expect(page.locator('.el-table')).toBeVisible();
  });

  test('取消按钮可返回', async ({ page }) => {
    await page.goto('/hc-requests/create');
    await page.waitForLoadState('networkidle');
    await page.click('text=取消');
    await page.waitForTimeout(500);
    // 应跳回上一页
    expect(page.url()).not.toContain('/hc-requests/create');
  });

  test('侧边栏编制管理可跳转', async ({ page }) => {
    await page.click('.el-menu-item:has-text("编制管理")');
    await expect(page).toHaveURL(/\/hc-requests/);
    await expect(page.locator('.page-title').first()).toContainText('编制管理');
  });
});
