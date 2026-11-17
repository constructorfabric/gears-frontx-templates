/**
 * Language persistence: the language a user picks survives a reload.
 *
 * The shell owns this rather than FrontX Studio, because Studio is a dev tool
 * and a built app has to remember the choice as well. It mirrors how the
 * theme persists (themePersistence.ts): storage is read and written through
 * try/catch, so a private window, blocked site data or a full quota makes
 * `localStorage` throw and none of that stops the app from booting or a
 * language from switching. Losing the choice is the worst case.
 *
 * Precedence, in the order the shell applies it: the choice the shell stored
 * wins, the profile language fetched with the user is the default when nothing
 * usable is stored, and English, the i18n plugin's startup language, is the
 * fallback when neither names a language the project lists.
 *
 * The key holds the last explicit choice made in the shell, and it is written
 * on every `i18n/language/changed` event the user starts: the header control,
 * a screen's set_language action, the Studio selector. The language the
 * fetched user profile applies is the default, not a choice, so that one
 * change is not stored - storing it would pin the first profile language as a
 * choice and a later change of it on the server would never reach the shell.
 * Studio is development-only, and this module does not change its package.
 * Studio keeps its own key, so the two can disagree: in development, with
 * Studio mounted, Studio's own restore saves the profile-applied language
 * under its key and replays it at the next start, and the shell then stores
 * that replayed language as a choice. A production build has no Studio. A
 * stored code the project does not list is simply ignored at startup instead
 * of being cleaned up: a project that later adds the language gets the choice
 * back for free.
 *
 * Storage can refuse a write, and the choice a user makes in the running
 * session still governs that session then: a marker set beside every write
 * tells `applyProfileLanguage` to stand down, so a profile arriving late
 * cannot undo a pick the key never managed to keep.
 */
import { eventBus, i18nRegistry, type Subscription } from '@gears-frontx/react';
import { isShellLanguage } from './shellLanguages';

/** localStorage key holding the code of the last applied language. */
export const LANGUAGE_STORAGE_KEY = 'frontx:shell:language';

function readStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeLanguage(language: string): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Not remembered this time; the language itself is already applied.
  }
}

/**
 * Applies a language when the project lists it, and only then.
 *
 * The event, not a direct registry call, is what applies the language: the
 * i18n plugin loads the translations for it, and the microfrontends plugin
 * forwards the same event to every mounted screen as the language shared
 * property, so screens follow even when the registry was built earlier. A
 * language that is already live is not emitted again - the load and the
 * broadcast would only repeat what is in place.
 *
 * Called with the stored code at startup, so the stored choice is in place
 * before the user arrives; the profile goes through `applyProfileLanguage`,
 * which keeps that choice.
 */
export function applyListedLanguage(language: string): void {
  if (!isShellLanguage(language)) {
    return;
  }
  if (i18nRegistry.getLanguage() === language) {
    return;
  }
  eventBus.emit('i18n/language/changed', { language });
}

/**
 * Set while the language of the fetched profile is being applied. The listener
 * in `applyPersistedLanguage` reads it to skip that one change event, so a
 * profile-applied language is never stored as a choice of the user's.
 */
let applyingProfileLanguage = false;

/**
 * Set once the user has made an explicit language choice in this session.
 *
 * The persistence listener in `applyPersistedLanguage` sets it on every
 * choice it is about to store, whether or not the write succeeds: a private
 * window, blocked site data or a full quota makes storage refuse the write,
 * and the pick the user just made must still count. Without it, a choice
 * made while the profile request is pending is lost the moment the profile
 * arrives: the key holds nothing, so the storage-only guard finds no choice
 * and the profile language replaces the user's. The marker lives for one
 * session; a reload starts a new one and reads the stored choice again.
 */
let explicitChoiceInSession = false;

/**
 * Applies the language of the fetched user, the default when the shell has no
 * usable choice of its own.
 *
 * Only a stored code the project lists counts as that choice: nothing stored,
 * or a stored code outside the list (a project that dropped a language, a
 * Studio selector writing something else), leaves the profile in charge. A
 * stored usable code wins even when the profile disagrees, because the user
 * changed the language in the shell after the profile was last saved.
 *
 * A choice made in this session counts the same way even when storage could
 * not keep it: the user can pick a language while the profile request is
 * still pending, and with the write refused the key holds nothing to read.
 * The marker set beside every stored write (see `applyPersistedLanguage`)
 * stands in for the key then, and the profile stands down as it does for a
 * stored choice.
 *
 * The profile language is applied but never stored: it is the default, not a
 * choice, so storing it would turn the first profile language ever seen into
 * a stored choice, and a later change of it on the server would never reach
 * the shell. The flag around the apply marks the event it sends, and the
 * persistence listener lets that one pass by without writing the key.
 */
export function applyProfileLanguage(language: string): void {
  const stored = readStoredLanguage();
  if (isShellLanguage(stored) || explicitChoiceInSession) {
    return;
  }
  applyingProfileLanguage = true;
  try {
    applyListedLanguage(language);
  } finally {
    applyingProfileLanguage = false;
  }
}

/**
 * Applies the language stored by an earlier session, before the first render,
 * and remembers every later explicit choice. Call it once, after the app is
 * built: the i18n plugin's subscription has to exist for the stored choice to
 * reach the registry. English, the plugin's startup language, stays in force
 * when nothing usable is stored; `applyProfileLanguage` then lets the
 * profile's language replace it, and English remains the fallback when that
 * is not listed either.
 *
 * Returns the bus subscription, so a caller that owns the app's lifetime can
 * remove the listener again.
 */
export function applyPersistedLanguage(): Subscription {
  // One call is one session, and the marker of an explicit choice does not
  // outlive it: a boot starting over begins from fresh module state, the way
  // a reload does.
  explicitChoiceInSession = false;

  const stored = readStoredLanguage();
  if (stored !== null) {
    applyListedLanguage(stored);
  }

  // After the apply: the startup choice is already the stored one. Every later
  // change the user starts is remembered; the change the profile apply sends
  // arrives while `applyingProfileLanguage` is set and is not stored here.
  // Studio, development-only, does not follow that rule: its own restore can
  // replay a profile language at the next start, and this listener stores the
  // replayed language as a choice. A production build has no Studio.
  return eventBus.on('i18n/language/changed', ({ language }) => {
    // A real string only: the payload is typed, but emit delivers whatever a
    // caller passes, and an emitter that omits or misnames the field hands
    // `undefined` over. Storing that would write the literal string
    // "undefined" over the user's last choice.
    if (!applyingProfileLanguage && typeof language === 'string') {
      // Counted before the write: storage can refuse it, and the pick the
      // user just made still governs this session even when the key could
      // not keep it.
      explicitChoiceInSession = true;
      storeLanguage(language);
    }
  });
}
