import { afterEach, describe, expect, it, vi } from 'vitest';
import { uniqueSuffix } from '@inbox-shared/ui/uniqueSuffix';

describe('uniqueSuffix', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID where the context offers it', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'from-crypto' });
    expect(uniqueSuffix()).toBe('from-crypto');
  });

  it('stays unique without crypto.randomUUID, as on a page served over plain http', () => {
    vi.stubGlobal('crypto', {});
    const first = uniqueSuffix();
    const second = uniqueSuffix();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
  });
});
