import sharedEn from '../i18n/en.json';
import type { Translate } from '../i18n/translate';

/**
 * What the checks need of the test runner. It comes in as an argument rather
 * than an import: this folder sits outside every package, and an import of
 * `vitest` from here could resolve to another copy than the one running the
 * suite.
 */
export type CatalogueTestRunner = {
  describe: (name: string, body: () => void) => unknown;
  it: (name: string, body: () => void) => unknown;
  expect: (actual: unknown, message?: string) => {
    toEqual: (expected: unknown) => void;
    toContain: (expected: unknown) => void;
    toBe: (expected: unknown) => void;
  };
};

/**
 * The checks every screen package's catalogue passes, one suite per package:
 * its keys stay out of the shared layer, every plural form in either layer
 * has its other form, and the translator the frame builds carries the menu
 * label and the document title.
 *
 * @param runner - The suite's `describe`, `it` and `expect`
 * @param en - The package's own `en.json`
 * @param t - The translator the frame builds for `en` (`test-support/translate.ts`)
 * @param label - The screen's menu label in English, e.g. `Chat`
 */
export function describeScreenCatalogue(
  { describe, it, expect }: CatalogueTestRunner,
  en: Record<string, string>,
  t: Translate,
  label: string
): void {
  describe(`the ${label.toLowerCase()} screen's catalogue`, () => {
    it("keeps the screen's keys out of the shared layer, so a package override is always deliberate", () => {
      const shared = new Set(Object.keys(sharedEn));
      expect(Object.keys(en).filter((key) => shared.has(key))).toEqual([]);
    });

    it('pairs every plural form with its other form, in both layers', () => {
      for (const catalogue of [sharedEn, en]) {
        for (const key of Object.keys(catalogue)) {
          const match = /^(.*)_one$/.exec(key);
          if (match) expect(Object.keys(catalogue), key).toContain(`${match[1]}_other`);
        }
      }
    });

    it('carries the menu label and the document title the frame reads', () => {
      expect(t('nav_label')).toBe(label);
      expect(t('document_title', { section: t('nav_label') })).toBe(`${label} - Workspace`);
    });
  });
}
