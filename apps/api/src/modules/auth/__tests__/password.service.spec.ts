import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordService } from '../password.service';

vi.mock('argon2', () => ({
  default: {
    argon2id: 2,
    hash: vi.fn().mockResolvedValue('$argon2id$hashed'),
    verify: vi.fn().mockResolvedValue(true),
    needsRehash: vi.fn().mockReturnValue(false),
  },
  argon2id: 2,
  hash: vi.fn().mockResolvedValue('$argon2id$hashed'),
  verify: vi.fn().mockResolvedValue(true),
  needsRehash: vi.fn().mockReturnValue(false),
}));

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
    vi.clearAllMocks();
  });

  it('hashes plaintext password using argon2id parameters', async () => {
    await expect(service.hash('Passw0rd!')).resolves.toBe('$argon2id$hashed');
  });

  it('returns true when argon2 verifies the password hash', async () => {
    await expect(service.verify('$argon2id$hash', 'Passw0rd!')).resolves.toBe(true);
  });

  it('returns false when argon2 verification throws for malformed hashes', async () => {
    const argon2 = await import('argon2');
    vi.mocked(argon2.verify).mockRejectedValueOnce(new Error('malformed hash'));

    await expect(service.verify('not-a-hash', 'Passw0rd!')).resolves.toBe(false);
  });

  it('returns argon2 rehash decision for the configured parameters', () => {
    expect(service.needsRehash('$argon2id$hash')).toBe(false);
  });
});
