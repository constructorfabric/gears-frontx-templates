/**
 * Shared Vitest setup for every suite in the app.
 *
 * It carries two responsibilities, the same two `template-shell/vitest.setup.ts`
 * carries. At load it installs the browser surface jsdom leaves missing but the
 * app legitimately expects (a media-query engine, working Web Storage,
 * `PointerEvent`), so every suite starts from the same platform instead of
 * each test file shimming what it happens to trip over. After each test it
 * puts back every shared slot a test can change: mounted screens, spies and
 * mocks, fake timers, stubbed globals, storage and cookies.
 *
 * A copy of the shell's approach rather than an import of its file: the shell
 * setup also clears Module Federation state this app does not have, and a
 * seeded project carries no path to the shell.
 */
import { afterEach, vi } from 'vitest';
import { cleanupScreens } from './src/__test-utils__/renderScreen';
import { resetStores } from './src/shared/createStore';

/**
 * jsdom implements no media-query engine, so `window.matchMedia` is simply
 * absent and the screens' breakpoint hook would read every query as "no
 * match" without being able to subscribe. The stub answers "no match" for
 * every query - the desktop layout the screen suites assert against - and a
 * suite that needs a narrow layout spies on it (`vi.spyOn(window,
 * 'matchMedia')`), which the restore below undoes.
 */
const matchMediaStub = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: matchMediaStub,
});

/**
 * In-memory Storage for when the runtime exposes a broken one: under some
 * Node versions `window.localStorage` arrives as a bare object with no methods
 * (Node's own `--localstorage-file` storage without a path), which the app's
 * storage helpers would read as "site data is blocked" and fall back from.
 * That fallback is a real branch, but not the one a browser takes.
 */
const createMemoryStorage = (): Storage => {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
  };
};

const isUsableStorage = (candidate: Storage | null | undefined): candidate is Storage =>
  candidate !== null &&
  candidate !== undefined &&
  typeof candidate.clear === 'function' &&
  typeof candidate.setItem === 'function' &&
  typeof candidate.getItem === 'function';

const ensureUsableWebStorage = (): void => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    if (isUsableStorage(window[name])) continue;
    Object.defineProperty(window, name, {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
};

/**
 * A `PointerEvent` constructor when the environment has none.
 *
 * jsdom implements no `PointerEvent`, while the kit's Base UI primitives
 * construct one off the element's owner window to forward a click onto the
 * hidden native input behind a checkbox, radio or switch - a suite rendering
 * one dies on `ownerWindow(...).PointerEvent is not a constructor` before it
 * asserts anything. A `MouseEvent` subclass carrying the pointer half of
 * `PointerEventInit` is the whole surface those code paths read; defaults
 * follow the specification's own `PointerEventInit` defaults. The same shim
 * as template-shell's setup.
 */
const installPointerEventConstructor = (): void => {
  if (typeof window.PointerEvent === 'function') return;

  class PointerEventShim extends MouseEvent {
    readonly pointerId: number;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;
    readonly tangentialPressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly twist: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tangentialPressure = params.tangentialPressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.twist = params.twist ?? 0;
      this.pointerType = params.pointerType ?? '';
      this.isPrimary = params.isPrimary ?? false;
    }
  }

  Object.defineProperty(window, 'PointerEvent', {
    value: PointerEventShim,
    writable: true,
    configurable: true,
  });
};

const ORIGINAL_FETCH = Object.getOwnPropertyDescriptor(globalThis, 'fetch');

const restoreFetch = (): void => {
  if (ORIGINAL_FETCH) {
    Object.defineProperty(globalThis, 'fetch', ORIGINAL_FETCH);
  } else {
    Reflect.deleteProperty(globalThis, 'fetch');
  }
};

const clearDocumentCookies = (): void => {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
};

ensureUsableWebStorage();
installPointerEventConstructor();

afterEach(() => {
  // Unmounted first, while every mock a screen's cleanup might call is still
  // in place.
  cleanupScreens();
  // Module-level stores (the inbox's drafts and selection) outlive a mount
  // by design, so each test starts them from their initial state.
  resetStores();

  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  restoreFetch();

  ensureUsableWebStorage();
  window.localStorage.clear();
  window.sessionStorage.clear();
  clearDocumentCookies();
});
