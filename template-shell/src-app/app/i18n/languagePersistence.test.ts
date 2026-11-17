import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFrontX, eventBus, i18n, i18nRegistry, Language } from '@gears-frontx/react';
import { LANGUAGE_STORAGE_KEY, applyListedLanguage, applyPersistedLanguage, applyProfileLanguage } from './languagePersistence';
import '@/app/i18n/shellTranslations';

/**
 * Where the localStorage the code uses gets its methods: the Storage prototype,
 * or the object itself when vitest.setup.ts installed its in-memory stand-in.
 */
const storageMethods = (): Storage =>
  Object.getPrototypeOf(window.localStorage) === Storage.prototype ? Storage.prototype : window.localStorage;

/**
 * Boots one session of the persistence the way main.tsx does, and keeps the
 * returned bus subscription so afterEach can remove it again: the bus is a
 * singleton, and listeners left behind would leak into later tests.
 */
const subscriptions: Array<{ unsubscribe: () => void }> = [];

function boot(): void {
  subscriptions.push(applyPersistedLanguage());
}

// The minimal wiring the persistence needs from the app: the i18n plugin is
// what turns the emitted event into a registry change, the way main.tsx builds
// the full app before calling applyPersistedLanguage(). One build for the
// file: the registry is a singleton, the plugin's subscription lives on it.
createFrontX().use(i18n()).build();

describe('applyPersistedLanguage', () => {
  beforeEach(async () => {
    // The registry is a singleton: put the plugin's startup language back
    // before each test, the state a fresh boot would start from.
    await i18nRegistry.setLanguage(Language.English);
    window.localStorage.clear();
  });

  afterEach(() => {
    while (subscriptions.length > 0) {
      subscriptions.pop()?.unsubscribe();
    }
    vi.restoreAllMocks();
  });

  it('applies the language chosen in an earlier session', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, Language.German);

    boot();

    expect(i18nRegistry.getLanguage()).toBe(Language.German);
  });

  it('stays on the startup language when nothing is stored', () => {
    boot();

    expect(i18nRegistry.getLanguage()).toBe(Language.English);
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });

  it('ignores a stored code outside the project list and leaves it stored', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');

    boot();

    expect(i18nRegistry.getLanguage()).toBe(Language.English);
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
  });

  it('boots on the startup language when storage cannot be read', () => {
    const getItem = vi.spyOn(storageMethods(), 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(() => boot()).not.toThrow();
    expect(getItem).toHaveBeenCalled();
    expect(i18nRegistry.getLanguage()).toBe(Language.English);
  });

  it('remembers every later change the user starts', () => {
    boot();

    // The header control and a screen's set_language both end here. The one
    // change that is not remembered, the profile's, has its own tests below.
    eventBus.emit('i18n/language/changed', { language: Language.German });
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(Language.German);

    eventBus.emit('i18n/language/changed', { language: Language.English });
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(Language.English);

    // Studio's selector may send a code the project does not list; the key
    // follows it all the same, so the shell key and Studio's never disagree.
    eventBus.emit('i18n/language/changed', { language: 'fr' });
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
  });

  it('keeps the stored choice when a change event arrives without a language', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, Language.German);
    boot();

    // The payload is typed, but emit delivers whatever a caller passes: an
    // emitter that omits or misnames the field hands `undefined` to the
    // listener. The cast below stands in for that caller; the key must keep
    // the last real choice instead of gaining the string "undefined".
    eventBus.emit('i18n/language/changed', { language: undefined as unknown as Language });
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(Language.German);
  });

  it('still switches the language when storage cannot be written', () => {
    const setItem = vi.spyOn(storageMethods(), 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    boot();

    expect(() =>
      eventBus.emit('i18n/language/changed', { language: Language.German }),
    ).not.toThrow();

    expect(setItem).toHaveBeenCalled();
    expect(i18nRegistry.getLanguage()).toBe(Language.German);
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });
});

describe('applyListedLanguage', () => {
  beforeEach(async () => {
    // The registry is a singleton: put the plugin's startup language back
    // before each test, the state a fresh boot would start from.
    await i18nRegistry.setLanguage(Language.English);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies a language the project lists', () => {
    applyListedLanguage(Language.German);

    expect(i18nRegistry.getLanguage()).toBe(Language.German);
  });

  it('ignores a language outside the project list', () => {
    applyListedLanguage('fr');

    expect(i18nRegistry.getLanguage()).toBe(Language.English);
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });
});

describe('applyProfileLanguage', () => {
  beforeEach(async () => {
    // The registry is a singleton: put the plugin's startup language back
    // before each test, the state a fresh boot would start from.
    await i18nRegistry.setLanguage(Language.English);
    window.localStorage.clear();
  });

  afterEach(() => {
    while (subscriptions.length > 0) {
      subscriptions.pop()?.unsubscribe();
    }
    vi.restoreAllMocks();
  });

  // Every test below starts its own persistence session in a beforeEach.
  // applyPersistedLanguage starts a session by clearing the marker of an
  // explicit choice, so a choice made in an earlier test cannot outlive it,
  // whatever order the tests run in. The groups differ only in what an
  // earlier session left in the key, because that has to be in place before
  // the session starts.
  describe('when nothing is stored', () => {
    beforeEach(() => {
      boot();
    });

    it('applies the profile language when nothing is stored', () => {
      expect(i18nRegistry.getLanguage()).toBe(Language.English);

      applyProfileLanguage(Language.German);

      expect(i18nRegistry.getLanguage()).toBe(Language.German);
      // The profile is the default, not a choice: applying it stores nothing,
      // so a later change of the profile language still applies.
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
    });

    it('applies a changed profile language in a later session', async () => {
      // First session, started above: a German profile and nothing chosen in
      // the shell, so the profile language applies and nothing is stored.
      applyProfileLanguage(Language.German);
      expect(i18nRegistry.getLanguage()).toBe(Language.German);
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();

      // A later session starts from the startup language again, and the
      // profile now says English, still with nothing chosen in the shell: the
      // changed profile language applies. Had the first one been stored as a
      // choice, this boot would have kept German instead.
      await i18nRegistry.setLanguage(Language.English);
      boot();
      applyProfileLanguage(Language.English);

      expect(i18nRegistry.getLanguage()).toBe(Language.English);
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
    });

    it('applies the profile language when storage cannot be read', () => {
      const getItem = vi.spyOn(storageMethods(), 'getItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });

      expect(() => applyProfileLanguage(Language.German)).not.toThrow();
      expect(getItem).toHaveBeenCalled();
      expect(i18nRegistry.getLanguage()).toBe(Language.German);
    });

    it('keeps a choice made while the profile was pending when storage cannot write', () => {
      // Storage refuses every write, the private-window case: the pick is
      // applied but never lands in the key. The choice marker this test
      // leaves set is cleared by the next test's own beforeEach boot.
      const setItem = vi.spyOn(storageMethods(), 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });

      // The user picks German while the profile request is still pending.
      eventBus.emit('i18n/language/changed', { language: Language.German });
      expect(setItem).toHaveBeenCalled();
      expect(i18nRegistry.getLanguage()).toBe(Language.German);
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();

      // The profile arrives with English: the session's own choice wins even
      // though storage never kept it.
      applyProfileLanguage(Language.English);

      expect(i18nRegistry.getLanguage()).toBe(Language.German);
    });
  });

  describe('when an earlier session stored a choice', () => {
    beforeEach(() => {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, Language.German);
      boot();
    });

    it('keeps the stored choice when the fetched profile says something else', () => {
      expect(i18nRegistry.getLanguage()).toBe(Language.German);

      // The user arrives with an English profile: startup already applied the
      // stored German, so the profile fills no gap and the language stays.
      applyProfileLanguage(Language.English);

      expect(i18nRegistry.getLanguage()).toBe(Language.German);
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(Language.German);
    });
  });

  describe('when an earlier session stored a code outside the project list', () => {
    beforeEach(() => {
      // Studio's selector may leave a code the project does not offer; it is
      // no choice of the user's, so the profile decides instead.
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
      boot();
    });

    it('applies the profile language when the stored code is outside the list', () => {
      expect(i18nRegistry.getLanguage()).toBe(Language.English);

      applyProfileLanguage(Language.German);

      expect(i18nRegistry.getLanguage()).toBe(Language.German);
      // The profile apply is not a choice either: the unlisted code stays as
      // it is instead of gaining the profile language.
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
    });
  });
});
