import { describe, expect, it, vi } from 'vitest';
import sharedEn from '@inbox-shared/i18n/en.json';
import { createTranslate } from '@inbox-shared/i18n/translate';
import { catalogueFor } from '@inbox-shared/i18n/useInboxTranslate';

const catalogue = {
  greeting: 'Hello, {name}',
  items_one: '{count} item',
  items_other: '{count} items',
  plain: 'Plain',
};

describe('createTranslate', () => {
  const translate = createTranslate(catalogue, 'en-US');

  it('returns a value as it is when the call passes no parameters', () => {
    expect(translate('plain')).toBe('Plain');
  });

  it('fills named parameters, and leaves one the call did not pass visible', () => {
    expect(translate('greeting', { name: 'Ada' })).toBe('Hello, Ada');
    expect(translate('greeting', {})).toBe('Hello, {name}');
  });

  it("picks the plural form for the count through the locale's plural rules", () => {
    expect(translate('items', { count: 1 })).toBe('1 item');
    expect(translate('items', { count: 0 })).toBe('0 items');
    expect(translate('items', { count: 2 })).toBe('2 items');
  });

  it("writes a number parameter with the locale's digit grouping", () => {
    expect(translate('items', { count: 12_500 })).toBe('12,500 items');
  });

  it('returns a missing key as itself and warns once per key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(translate('absent')).toBe('absent');
    expect(translate('absent')).toBe('absent');
    expect(translate('also_absent')).toBe('also_absent');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('catalogueFor', () => {
  const screen = { en: { screen_title: 'Title', retry: 'Screen retry' }, de: { screen_title: 'Titel' } };

  it("merges the screen's catalogue over the shared one", () => {
    const catalogue = catalogueFor('en', screen);
    expect(catalogue.screen_title).toBe('Title');
    expect(catalogue.load_error_title).toBe(sharedEn.load_error_title);
    expect(catalogue.retry).toBe('Screen retry');
  });

  it('falls back to en as a whole when either layer lacks the language', () => {
    expect(catalogueFor('de', screen).screen_title).toBe('Title');
    expect(catalogueFor('xx', screen).screen_title).toBe('Title');
  });
});
