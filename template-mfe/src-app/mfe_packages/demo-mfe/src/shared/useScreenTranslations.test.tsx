import { act, renderHook, waitFor } from '@testing-library/react';
import { FRONTX_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScreenTranslations } from './useScreenTranslations';

function screenTranslationsTestBridge(language: string) {
  return createMfeBridgeFixture({
    extDomainId: 'test-domain',
    extensionId: 'test-instance',
    initialProperties: { [FRONTX_SHARED_PROPERTY_LANGUAGE]: language },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useScreenTranslations', () => {
  it('falls back to English when the requested language file is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const englishImporter = vi.fn(async () => ({
      default: {
        title: 'Home',
      },
    }));
    const languageModules = {
      './i18n/en.json': englishImporter,
    };
    const { bridge } = screenTranslationsTestBridge('fr');

    const { result } = renderHook(() => useScreenTranslations(languageModules, bridge));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(englishImporter).toHaveBeenCalledTimes(1);
    expect(result.current.t('title')).toBe('Home');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('No translation module found');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('fr');
  });

  it('returns the translation key when a key is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const languageModules = {
      './i18n/en.json': async () => ({
        default: {
          title: 'Home',
        },
      }),
    };
    const { bridge } = screenTranslationsTestBridge('en');

    const { result } = renderHook(() => useScreenTranslations(languageModules, bridge));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.t('missing_key')).toBe('missing_key');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Missing translation key');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('missing_key');
  });

  it('reloads translations when the bridge language changes', async () => {
    const englishImporter = vi.fn(async () => ({
      default: {
        title: 'Home',
      },
    }));
    const frenchImporter = vi.fn(async () => ({
      default: {
        title: 'Accueil',
      },
    }));
    const fixture = screenTranslationsTestBridge('en');
    const languageModules = {
      './i18n/en.json': englishImporter,
      './i18n/fr.json': frenchImporter,
    };

    const { result } = renderHook(() => useScreenTranslations(languageModules, fixture.bridge));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.t('title')).toBe('Home');
    });

    await act(async () => {
      fixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'fr');
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.t('title')).toBe('Accueil');
    });

    expect(englishImporter).toHaveBeenCalledTimes(1);
    expect(frenchImporter).toHaveBeenCalledTimes(1);

    await act(async () => {
      fixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'fr');
    });

    await waitFor(() => {
      expect(frenchImporter).toHaveBeenCalledTimes(1);
    });
  });

  it('unsubscribes from bridge language updates on unmount', async () => {
    const fixture = screenTranslationsTestBridge('en');
    const languageModules = {
      './i18n/en.json': async () => ({
        default: {
          title: 'Home',
        },
      }),
    };

    const { unmount } = renderHook(() => useScreenTranslations(languageModules, fixture.bridge));

    await waitFor(() => {
      expect(fixture.subscribeToProperty).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(fixture.unsubscriptions).toHaveLength(1);
    expect(fixture.unsubscriptions[0]?.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
