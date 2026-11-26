import { afterEach, describe, expect, it, vi } from 'vitest';
import { eventBus, Language, type FrontXApp } from '@gears-frontx/react';
import type { MfeRegistry } from '@gears-frontx/react/mfe';
import { createHostApp } from '@frontx-test-utils/createHostApp';
import {
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SHARED_PROPERTY_THEME,
} from '../../../src/index';
import { publishThemeAndLanguage } from './sharedProperties';

/** A registry whose `updateSharedProperty` records the shared properties published to it. */
function fakeRegistry(): { registry: MfeRegistry; updateSharedProperty: ReturnType<typeof vi.fn> } {
  const { registry } = createHostApp();
  const updateSharedProperty = vi.spyOn(registry, 'updateSharedProperty').mockImplementation(() => undefined);
  return { registry, updateSharedProperty };
}

/** An app whose current theme and language are the given ones. */
function fakeApp(themeId: string | undefined, language: Language | null): FrontXApp {
  const { app } = createHostApp();
  vi.spyOn(app.themeRegistry, 'getCurrent').mockReturnValue(
    themeId ? { id: themeId, name: themeId, variables: {} } : undefined,
  );
  vi.spyOn(app.i18nRegistry, 'getLanguage').mockReturnValue(language);
  return app;
}

describe('publishThemeAndLanguage', () => {
  const stops: Array<() => void> = [];

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    vi.restoreAllMocks();
  });

  it('publishes the current theme and language at once', () => {
    const { registry, updateSharedProperty } = fakeRegistry();

    stops.push(publishThemeAndLanguage(fakeApp('dark', Language.German), registry));

    expect(updateSharedProperty.mock.calls).toEqual([
      [FRONTX_SHARED_PROPERTY_THEME, 'dark'],
      [FRONTX_SHARED_PROPERTY_LANGUAGE, 'de'],
    ]);
  });

  it('publishes nothing at once when there is no current theme or language', () => {
    const { registry, updateSharedProperty } = fakeRegistry();

    stops.push(publishThemeAndLanguage(fakeApp(undefined, null), registry));

    expect(updateSharedProperty).not.toHaveBeenCalled();
  });

  it('publishes every later theme and language change', () => {
    const { registry, updateSharedProperty } = fakeRegistry();
    stops.push(publishThemeAndLanguage(fakeApp(undefined, null), registry));

    eventBus.emit('theme/changed', { themeId: 'light' });
    eventBus.emit('i18n/language/changed', { language: 'fr' });

    expect(updateSharedProperty.mock.calls).toEqual([
      [FRONTX_SHARED_PROPERTY_THEME, 'light'],
      [FRONTX_SHARED_PROPERTY_LANGUAGE, 'fr'],
    ]);
  });

  it('logs a failure to publish the current values and keeps publishing changes', () => {
    const { registry, updateSharedProperty } = fakeRegistry();
    updateSharedProperty.mockImplementationOnce(() => {
      throw new Error('rejected');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    stops.push(publishThemeAndLanguage(fakeApp('dark', Language.German), registry));
    eventBus.emit('theme/changed', { themeId: 'light' });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(updateSharedProperty).toHaveBeenLastCalledWith(FRONTX_SHARED_PROPERTY_THEME, 'light');
  });

  it('only logs a failed theme change, without throwing', () => {
    const { registry, updateSharedProperty } = fakeRegistry();
    stops.push(publishThemeAndLanguage(fakeApp(undefined, null), registry));
    const error = new Error('rejected');
    updateSharedProperty.mockImplementation(() => {
      throw error;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const emitSpy = vi.spyOn(eventBus, 'emit');

    expect(() => eventBus.emit('theme/changed', { themeId: 'light' })).not.toThrow();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('[Gears FrontX] Failed to propagate theme to MFE domains', error);
    expect(emitSpy.mock.calls.map(([event]) => event)).toEqual(['theme/changed']);
  });

  it('only logs a failed language change, without throwing', () => {
    const { registry, updateSharedProperty } = fakeRegistry();
    stops.push(publishThemeAndLanguage(fakeApp(undefined, null), registry));
    const error = new Error('rejected');
    updateSharedProperty.mockImplementation(() => {
      throw error;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const emitSpy = vi.spyOn(eventBus, 'emit');

    expect(() => eventBus.emit('i18n/language/changed', { language: 'fr' })).not.toThrow();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('[Gears FrontX] Failed to propagate language to MFE domains', error);
    expect(emitSpy.mock.calls.map(([event]) => event)).toEqual(['i18n/language/changed']);
  });

  it('stops publishing changes once stopped', () => {
    const { registry, updateSharedProperty } = fakeRegistry();
    const stop = publishThemeAndLanguage(fakeApp(undefined, null), registry);

    stop();
    eventBus.emit('theme/changed', { themeId: 'light' });
    eventBus.emit('i18n/language/changed', { language: 'fr' });

    expect(updateSharedProperty).not.toHaveBeenCalled();
  });
});
