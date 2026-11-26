import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChildMfeBridge } from '@gears-frontx/react/mfe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScreenTranslations } from './useScreenTranslations';
import { FRONTX_SHARED_PROPERTY_LANGUAGE } from '../shellContract';

function screenTranslationsTestBridge(
  overrides: Partial<Pick<ChildMfeBridge, 'getProperty' | 'subscribeToProperty'>>
): ChildMfeBridge {
  return {
    extDomainId: 'test-domain',
    extensionId: 'test-instance',
    executeActionsChain: vi.fn().mockReturnValue(undefined),
    registerActionHandler: vi.fn(),
    getProperty: overrides.getProperty ?? vi.fn(),
    subscribeToProperty: overrides.subscribeToProperty ?? vi.fn().mockReturnValue(() => undefined),
  };
}

/*
 * Renders the hook while recording `loading` of every render into `renderLog`,
 * so a case can assert that no render ever showed the loading branch, not just
 * that the final one did not.
 */
function renderRecordingHook(
  languageModules: Parameters<typeof useScreenTranslations>[0],
  bridge: ChildMfeBridge,
  renderLog: boolean[]
) {
  return renderHook(() => {
    const state = useScreenTranslations(languageModules, bridge);
    renderLog.push(state.loading);
    return state;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

type LanguageProperty = {
  id: string;
  value: string | undefined;
};

function languageProperty(value: string | undefined): LanguageProperty {
  return { id: FRONTX_SHARED_PROPERTY_LANGUAGE, value };
}

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
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('fr')),
      subscribeToProperty: vi.fn(() => vi.fn()),
    });

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
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('en')),
      subscribeToProperty: vi.fn(() => vi.fn()),
    });

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
    let subscriptionCallback: ((property: LanguageProperty) => void) | undefined;
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('en')),
      subscribeToProperty: vi.fn((_propertyName: string, callback: (property: LanguageProperty) => void) => {
        subscriptionCallback = callback;
        return vi.fn();
      }),
    });
    const languageModules = {
      './i18n/en.json': englishImporter,
      './i18n/fr.json': frenchImporter,
    };

    const { result } = renderHook(() => useScreenTranslations(languageModules, bridge));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.t('title')).toBe('Home');
    });

    await act(async () => {
      subscriptionCallback?.(languageProperty('fr'));
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.t('title')).toBe('Accueil');
    });

    expect(englishImporter).toHaveBeenCalledTimes(1);
    expect(frenchImporter).toHaveBeenCalledTimes(1);

    await act(async () => {
      subscriptionCallback?.(languageProperty('fr'));
    });

    await waitFor(() => {
      expect(frenchImporter).toHaveBeenCalledTimes(1);
    });
  });

  it('unsubscribes from bridge language updates on unmount', async () => {
    const unsubscribe = vi.fn();
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('en')),
      subscribeToProperty: vi.fn(() => unsubscribe),
    });
    const languageModules = {
      './i18n/en.json': async () => ({
        default: {
          title: 'Home',
        },
      }),
    };

    const { unmount } = renderHook(() => useScreenTranslations(languageModules, bridge));

    await waitFor(() => {
      expect(bridge.subscribeToProperty).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  /*
   * The module-level cache is keyed by the importer map object, so a fresh
   * map object per case is a cold cache and reusing one across mounts is a
   * warm one; the cache needs no reset helper between cases.
   */
  it('serves a cached language on the first render of a repeat mount', async () => {
    const englishImporter = vi.fn(async () => ({ default: { title: 'Home' } }));
    const languageModules = { './i18n/en.json': englishImporter };
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('en')),
      subscribeToProperty: vi.fn(() => vi.fn()),
    });

    const coldLog: boolean[] = [];
    const cold = renderRecordingHook(languageModules, bridge, coldLog);
    await waitFor(() => expect(cold.result.current.loading).toBe(false));
    cold.unmount();

    const warmLog: boolean[] = [];
    const warm = renderRecordingHook(languageModules, bridge, warmLog);

    // The repeat mount's FIRST render already carries the real text with
    // `loading` false: no loading branch ran, and the module imported once.
    expect(warm.result.current.loading).toBe(false);
    expect(warm.result.current.t('title')).toBe('Home');
    expect(warmLog.every((loading) => loading === false)).toBe(true);
    expect(englishImporter).toHaveBeenCalledTimes(1);
    warm.unmount();
  });

  it('shows no loading frame in any render while a language switch loads', async () => {
    let resolveFrench: (module: { default: Record<string, string> }) => void = () => {};
    const englishImporter = vi.fn(async () => ({ default: { title: 'Home' } }));
    const frenchImporter = vi.fn(
      () =>
        new Promise<{ default: Record<string, string> }>((resolve) => {
          resolveFrench = resolve;
        })
    );
    let subscriptionCallback: ((property: LanguageProperty) => void) | undefined;
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('en')),
      subscribeToProperty: vi.fn((_propertyName: string, callback: (property: LanguageProperty) => void) => {
        subscriptionCallback = callback;
        return vi.fn();
      }),
    });
    const languageModules = {
      './i18n/en.json': englishImporter,
      './i18n/fr.json': frenchImporter,
    };

    const renderLog: boolean[] = [];
    const { result } = renderRecordingHook(languageModules, bridge, renderLog);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.t('title')).toBe('Home');
    });

    // From here on the hook holds a dictionary, so no render of any later
    // load may report `loading` again: the English words stay until the
    // French ones land.
    renderLog.length = 0;

    await act(async () => {
      subscriptionCallback?.(languageProperty('fr'));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.t('title')).toBe('Home');

    await act(async () => {
      resolveFrench({ default: { title: 'Accueil' } });
    });

    await waitFor(() => expect(result.current.t('title')).toBe('Accueil'));
    expect(renderLog.length).toBeGreaterThan(0);
    expect(renderLog.every((loading) => loading === false)).toBe(true);
    expect(frenchImporter).toHaveBeenCalledTimes(1);
  });

  it('keeps the latest language when an earlier switch settles after it', async () => {
    let resolveGerman: (module: { default: Record<string, string> }) => void = () => {};
    const englishImporter = vi.fn(async () => ({ default: { title: 'Home' } }));
    const germanImporter = vi.fn(
      () =>
        new Promise<{ default: Record<string, string> }>((resolve) => {
          resolveGerman = resolve;
        })
    );
    const frenchImporter = vi.fn(async () => ({ default: { title: 'Accueil' } }));
    let subscriptionCallback: ((property: LanguageProperty) => void) | undefined;
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('en')),
      subscribeToProperty: vi.fn((_propertyName: string, callback: (property: LanguageProperty) => void) => {
        subscriptionCallback = callback;
        return vi.fn();
      }),
    });
    const languageModules = {
      './i18n/en.json': englishImporter,
      './i18n/de.json': germanImporter,
      './i18n/fr.json': frenchImporter,
    };

    const { result } = renderHook(() => useScreenTranslations(languageModules, bridge));
    await waitFor(() => expect(result.current.t('title')).toBe('Home'));

    // German starts first and hangs; French starts later and lands first.
    await act(async () => {
      subscriptionCallback?.(languageProperty('de'));
    });
    await act(async () => {
      subscriptionCallback?.(languageProperty('fr'));
    });

    await waitFor(() => expect(result.current.t('title')).toBe('Accueil'));

    // German settling last must not overwrite the French dictionary. The
    // macrotask flush drains the whole promise chain (importer, then, then)
    // before the assertion, so a stale setState that still fires cannot hide
    // behind an undrained microtask queue.
    await act(async () => {
      resolveGerman({ default: { title: 'Zuhause' } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.t('title')).toBe('Accueil');
    expect(germanImporter).toHaveBeenCalledTimes(1);
  });

  it('retries a language whose import failed on the next mount', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let attempts = 0;
    const englishImporter = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('chunk load failed');
      }
      return { default: { title: 'Home' } };
    });
    const languageModules = { './i18n/en.json': englishImporter };
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('en')),
      subscribeToProperty: vi.fn(() => vi.fn()),
    });

    const failed = renderHook(() => useScreenTranslations(languageModules, bridge));
    await waitFor(() => expect(failed.result.current.loading).toBe(false));
    // The mount that saw the failure still gets a working hook: an empty
    // dictionary, whose misses fall back to the key.
    expect(failed.result.current.t('title')).toBe('title');
    failed.unmount();

    // The failure is not cached: a later mount retries the import and serves
    // the dictionary it brings.
    const retried = renderHook(() => useScreenTranslations(languageModules, bridge));
    await waitFor(() => expect(retried.result.current.t('title')).toBe('Home'));
    expect(retried.result.current.loading).toBe(false);
    expect(englishImporter).toHaveBeenCalledTimes(2);
    retried.unmount();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('ends the load with an empty dictionary when no module exists, not even en', async () => {
    const languageModules = {};
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('de')),
      subscribeToProperty: vi.fn(() => vi.fn()),
    });

    const { result } = renderHook(() => useScreenTranslations(languageModules, bridge));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.t('title')).toBe('title');
  });

  it('shares one en import across unsupported languages', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const englishImporter = vi.fn(async () => ({ default: { title: 'Home' } }));
    const languageModules = { './i18n/en.json': englishImporter };
    let subscriptionCallback: ((property: LanguageProperty) => void) | undefined;
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('fr')),
      subscribeToProperty: vi.fn((_propertyName: string, callback: (property: LanguageProperty) => void) => {
        subscriptionCallback = callback;
        return vi.fn();
      }),
    });

    const { result } = renderHook(() => useScreenTranslations(languageModules, bridge));
    await waitFor(() => expect(result.current.t('title')).toBe('Home'));

    // A second language with no module of its own joins the same en entry:
    // one import, one fresh warning for the new language, nothing more.
    await act(async () => {
      subscriptionCallback?.(languageProperty('es'));
    });
    await waitFor(() => expect(result.current.t('title')).toBe('Home'));

    expect(englishImporter).toHaveBeenCalledTimes(1);
    // Only the fallback warnings matter here; the missing-key warnings the
    // probe renders are dropped by the filter, and one warning per unsupported
    // language is the whole budget.
    const fallbackWarnings = warnSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes('No translation module found'));
    expect(fallbackWarnings).toHaveLength(2);
    expect(fallbackWarnings[0]).toContain('fr');
    expect(fallbackWarnings[1]).toContain('es');
  });

  /*
   * An unsupported language aliases no cache entry: it resolves to the en
   * entry on each request. The en import fails here, so every key the
   * language may have pointed at must be evicted with the failure - a stale
   * alias would serve an empty dictionary with `loading` false forever and
   * never retry.
   */
  it('retries the en fallback for an unsupported language after a failed import', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let attempts = 0;
    const englishImporter = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('chunk load failed');
      }
      return { default: { title: 'Home' } };
    });
    // No './i18n/fr.json': French can only ever resolve to the en entry.
    const languageModules = { './i18n/en.json': englishImporter };
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('fr')),
      subscribeToProperty: vi.fn(() => vi.fn()),
    });

    const failed = renderHook(() => useScreenTranslations(languageModules, bridge));
    await waitFor(() => expect(failed.result.current.loading).toBe(false));
    // The mount that saw the failure still gets a working hook: an empty
    // dictionary, whose misses fall back to the key.
    expect(failed.result.current.t('title')).toBe('title');
    failed.unmount();

    // The failure was not cached under French either: the later mount retries
    // the en import and serves the dictionary it brings.
    const retried = renderHook(() => useScreenTranslations(languageModules, bridge));
    await waitFor(() => expect(retried.result.current.t('title')).toBe('Home'));
    expect(retried.result.current.loading).toBe(false);
    expect(englishImporter).toHaveBeenCalledTimes(2);
    retried.unmount();
    expect(errorSpy).toHaveBeenCalled();
  });

  /*
   * A failed switch may not blank the screen: the dictionary already shown is
   * the only words the user has, so it stays, with no loading frame, until a
   * later import for some language actually lands.
   */
  it('keeps the words on screen when a language switch fails to load', async () => {
    let rejectGerman: (error: Error) => void = () => {};
    const englishImporter = vi.fn(async () => ({ default: { title: 'Home' } }));
    const germanImporter = vi.fn(
      () =>
        new Promise<{ default: Record<string, string> }>((_resolve, reject) => {
          rejectGerman = reject;
        })
    );
    let subscriptionCallback: ((property: LanguageProperty) => void) | undefined;
    const bridge = screenTranslationsTestBridge({
      getProperty: vi.fn(() => languageProperty('en')),
      subscribeToProperty: vi.fn((_propertyName: string, callback: (property: LanguageProperty) => void) => {
        subscriptionCallback = callback;
        return vi.fn();
      }),
    });
    const languageModules = {
      './i18n/en.json': englishImporter,
      './i18n/de.json': germanImporter,
    };

    const renderLog: boolean[] = [];
    const { result } = renderRecordingHook(languageModules, bridge, renderLog);
    await waitFor(() => expect(result.current.t('title')).toBe('Home'));
    renderLog.length = 0;

    await act(async () => {
      subscriptionCallback?.(languageProperty('de'));
    });
    await act(async () => {
      rejectGerman(new Error('chunk load failed'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The English words are still on screen and no render ever showed the
    // loading branch: the failure ended the load, it did not blank it.
    expect(result.current.t('title')).toBe('Home');
    expect(result.current.loading).toBe(false);
    expect(renderLog.length).toBeGreaterThan(0);
    expect(renderLog.every((loading) => loading === false)).toBe(true);
  });
});
