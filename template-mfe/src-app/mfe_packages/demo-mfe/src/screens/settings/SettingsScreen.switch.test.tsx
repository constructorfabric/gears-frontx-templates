/*
 * The switch the mocked suite cannot exercise: this file keeps the real
 * `useScreenTranslations`, so the German dictionary really is in flight while
 * the assertions run, and what is pinned is the hook's hold, not a mock's
 * `loading: false`. While a switch loads, no render may show the loading
 * region or a busy mark, and the focused German radio may be neither replaced
 * nor unfocused; when the dictionary lands, the German words take over in
 * place.
 *
 * The screen's own suite keeps the screen-side contract (a later load with the
 * hook forced to `loading: true` keeps the controls and marks the screen
 * busy); this one pins what the real hook feeds that contract.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SHARED_PROPERTY_THEME,
} from '../../shellContract';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { mockShadowHost } from '@frontx-test-utils/mockShadowHost';
import { describe, expect, it, vi } from 'vitest';
import { SettingsScreen } from './SettingsScreen';

/*
 * The German module is held in flight on purpose. A warm module cache can
 * settle the import inside the act flush, and the hold assertions would then
 * run after the switch has finished, testing nothing. Everything else stays
 * real - the hook, the screen, the en dictionary - and the held module
 * resolves with the German words the screen ships, so the landing assertions
 * read the real dictionary.
 */
const germanModule = vi.hoisted(() => {
  let resolveGerman: (module: { default: Record<string, string> }) => void = () => {};
  const promise = new Promise<{ default: Record<string, string> }>((resolve) => {
    resolveGerman = resolve;
  });
  return { promise, resolveGerman };
});

vi.mock('./i18n/de.json', () => germanModule.promise);

describe('SettingsScreen over the real translation hook', () => {
  it('keeps the radio group and its focus through a language switch', async () => {
    const bridgeFixture = createMfeBridgeFixture({
      extDomainId: 'demo-domain',
      extensionId: 'settings-screen',
      executeActionsChain: vi.fn().mockReturnValue(undefined),
      initialProperties: {
        [FRONTX_SHARED_PROPERTY_THEME]: 'default',
        [FRONTX_SHARED_PROPERTY_LANGUAGE]: 'en',
      },
    });
    mockShadowHost(HTMLDivElement);
    const { container, unmount } = render(<SettingsScreen bridge={bridgeFixture.bridge} />);

    try {
      // First load: the English dictionary arrives and the controls mount.
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Settings');
      });

      /*
       * The watch on every later commit: any skeleton region or busy mark that
       * flashes up while the switch loads is a broken hold, even one that only
       * lasts a render. MutationObserver delivers between React's commits, so
       * nothing the switch produces can slip past unrecorded.
       */
      const violations: string[] = [];
      const observer = new MutationObserver(() => {
        if (container.querySelector('[role="status"]') !== null) {
          violations.push('a loading region rendered');
        }
        if (container.firstElementChild?.getAttribute('aria-busy') === 'true') {
          violations.push('the screen root was marked busy');
        }
      });
      observer.observe(container, {
        attributes: true,
        attributeFilter: ['aria-busy'],
        childList: true,
        subtree: true,
      });

      // A keyboard user has just chosen German, so the radio holds the focus.
      const germanRadio = screen.getByRole('radio', { name: 'Deutsch' });
      germanRadio.focus();
      expect(document.activeElement).toBe(germanRadio);

      // The shell publishes the language; the German dictionary import starts
      // here and is still in flight during the next assertions.
      await act(async () => {
        bridgeFixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'de');
      });

      // Prove this really is the hold window: the heading still reads the old
      // words, so the German dictionary has not landed under the assertions.
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Settings');
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByRole('radiogroup').isConnected).toBe(true);
      expect(screen.getByRole('radio', { name: 'Deutsch' })).toBe(germanRadio);
      expect(germanRadio.isConnected).toBe(true);
      expect(document.activeElement).toBe(germanRadio);

      // The German dictionary lands and the words swap in place, on the same
      // radios the switch started with.
      await act(async () => {
        germanModule.resolveGerman({
          default: {
            title: 'Einstellungen',
            description:
              'Ein Beispiel-Bildschirm für Einstellungen. Die hier gewählte Sprache geht als set_language-Aktion an die Shell, die sie für sich und alle Bildschirme anwendet.',
            language_title: 'Sprache',
            language_description:
              'Wählen Sie die Sprache, in der die Shell und ihre Bildschirme erscheinen. Der Schalter zeigt die Sprache, die die Shell gerade nutzt, und folgt damit auch einer Änderung über die Kopfzeile der Shell.',
            current_language: 'Aktuelle Sprache:',
          },
        });
      });
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Einstellungen');
      });

      expect(screen.getByRole('radio', { name: 'Deutsch' })).toBe(germanRadio);
      expect(document.activeElement).toBe(germanRadio);
      expect(violations).toEqual([]);

      observer.disconnect();
    } finally {
      unmount();
    }
  });
});
