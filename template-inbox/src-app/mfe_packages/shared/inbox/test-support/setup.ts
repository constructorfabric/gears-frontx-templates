/**
 * The inbox packages' shared Vitest setup, called from each package's
 * `src/test-support/setup.ts`, which runs after the shell's shared setup
 * files.
 *
 * At load it installs the browser surface jsdom leaves missing but the
 * screens legitimately expect (a media-query engine, working Web Storage,
 * `PointerEvent`, client rects), so every suite starts from the same platform
 * instead of each test file shimming what it happens to trip over. After each
 * test it puts back every shared slot a test can change: mounted screens,
 * spies and mocks, fake timers, stubbed globals, storage and cookies, the
 * inbox's module-level and page-wide state, the URL and the document title.
 *
 * The test runner's hooks come in as arguments rather than imports: this
 * folder sits outside every package, and an import of `vitest` from here
 * could resolve to another copy than the one running the package's suite.
 */
import { resetQueryCache } from '../api/queries';
import { resetScreenMountFocus } from '../lifecycle/InboxScreenFrame';
import { resetStores } from '../ui/createStore';

export type InboxTestHooks = {
  afterEach: (run: () => void) => void;
  vi: {
    clearAllMocks: () => unknown;
    restoreAllMocks: () => unknown;
    unstubAllGlobals: () => unknown;
    useRealTimers: () => unknown;
  };
  /** Unmounts every rendered tree (`@testing-library/react`'s `cleanup`). */
  cleanup: () => void;
  /** Puts the package's mock backend back to its seed. */
  resetMockState: () => void;
};

/**
 * jsdom implements no media-query engine, so `window.matchMedia` is simply
 * absent and the screens' breakpoint hook would read every query as "no
 * match" without being able to subscribe. The stub answers "no match" for
 * every query - the desktop layout the screen suites assert against - and a
 * suite that needs a narrow layout replaces it (`stubMatchMedia`), which the
 * reset after each test undoes.
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

const installMatchMediaStub = (): void => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: matchMediaStub,
  });
};

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

/**
 * Client rects for an element that would render a box.
 *
 * jsdom has no layout, so `getClientRects()` is empty for every element, and
 * `ScreenHeading` (which leaves a focus request to a heading that renders a
 * box) would find no heading visible at all. The stand-in answers from the two
 * signals this app hides a pane with: the `hidden` attribute, and the
 * single-pane class a narrow layout sets to `display: none` (CSS is not
 * loaded under Vitest, so the class name is what there is to read).
 */
const installClientRects = (): void => {
  Object.defineProperty(Element.prototype, 'getClientRects', {
    configurable: true,
    writable: true,
    value(this: Element): DOMRectList | DOMRect[] {
      const hidden = this.closest('[hidden]') !== null || this.closest('[class*="singlePaneHidden"]') !== null;
      return hidden ? [] : [new DOMRect(0, 0, 1, 1)];
    },
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

/**
 * jsdom implements no `window.scrollTo` and reports every call as an error.
 * The screens' router restores the scroll position after each navigation, so
 * a no-op keeps that report out of every routed test; there is no layout to
 * scroll anyway.
 */
const installScrollTo = (): void => {
  Object.defineProperty(window, 'scrollTo', { configurable: true, writable: true, value: () => undefined });
};

export function registerInboxTestSetup({ afterEach, vi, cleanup, resetMockState }: InboxTestHooks): void {
  installMatchMediaStub();
  ensureUsableWebStorage();
  installScrollTo();
  installPointerEventConstructor();
  installClientRects();

  afterEach(() => {
    // Unmounted first, while every mock a screen's cleanup might call is
    // still in place.
    cleanup();
    // Module-level and page-wide state outlives a mount by design - the
    // screens' stores, the heading-focus counters, the query cache, the mock
    // API's state and the first-mount flag - so each test starts all of it
    // from its initial state, and from the address a fresh page has.
    resetStores();
    resetMockState();
    resetQueryCache();
    resetScreenMountFocus();
    window.history.replaceState(null, '', '/');
    document.title = '';

    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    restoreFetch();
    installMatchMediaStub();

    ensureUsableWebStorage();
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearDocumentCookies();
  });
}
