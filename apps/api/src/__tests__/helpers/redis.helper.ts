import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) await redis.connect();
}

export async function flushTestRedis(): Promise<void> {
  await connectRedis();
  await redis.flushDb();
}

export async function redisGet(key: string): Promise<string | null> {
  await connectRedis();
  return redis.get(key);
}

export async function redisKeys(pattern: string): Promise<string[]> {
  await connectRedis();
  return redis.keys(pattern);
}

export async function redisExpire(key: string, seconds: number): Promise<void> {
  await connectRedis();
  await redis.expire(key, seconds);
}

export async function disconnectRedis(): Promise<void> {
  if (redis.isOpen) await redis.quit();
}
