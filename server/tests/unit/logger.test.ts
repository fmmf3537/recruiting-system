import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger } from '../../src/lib/logger';

function captureLogger() {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const log = createLogger(stream);
  return {
    log,
    read: () => output,
  };
}

describe('logger PII redact', () => {
  it('logger.info({ phone }) 输出中不应包含手机号', () => {
    const { log, read } = captureLogger();
    log.info({ phone: '13800138000' }, 'test');
    const out = read();
    expect(out).not.toContain('138');
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('test');
  });

  it('logger.error candidate.name/email 应被 redact', () => {
    const { log, read } = captureLogger();
    log.error(
      { err: new Error('bad'), candidate: { name: '张三', email: 'a@b.com' } },
      'fail'
    );
    const out = read();
    expect(out).not.toContain('张三');
    expect(out).not.toContain('a@b.com');
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('fail');
  });

  it('logger.info userId/requestId 应正常输出', () => {
    const { log, read } = captureLogger();
    log.info({ userId: 'u1', requestId: 'r1' });
    const out = read();
    expect(out).toContain('u1');
    expect(out).toContain('r1');
  });

  it('logger.info 纯文本消息应正常输出', () => {
    const { log, read } = captureLogger();
    log.info('plain message');
    const out = read();
    expect(out).toContain('plain message');
  });
});
