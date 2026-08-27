import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

const mockRedis = vi.hoisted(() => ({
  ping: vi.fn(),
}));

const mockGetJobCounts = vi.hoisted(() => vi.fn());
const mockQueueClose = vi.hoisted(() => vi.fn());
const mockGetBullMQConnection = vi.hoisted(() => vi.fn(() => ({ host: 'localhost', port: 6379 })));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('../../src/lib/redis', () => ({
  redis: mockRedis,
  getBullMQConnection: mockGetBullMQConnection,
}));

vi.mock('bullmq', () => ({
  Queue: class {
    getJobCounts = mockGetJobCounts;

    close = mockQueueClose;
  },
}));

import {
  checkBullMQ,
  checkDatabase,
  checkRedis,
  clearHealthCache,
  getHealthSnapshot,
} from '../../src/services/health.service';

const idleJobCounts = {
  waiting: 0,
  active: 0,
  delayed: 0,
  completed: 0,
  failed: 0,
  paused: 0,
};

describe('health.service - 健康检查', () => {
  beforeEach(() => {
    clearHealthCache();
    vi.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockRedis.ping.mockResolvedValue('PONG');
    mockGetJobCounts.mockResolvedValue(idleJobCounts);
    mockQueueClose.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    clearHealthCache();
  });

  it('DB 正常时 checkDatabase() 返回 { status: ok, latencyMs }', async () => {
    const result = await checkDatabase();
    expect(result.status).toBe('ok');
    expect(result.latencyMs).toEqual(expect.any(Number));
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('DB 超时时返回 { status: fail, message: timeout }', async () => {
    vi.useFakeTimers();
    mockPrisma.$queryRaw.mockImplementation(() => new Promise(() => undefined));

    const pending = checkDatabase();
    await vi.advanceTimersByTimeAsync(2000);
    const result = await pending;

    expect(result.status).toBe('fail');
    expect(result.message).toBe('timeout');
  });

  it('Redis ping 失败时返回 fail', async () => {
    mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

    const result = await checkRedis();

    expect(result.status).toBe('fail');
    expect(result.message).toBe('Connection refused');
  });

  it('BullMQ 队列积压 > 1000 时返回 warn', async () => {
    mockGetJobCounts.mockResolvedValue({
      ...idleJobCounts,
      waiting: 800,
      active: 150,
      delayed: 51,
    });

    const result = await checkBullMQ();

    expect(result.status).toBe('warn');
    expect(result.message).toBe('队列积压过多');
    expect(result.detail).toEqual({
      jobs: { ...idleJobCounts, waiting: 800, active: 150, delayed: 51 },
      total: 1001,
    });
    expect(mockQueueClose).toHaveBeenCalledTimes(1);
  });

  it('整体快照：DB 正常 + Redis 正常 → status: ok', async () => {
    const snapshot = await getHealthSnapshot();

    expect(snapshot.status).toBe('ok');
    expect(snapshot.checks.database.status).toBe('ok');
    expect(snapshot.checks.redis.status).toBe('ok');
    expect(snapshot.uptime).toBeGreaterThanOrEqual(0);
    expect(snapshot.timestamp).toEqual(expect.any(String));
  });

  it('缓存机制：连续两次调用，DB 查询只执行 1 次', async () => {
    await getHealthSnapshot();
    await getHealthSnapshot();

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockRedis.ping).toHaveBeenCalledTimes(1);
  });

  it('版本号从 package.json 读取，不是硬编码', async () => {
    const readSpy = vi
      .spyOn(fs, 'readFileSync')
      .mockReturnValue(JSON.stringify({ version: '2.3.4-test' }));

    try {
      const snapshot = await getHealthSnapshot();
      expect(snapshot.version).toBe('2.3.4-test');
      expect(readSpy).toHaveBeenCalled();
    } finally {
      readSpy.mockRestore();
    }
  });
});
