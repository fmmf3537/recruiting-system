import Redis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => {
    if (times > 3) {
      console.error('Redis connection failed after 3 retries');
      return null;
    }
    return Math.min(times * 100, 3000);
  },
});

/** BullMQ 连接配置（避免与 bullmq 内置 ioredis 类型冲突） */
export function getBullMQConnection(): ConnectionOptions {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

redis.on('error', (err) => {
  console.error('Redis error:', err.message);
});

// 连接 Redis（首次使用时）
export async function connectRedis(): Promise<void> {
  if (redis.status === 'wait') {
    await redis.connect();
  }
}

// 通用缓存读取
export async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

// 通用缓存写入
export async function setCache(key: string, value: unknown, ttlSeconds = 30): Promise<void> {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to set cache:', error);
  }
}

// 按 pattern 清除列表缓存
export async function clearListCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error(`Failed to clear cache ${pattern}:`, error);
  }
}

// 清除统计缓存
export async function clearStatsCache(): Promise<void> {
  await clearListCache('stats:*');
}
