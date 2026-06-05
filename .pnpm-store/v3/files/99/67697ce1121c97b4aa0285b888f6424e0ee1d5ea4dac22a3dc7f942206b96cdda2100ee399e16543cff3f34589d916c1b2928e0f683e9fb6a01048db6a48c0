import { ThrottlerStorage } from '@nestjs/throttler';
import Redis, { Cluster } from 'ioredis';
export interface ThrottlerStorageRedis {
    redis: Redis | Cluster;
    increment: ThrottlerStorage['increment'];
}
export declare const ThrottlerStorageRedis: unique symbol;
