import { OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis, { Cluster, RedisOptions } from 'ioredis';
import { ThrottlerStorageRedis } from './throttler-storage-redis.interface';
export declare class ThrottlerStorageRedisService implements ThrottlerStorageRedis, OnModuleDestroy {
    scriptSrc: string;
    redis: Redis | Cluster;
    disconnectRequired?: boolean;
    constructor(redis?: Redis);
    constructor(cluster?: Cluster);
    constructor(options?: RedisOptions);
    constructor(url?: string);
    getScriptSrc(): string;
    increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord>;
    onModuleDestroy(): void;
}
