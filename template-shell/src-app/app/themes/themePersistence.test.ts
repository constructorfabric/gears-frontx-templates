import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThemeRegistry, type ThemeConfig, type ThemeRegistry } from '@gears-frontx/react';
import { THEME_STORAGE_KEY, applyPersistedTheme } from './themePersistence';

const theme = (id: string, isDefault = false): ThemeConfig => ({
  id,
  name: id,
  default: isDefault,
  variables: { '--background': id },
});

/** A registry holding the same two themes the shell would register before applying one. */
const registryWith = (): ThemeRegistry => {
  const registry = createThemeRegistry();
  registry.register(theme('default', true));
  registry.register(theme('dark'));
  return registry;
};

/**
 * Where the localStorage the code uses gets its methods: the Storage prototype,
 * or the object itself when vitest.setup.ts installed its in-memory stand-in.
 */
const storageMethods = (): Storage =>
  Object.getPrototypeOf(window.localStorage) === Storage.prototype ? Storage.prototype : window.localStorage;

describe('applyPersistedTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.head.querySelector('#frontx-theme-vars')?.remove();
    document.documentElement.removeAttribute('data-theme');
  });

  it('applies the fallback theme on a first visit', () => {
    const registry = registryWith();

    applyPersistedTheme(registry, 'dark');

    expect(registry.getCurrent()?.id).toBe('dark');
  });

  it('applies the theme chosen in an earlier session', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const registry = registryWith();

    applyPersistedTheme(registry, 'default');

    expect(registry.getCurrent()?.id).toBe('dark');
  });

  it('keeps every later choice for the next session', () => {
    const registry = registryWith();
    applyPersistedTheme(registry, 'default');

    registry.apply('dark');

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('falls back when the stored theme is no longer registered', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'removed-theme');
    const registry = registryWith();

    applyPersistedTheme(registry, 'dark');

    expect(registry.getCurrent()?.id).toBe('dark');
  });

  it('boots on the fallback when storage cannot be read', () => {
    const getItem = vi.spyOn(storageMethods(), 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const registry = registryWith();

    expect(() => applyPersistedTheme(registry, 'dark')).not.toThrow();
    expect(getItem).toHaveBeenCalled();
    expect(registry.getCurrent()?.id).toBe('dark');
  });

  it('still switches themes when storage cannot be written', () => {
    const setItem = vi.spyOn(storageMethods(), 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const registry = registryWith();
    applyPersistedTheme(registry, 'default');

    expect(() => registry.apply('dark')).not.toThrow();
    expect(setItem).toHaveBeenCalled();
    expect(registry.getCurrent()?.id).toBe('dark');
  });
});
