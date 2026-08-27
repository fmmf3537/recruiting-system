import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Breadcrumb, ErrorEvent } from '@sentry/node';

const sentryInit = vi.hoisted(() => vi.fn());

vi.mock('@sentry/node', () => ({
  init: sentryInit,
  setupExpressErrorHandler: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

import {
  initSentry,
  isSentryEnabled,
  resetSentryState,
  sentryBeforeBreadcrumb,
  sentryBeforeSend,
} from '../../src/lib/sentry';

describe('Sentry 初始化与脱敏', () => {
  afterEach(() => {
    delete process.env.SENTRY_DSN;
    resetSentryState();
    sentryInit.mockClear();
  });

  it('当 SENTRY_DSN 未设置时，initSentry() 不抛错，isSentryEnabled() 返回 false', () => {
    delete process.env.SENTRY_DSN;
    expect(() => initSentry()).not.toThrow();
    expect(isSentryEnabled()).toBe(false);
    expect(sentryInit).not.toHaveBeenCalled();
  });

  it('当 SENTRY_DSN 设置时，isSentryEnabled() 返回 true', () => {
    process.env.SENTRY_DSN = 'https://key@o0.ingest.sentry.io/1';
    initSentry();
    expect(isSentryEnabled()).toBe(true);
    expect(sentryInit).toHaveBeenCalledTimes(1);
  });

  it('beforeSend 钩子能正确 redact request.data', () => {
    const event = {
      request: { data: { email: 'candidate@example.com', phone: '13800138000' } },
    } as ErrorEvent;

    const result = sentryBeforeSend(event);

    expect(result.request?.data).toBe('[REDACTED]');
  });

  it('beforeSend 钩子能正确删除 user.email', () => {
    const event = {
      user: { id: 'user-1', email: 'hr@example.com', ip_address: '10.0.0.1' },
    } as ErrorEvent;

    const result = sentryBeforeSend(event);

    expect(result.user?.email).toBeUndefined();
    expect(result.user?.ip_address).toBeUndefined();
    expect(result.user?.id).toBe('user-1');
  });

  it('URL 中含 token=xxx 的 breadcrumb 被脱敏', () => {
    const breadcrumb: Breadcrumb = {
      category: 'http',
      data: { url: 'https://ats.example.com/api/files/abc.pdf?token=secret-jwt' },
    };

    const result = sentryBeforeBreadcrumb(breadcrumb);

    expect(result.data?.url).toBe('https://ats.example.com/api/files/abc.pdf');
    expect(String(result.data?.url)).not.toContain('token=');
  });

  it('URL 中含 cuid/UUID 的请求路径被脱敏为 :id', () => {
    const cuidEvent = {
      request: { url: 'https://ats.example.com/api/candidates/clh1abcdefghijklmnopqrst' },
    } as ErrorEvent;
    const uuidEvent = {
      request: { url: 'https://ats.example.com/api/users/550e8400-e29b-41d4-a716-446655440000' },
    } as ErrorEvent;

    expect(sentryBeforeSend(cuidEvent).request?.url).toBe(
      'https://ats.example.com/api/candidates/:id'
    );
    expect(sentryBeforeSend(uuidEvent).request?.url).toBe(
      'https://ats.example.com/api/users/:id'
    );
  });
});
