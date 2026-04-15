import Redis from 'ioredis';
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

redis.on('error', (err) => {
  console.error('Redis error:', err.message);
});

// 连接 Redis（首次使用时）
export async function connectRedis(): Promise<void> {
  if (redis.status === 'wait') {
    await redis.connect();
  }
}

// 清除统计缓存
export async function clearStatsCache(): Promise<void> {
  try {
    const keys = await redis.keys('stats:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error('Failed to clear stats cache:', error);
  }
}
