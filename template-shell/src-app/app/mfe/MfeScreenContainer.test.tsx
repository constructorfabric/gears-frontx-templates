import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

const mockBootstrapMFE = vi.fn();
const mockUseFrontX = vi.fn();
const mockScreenDomain = { id: 'screen-domain' };
const FRONTX_SCREEN_DOMAIN = 'screen-domain';

vi.mock('./bootstrap', () => ({
  bootstrapMFE: (...args: never[]) => mockBootstrapMFE(...args),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, never>>()),
  useFrontX: () => mockUseFrontX(),
  screenDomain: mockScreenDomain,
  FRONTX_SCREEN_DOMAIN,
  // `ExtensionDomainSlot` itself owns starting/stopping a routed domain's
  // observer (ADR 0036, "URL ownership") — its own suite covers that; this fake
  // only stands in for the DOM root this container renders around.
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
      data-testid="extension-domain-slot"
      data-registry-present={registry ? 'yes' : 'no'}
      data-domain-id={domainId}
      data-class-name={className}
    />
  ),
}));

describe('MfeScreenContainer', () => {
  let app: { mfeRegistry: Record<string, never> };
  let bootstrap: { resolve: () => void; reject: (error: Error) => void };

  beforeEach(() => {
    // The bootstrap promise this component reuses across a real remount
    // (C8) is hoisted to the SUT module's own scope — resetting the module
    // registry before each test is what gives every test a fresh one,
    // instead of leaking the previous test's (already-settled) promise into
    // this one via the dynamic `import('./MfeScreenContainer')` below.
    vi.resetModules();
    app = { mfeRegistry: {} };
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

    expect(screen.queryByTestId('extension-domain-slot')).toBeNull();
  });

  it('bootstraps the MFE runtime once across re-renders, with the screen domain it implements', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');
    const { registerScreenDomain } = await import('./screenDomain');

    const { rerender } = render(<MfeScreenContainer />);
    rerender(<MfeScreenContainer />);
    rerender(<MfeScreenContainer />);

    expect(mockBootstrapMFE).toHaveBeenCalledTimes(1);
    expect(mockBootstrapMFE).toHaveBeenCalledWith(app, [registerScreenDomain]);
  });

  it('renders the screen-domain ExtensionDomainSlot after bootstrap succeeds', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);
    await settleBootstrap();

    const slot = screen.getByTestId('extension-domain-slot');
    expect(slot.dataset.domainId).toBe(mockScreenDomain.id);
    expect(slot.dataset.registryPresent).toBe('yes');
    expect(slot.dataset.className).toContain('h-full');
  });

  it('reuses the settled bootstrap across a real remount rather than re-invoking it (C8)', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    // A real remount — unmount, then a LATER, distinct `render()` — not
    // `rerender`, which reuses the same component instance and would pass
    // even with the old per-instance `useRef` guard this test targets.
    const first = render(<MfeScreenContainer />);
    await settleBootstrap();
    expect(screen.getByTestId('extension-domain-slot')).not.toBeNull();
    first.unmount();

    await act(async () => {
      render(<MfeScreenContainer />);
    });

    expect(screen.getByTestId('extension-domain-slot')).not.toBeNull();
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
    expect(screen.queryByTestId('extension-domain-slot')).toBeNull();
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
        app.mfeRegistry = { executeActionsChain } as never;
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
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
