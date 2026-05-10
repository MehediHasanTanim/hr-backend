import { z, ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import { ZodBody } from './zod-schema.decorator';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  age: z.coerce.number(),
  name: z.string(),
}).strip();

@ZodBody(schema)
class BodyDto {}

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  it('passes through non-body metadata types', () => {
    const value = { any: 'value' };
    expect(pipe.transform(value, { type: 'query' })).toBe(value);
  });

  it('passes through when schema is missing', () => {
    const value = { any: 'value' };
    expect(pipe.transform(value, { type: 'body', metatype: class X {} })).toBe(value);
  });

  it('returns parsed data for valid body', () => {
    const result = pipe.transform(
      { age: '42', name: 'Jane', extra: 'x' },
      { type: 'body', metatype: BodyDto },
    ) as { age: number; name: string };

    expect(result).toEqual({ age: 42, name: 'Jane' });
  });

  it('throws ZodError for invalid body', () => {
    expect(() => pipe.transform({ age: 'x' }, { type: 'body', metatype: BodyDto })).toThrow(ZodError);
  });
});
