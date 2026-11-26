import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextDirection } from '@gears-frontx/react';
import {
  FRONTX_SCREEN_DOMAIN,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SHARED_PROPERTY_THEME,
} from '../../shellContract';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { mockShadowHost } from '@frontx-test-utils/mockShadowHost';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHROME_ACTION_SET_LANGUAGE } from '../../shared/extension-ids';

/*
 * The screen module pays its whole Vite transform on first import, and the
 * sibling screen test files cold-start that transform at the same time.
 * Imported here, at file scope, the cost lands in the import phase, outside
 * the per-test budget; a first import inside the first test blows that budget
 * on a cold transform cache, and every later test then finds the previous
 * screen still mounted. The setup helpers re-import the same module registry
 * entry, so they get this instance without paying for it again.
 */
await import('./SettingsScreen');

const { useScreenTranslationsMock } = vi.hoisted(() => ({
  useScreenTranslationsMock: vi.fn(),
}));

vi.mock('../../shared/useScreenTranslations', () => ({
  useScreenTranslations: useScreenTranslationsMock,
}));

/**
 * Stand-in for the kit's RadioGroup, used by the test that feeds the screen a
 * value outside its offered list. The real group is generically typed and
 * hands its change callback whatever it emits, so this one emits on demand:
 * an unlisted code, and German as the positive control proving the same seam
 * still dispatches.
 */
function RadioGroupEmitStub({ onValueChange }: { onValueChange?: (value: unknown) => void }) {
  return (
    <div>
      <button type="button" onClick={() => onValueChange?.('es')}>
        emit-unlisted-language
      </button>
      <button type="button" onClick={() => onValueChange?.('de')}>
        emit-german
      </button>
    </div>
  );
}

type SetupOptions = {
  initialLanguage?: string;
};

async function setupSettingsScreen({ initialLanguage = 'en' }: SetupOptions = {}) {
  const { SettingsScreen } = await import('./SettingsScreen');
  const executeActionsChain = vi.fn().mockReturnValue(undefined);
  const bridgeFixture = createMfeBridgeFixture({
    extDomainId: 'demo-domain',
    extensionId: 'settings-screen',
    executeActionsChain,
    initialProperties: {
      [FRONTX_SHARED_PROPERTY_THEME]: 'default',
      [FRONTX_SHARED_PROPERTY_LANGUAGE]: initialLanguage,
    },
  });

  // Raised before the render, so the screen's mount effect has a host to write
  // its direction on. Attached afterwards, that first pass reaches no host at
  // all and the initial LTR direction is asserted by nothing.
  const { host } = mockShadowHost(HTMLDivElement);
  const { unmount } = render(<SettingsScreen bridge={bridgeFixture.bridge} />);

  await screen.findByRole('heading', { level: 1 });

  return {
    SettingsScreen,
    bridgeFixture,
    executeActionsChain,
    initialLanguage,
    host,
    unmount,
  };
}

/**
 * Renders the screen while its very first dictionary is still loading. The
 * setup helper above cannot be used for that: it waits for the heading, which
 * the first load's skeletons do not have.
 */
async function renderDuringFirstLoad() {
  useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: true });
  const { SettingsScreen } = await import('./SettingsScreen');
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
  const { rerender, unmount } = render(<SettingsScreen bridge={bridgeFixture.bridge} />);

  // Re-renders the same mounted screen with the hook reporting `loading`.
  const renderWithLoading = (loading: boolean) => {
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading });
    rerender(<SettingsScreen bridge={bridgeFixture.bridge} />);
  };

  return { renderWithLoading, unmount };
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('offers the shell project list, English and German, and checks the one the language property carries', async () => {
    const { host, executeActionsChain } = await setupSettingsScreen({ initialLanguage: 'de' });

    // The direction lands on the shadow host, not on the screen root, and
    // `de` resolves to the left-to-right default.
    expect(host.dir).toBe(TextDirection.LeftToRight);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'English' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Deutsch' })).toBeTruthy();

    // The group's value is the shared property, not local state: the property
    // says `de`, so German is the checked one and nothing has been sent.
    expect(screen.getByRole('radio', { name: 'Deutsch' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('de')).toBeTruthy();
    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('sends exactly one set_language chain with the chosen code and the screen domain as target', async () => {
    const { executeActionsChain } = await setupSettingsScreen({ initialLanguage: 'en' });

    expect(executeActionsChain).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Deutsch' }));

    await waitFor(() => {
      expect(executeActionsChain).toHaveBeenCalledTimes(1);
      expect(executeActionsChain).toHaveBeenCalledWith({
        action: {
          type: CHROME_ACTION_SET_LANGUAGE,
          target: FRONTX_SCREEN_DOMAIN,
          payload: { language: 'de' },
        },
      });
    });
  });

  it('sends the other code the same way when the screen opened on German', async () => {
    const { executeActionsChain } = await setupSettingsScreen({ initialLanguage: 'de' });

    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'English' }));

    await waitFor(() => {
      expect(executeActionsChain).toHaveBeenCalledTimes(1);
      expect(executeActionsChain).toHaveBeenCalledWith({
        action: {
          type: CHROME_ACTION_SET_LANGUAGE,
          target: FRONTX_SCREEN_DOMAIN,
          payload: { language: 'en' },
        },
      });
    });
  });

  it('follows a language change published on the shared property without sending the action again', async () => {
    const { bridgeFixture, executeActionsChain } = await setupSettingsScreen({ initialLanguage: 'en' });

    // A change made in the shell header reaches the screen as a property
    // change; the control follows it and no chain goes out from here.
    await act(async () => {
      bridgeFixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'de');
    });

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Deutsch' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe('false');
    });
    expect(screen.getByText('de')).toBeTruthy();
    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('sends nothing when the group hands over a value outside the offered list', async () => {
    vi.resetModules();
    vi.doMock('@gears-frontx/ui-kit', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@gears-frontx/ui-kit')>();
      return { ...actual, RadioGroup: RadioGroupEmitStub as unknown as typeof actual.RadioGroup };
    });
    try {
      const { executeActionsChain } = await setupSettingsScreen({ initialLanguage: 'en' });

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'emit-unlisted-language' }));

      // `es` is a code the screen does not offer: the value the group handed
      // over is narrowed against the screen's own list, so nothing goes out.
      expect(executeActionsChain).not.toHaveBeenCalled();

      // Positive control: the same seam, a listed code, still dispatches.
      await user.click(screen.getByRole('button', { name: 'emit-german' }));
      await waitFor(() => {
        expect(executeActionsChain).toHaveBeenCalledTimes(1);
        expect(executeActionsChain).toHaveBeenCalledWith({
          action: {
            type: CHROME_ACTION_SET_LANGUAGE,
            target: FRONTX_SCREEN_DOMAIN,
            payload: { language: 'de' },
          },
        });
      });
    } finally {
      vi.doUnmock('@gears-frontx/ui-kit');
      vi.resetModules();
    }
  });

  it('keeps the radio group in the document with the focus kept when a later load begins', async () => {
    const { bridgeFixture } = await setupSettingsScreen({ initialLanguage: 'en' });

    // A keyboard user has just chosen German, so the radio holds the focus.
    const germanRadio = screen.getByRole('radio', { name: 'Deutsch' });
    germanRadio.focus();
    expect(document.activeElement).toBe(germanRadio);

    // The language property comes back changed while the dictionary for it
    // is still loading. That is a later load, not the first one: the group
    // stays in the document and keeps the focus instead of giving way to
    // skeletons.
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: true });
    await act(async () => {
      bridgeFixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'de');
    });

    expect(screen.getByRole('radiogroup').isConnected).toBe(true);
    expect(screen.getByRole('radio', { name: 'Deutsch' })).toBe(germanRadio);
    expect(germanRadio.isConnected).toBe(true);
    expect(document.activeElement).toBe(germanRadio);
  });

  /*
   * The cold first frame may show the placeholder, but its root is the screen
   * root, which the screen's CSS Module holds at the host's height: the area
   * below the header must not collapse to the skeleton and grow once the
   * dictionary lands. The suite ships the module's real CSS (`css: true`), so
   * the computed style pins the declaration through the same cascade a browser
   * runs.
   */
  it('keeps the cold loading frame as tall as the screen slot', async () => {
    const { renderWithLoading, unmount } = await renderDuringFirstLoad();
    expect(screen.getByRole('status')).toBeTruthy();

    const loadingRoot = screen.getByRole('status');
    expect(getComputedStyle(loadingRoot).minHeight).toBe('100%');

    // Once the dictionary lands the branch is gone; the loaded root keeps the
    // screen root's own class, so it stays as tall as the slot.
    renderWithLoading(false);
    expect(screen.queryByRole('status')).toBeNull();
    const loadedRoot = screen
      .getByRole('heading', { level: 1 })
      .closest('[data-theme]') as HTMLElement | null;
    expect(loadedRoot).toBeTruthy();
    expect(getComputedStyle(loadedRoot as HTMLElement).minHeight).toBe('100%');
    unmount();
  });

  it('opens on skeletons for the first load and brings the controls in once it lands', async () => {
    const { renderWithLoading } = await renderDuringFirstLoad();

    // First load: the skeletons stand in for a screen that has no words yet,
    // and no radio exists that a focus could be lost from.
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();

    // The dictionary lands and the controls arrive.
    renderWithLoading(false);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('keeps the controls of the screen the first load opened through a second load', async () => {
    // The sequence the real hook produces on one mounted screen: the first
    // dictionary loads, it lands, and a language change starts another load.
    const { renderWithLoading } = await renderDuringFirstLoad();
    expect(screen.getByRole('status')).toBeTruthy();

    renderWithLoading(false);
    const germanRadio = screen.getByRole('radio', { name: 'Deutsch' });

    // The second load keeps the same radios in place and only marks the
    // screen busy; the first load's skeletons do not come back.
    renderWithLoading(true);

    expect(screen.queryByRole('status')).toBeNull();
    expect(germanRadio.isConnected).toBe(true);
    expect(screen.getByRole('radio', { name: 'Deutsch' })).toBe(germanRadio);
    expect(germanRadio.closest('[aria-busy="true"]')).not.toBeNull();
  });
});
