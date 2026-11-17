/**
 * The header's language control, in both renderings: the kit select the shell
 * ships with and the plain native select the no-UI-kit variants ask for. Both
 * run against the real i18n wiring - the plugin, the registry, the shell
 * namespace's words - so a change here is a change of language, not of a stub.
 */
import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFrontX, FrontXProvider, i18n, i18nRegistry, Language } from '@gears-frontx/react';
import { Header } from './Header';
import '@/app/i18n/shellTranslations';

// One app for the file: a runtime builds exactly one, and every variant mounts
// under it the way both entries mount their header under the shell's app.
const app = createFrontX().use(i18n()).build();

/**
 * Mounts the header the way the shell runs it: the language settled first,
 * the way the i18n plugin's startup load leaves it. English unless a test
 * asks for another one, since Studio can put the shell on any of the SDK's
 * languages, listed here or not.
 */
const renderHeader = async (languageControl?: 'kit' | 'plain', language: Language = Language.English) => {
  await act(async () => {
    await i18nRegistry.setLanguage(language);
  });

  render(
    <FrontXProvider app={app}>
      <Header {...(languageControl === undefined ? {} : { languageControl })} />
    </FrontXProvider>,
  );
};

const optionNames = (select: Element): string[] =>
  Array.from(select.querySelectorAll('option')).map((option) => option.textContent ?? '');

describe.each([
  ['the kit select', undefined],
  ['the plain native select', 'plain'],
] as const)('the header language control, %s', (_name, languageControl) => {
  it('shows the current language and lists the project languages by their own names', async () => {
    await renderHeader(languageControl);

    const select = screen.getByRole('combobox', { name: 'Language' }) as HTMLSelectElement;
    expect(select.value).toBe('en');
    expect(optionNames(select)).toEqual(['English', 'Deutsch']);
  });

  it('switches the language, and the accessible name follows the shell words', async () => {
    await renderHeader(languageControl);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'de');

    // The switch went through setLanguage: the words and the select's own
    // accessible name come back in German once the dictionaries have landed.
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: 'Sprache' }) as HTMLSelectElement;
      expect(select.value).toBe('de');
    });
  });

  it('shows an unlisted current language as a disabled option and can switch back to a listed one', async () => {
    // Studio can put the shell on any of the SDK's languages, here one the
    // project does not list. Without the disabled option the select would
    // show "English" while the app is in French, and picking English then
    // fired no change event, so this is the branch that keeps the way back.
    await renderHeader(languageControl, Language.French);

    const select = screen.getByRole('combobox', { name: 'Language' }) as HTMLSelectElement;
    expect(select.value).toBe('fr');
    const unlisted = Array.from(select.querySelectorAll('option')).find((option) => option.value === 'fr');
    expect(unlisted?.disabled).toBe(true);

    await userEvent.selectOptions(select, 'en');

    // The switch went out through setLanguage: the registry follows and the
    // select lists the project's languages again, disabled option gone.
    await waitFor(() => expect(i18nRegistry.getLanguage()).toBe(Language.English));
    await waitFor(() => expect(optionNames(select)).toEqual(['English', 'Deutsch']));
  });
});
