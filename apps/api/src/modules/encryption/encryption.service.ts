import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { BadRequestError, InternalError } from '@hr/shared';
import { AppConfigService } from '../../config/config.service';

export interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.key = this.parseKey(config.get('encryption').key);
  }

  encrypt(value: string | null | undefined): EncryptedPayload | null {
    if (value === null || value === undefined || value === '') return null;

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  decrypt(payload: unknown): string | null {
    if (!payload) return null;
    if (!this.isEncryptedPayload(payload)) {
      throw new BadRequestError('Invalid encrypted payload');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  mask(value: string | null | undefined, visibleLast = 4): string | null {
    if (!value) return null;
    if (value.length <= visibleLast) return '*'.repeat(value.length);
    return `${'*'.repeat(Math.max(0, value.length - visibleLast))}${value.slice(-visibleLast)}`;
  }

  private parseKey(raw: string): Buffer {
    const key = Buffer.from(raw, 'base64');
    if (key.length === 32) return key;

    const utf8Key = Buffer.from(raw, 'utf8');
    if (utf8Key.length === 32) return utf8Key;

    throw new InternalError('ENCRYPTION_KEY must be exactly 32 bytes or base64-encoded 32 bytes');
  }

  private isEncryptedPayload(payload: unknown): payload is EncryptedPayload {
    if (payload === null || typeof payload !== 'object') return false;
    const record = payload as Record<string, unknown>;
    return ['iv', 'tag', 'ciphertext'].every((key) => typeof record[key] === 'string');
  }
}
