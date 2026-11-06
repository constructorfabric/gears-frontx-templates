import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createThemeRegistry, type ThemeConfig, type ThemeRegistry } from '@gears-frontx/react';
import { THEME_ID_ATTRIBUTE, stampAppliedThemeId } from './themeIdAttribute';
import { THEME_STORAGE_KEY, applyPersistedTheme } from './themePersistence';

const theme = (id: string, isDefault = false): ThemeConfig => ({
  id,
  name: id,
  default: isDefault,
  variables: { '--background': id },
});

const registryWith = (): ThemeRegistry => {
  const registry = createThemeRegistry();
  registry.register(theme('default', true));
  registry.register(theme('dark'));
  registry.register(theme('dracula'));
  return registry;
};

const stampedId = (): string | null => document.documentElement.getAttribute(THEME_ID_ATTRIBUTE);

describe('stampAppliedThemeId', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    document.head.querySelector('#frontx-theme-vars')?.remove();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute(THEME_ID_ATTRIBUTE);
  });

  it('stamps the theme applied at boot', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dracula');
    const registry = registryWith();

    applyPersistedTheme(registry, 'default');
    stampAppliedThemeId(registry);

    expect(stampedId()).toBe('dracula');
  });

  it('stamps the fallback in place of a stored id that is not registered', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'drakula');
    const registry = registryWith();

    applyPersistedTheme(registry, 'default');
    stampAppliedThemeId(registry);

    expect(stampedId()).toBe('default');
  });

  it('stamps every theme applied later', () => {
    const registry = registryWith();
    applyPersistedTheme(registry, 'default');
    stampAppliedThemeId(registry);

    registry.apply('dark');
    expect(stampedId()).toBe('dark');

    registry.apply('dracula');
    expect(stampedId()).toBe('dracula');
  });
});
