import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FRONTX_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { useInboxTranslate } from '@inbox-shared/i18n/useInboxTranslate';
import sharedEn from '@inbox-shared/i18n/en.json';

const catalogues = { en: { greeting: 'Hello' }, de: { greeting: 'Hallo' } };

describe('useInboxTranslate', () => {
  it("translates in the shell's language and follows a switch", () => {
    const fixture = createMfeBridgeFixture({
      extDomainId: 'domain',
      extensionId: 'extension',
      initialProperties: { [FRONTX_SHARED_PROPERTY_LANGUAGE]: 'en' },
    });
    const { result } = renderHook(() => useInboxTranslate(fixture.bridge, catalogues));
    expect(result.current('greeting')).toBe('Hello');
    expect(result.current('retry')).toBe(sharedEn.retry);

    act(() => fixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'fr'));
    expect(result.current('greeting')).toBe('Hello');
  });

  it('reads en while the shell has published no language', () => {
    const fixture = createMfeBridgeFixture({ extDomainId: 'domain', extensionId: 'extension' });
    const { result } = renderHook(() => useInboxTranslate(fixture.bridge, catalogues));

    expect(result.current('greeting')).toBe('Hello');
  });
});
