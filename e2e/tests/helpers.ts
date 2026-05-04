import type { Page } from '@playwright/test';

export const TEST_EMAIL = 'admin@example.com';

// 预生成的 JWT token（有效期30天），完全绕过登录 API 和限流
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbW5zYXh5YjgwMDAwOHJ1dDFwbDY5cmN6IiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSIsImRlcGFydG1lbnQiOm51bGwsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3Nzc3NTM2NiwiZXhwIjoxNzgwMzY3MzY2fQ.DE8OEKA8gmoaMv94Trz2Izi4JKTRfV0Urrm1N8SuGCs';

/**
 * 通过预生成 JWT 直接注入 localStorage，完全不经过后端登录 API
 * 避免 express-rate-limit 429 频控问题
 */
export async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.evaluate((token) => {
    localStorage.setItem('ats_token', token);
    localStorage.setItem('ats_user', JSON.stringify({
      id: 'cmnsaxyb800008rut1pl69rcz',
      email: TEST_EMAIL,
      name: '系统管理员',
      role: 'admin',
      department: null,
      createdAt: '2026-04-10T02:43:57.044Z',
    }));
  }, TEST_TOKEN);

  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
}
