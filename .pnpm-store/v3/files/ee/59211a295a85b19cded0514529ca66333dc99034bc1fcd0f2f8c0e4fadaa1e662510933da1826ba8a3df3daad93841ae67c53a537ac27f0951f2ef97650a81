"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThrottlerStorageRedisService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = require("ioredis");
let ThrottlerStorageRedisService = class ThrottlerStorageRedisService {
    constructor(redisOrOptions) {
        if (redisOrOptions instanceof ioredis_1.default || redisOrOptions instanceof ioredis_1.Cluster) {
            this.redis = redisOrOptions;
        }
        else if (typeof redisOrOptions === 'string') {
            this.redis = new ioredis_1.default(redisOrOptions);
            this.disconnectRequired = true;
        }
        else {
            this.redis = new ioredis_1.default(redisOrOptions);
            this.disconnectRequired = true;
        }
        this.scriptSrc = this.getScriptSrc();
    }
    getScriptSrc() {
        return `
      local hitKey = KEYS[1]
      local blockKey = KEYS[2]
      local throttlerName = ARGV[1]
      local ttl = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local blockDuration = tonumber(ARGV[4])

      local totalHits = redis.call('INCR', hitKey)
      local timeToExpire = redis.call('PTTL', hitKey)
      
      if timeToExpire <= 0 then
        redis.call('PEXPIRE', hitKey, ttl)
        timeToExpire = ttl
      end

      local isBlocked = redis.call('GET', blockKey)
      local timeToBlockExpire = 0

      if isBlocked then
        timeToBlockExpire = redis.call('PTTL', blockKey)
      elseif totalHits > limit then
        redis.call('SET', blockKey, 1, 'PX', blockDuration)
        isBlocked = '1'
        timeToBlockExpire = blockDuration
      end

      if isBlocked and timeToBlockExpire <= 0 then
        redis.call('DEL', blockKey)
        redis.call('SET', hitKey, 1, 'PX', ttl)
        totalHits = 1
        timeToExpire = ttl
        isBlocked = false
      end

      return { totalHits, timeToExpire, isBlocked and 1 or 0, timeToBlockExpire }
    `
            .replace(/^\s+/gm, '')
            .trim();
    }
    async increment(key, ttl, limit, blockDuration, throttlerName) {
        const hitKey = `${this.redis.options.keyPrefix}{${key}:${throttlerName}}:hits`;
        const blockKey = `${this.redis.options.keyPrefix}{${key}:${throttlerName}}:blocked`;
        const results = (await this.redis.call('EVAL', this.scriptSrc, 2, hitKey, blockKey, throttlerName, ttl, limit, blockDuration));
        if (!Array.isArray(results)) {
            throw new TypeError(`Expected result to be array of values, got ${results}`);
        }
        const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = results;
        if (typeof totalHits !== 'number') {
            throw new TypeError('Expected totalHits to be a number');
        }
        if (typeof timeToExpire !== 'number') {
            throw new TypeError('Expected timeToExpire to be a number');
        }
        if (typeof isBlocked !== 'number') {
            throw new TypeError('Expected isBlocked to be a number');
        }
        if (typeof timeToBlockExpire !== 'number') {
            throw new TypeError('Expected timeToBlockExpire to be a number');
        }
        return {
            totalHits,
            timeToExpire: Math.ceil(timeToExpire / 1000),
            isBlocked: isBlocked === 1,
            timeToBlockExpire: Math.ceil(timeToBlockExpire / 1000),
        };
    }
    onModuleDestroy() {
        var _a;
        if (this.disconnectRequired) {
            (_a = this.redis) === null || _a === void 0 ? void 0 : _a.disconnect(false);
        }
    }
};
exports.ThrottlerStorageRedisService = ThrottlerStorageRedisService;
exports.ThrottlerStorageRedisService = ThrottlerStorageRedisService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object])
], ThrottlerStorageRedisService);
//# sourceMappingURL=throttler-storage-redis.service.js.map