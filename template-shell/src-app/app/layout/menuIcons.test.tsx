/**
 * Tests for the bundled menu icons at run time (`menuIcons.ts` + `Menu.tsx`).
 *
 * The icons file is a build product the shell serves itself, so the invariants
 * here are about what reaches the network and what renders when it is missing:
 * - with the collections registered, every icon-bearing item renders its svg
 *   and every fetch the menu path makes is the shell's own local file - the
 *   offline Icon build must never reach an icon API;
 * - a missing icons file leaves the menu working without icons and costs one
 *   console warning, not an error and not a broken page;
 * - an icon the registered collections do not carry (an MFE deployed apart
 *   from this build) renders no icon and warns once per name in dev.
 *
 * Each case imports `./Menu` and `./menuIcons` after `vi.resetModules()`, so
 * the module-level registration state of `menuIcons.ts` is fresh per test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import type { ScreenExtension } from '../../../src/index';
import type { IconifyJSON } from '@iconify/react';

const mockBootstrapSettled = vi.fn();
let mockMenuState: { collapsed: boolean } | undefined;

vi.mock('@/app/mfe/bootstrapOnce', () => ({
  bootstrapSettled: () => mockBootstrapSettled(),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gears-frontx/react')>()),
  useAppSelector: () => mockMenuState,
  useFrontX: () => mockUseFrontX(),
  useTranslation: () => ({
    t: (key: string) => key,
    language: 'en',
    setLanguage: () => {},
    isRTL: false,
  }),
}));

const mockUseFrontX = vi.fn();

/** A minimal lucide collection shaped like what the generator writes. */
const lucideCollection: IconifyJSON = {
  prefix: 'lucide',
  icons: {
    home: { body: '<path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-16a1 1 0 0 1-1-1z"/>' },
  },
  width: 24,
  height: 24,
};

const screenExtension = (id: string, icon?: string): ScreenExtension => ({
  id,
  domain: 'screen-domain',
  entry: `${id}.entry`,
  route: `/${id}`,
  presentation: { label: id, order: 10, ...(icon ? { icon } : {}) },
});

let app: {
  mfeRegistry: {
    getExtensionsForDomain: ReturnType<typeof vi.fn>;
    executeActionsChain: ReturnType<typeof vi.fn>;
  };
  i18nRegistry: {
    getLanguage: () => string;
    subscribe: (listener: () => void) => () => void;
    t: (key: string) => string;
  };
};

type FetchCall = { url: string };
let fetchCalls: FetchCall[];

/**
 * Stubs global fetch: records every call, answers the icons file from
 * `iconsResponse` and any other URL with a 404, so an unexpected external
 * request shows up both as a recorded non-local URL and as a failing one.
 */
function stubFetch(iconsResponse: { status: number; body?: string }): void {
  fetchCalls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    fetchCalls.push({ url });
    if (url.endsWith('/generated-menu-icons.json')) {
      return new Response(iconsResponse.body ?? '', { status: iconsResponse.status });
    }
    return new Response('not found', { status: 404 });
  }));
}

/** Menu and menuIcons freshly imported, so the module state is this test's own. */
async function loadModules(): Promise<{
  Menu: ComponentType;
  menuIcons: typeof import('./menuIcons');
}> {
  const { Menu } = await import('./Menu');
  const menuIcons = await import('./menuIcons');
  return { Menu, menuIcons };
}

/**
 * The offline invariant, defined once: every fetch the menu path made is the
 * shell's own local icons file - no icon API host, whatever the icon names
 * resolve to. The message names the offending URL so a break of the invariant
 * shows which host was asked.
 */
function expectOnlyLocalIconFetches(): void {
  for (const call of fetchCalls) {
    expect(call.url, `fetch to a non-local URL: ${call.url}`).toMatch(
      /generated-menu-icons\.json$/,
    );
  }
}

beforeEach(() => {
  vi.resetModules();
  mockMenuState = undefined;
  mockBootstrapSettled.mockResolvedValue(undefined);
  const listeners = new Set<() => void>();
  app = {
    mfeRegistry: {
      getExtensionsForDomain: vi.fn().mockReturnValue([]),
      executeActionsChain: vi.fn().mockReturnValue(undefined),
    },
    i18nRegistry: {
      getLanguage: () => 'en',
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      t: (key: string) => key,
    },
  };
  mockUseFrontX.mockReturnValue(app);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bundled menu icons', () => {
  it('renders the registered icon and fetches only the shell\'s own local file', async () => {
    stubFetch({ status: 200, body: JSON.stringify([lucideCollection]) });
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([screenExtension('home', 'lucide:home')]);
    const { Menu, menuIcons } = await loadModules();

    await act(async () => {
      menuIcons.startMenuIconsFetch('/', 'https://shell.example/assets/app.js');
      render(<Menu />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Every request the menu path made is the shell's own public asset: no
    // icon API host, whatever the icon names resolve to. Asserted before the
    // render check, after a short settle, so a swap back to the API-backed
    // Icon module fails here, naming the host it asked, and not only at the
    // svg.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await waitFor(() => expect(fetchCalls.length).toBeGreaterThan(0));
    expectOnlyLocalIconFetches();
    await waitFor(() => {
      expect(screen.getByTestId('menu-item-home').querySelector('svg')).toBeTruthy();
    });
  });

  it('re-renders with the icon when the bundle lands after the first paint', async () => {
    let releaseIcons!: () => void;
    const gate = new Promise<string>((resolve) => {
      releaseIcons = () => resolve(JSON.stringify([lucideCollection]));
    });
    fetchCalls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push({ url });
      return new Response(await gate, { status: 200 });
    }));
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([screenExtension('home', 'lucide:home')]);
    const { Menu, menuIcons } = await loadModules();

    await act(async () => {
      menuIcons.startMenuIconsFetch('/', 'https://shell.example/assets/app.js');
      render(<Menu />);
    });
    expect(screen.getByTestId('menu-item-home').querySelector('svg')).toBeNull();

    await act(async () => {
      releaseIcons();
    });
    await waitFor(() => {
      expect(screen.getByTestId('menu-item-home').querySelector('svg')).toBeTruthy();
    });
  });

  it('a missing icons file leaves the menu without icons and logs exactly one warning', async () => {
    stubFetch({ status: 404 });
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([screenExtension('home', 'lucide:home')]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { Menu, menuIcons } = await loadModules();

    await act(async () => {
      menuIcons.startMenuIconsFetch('/', 'https://shell.example/assets/app.js');
      render(<Menu />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // The item is listed, with no icon on it: the app works without the file.
    expect(screen.getByTestId('menu-item-home')).toBeTruthy();
    expect(screen.getByTestId('menu-item-home').querySelector('svg')).toBeNull();
    await waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(1));
    expect(String(warnSpy.mock.calls[0][0])).toContain('generated-menu-icons.json');
    expectOnlyLocalIconFetches();
  });

  it('an unknown icon renders no icon and warns once for that name in dev', async () => {
    stubFetch({ status: 200, body: JSON.stringify([lucideCollection]) });
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([
      screenExtension('home', 'lucide:home'),
      // Two items carrying the same unknown name: the warning is once per
      // icon name, not once per item or per render.
      screenExtension('orphan', 'lucide:deployed-elsewhere'),
      screenExtension('orphan-two', 'lucide:deployed-elsewhere'),
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { Menu, menuIcons } = await loadModules();

    await act(async () => {
      menuIcons.startMenuIconsFetch('/', 'https://shell.example/assets/app.js');
      render(<Menu />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('menu-item-home').querySelector('svg')).toBeTruthy();
    });
    expect(screen.getByTestId('menu-item-orphan').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('menu-item-orphan-two').querySelector('svg')).toBeNull();
    // One warning, naming the icon, none for the icon that did render.
    await waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(1));
    expect(String(warnSpy.mock.calls[0][0])).toContain('lucide:deployed-elsewhere');
    // And no request went out to learn about the missing icon.
    expectOnlyLocalIconFetches();
  });

  it('a broken entry registers nothing, even when earlier entries are valid', async () => {
    const goodCollection: IconifyJSON = {
      prefix: 'good',
      icons: { ok: { body: '<path d="M1 1"/>' } },
    };
    stubFetch({ status: 200, body: JSON.stringify([goodCollection, { prefix: 7 }]) });
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([screenExtension('home', 'good:ok')]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { Menu, menuIcons } = await loadModules();

    await act(async () => {
      menuIcons.startMenuIconsFetch('/', 'https://shell.example/assets/app.js');
      render(<Menu />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // The state says no icons are coming, and the good:ok icon that a partly
    // applied registration would have left in the registry renders no icon -
    // the dev warning effect only reports on `ready`, so a partial
    // registration would render an icon nothing reports.
    expect(menuIcons.hasMenuIcon('good:ok')).toBe(false);
    expect(screen.getByTestId('menu-item-home').querySelector('svg')).toBeNull();
    await waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(1));
    expect(String(warnSpy.mock.calls[0][0])).toContain('not an Iconify icon collection');
    expectOnlyLocalIconFetches();
  });

  // A broken entry must register nothing, even when earlier entries are
  // valid, whatever the shape of the break. An icon whose body is not a
  // string, an alias naming an icon the collection does not carry and a
  // non-numeric width all pass a prefix-and-icons shape check and are caught
  // only by reading every collection fully before any registration starts:
  // the per-icon dev warning effect only runs on `ready`, so a half-registered
  // file would put icons in the registry nothing reports.
  describe('an entry whose icons, aliases or dimensions are broken', () => {
    const goodCollection: IconifyJSON = {
      prefix: 'good',
      icons: { ok: { body: '<path d="M1 1"/>' } },
    };

    async function sweep(body: unknown): Promise<{
      warnSpy: ReturnType<typeof vi.spyOn>;
      menuIcons: typeof import('./menuIcons');
    }> {
      stubFetch({ status: 200, body: JSON.stringify([goodCollection, body]) });
      app.mfeRegistry.getExtensionsForDomain.mockReturnValue([screenExtension('home', 'good:ok')]);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { menuIcons } = await loadModules();
      await act(async () => {
        menuIcons.startMenuIconsFetch('/', 'https://shell.example/assets/app.js');
        await Promise.resolve();
        await Promise.resolve();
      });
      return { warnSpy, menuIcons };
    }

    it.each([
      ['an icon body that is not a string', { prefix: 'bad', icons: { broken: null } }],
      ['an icon with no body at all', { prefix: 'bad', icons: { broken: {} } }],
      ['an alias naming an icon the collection does not carry', { prefix: 'bad', icons: {}, aliases: { gone: { parent: 'absent' } } }],
      ['a non-numeric width', { prefix: 'bad', icons: { broken: { body: '<path d="M1 1"/>' } }, width: 'wide' }],
    ])('registers nothing and logs one warning: %s', async (_name, body) => {
      const { warnSpy, menuIcons } = await sweep(body);

      expect(menuIcons.hasMenuIcon('good:ok')).toBe(false);
      expect(menuIcons.hasMenuIcon('bad:broken')).toBe(false);
      await waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(1));
      expect(String(warnSpy.mock.calls[0][0])).toContain('not an Iconify icon collection');
      expectOnlyLocalIconFetches();
    });
  });

  it('a second start while the fetch is in flight starts no second fetch', async () => {
    let releaseIcons!: () => void;
    const gate = new Promise<string>((resolve) => {
      releaseIcons = () => resolve(JSON.stringify([lucideCollection]));
    });
    fetchCalls = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push({ url });
      return new Response(await gate, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { menuIcons } = await loadModules();

    await act(async () => {
      // A retry after a failed bootstrap (or an HMR re-run) can call this
      // again while the first request is still pending: one file fetch, one
      // registration, one warning budget.
      menuIcons.startMenuIconsFetch('/', 'https://shell.example/assets/app.js');
      menuIcons.startMenuIconsFetch('/', 'https://shell.example/assets/app.js');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseIcons();
    });
    await waitFor(() => expect(menuIcons.hasMenuIcon('lucide:home')).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectOnlyLocalIconFetches();
  });
});
