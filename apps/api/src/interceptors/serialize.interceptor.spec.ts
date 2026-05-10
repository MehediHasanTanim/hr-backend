import { Exclude } from 'class-transformer';
import { of, firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SerializeInterceptor } from './serialize.interceptor';

class SecretClass {
  name = 'ok';

  @Exclude()
  hidden = 'nope';
}

describe('SerializeInterceptor', () => {
  const interceptor = new SerializeInterceptor();

  async function serialize(value: unknown): Promise<unknown> {
    const stream = interceptor.intercept({} as never, { handle: () => of(value) });
    return firstValueFrom(stream);
  }

  it('strips internal fields recursively', async () => {
    const result = await serialize({
      _internalId: '1',
      password: 'p',
      secretKey: 's',
      nested: { tokenValue: 't', keep: 'ok' },
      list: [{ _x: 1, keep: 2 }],
      keep: true,
    });

    expect(result).toEqual({
      data: {
        nested: { keep: 'ok' },
        list: [{ keep: 2 }],
        keep: true,
      },
    });
  });

  it('passes through already wrapped response', async () => {
    const value = { data: { name: 'x' }, meta: { page: 1 } };
    expect(await serialize(value)).toBe(value);
  });

  it('supports class-transformer @Exclude', async () => {
    expect(await serialize(new SecretClass())).toEqual({ data: { name: 'ok' } });
  });

  it('wraps primitive values', async () => {
    expect(await serialize(123)).toEqual({ data: 123 });
  });
});
