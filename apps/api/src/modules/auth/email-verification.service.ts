import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { BadRequestError } from '@hr/shared';
import { RedisKeys } from '../../common/redis/redis-keys';
import { RedisService } from '../../common/redis/redis.service';
import { MailService } from '../../common/mail/mail.service';

interface OtpState {
  otp: string;
  attempts: number;
}

@Injectable()
export class EmailVerificationService {
  private readonly ttlSeconds = 24 * 60 * 60;

  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async generateAndSend(userId: string, email: string): Promise<void> {
    const otp = this.generateOtp();
    await this.redis.set(
      RedisKeys.emailOtp(userId),
      JSON.stringify({ otp, attempts: 0 } satisfies OtpState),
      this.ttlSeconds,
    );

    await this.mail.send({
      to: email,
      subject: 'Verify your email',
      html: this.mail.renderTemplate(
        'Verify your email',
        `<p>Your verification code is <strong>${otp}</strong>.</p><p>This code expires in 24 hours.</p>`,
      ),
    });
  }

  async verify(userId: string, otp: string): Promise<void> {
    const key = RedisKeys.emailOtp(userId);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new BadRequestError('Verification code expired or invalid');
    }

    const state = JSON.parse(raw) as OtpState;
    if (state.otp === otp) {
      await this.redis.del(key);
      return;
    }

    const attempts = state.attempts + 1;
    if (attempts >= 5) {
      await this.redis.del(key);
      throw new BadRequestError('Verification code expired or invalid');
    }

    await this.redis.set(key, JSON.stringify({ otp: state.otp, attempts }), this.ttlSeconds);
    throw new BadRequestError('Verification code expired or invalid');
  }

  private generateOtp(): string {
    const array = crypto.randomBytes(4);
    return (array.readUInt32BE(0) % 1_000_000).toString().padStart(6, '0');
  }
}
