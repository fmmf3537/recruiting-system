import fs from 'fs';
import path from 'path';

import prisma from '../lib/prisma';
import { getBullMQConnection, redis } from '../lib/redis';

export interface CheckResult {
  status: 'ok' | 'warn' | 'fail';
  latencyMs?: number;
  message?: string;
  detail?: Record<string, unknown>;
}

export interface HealthResult {
  status: 'ok' | 'degraded' | 'fail';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    bullmq: CheckResult;
  };
}

const startTime = Date.now();
const CHECK_TIMEOUT_MS = 2000;
const CACHE_TTL_MS = 5000;

function getAppVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, CHECK_TIMEOUT_MS);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'fail', message: (err as Error).message };
  }
}

export async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(redis.ping(), CHECK_TIMEOUT_MS);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'fail', message: (err as Error).message };
  }
}

export async function checkBullMQ(): Promise<CheckResult> {
  let queue:
    | { getJobCounts: () => Promise<Record<string, number>>; close: () => Promise<void> }
    | undefined;
  try {
    const { Queue } = await import('bullmq');
    queue = new Queue('resume-parse', { connection: getBullMQConnection() });
    const counts = await withTimeout(queue.getJobCounts(), CHECK_TIMEOUT_MS);
    const total = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
    return {
      status: total > 1000 ? 'warn' : 'ok',
      detail: { jobs: counts, total },
      message: total > 1000 ? '队列积压过多' : undefined,
    };
  } catch (err) {
    return { status: 'warn', message: `BullMQ 检查失败: ${(err as Error).message}` };
  } finally {
    // 超时或异常时也要关闭临时 Queue，避免泄漏 Redis 连接
    if (queue) {
      await queue.close().catch(() => undefined);
    }
  }
}

let cache: { result: HealthResult; ts: number } | null = null;

/** 测试用：清空 5 秒缓存 */
export function clearHealthCache(): void {
  cache = null;
}

export async function getHealthSnapshot(): Promise<HealthResult> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.result;
  }

  const [database, redisResult, bullmq] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkBullMQ(),
  ]);

  // DB 不可用 → fail（HTTP 503）；Redis 不可用 → degraded（HTTP 200，探针不杀进程）
  // BullMQ 仅 warn，不参与整体状态
  let status: HealthResult['status'] = 'ok';
  if (database.status === 'fail') {
    status = 'fail';
  } else if (redisResult.status === 'fail') {
    status = 'degraded';
  }

  const result: HealthResult = {
    status,
    timestamp: new Date().toISOString(),
    version: getAppVersion(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: { database, redis: redisResult, bullmq },
  };

  cache = { result, ts: Date.now() };
  return result;
}
