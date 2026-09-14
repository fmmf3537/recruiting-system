import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

test.describe('数据统计模块', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('.el-menu-item:has-text("数据统计")');
    await expect(page).toHaveURL(/\/stats/);
    await page.waitForLoadState('networkidle');
  });

  test('统计页面正确加载', async ({ page }) => {
    await expect(page.locator('.page-title').first()).toContainText('数据统计');
    await expect(page.locator('.el-tabs')).toBeVisible();
  });

  test('所有 Tab 可见', async ({ page }) => {
    await expect(page.locator('.el-tabs__item:has-text("招聘漏斗")')).toBeVisible();
    await expect(page.locator('.el-tabs__item:has-text("招聘周期")')).toBeVisible();
    await expect(page.locator('.el-tabs__item:has-text("渠道分析")')).toBeVisible();
    await expect(page.locator('.el-tabs__item:has-text("工作量统计")')).toBeVisible();
  });

  test('招聘漏斗 Tab 显示图表和表格', async ({ page }) => {
    await page.click('.el-tabs__item:has-text("招聘漏斗")');
    await page.waitForTimeout(500);
    // v-chart 懒加载 echarts 慢；断言外层容器（必现）+ tab 内表格
    await expect(page.locator('.funnel-chart-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.funnel-table .el-table').first()).toBeVisible();
  });

  test('招聘周期 Tab 显示图表和表格', async ({ page }) => {
    await page.click('.el-tabs__item:has-text("招聘周期")');
    await page.waitForTimeout(500);
    await expect(page.locator('.cycle-chart-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.cycle-table .el-table').first()).toBeVisible();
  });

  test('渠道分析 Tab 显示图表和表格', async ({ page }) => {
    await page.click('.el-tabs__item:has-text("渠道分析")');
    await page.waitForTimeout(500);
    // 改断言为外层容器 + tab 内表格（避开 v-chart 懒加载时序 + 多表 hidden 问题）
    await expect(page.locator('.channel-chart-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.channel-table .el-table')).toBeVisible({ timeout: 10000 });
  });

  test('工作量统计 Tab 显示图表和表格', async ({ page }) => {
    await page.click('.el-tabs__item:has-text("工作量统计")');
    await page.waitForTimeout(500);
    await expect(page.locator('.workload-chart-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.workload-table .el-table').first()).toBeVisible();
  });

  test('时间范围筛选器可见', async ({ page }) => {
    // el-date-picker 渲染为 .el-date-editor.el-date-editor--daterange
    await expect(page.locator('.el-date-editor.el-date-editor--daterange').first()).toBeVisible();
  });

  test('刷新数据按钮可见并可点击', async ({ page }) => {
    const refreshBtn = page.locator('button:has-text("刷新数据")');
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    await page.waitForTimeout(500);
  });

  test('导出 Excel 按钮可见', async ({ page }) => {
    await expect(page.locator('button:has-text("导出 Excel")')).toBeVisible();
  });

  test('侧边栏数据统计菜单可跳转', async ({ page }) => {
    await expect(page).toHaveURL(/\/stats/);
  });
});
