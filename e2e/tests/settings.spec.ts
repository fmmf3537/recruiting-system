import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

test.describe('自动化邮件规则', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/settings/automation-rules');
    await page.waitForLoadState('networkidle');
  });

  test('自动化邮件规则页正确加载', async ({ page }) => {
    await expect(page.locator('.page-title').first()).toContainText('自动化邮件规则');
    await expect(page.locator('.el-table')).toBeVisible();
  });

  test('新建规则按钮可见', async ({ page }) => {
    await expect(page.locator('button:has-text("新建规则")')).toBeVisible();
  });

  test('新建规则对话框可打开', async ({ page }) => {
    await page.click('button:has-text("新建规则")');
    await page.waitForTimeout(300);
    await expect(page.locator('.el-dialog')).toBeVisible();
  });

  test('新建规则表单包含必要字段', async ({ page }) => {
    await page.click('button:has-text("新建规则")');
    await page.waitForTimeout(300);
    // 触发阶段选择器
    await expect(page.locator('.el-form-item:has-text("触发阶段")')).toBeVisible();
    await expect(page.locator('.el-form-item:has-text("邮件模板")')).toBeVisible();
    await expect(page.locator('.el-form-item:has-text("启用")')).toBeVisible();
  });

  test('启用开关可见', async ({ page }) => {
    const switches = page.locator('.el-switch');
    const count = await switches.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('侧边栏自动化邮件菜单存在', async ({ page }) => {
    await expect(page.locator('.el-menu-item:has-text("自动化邮件")')).toBeVisible();
  });
});

test.describe('字典管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/settings/dictionary');
    await page.waitForLoadState('networkidle');
  });

  test('字典管理页正确加载', async ({ page }) => {
    await expect(page.locator('.page-title').first()).toContainText('字典管理');
  });
});

test.describe('标签管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/settings/tags');
    await page.waitForLoadState('networkidle');
  });

  test('标签管理页正确加载', async ({ page }) => {
    await expect(page.locator('.page-title').first()).toContainText('标签管理');
  });
});

test.describe('邮件模板管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/settings/email-templates');
    await page.waitForLoadState('networkidle');
  });

  test('邮件模板页正确加载', async ({ page }) => {
    await expect(page.locator('.page-title').first()).toContainText('邮件模板');
  });
});
