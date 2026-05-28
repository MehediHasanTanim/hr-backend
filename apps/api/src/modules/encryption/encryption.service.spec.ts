import { describe, expect, it } from 'vitest';
import { EncryptionService } from './encryption.service';
import type { AppConfigService } from '../../config/config.service';

const key = Buffer.from('12345678901234567890123456789012').toString('base64');

function service() {
  return new EncryptionService({
    get: () => ({ key }),
  } as unknown as AppConfigService);
}

describe('EncryptionService', () => {
  it('encrypts and decrypts AES-256-GCM payloads', () => {
    const encryption = service();
    const encrypted = encryption.encrypt('4111111111111111');

    expect(encrypted).toMatchObject({
      iv: expect.any(String),
      tag: expect.any(String),
      ciphertext: expect.any(String),
    });
    expect(encrypted?.ciphertext).not.toContain('4111111111111111');
    expect(encryption.decrypt(encrypted)).toBe('4111111111111111');
  });

  it('uses a unique iv for each encryption', () => {
    const encryption = service();
    const first = encryption.encrypt('secret');
    const second = encryption.encrypt('secret');

    expect(first?.iv).not.toBe(second?.iv);
    expect(first?.ciphertext).not.toBe(second?.ciphertext);
  });

  it('validates key length', () => {
    expect(() => new EncryptionService({
      get: () => ({ key: 'too-short' }),
    } as unknown as AppConfigService)).toThrow(/ENCRYPTION_KEY/);
  });
});
