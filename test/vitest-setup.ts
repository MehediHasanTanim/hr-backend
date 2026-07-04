import { expect } from 'vitest';

expect.extend({
  toBeOneOf(received: unknown, candidates: unknown[]) {
    const pass = candidates.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${String(received)} NOT to be one of [${candidates.join(', ')}]`
          : `Expected ${String(received)} to be one of [${candidates.join(', ')}]`,
    };
  },
});
