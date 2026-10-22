// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-blank-mfe-tests:p1
import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { FRONTX_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScreenTranslations } from './useScreenTranslations';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeBridge(language: string) {
  return createMfeBridgeFixture({
    extDomainId: 'test-domain',
    extensionId: 'test-instance',
    initialProperties: { [FRONTX_SHARED_PROPERTY_LANGUAGE]: language },
  });
}

describe('useScreenTranslations', () => {
  it('loads the translation module for the current bridge language', async () => {
    const enImporter = vi.fn(async () => ({ default: { greeting: 'Hello' } }));
    const languageModules = { './i18n/en.json': enImporter };

    const { bridge } = makeBridge('en');

    const { result } = renderHook(() =>
      useScreenTranslations(languageModules, bridge),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.t('greeting')).toBe('Hello');
  });

  it('returns the key itself when a translation key is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const languageModules = {
      './i18n/en.json': async () => ({ default: { greeting: 'Hello' } }),
    };

    const { bridge } = makeBridge('en');

    const { result } = renderHook(() =>
      useScreenTranslations(languageModules, bridge),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.t('missing_key')).toBe('missing_key');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Missing translation key');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('missing_key');
  });

  it('warns and falls back to en when the requested language module is absent', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const enImporter = vi.fn(async () => ({ default: { greeting: 'Hello' } }));
    const languageModules = { './i18n/en.json': enImporter };

    const { bridge } = makeBridge('fr');

    const { result } = renderHook(() =>
      useScreenTranslations(languageModules, bridge),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // The hook emits a warning and serves English content when falling back to en.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('No translation module found');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('fr');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('falling back to en');
    expect(result.current.t('greeting')).toBe('Hello');
  });

  it('reloads translations when the bridge language changes', async () => {
    const enImporter = vi.fn(async () => ({ default: { greeting: 'Hello' } }));
    const frImporter = vi.fn(async () => ({ default: { greeting: 'Bonjour' } }));
    const languageModules = {
      './i18n/en.json': enImporter,
      './i18n/fr.json': frImporter,
    };
    const fixture = makeBridge('en');

    const { result } = renderHook(() =>
      useScreenTranslations(languageModules, fixture.bridge),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.t('greeting')).toBe('Hello');
    });

    await act(async () => {
      fixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'fr');
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.t('greeting')).toBe('Bonjour');
    });

    expect(enImporter).toHaveBeenCalledTimes(1);
    expect(frImporter).toHaveBeenCalledTimes(1);

    // Repeating the same language should not trigger another import.
    await act(async () => {
      fixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'fr');
    });

    await waitFor(() => {
      expect(frImporter).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the newest language when an older load resolves last', async () => {
    let resolveFrench: (module: { default: Record<string, string> }) => void = () => {};
    const languageModules = {
      './i18n/en.json': async () => ({ default: { greeting: 'Hello' } }),
      './i18n/fr.json': () =>
        new Promise<{ default: Record<string, string> }>((resolve) => {
          resolveFrench = resolve;
        }),
      './i18n/de.json': async () => ({ default: { greeting: 'Hallo' } }),
    };
    const fixture = makeBridge('en');

    const { result } = renderHook(() =>
      useScreenTranslations(languageModules, fixture.bridge),
    );

    await waitFor(() => expect(result.current.t('greeting')).toBe('Hello'));

    await act(async () => {
      fixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'fr');
    });
    await act(async () => {
      fixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'de');
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.t('greeting')).toBe('Hallo');
    });

    // The French load resolving last must not overwrite the German strings.
    await act(async () => {
      resolveFrench({ default: { greeting: 'Bonjour' } });
    });

    expect(result.current.t('greeting')).toBe('Hallo');
    expect(result.current.loading).toBe(false);
  });

  it('finishes loading under StrictMode', async () => {
    const languageModules = {
      './i18n/en.json': async () => ({ default: { greeting: 'Hello' } }),
    };

    const { bridge } = makeBridge('en');

    const { result } = renderHook(
      () => useScreenTranslations(languageModules, bridge),
      { wrapper: StrictMode },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.t('greeting')).toBe('Hello');
  });

  it('unsubscribes from bridge language updates on unmount', async () => {
    const fixture = makeBridge('en');
    const languageModules = {
      './i18n/en.json': async () => ({ default: { greeting: 'Hello' } }),
    };

    const { unmount } = renderHook(() =>
      useScreenTranslations(languageModules, fixture.bridge),
    );

    await waitFor(() => {
      expect(fixture.subscribeToProperty).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(fixture.unsubscriptions).toHaveLength(1);
    expect(fixture.unsubscriptions[0]?.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
