/**
 * Studio is developer tooling. The entry loads it with loadStudioOverlay()
 * before the first render and passes it to the App variants as a prop, so a
 * production build neither imports nor renders it, and the App variants
 * render exactly the overlay they are given. The layout and the screen
 * container are stubbed; only the Studio handoff and the language control a
 * variant asks the layout for are under test.
 */
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const studio = vi.hoisted(() => ({ imported: false }));

// The layout props each App variant handed over, for the test that pins which
// language control a variant asks the header for.
const layoutProps = vi.hoisted(() => [] as Array<{ languageControl?: 'kit' | 'plain' }>);

// The standard Studio mock, shared by the file level `vi.mock` and by the
// failure test that has to reinstall it afterwards. A getter, not a flag set
// in the factory body: Vitest keeps a mocked module across `resetModules`, so
// only a read of the export proves the module was loaded. The import-failure
// case does not rely on this factory: it stubs its own throwing module with
// `vi.doMock`, which is what a broken Studio chunk download looks like to
// loadStudioOverlay, independent of test order.
const mockStudio = vi.hoisted(() => () => ({
  get StudioOverlay() {
    studio.imported = true;
    return () => <div data-testid="studio-overlay" />;
  },
}));

vi.mock('@gears-frontx/studio', () => mockStudio());
vi.mock('@/app/layout', () => ({
  Layout: ({ children, languageControl }: { children?: ReactNode; languageControl?: 'kit' | 'plain' }) => {
    layoutProps.push({ languageControl });
    return <main>{children}</main>;
  },
}));
vi.mock('@/app/mfe/MfeScreenContainer', () => ({ MfeScreenContainer: () => <div data-testid="screen-container" /> }));
vi.mock('@/app/mfe/ScreenLoadFailed', () => ({ ScreenLoadFailed: () => null }));

// loadStudioOverlay reloads the current language once Studio's import has
// registered its translation loader, because that registration alone loads
// nothing. Only i18nRegistry is replaced, following the same spread pattern
// as the layout tests, so anything else importing the module still gets the
// real exports.
const i18n = vi.hoisted(() => ({
  getLanguage: vi.fn((): string | null => null),
  loadLanguage: vi.fn((): Promise<void> => Promise.resolve()),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gears-frontx/react')>()),
  i18nRegistry: { getLanguage: i18n.getLanguage, loadLanguage: i18n.loadLanguage },
}));

describe('loadStudioOverlay', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    studio.imported = false;
    i18n.getLanguage.mockReset();
    i18n.loadLanguage.mockReset();
  });

  it('returns null and never imports the module when the build is not a development build', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const { loadStudioOverlay } = await import('./studioOverlay');

    await expect(loadStudioOverlay()).resolves.toBeNull();
    expect(studio.imported).toBe(false);
  });

  it('returns null and logs once when the Studio chunk fails to load', async () => {
    vi.stubEnv('DEV', true);
    vi.resetModules();
    vi.doMock('@gears-frontx/studio', () => {
      throw new Error('chunk failed');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { loadStudioOverlay } = await import('./studioOverlay');

      await expect(loadStudioOverlay()).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      // doUnmock drops the file level mock for the path as well, so put the
      // standard mock back for whichever test runs next.
      vi.doUnmock('@gears-frontx/studio');
      vi.doMock('@gears-frontx/studio', () => mockStudio());
    }
  });

  it('returns the StudioOverlay component in a development build', async () => {
    vi.stubEnv('DEV', true);
    vi.resetModules();
    const { loadStudioOverlay } = await import('./studioOverlay');

    const overlay = await loadStudioOverlay();

    expect(overlay).toBeTypeOf('function');
    expect(studio.imported).toBe(true);
  });

  it('reloads the current language after the Studio import registered its loader', async () => {
    vi.stubEnv('DEV', true);
    vi.resetModules();
    i18n.getLanguage.mockReturnValue('en');
    const { loadStudioOverlay } = await import('./studioOverlay');

    const overlay = await loadStudioOverlay();

    expect(overlay).toBeTypeOf('function');
    expect(i18n.getLanguage).toHaveBeenCalledTimes(1);
    expect(i18n.loadLanguage).toHaveBeenCalledTimes(1);
    expect(i18n.loadLanguage).toHaveBeenCalledWith('en');
  });

  it('loads no language when none is set yet, leaving it to the first setLanguage', async () => {
    vi.stubEnv('DEV', true);
    vi.resetModules();
    i18n.getLanguage.mockReturnValue(null);
    const { loadStudioOverlay } = await import('./studioOverlay');

    const overlay = await loadStudioOverlay();

    expect(overlay).toBeTypeOf('function');
    expect(i18n.loadLanguage).not.toHaveBeenCalled();
  });

  it('resolves without waiting for loadLanguage', async () => {
    vi.stubEnv('DEV', true);
    vi.resetModules();
    i18n.getLanguage.mockReturnValue('en');
    // loadLanguage never resolves: the real registry never rejects either, it
    // notifies subscribers per namespace and logs its own load failures, so
    // loadStudioOverlay must not hold the overlay for it.
    i18n.loadLanguage.mockReturnValue(new Promise<void>(() => undefined));
    const { loadStudioOverlay } = await import('./studioOverlay');

    const overlay = await loadStudioOverlay();

    expect(overlay).toBeTypeOf('function');
    expect(i18n.loadLanguage).toHaveBeenCalledWith('en');
  });
});

const variants = {
  'App.tsx': () => import('./App'),
  'App.no-uikit.tsx': () => import('./App.no-uikit'),
  'App.no-studio.tsx': () => import('./App.no-studio'),
  'App.no-uikit.no-studio.tsx': () => import('./App.no-uikit.no-studio'),
};

// Which language control each variant asks the layout for: the shell as
// shipped takes the kit's select (undefined, the layout's default), a
// no-UI-kit build the plain native one. A Record over the variant names, so
// a variant without an entry here is a compile error, not a silently
// untested regression.
const languageControls: Record<keyof typeof variants, 'kit' | 'plain' | undefined> = {
  'App.tsx': undefined,
  'App.no-uikit.tsx': 'plain',
  'App.no-studio.tsx': undefined,
  'App.no-uikit.no-studio.tsx': 'plain',
};

type VariantName = keyof typeof variants;
type VariantLoader = (typeof variants)[VariantName];
type StudioVariantName = 'App.tsx' | 'App.no-uikit.tsx';
type NoStudioVariantName = 'App.no-studio.tsx' | 'App.no-uikit.no-studio.tsx';

// The one behavior every variant shares, studio or not: the language control
// it asks the layout for. The no-studio variants take no StudioOverlay prop,
// so the overlay handoff tests stay with the studio variants.
const itAsksTheLayoutForItsLanguageControl = (name: VariantName, load: VariantLoader): void => {
  it('asks the layout for the language control its variant renders', async () => {
    const { default: App } = await load();

    render(<App />);

    expect(layoutProps).toHaveLength(1);
    expect(layoutProps[0]?.languageControl).toBe(languageControls[name]);
  });
};

const studioVariants: Array<[StudioVariantName, (typeof variants)[StudioVariantName]]> = [
  ['App.tsx', variants['App.tsx']],
  ['App.no-uikit.tsx', variants['App.no-uikit.tsx']],
];

const noStudioVariants: Array<[NoStudioVariantName, (typeof variants)[NoStudioVariantName]]> = [
  ['App.no-studio.tsx', variants['App.no-studio.tsx']],
  ['App.no-uikit.no-studio.tsx', variants['App.no-uikit.no-studio.tsx']],
];

describe.each(studioVariants)('%s', (name, load) => {
  afterEach(() => {
    vi.resetModules();
    layoutProps.length = 0;
  });

  it('renders the StudioOverlay it is given', async () => {
    const { default: App } = await load();
    const FakeOverlay: ComponentType = () => <div data-testid="studio-overlay" />;

    render(<App StudioOverlay={FakeOverlay} />);

    expect(screen.getByTestId('screen-container')).toBeTruthy();
    expect(screen.getByTestId('studio-overlay')).toBeTruthy();
  });

  it('renders no Studio when no overlay is passed', async () => {
    const { default: App } = await load();

    render(<App />);

    expect(screen.getByTestId('screen-container')).toBeTruthy();
    expect(screen.queryByTestId('studio-overlay')).toBeNull();
  });

  itAsksTheLayoutForItsLanguageControl(name, load);
});

describe.each(noStudioVariants)('%s', (name, load) => {
  afterEach(() => {
    vi.resetModules();
    layoutProps.length = 0;
  });

  itAsksTheLayoutForItsLanguageControl(name, load);
});
