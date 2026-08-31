import { describe, it, expect } from 'vitest';
import { isAdmin } from '../../src/routes/hiring';

describe('hiring isAdmin 辅助函数', () => {
  it("isAdmin('admin') 返回 true", () => {
    expect(isAdmin('admin')).toBe(true);
  });

  it("isAdmin('hr') 返回 false", () => {
    expect(isAdmin('hr')).toBe(false);
  });

  it("isAdmin('hiring_manager') 返回 false", () => {
    expect(isAdmin('hiring_manager')).toBe(false);
  });

  it("isAdmin('interviewer') 返回 false", () => {
    expect(isAdmin('interviewer')).toBe(false);
  });
});
