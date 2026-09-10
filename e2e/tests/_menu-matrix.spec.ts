import { test, expect } from '@playwright/test';
import { EXPECTED_VISIBLE, EXPECTED_HIDDEN } from '../fixtures/menu-matrix';
import { ROLES, type Role } from '../fixtures/auth';

/**
 * L1 菜单可见性矩阵：4 角色 × 19 菜单 = 76 断言（41 可见 + 35 隐藏）。
 * 4 个 role project 各跑一次，project 名即当前身份角色。
 *
 * 过滤方式：每个 role 一条独立 describe，用 testInfo.project.name 精确匹配当前 project。
 * 不能对整 describe 用 test.skip(布尔)（会误杀整个块），也不能用 callback 条件
 * （test.skip 的条件回调签名是 (args) => boolean，取不到 testInfo —— 实测
 * `test.skip(({ }, testInfo) => ...)` 里 testInfo 为 undefined）。
 */
for (const role of ROLES) {
  test.describe(`L1 菜单矩阵 @${role}`, () => {
    test.beforeEach(async ({ }, testInfo) => {
      // 仅当前 project 名与 role 相等时执行（其它 project 跳过本块）
      test.skip(testInfo.project.name !== role, `仅 ${role} project 执行`);
    });

    test('可见菜单必须可见', async ({ page }) => {
      await page.goto('/dashboard');
      for (const title of EXPECTED_VISIBLE[role]) {
        await expect(page.locator(`.el-menu-item:has-text("${title}")`).first()).toBeVisible({
          timeout: 8000,
        });
      }
    });

    test('隐藏菜单必须不可见', async ({ page }) => {
      await page.goto('/dashboard');
      for (const title of EXPECTED_HIDDEN[role]) {
        await expect(page.locator(`.el-menu-item:has-text("${title}")`)).toHaveCount(0);
      }
    });
  });
}

// 类型守卫：确认 Role 被使用（避免 noUnusedLocals 误伤 import）
void (ROLES satisfies readonly Role[]);