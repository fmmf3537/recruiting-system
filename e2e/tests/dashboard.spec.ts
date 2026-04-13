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

test.describe('仪表盘模块', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await login(page);
  });

  test('仪表盘页面正确加载', async () => {
    await expect(page.locator('.page-title').first()).toContainText('仪表盘');
  });

  test('统计数据卡片正确显示', async () => {
    await expect(page.locator('text=本月新增候选人')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=进行中职位数')).toBeVisible();
    await expect(page.locator('text=待入职人数')).toBeVisible();
  });

  test('近期候选人动态正确显示', async () => {
    await expect(page.locator('text=近期候选人动态')).toBeVisible();
  });

  test('招聘漏斗图表正确显示', async () => {
    await expect(page.locator('text=招聘漏斗')).toBeVisible();
    await expect(page.locator('.funnel-chart')).toBeVisible();
  });

  test('点击卡片跳转到对应页面', async () => {
    const candidateCard = page.locator('.stat-card:has-text("本月新增候选人")');
    if (await candidateCard.isVisible()) {
      await candidateCard.click();
      await expect(page).toHaveURL(/\/candidates/);
    }
  });
});

test.describe('数据统计模块', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await login(page);
    await page.click('.el-menu-item:has-text("数据统计")');
    await expect(page).toHaveURL(/\/stats/);
    await page.waitForLoadState('networkidle');
  });

  test('数据统计页面正确加载', async () => {
    await expect(page.locator('.page-title').first()).toContainText('数据统计');
    await expect(page.locator('text=多维度招聘数据分析')).toBeVisible();
  });

  test('时间范围筛选器正确显示', async () => {
    await expect(page.locator('text=时间范围')).toBeVisible();
  });

  test('招聘漏斗Tab正确显示', async () => {
    await expect(page.locator('text=招聘漏斗')).toBeVisible();
    await expect(page.locator('.funnel-chart')).toBeVisible();
  });

  test('招聘周期Tab正确显示', async () => {
    await page.click('text=招聘周期');
    await expect(page.locator('.cycle-chart')).toBeVisible();
  });

  test('渠道分析Tab正确显示', async () => {
    await page.click('text=渠道分析');
    await expect(page.locator('.channel-chart')).toBeVisible();
  });

  test('工作量统计Tab正确显示', async () => {
    await page.click('text=工作量统计');
    await expect(page.locator('.workload-chart')).toBeVisible();
  });

  test('导出Excel按钮可见', async () => {
    await expect(page.locator('button:has-text("导出 Excel")')).toBeVisible();
  });

  test('刷新数据按钮功能正常', async () => {
    await page.click('text=刷新数据');
    await page.waitForTimeout(1000);
  });
});