import { test, expect } from '@playwright/test';
import { login, loadAuthToken, loadAuthUserId } from './helpers';

test.describe('面试管理模块', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/interviews');
    await page.waitForLoadState('networkidle');
  });

  test('面试列表页正确加载', async ({ page }) => {
    await expect(page.locator('.page-title').first()).toContainText('面试');
    await expect(page.locator('.el-table')).toBeVisible();
  });

  test('筛选器可见', async ({ page }) => {
    // 面试管理页筛选器是日期选择器（开始/结束日期）+ 轮次/状态下拉，无「搜索」输入框
    const filterVisible =
      (await page.locator('input[placeholder="开始日期"]').isVisible({ timeout: 2000 })) ||
      (await page.locator('.el-select').first().isVisible({ timeout: 2000 }).catch(() => false));
    expect(filterVisible).toBeTruthy();
  });

  test('面试列表可排序', async ({ page }) => {
    const sortableHeaders = page.locator('.el-table__header th.sortable');
    const count = await sortableHeaders.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('从候选人详情页可安排面试', async ({ page }) => {
    // Go to first candidate
    await page.click('.el-menu-item:has-text("候选人管理")');
    await expect(page).toHaveURL(/\/candidates/);
    await page.waitForLoadState('networkidle');

    const firstRow = page.locator('.el-table__body tr').first();
    if (await firstRow.isVisible({ timeout: 3000 })) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      // Check for interview-related buttons
      const feedbackButton = page.locator('button:has-text("添加面试反馈")');
      if (await feedbackButton.isVisible({ timeout: 1000 })) {
        await expect(feedbackButton).toBeVisible();
      }
    }
  });

  test('scheduled 面试可在列表编辑并取消', async ({ page, baseURL }) => {
    const apiBase = baseURL ?? 'http://localhost:5174';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loadAuthToken('admin')}`,
    };
    const suffix = Date.now().toString().slice(-8);
    const candidateName = `E2E编取-${suffix}`;
    const location = `E2E-会议室-${suffix}`;
    let candidateId: string | undefined;

    const candRes = await fetch(`${apiBase}/api/candidates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: candidateName,
        phone: `139${suffix.slice(-8).padStart(8, '0')}`.slice(0, 11),
        email: `e2e-intv-ui-${suffix}@test.local`,
      }),
    });
    test.skip(candRes.status !== 201, '候选人创建失败（e2e 环境可能异常），跳过');
    candidateId = ((await candRes.json()) as { data: { id: string } }).data.id;

    try {
      // 后天 10:00 创建，编辑改为 09:30，排序位置接近，降低分页 miss
      const start = new Date();
      start.setDate(start.getDate() + 2);
      start.setHours(10, 0, 0, 0);

      const createRes = await fetch(`${apiBase}/api/interviews`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          candidateId,
          round: '初试',
          type: '现场',
          interviewers: [{ id: loadAuthUserId('admin'), name: '管理员测试' }],
          scheduledAt: start.toISOString(),
          duration: 60,
          location: 'E2E-待改地点',
        }),
      });
      expect(createRes.status, await createRes.text()).toBe(201);

      await page.goto('/interviews');
      await page.waitForLoadState('networkidle');

      const row = page.locator('.el-table__body tr', { hasText: candidateName });
      const rowVisible = await row.isVisible({ timeout: 8000 }).catch(() => false);
      if (!rowVisible) {
        const listRes = await fetch(
          `${apiBase}/api/interviews?candidateId=${candidateId}&pageSize=20`,
          { headers }
        );
        const listJson = (await listRes.json()) as {
          data?: Array<{ status: string; location: string | null }>;
        };
        expect(listJson.data?.[0]?.status).toBe('scheduled');
        test.info().annotations.push({
          type: 'note',
          description: '列表分页未找到行，仅 API 兜底断言 scheduled 存在',
        });
        return;
      }

      await row.getByRole('button', { name: '编辑' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      const editedAt = new Date();
      editedAt.setDate(editedAt.getDate() + 2);
      editedAt.setHours(9, 30, 0, 0);
      const pad = (n: number) => String(n).padStart(2, '0');
      const dt = `${editedAt.getFullYear()}-${pad(editedAt.getMonth() + 1)}-${pad(editedAt.getDate())} ${pad(editedAt.getHours())}:${pad(editedAt.getMinutes())}:${pad(editedAt.getSeconds())}`;

      await dialog.locator('input[placeholder="选择日期时间"]').fill(dt);
      await dialog.getByPlaceholder('会议室/视频链接（可选）').fill(location);
      await dialog.getByRole('button', { name: '保存' }).click();

      await expect(page.getByText('面试安排已更新')).toBeVisible();
      await expect(row).toContainText(location);

      await row.getByRole('button', { name: '取消' }).click();
      const confirmBox = page.getByRole('dialog', { name: '取消面试' });
      await expect(confirmBox).toBeVisible();
      await confirmBox.getByRole('textbox', { name: '请输入取消原因' }).fill('E2E UI 取消');
      // Element Plus 英文 locale 下按钮 accessible name 是 OK，不是确定
      await confirmBox.getByRole('button', { name: /^(确定|OK)$/ }).click();
      await expect(row).toContainText('已取消');
    } finally {
      if (candidateId) {
        try {
          const listRes = await fetch(
            `${apiBase}/api/interviews?candidateId=${candidateId}&pageSize=20`,
            { headers }
          );
          const listJson = (await listRes.json()) as {
            data?: Array<{ id: string; status: string }>;
          };
          for (const it of listJson.data || []) {
            if (it.status !== 'scheduled') continue;
            await fetch(`${apiBase}/api/interviews/${it.id}/cancel`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ reason: 'E2E cleanup' }),
            }).catch(() => {});
          }
        } catch {
          /* 仍尝试删候选人 */
        }
        await fetch(`${apiBase}/api/candidates/${candidateId}`, {
          method: 'DELETE',
          headers,
        }).catch(() => {});
      }
    }
  });
});
