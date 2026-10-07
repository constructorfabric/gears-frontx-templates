import { describe, expect, it } from 'vitest';
import { describeScreenCatalogue } from '@inbox-shared/test-support/describeScreenCatalogue';
import en from './en.json';
import { t } from '../test-support/translate';

describeScreenCatalogue({ describe, it, expect }, en, t, 'Contacts');

describe("the contacts screen's plurals", () => {
  it('reads the shipped plurals', () => {
    expect(t('people_count', { count: 1 })).toBe('1 person');
    expect(t('people_count', { count: 29 })).toBe('29 people');
  });
});
