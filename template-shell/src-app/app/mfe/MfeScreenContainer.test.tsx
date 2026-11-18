import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import styles from './MfeScreenContainer.module.css';

const mockBootstrapMFE = vi.fn();
const mockUseFrontX = vi.fn();
const mockScreenDomain = { id: 'screen-domain' };
const FRONTX_SCREEN_DOMAIN = 'screen-domain';
// The popup domain the shell implements is the framework's own declaration
// (`@gears-frontx/react` is only partially mocked below), so its id is the
// real one and names the popup slot's test id through the mock.
const POPUP_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1';
const SCREEN_SLOT_TEST_ID = 'extension-domain-slot-screen-domain';
const POPUP_SLOT_TEST_ID = `extension-domain-slot-${POPUP_DOMAIN_ID}`;
// The unmount action type id the layer's close button and Escape send.
const FRONTX_ACTION_UNMOUNT_EXT_ID = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~';

vi.mock('./bootstrap', () => ({
  bootstrapMFE: (...args: never[]) => mockBootstrapMFE(...args),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, never>>()),
  useFrontX: () => mockUseFrontX(),
  // The error state's words come from the shell namespace through
  // `useTranslation`; the stub echoes the key, which is the state the
  // component treats as "translations not loaded yet" and answers with its
  // plain-English fallback, so the assertions below stay on those words.
  useTranslation: () => ({
    t: (key: string) => key,
    language: 'en',
    setLanguage: () => {},
    isRTL: false,
  }),
  screenDomain: mockScreenDomain,
  FRONTX_SCREEN_DOMAIN,
  // `ExtensionDomainSlot` itself owns starting/stopping a routed domain's
  // observer (ADR 0036, "URL ownership") — its own suite covers that; this fake
  // only stands in for the DOM root this container renders around. One slot
  // per domain is rendered (the screen domain's, and the popup domain's inside
  // the modal layer), so the test id names the domain.
  ExtensionDomainSlot: ({
    registry,
    domainId,
    className,
  }: {
    registry: { mfeRegistry: Record<string, never> } | null;
    domainId: string;
    className?: string;
  }) => (
    <div
      data-testid={`extension-domain-slot-${domainId}`}
      data-registry-present={registry ? 'yes' : 'no'}
      data-domain-id={domainId}
      data-class-name={className}
    />
  ),
}));

describe('MfeScreenContainer', () => {
  let app: { mfeRegistry: Record<string, unknown> };
  let bootstrap: { resolve: () => void; reject: (error: Error) => void };

  beforeEach(() => {
    // The bootstrap promise this component reuses across a real remount
    // (C8) is hoisted to the SUT module's own scope — resetting the module
    // registry before each test is what gives every test a fresh one,
    // instead of leaking the previous test's (already-settled) promise into
    // this one via the dynamic `import('./MfeScreenContainer')` below.
    vi.resetModules();
    // `getExtensionsForDomain` is on the mock because the container asks the
    // registry for the default screen once the bootstrap has settled; an empty
    // answer selects nothing, which is what these tests mean by "no screens".
    app = { mfeRegistry: { getExtensionsForDomain: () => [] } };
    mockUseFrontX.mockReturnValue(app);
    mockBootstrapMFE.mockReset();
    // Bootstrap settles only when a test says so, inside `act`.
    bootstrap = {
      resolve: () => {},
      reject: () => {},
    };
    mockBootstrapMFE.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          bootstrap.resolve = resolve;
          bootstrap.reject = reject;
        }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function settleBootstrap(): Promise<void> {
    await act(async () => {
      bootstrap.resolve();
    });
  }

  it('renders nothing while bootstrap is pending', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    expect(screen.queryByTestId(SCREEN_SLOT_TEST_ID)).toBeNull();
  });

  it('bootstraps the MFE runtime once across re-renders, with the domains it implements', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');
    const { registerScreenDomain } = await import('./screenDomain');
    const { registerModalDomain } = await import('./modalDomain');

    const { rerender } = render(<MfeScreenContainer />);
    rerender(<MfeScreenContainer />);
    rerender(<MfeScreenContainer />);

    expect(mockBootstrapMFE).toHaveBeenCalledTimes(1);
    expect(mockBootstrapMFE).toHaveBeenCalledWith(app, [registerScreenDomain, registerModalDomain]);
  });

  it('renders the screen-domain ExtensionDomainSlot after bootstrap succeeds', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);
    await settleBootstrap();

    const slot = screen.getByTestId(SCREEN_SLOT_TEST_ID);
    expect(slot.dataset.domainId).toBe(mockScreenDomain.id);
    expect(slot.dataset.registryPresent).toBe('yes');
    expect(slot.dataset.className).toBe(styles.slot);
  });

  it('reuses the settled bootstrap across a real remount rather than re-invoking it (C8)', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    // A real remount — unmount, then a LATER, distinct `render()` — not
    // `rerender`, which reuses the same component instance and would pass
    // even with the old per-instance `useRef` guard this test targets.
    const first = render(<MfeScreenContainer />);
    await settleBootstrap();
    expect(screen.getByTestId(SCREEN_SLOT_TEST_ID)).not.toBeNull();
    first.unmount();

    await act(async () => {
      render(<MfeScreenContainer />);
    });

    expect(screen.getByTestId(SCREEN_SLOT_TEST_ID)).not.toBeNull();
    expect(mockBootstrapMFE).toHaveBeenCalledTimes(1);
  });

  it('logs the error and shows the error state when bootstrap rejects (the manifest aggregate unreachable)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { MfeScreenContainer } = await import('./MfeScreenContainer');
    render(<MfeScreenContainer />);
    await act(async () => {
      bootstrap.reject(new Error('boom'));
    });

    expect(errorSpy).toHaveBeenCalled();
    expect(screen.queryByTestId(SCREEN_SLOT_TEST_ID)).toBeNull();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { level: 2 }).textContent).toBe('This screen could not be loaded');
    expect(within(alert).getByRole('button', { name: 'Retry' })).not.toBeNull();
  });

  it('reloads the page on Retry after a failed bootstrap, which is not safe to repeat in the same page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    const realLocation = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } });
    try {
      const { MfeScreenContainer } = await import('./MfeScreenContainer');
      const { screenLoadFailure } = await import('./screenLoadFailure');
      render(<MfeScreenContainer />);
      await act(async () => {
        bootstrap.reject(new Error('boom'));
      });
      act(() => screenLoadFailure.report('ext.orders', 'push'));

      expect(screen.getAllByRole('alert')).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(reload).toHaveBeenCalledTimes(1);
      expect(mockBootstrapMFE).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
    }
  });

  describe('a screen that failed to load', () => {
    it('shows the error state once a screen failure is reported', async () => {
      const { MfeScreenContainer } = await import('./MfeScreenContainer');
      const { screenLoadFailure } = await import('./screenLoadFailure');
      render(<MfeScreenContainer />);
      await settleBootstrap();

      act(() => screenLoadFailure.report('ext.orders', 'push'));

      const alert = screen.getByRole('alert');
      expect(within(alert).getByRole('heading', { level: 2 }).textContent).toBe('This screen could not be loaded');
      expect(within(alert).getByRole('button', { name: 'Retry' })).not.toBeNull();
    });

    it.each(['push', 'replace', 'none'] as const)(
      'mounts the screen again on Retry with the failed action history intent (%s)',
      async (history) => {
        const executeActionsChain = vi.fn();
        app.mfeRegistry = { getExtensionsForDomain: () => [], executeActionsChain } as never;
        const { MfeScreenContainer } = await import('./MfeScreenContainer');
        const { screenLoadFailure } = await import('./screenLoadFailure');
        render(<MfeScreenContainer />);
        await settleBootstrap();
        act(() => screenLoadFailure.report('ext.orders', history));

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        expect(executeActionsChain).toHaveBeenCalledWith({
          action: {
            type: 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~',
            target: FRONTX_SCREEN_DOMAIN,
            payload: { subject: 'ext.orders', history },
          },
        });
        expect(screen.queryByRole('alert')).toBeNull();
      },
    );

    it('drops the error state when a history step leaves the failed navigation', async () => {
      const { MfeScreenContainer } = await import('./MfeScreenContainer');
      const { screenLoadFailure } = await import('./screenLoadFailure');
      render(<MfeScreenContainer />);
      await settleBootstrap();
      act(() => screenLoadFailure.report('ext.orders', 'push'));

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('starts the new visit before a popstate listener added earlier mounts the new address', async () => {
      const { MfeScreenContainer } = await import('./MfeScreenContainer');
      const { screenLoadFailure } = await import('./screenLoadFailure');
      let visitSeenByRouter: number | undefined;
      // Stands in for the router, which subscribes in the bubble phase; added
      // first, so only the phase decides the order.
      const router = () => {
        visitSeenByRouter = screenLoadFailure.visit();
      };
      window.addEventListener('popstate', router);
      try {
        render(<MfeScreenContainer />);
        await settleBootstrap();
        const before = screenLoadFailure.visit();

        act(() => {
          window.dispatchEvent(new PopStateEvent('popstate'));
        });

        expect(visitSeenByRouter).toBe(before + 1);
      } finally {
        window.removeEventListener('popstate', router);
      }
    });

    it('renders the error state the app passes in', async () => {
      const { MfeScreenContainer } = await import('./MfeScreenContainer');
      const { screenLoadFailure } = await import('./screenLoadFailure');
      const Custom = ({ onRetry }: { onRetry: () => void }) => (
        <button type="button" onClick={onRetry}>
          custom error state
        </button>
      );
      render(<MfeScreenContainer LoadFailed={Custom} />);
      await settleBootstrap();

      act(() => screenLoadFailure.report('ext.orders', 'push'));

      expect(screen.getByRole('button', { name: 'custom error state' })).not.toBeNull();
      // The wrapper is what carries the load-failure gutter (the errorState
      // rule in MfeScreenContainer.module.css): the custom content has to sit
      // directly inside it, or the state loses its padding with this suite
      // still green (jsdom runs no cascade, so only the structure pins it).
      const errorButton = screen.getByRole('button', { name: 'custom error state' });
      expect(errorButton.parentElement?.className).toBe(styles.errorState);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('the modal layer', () => {
    // jsdom lays nothing out: every element has no client rects, and it has no
    // checkVisibility(). The layer's Tab wrap asks whether a control is
    // rendered, so this block gives jsdom a checkVisibility() that answers from
    // the computed styles of the element and its ancestors, through shadow
    // hosts, the way a browser does for display and visibility.
    const ownCheckVisibility = Object.getOwnPropertyDescriptor(Element.prototype, 'checkVisibility');
    const isRendered = (element: Element): boolean => {
      if (getComputedStyle(element).visibility === 'hidden') return false;
      for (let node: Element | null = element; node; ) {
        if (getComputedStyle(node).display === 'none') return false;
        const root = node.getRootNode();
        node = node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      }
      return true;
    };
    beforeAll(() => {
      Element.prototype.checkVisibility = function checkVisibility(this: Element) {
        return isRendered(this);
      };
    });
    afterAll(() => {
      if (ownCheckVisibility) Object.defineProperty(Element.prototype, 'checkVisibility', ownCheckVisibility);
      else delete (Element.prototype as Partial<Element>).checkVisibility;
    });

    // A modal extension as the registry hands it out (no `route`): the
    // derived modal type requires `label`, `size` and `cancelable`.
    const MODAL_EXTENSION_ID =
      'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.popup.v1~frontx.example.modals.terms.v1';

    function stubRegistry(modalExtension?: {
      id: string;
      presentation: { label: string; size: string; cancelable: boolean };
    }) {
      const executeActionsChain = vi.fn();
      app.mfeRegistry = {
        // The default-screen selection asks for the screen domain and must
        // find nothing; the modal layer asks for the popup domain.
        getExtensionsForDomain: (domainId: string) =>
          domainId === POPUP_DOMAIN_ID && modalExtension ? [modalExtension] : [],
        executeActionsChain,
      } as never;
      return executeActionsChain;
    }

    async function renderSettledLayer() {
      const { MfeScreenContainer } = await import('./MfeScreenContainer');
      const { modalState } = await import('./modalDomain');
      render(<MfeScreenContainer />);
      await settleBootstrap();
      return { modalState };
    }

    it('renders the popup-domain slot in a closed layer after bootstrap succeeds', async () => {
      stubRegistry();
      await renderSettledLayer();

      const popupSlot = screen.getByTestId(POPUP_SLOT_TEST_ID);
      expect(popupSlot.dataset.domainId).toBe(POPUP_DOMAIN_ID);
      expect(popupSlot.dataset.className).toBe(styles.modalSlot);

      const layer = document.querySelector('[data-modal-layer]');
      expect(layer).not.toBeNull();
      expect(layer?.getAttribute('data-modal-open')).toBe('false');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('presents a mounted modal as a dialog the presentation describes', async () => {
      stubRegistry({
        id: MODAL_EXTENSION_ID,
        presentation: { label: 'Terms of use', size: 'full', cancelable: true },
      });
      const { modalState } = await renderSettledLayer();

      act(() => modalState.set(MODAL_EXTENSION_ID));

      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-label')).toBe('Terms of use');
      // size "full": the layer carries the covers-the-viewport presentation.
      expect(dialog.className).toContain(styles.modalFull);
      expect(within(dialog).getByTestId(POPUP_SLOT_TEST_ID)).not.toBeNull();
    });

    it('closes the layer again when the modal unmounts', async () => {
      stubRegistry({
        id: MODAL_EXTENSION_ID,
        presentation: { label: 'Terms of use', size: 'full', cancelable: true },
      });
      const { modalState } = await renderSettledLayer();

      act(() => modalState.set(MODAL_EXTENSION_ID));
      act(() => modalState.set(undefined));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.querySelector('[data-modal-layer]')?.getAttribute('data-modal-open')).toBe('false');
    });

    it('a cancelable modal closes from the UI: the close button and Escape send unmount_ext for it', async () => {
      const executeActionsChain = stubRegistry({
        id: MODAL_EXTENSION_ID,
        presentation: { label: 'Terms of use', size: 'full', cancelable: true },
      });
      const { modalState } = await renderSettledLayer();
      act(() => modalState.set(MODAL_EXTENSION_ID));

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(executeActionsChain).toHaveBeenCalledTimes(1);
      expect(executeActionsChain).toHaveBeenCalledWith({
        action: {
          type: FRONTX_ACTION_UNMOUNT_EXT_ID,
          target: POPUP_DOMAIN_ID,
          payload: { subject: MODAL_EXTENSION_ID },
        },
      });

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(executeActionsChain).toHaveBeenCalledTimes(2);
      expect(executeActionsChain).toHaveBeenLastCalledWith({
        action: {
          type: FRONTX_ACTION_UNMOUNT_EXT_ID,
          target: POPUP_DOMAIN_ID,
          payload: { subject: MODAL_EXTENSION_ID },
        },
      });
    });

    it('Tab and Shift+Tab wrap between the first and last controls, across the modal shadow root', async () => {
      stubRegistry({
        id: MODAL_EXTENSION_ID,
        presentation: { label: 'Terms of use', size: 'medium', cancelable: true },
      });
      const { modalState } = await renderSettledLayer();
      act(() => modalState.set(MODAL_EXTENSION_ID));

      // The modal renders into a shadow root inside the slot, as the runtime
      // mounts an extension; the close button is the layer's own first control.
      const host = document.createElement('div');
      screen.getByTestId(POPUP_SLOT_TEST_ID).appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<input name="user" /><button type="submit">Sign in</button>';
      const submit = shadow.querySelector('button') as HTMLButtonElement;
      const close = screen.getByRole('button', { name: 'Close' });

      // Tab past the last control (inside the shadow root) goes to the first.
      submit.focus();
      expect(shadow.activeElement).toBe(submit);
      expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false);
      expect(document.activeElement).toBe(close);

      // Shift+Tab from the first control goes to the last, inside the shadow root.
      expect(fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })).toBe(false);
      expect(document.activeElement).toBe(host);
      expect(shadow.activeElement).toBe(submit);

      // Between the two the browser moves focus on its own.
      (shadow.querySelector('input') as HTMLInputElement).focus();
      expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
    });

    it('the Tab wrap counts only real tab stops: hidden inputs and CSS-hidden controls are skipped', async () => {
      stubRegistry({
        id: MODAL_EXTENSION_ID,
        presentation: { label: 'Terms of use', size: 'medium', cancelable: true },
      });
      const { modalState } = await renderSettledLayer();
      act(() => modalState.set(MODAL_EXTENSION_ID));

      // The form ends with controls Tab never stops at: a hidden input, a
      // CSS-hidden one, one under a display:none wrapper, an invisible one and
      // a disabled one. The submit button is the last real tab stop.
      const host = document.createElement('div');
      screen.getByTestId(POPUP_SLOT_TEST_ID).appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML =
        '<input name="user" /><button type="submit">Sign in</button>' +
        '<input type="hidden" name="csrf" value="t" />' +
        '<input name="trap" style="display: none" />' +
        '<div style="display: none"><input name="nested" /></div>' +
        '<input name="ghost" style="visibility: hidden" />' +
        '<input name="off" disabled />';
      const submit = shadow.querySelector('button') as HTMLButtonElement;
      const close = screen.getByRole('button', { name: 'Close' });

      // Tab from the submit button wraps to the first control.
      submit.focus();
      expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false);
      expect(document.activeElement).toBe(close);

      // Shift+Tab from the first control lands on the submit button, not on
      // the hidden input after it.
      expect(fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })).toBe(false);
      expect(shadow.activeElement).toBe(submit);
    });

    it('the fallback without checkVisibility still skips a trailing visibility:hidden control', async () => {
      stubRegistry({
        id: MODAL_EXTENSION_ID,
        presentation: { label: 'Terms of use', size: 'medium', cancelable: true },
      });
      const { modalState } = await renderSettledLayer();
      act(() => modalState.set(MODAL_EXTENSION_ID));

      // The submit button is the last real tab stop; the invisible input after
      // it is not one.
      const host = document.createElement('div');
      screen.getByTestId(POPUP_SLOT_TEST_ID).appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML =
        '<input name="user" /><button type="submit">Sign in</button>' +
        '<input name="ghost" style="visibility: hidden" />';
      const submit = shadow.querySelector('button') as HTMLButtonElement;
      const close = screen.getByRole('button', { name: 'Close' });

      // This browser has no checkVisibility(), and jsdom lays nothing out, so
      // every element reports one client rect the way a laid-out one would.
      const ownCheckVisibility = Object.getOwnPropertyDescriptor(Element.prototype, 'checkVisibility');
      const rects = vi
        .spyOn(Element.prototype, 'getClientRects')
        .mockImplementation(() => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList);
      delete (Element.prototype as Partial<Element>).checkVisibility;
      try {
        // Tab from the submit button wraps to the first control instead of
        // stopping at the invisible input.
        submit.focus();
        expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false);
        expect(document.activeElement).toBe(close);
      } finally {
        rects.mockRestore();
        if (ownCheckVisibility) Object.defineProperty(Element.prototype, 'checkVisibility', ownCheckVisibility);
      }
    });

    it('a non-cancelable modal has no close button and ignores Escape', async () => {
      const executeActionsChain = stubRegistry({
        id: MODAL_EXTENSION_ID,
        presentation: { label: 'Session locked', size: 'medium', cancelable: false },
      });
      const { modalState } = await renderSettledLayer();
      act(() => modalState.set(MODAL_EXTENSION_ID));

      const dialog = screen.getByRole('dialog');
      expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
      // size "medium": the layer carries the centred-panel presentation.
      expect(dialog.className).toContain(styles.modalMedium);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(executeActionsChain).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).not.toBeNull();
    });
  });
});
