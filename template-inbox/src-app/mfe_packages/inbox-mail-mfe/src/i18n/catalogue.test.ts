import { describe, expect, it } from 'vitest';
import sharedEn from '@inbox-shared/i18n/en.json';
import en from './en.json';
import { t } from '../test-support/translate';

describe("the mail screen's catalogue", () => {
  it("keeps the screen's keys out of the shared layer, so a package override is always deliberate", () => {
    const shared = new Set(Object.keys(sharedEn));
    expect(Object.keys(en).filter((key) => shared.has(key))).toEqual([]);
  });

  it('pairs every plural form with its other form', () => {
    for (const key of Object.keys(en)) {
      const match = /^(.*)_one$/.exec(key);
      if (match) expect(Object.keys(en), key).toContain(`${match[1]}_other`);
    }
  });

  it('carries the menu label and the document title the frame reads', () => {
    expect(t('nav_label')).toBe('Mail');
    expect(t('document_title', { section: t('nav_label') })).toBe('Mail - Workspace');
  });
});
