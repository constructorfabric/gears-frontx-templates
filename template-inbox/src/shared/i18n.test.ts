import { describe, expect, it, vi } from 'vitest';
import en from '../i18n/en.json';
import { createTranslate, t } from './i18n';

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

describe('the shipped catalogue', () => {
  it('pairs every plural form with its other form', () => {
    for (const key of Object.keys(en)) {
      const match = /^(.*)_one$/.exec(key);
      if (match) expect(Object.keys(en), key).toContain(`${match[1]}_other`);
    }
  });

  it('reads the shipped plurals', () => {
    expect(t('people_count', { count: 1 })).toBe('1 person');
    expect(t('people_count', { count: 29 })).toBe('29 people');
    expect(t('earlier_messages', { count: 2 })).toBe('2 earlier messages');
  });
});
