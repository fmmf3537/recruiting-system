import { describe, it, expect } from 'vitest';
import { formatNumber } from '@/utils/format';

describe('formatNumber', () => {
  it('should format number with default 2 digits', () => {
    expect(formatNumber(3.14159)).toBe('3.14');
  });

  it('should format number with custom digits', () => {
    expect(formatNumber(3.14159, 3)).toBe('3.142');
  });
});
