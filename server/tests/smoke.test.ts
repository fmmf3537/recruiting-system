import { describe, it, expect } from 'vitest';

describe('测试基础设施 smoke test', () => {
  it('vitest 工作正常', () => {
    expect(1 + 1).toBe(2);
  });
});
