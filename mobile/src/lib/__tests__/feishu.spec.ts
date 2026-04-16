import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isFeishu } from '../feishu';

describe('feishu', () => {
  let originalUA: string;

  beforeEach(() => {
    originalUA = navigator.userAgent;
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: originalUA,
      writable: true,
      configurable: true,
    });
  });

  it('should return true when user agent contains "lark"', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Lark/6.0.0',
      writable: true,
      configurable: true,
    });
    expect(isFeishu()).toBe(true);
  });

  it('should return true when user agent contains "feishu"', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 10; SM-G960U) AppleWebKit/537.36 (KHTML, like Gecko) Feishu/5.0.0',
      writable: true,
      configurable: true,
    });
    expect(isFeishu()).toBe(true);
  });

  it('should return false for normal browser user agent', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      writable: true,
      configurable: true,
    });
    expect(isFeishu()).toBe(false);
  });
});
