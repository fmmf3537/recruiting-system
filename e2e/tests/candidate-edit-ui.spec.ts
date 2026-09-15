import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { login } from './helpers';

// ESM 无 __dirname 全局，从 import.meta.url 推导（Node 18+）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E-P15B 候选人信息编辑 UI 冒烟（chromium project，真浏览器点击）
 *
 * 链路：API 创建候选人 → detail 页 → 点「编辑」→ 改姓名/手机号 → 保存 → 断言成功
 *
 * 前置：后端在跑 + 前端在跑 + .auth/admin.json 存在（webServer 自动启）。
 * 说明：用 helpers.login（P9 storageState 注入）登录；chromium project 无自带 storageState。
 */

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const ADMIN_AUTH_FILE = path.join(AUTH_DIR, 'admin.json');
const API_BASE = 'http://localhost:3001'; // 后端地址（webServer 启动）

interface StorageState {
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

function loadAdminToken(): string {
  const raw = fs.readFileSync(ADMIN_AUTH_FILE, 'utf8');
  const state = JSON.parse(raw) as StorageState;
  const entry = state.origins[0]?.localStorage.find((x) => x.name === 'ats_token');
  if (!entry) throw new Error(`admin.json 缺少 ats_token entry`);
  return entry.value;
}

test.describe('候选人信息编辑 UI', () => {
  test('detail → 编辑 → 改姓名/手机号 → 保存成功', async ({ page }) => {
    const token = loadAdminToken();

    // 1. API 创建候选人（不依赖预置数据）
    const suffix = Date.now().toString().slice(-8);
    const createRes = await fetch(`${API_BASE}/api/candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: `UI编辑源-${suffix}`,
        phone: `138${suffix.slice(0, 8)}`,
        email: `ui-src-${suffix}@test.local`,
      }),
    });
    test.skip(createRes.status !== 201, '候选人创建失败（后端/环境异常），跳过');
    const candidate = (await createRes.json()).data;
    expect(candidate.id).toBeTruthy();

    try {
      // 2. 登录（P9 helpers：storageState 注入 + 跳 dashboard）
      await login(page);

      // 3. 直达该候选人详情页（限定详情页 h3，避免 keep-alive 仪表盘同名 class 干扰）
      await page.goto(`/candidates/${candidate.id}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.candidate-detail-page .candidate-name')).toContainText(`UI编辑源-${suffix}`, { timeout: 10000 });

      // 4. 点「编辑」→ 进编辑页；先等详情 GET 回填完成，避免异步 Object.assign 覆盖已填内容
      const editDetailLoaded = page.waitForResponse(
        (r) => {
          const url = r.url();
          const detailPath = `/api/candidates/${candidate.id}`;
          return (
            r.request().method() === 'GET' &&
            url.includes(detailPath) &&
            !url.includes(`${detailPath}/`)
          );
        },
        { timeout: 10000 }
      );
      await page.click('button:has-text("编辑")');
      await expect(page).toHaveURL(/\/candidates\/.+\/edit/, { timeout: 10000 });
      await editDetailLoaded;

      // 5. 改姓名 + 手机号（姓名 min(2)；手机号 11 位）
      const newName = `UI编辑后-${suffix}`;
      const newPhone = `139${suffix.slice(0, 8)}`;
      const nameInput = page.locator('input[placeholder="请输入姓名"]');
      await nameInput.fill(newName);
      await expect(nameInput).toHaveValue(newName);
      const phoneInput = page.locator('input[placeholder="请输入手机号"]');
      await phoneInput.fill(newPhone);
      await expect(phoneInput).toHaveValue(newPhone);

      // 6. 保存（同时等待 PATCH 响应确保后端持久化完成）
      const [patchRes] = await Promise.all([
        page.waitForResponse((r) => r.url().includes(`/api/candidates/${candidate.id}`) && r.request().method() === 'PATCH', { timeout: 10000 }),
        page.click('button:has-text("保存修改")'),
      ]);
      expect(patchRes.status()).toBe(200);

      // 7. 断言成功提示
      await expect(page.locator('.el-message').first()).toContainText('修改成功', { timeout: 10000 });

      // 8. 等详情 API 返回新数据后断言
      const [detailRes] = await Promise.all([
        page.waitForResponse((r) => r.url().includes(`/api/candidates/${candidate.id}`) && r.request().method() === 'GET', { timeout: 10000 }),
        page.goto(`/candidates/${candidate.id}`, { waitUntil: 'networkidle' }),
      ]);
      detailRes.body().then((b) => console.log('[DEBUG] detail GET status:', detailRes.status(), '| name =', b?.name ?? 'n/a')).catch(() => {});
      await expect(page.locator('.candidate-detail-page .candidate-name')).toContainText(newName, { timeout: 10000 });
    } finally {
      // 清理（API 软删）
      await fetch(`${API_BASE}/api/candidates/${candidate.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});