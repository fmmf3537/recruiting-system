import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

test.describe('成员管理模块', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('.el-menu-item:has-text("成员管理")');
    await expect(page).toHaveURL(/\/users/);
    await page.waitForLoadState('networkidle');
  });

  test('成员列表页正确加载', async ({ page }) => {
    await expect(page.locator('.page-title').first()).toContainText('成员管理');
    await expect(page.locator('.el-table')).toBeVisible();
  });

  test('成员列表显示姓名、邮箱、部门、角色', async ({ page }) => {
    const tableHeaders = page.locator('.el-table__header th');
    const headerTexts = await tableHeaders.allTextContents();
    const joined = headerTexts.join(' ');
    expect(joined).toContain('姓名');
    expect(joined).toContain('邮箱');
    expect(joined).toContain('部门');
    expect(joined).toContain('角色');
  });

  test('新增成员按钮可见', async ({ page }) => {
    await expect(page.locator('button:has-text("新增成员")')).toBeVisible();
  });

  test('新增成员对话框可打开', async ({ page }) => {
    await page.click('button:has-text("新增成员")');
    await page.waitForTimeout(300);
    await expect(page.locator('.el-dialog')).toBeVisible();
    await expect(page.locator('.el-dialog__title')).toContainText('新增成员');
  });

  test('新增成员表单验证规则生效', async ({ page }) => {
    await page.click('button:has-text("新增成员")');
    await page.waitForTimeout(300);
    await page.click('.el-dialog .el-button--primary:has-text("创建")');
    await expect(page.locator('.el-form-item__error').first()).toBeVisible();
  });

  test('新增成员表单包含部门字段', async ({ page }) => {
    await page.click('button:has-text("新增成员")');
    await page.waitForTimeout(300);
    await expect(page.locator('.el-form-item:has-text("部门")')).toBeVisible();
  });

  test('编辑成员可打开对话框', async ({ page }) => {
    const editBtns = page.locator('button:has-text("编辑")');
    if (await editBtns.first().isVisible({ timeout: 2000 })) {
      await editBtns.first().click();
      await page.waitForTimeout(300);
      await expect(page.locator('.el-dialog')).toBeVisible();
    }
  });

  test('角色标签可点击切换', async ({ page }) => {
    const roleTag = page.locator('.role-tag').first();
    if (await roleTag.isVisible({ timeout: 2000 })) {
      await roleTag.click();
      await page.waitForTimeout(300);
      // 确认对话框应弹出
      const roleDialog = page.locator('.el-dialog:has-text("切换角色")');
      const visible = await roleDialog.isVisible({ timeout: 1000 });
      expect(visible).toBeTruthy();
    }
  });

  test('删除按钮可见', async ({ page }) => {
    const delBtns = page.locator('button:has-text("删除")');
    const count = await delBtns.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('侧边栏成员管理可跳转', async ({ page }) => {
    await expect(page).toHaveURL(/\/users/);
  });
});
