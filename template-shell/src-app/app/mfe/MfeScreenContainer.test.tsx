import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockBootstrapMFE = vi.fn();
const mockUseFrontX = vi.fn();
const mockUseMountedExtensions = vi.fn((_domainId: string): Array<{ id: string }> => []);
const mockUseDomainRouteStatus = vi.fn(
  (_registry: unknown, _domainId: string): { entries: number; unresolved: number } => ({
    entries: 0,
    unresolved: 0,
  }),
);
const mockScreenDomain = { id: 'screen-domain' };
const FRONTX_SCREEN_DOMAIN = 'screen-domain';

vi.mock('./bootstrap', () => ({
  bootstrapMFE: (...args: never[]) => mockBootstrapMFE(...args),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, never>>()),
  useFrontX: () => mockUseFrontX(),
  useMountedExtensions: (domainId: string) => mockUseMountedExtensions(domainId),
  useDomainRouteStatus: (registry: unknown, domainId: string) => mockUseDomainRouteStatus(registry, domainId),
  screenDomain: mockScreenDomain,
  FRONTX_SCREEN_DOMAIN,
  // `ExtensionDomainSlot` itself owns starting/stopping a routed domain's
  // observer (ADR 0036, D10/D11) — its own suite covers that; this fake
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
    mockBootstrapMFE.mockResolvedValue(undefined);
    mockUseMountedExtensions.mockReset();
    mockUseMountedExtensions.mockReturnValue([]);
    mockUseDomainRouteStatus.mockReset();
    mockUseDomainRouteStatus.mockReturnValue({ entries: 0, unresolved: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing while bootstrap is pending', async () => {
    let resolveBootstrap: (() => void) | undefined;
    mockBootstrapMFE.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveBootstrap = resolve;
        }),
    );
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    expect(screen.queryByTestId('extension-domain-slot')).toBeNull();

    resolveBootstrap?.();
  });

  it('bootstraps the MFE runtime only once across re-renders', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    const { rerender } = render(<MfeScreenContainer />);
    rerender(<MfeScreenContainer />);
    rerender(<MfeScreenContainer />);

    await waitFor(() => {
      expect(mockBootstrapMFE).toHaveBeenCalledTimes(1);
    });
    expect(mockBootstrapMFE).toHaveBeenCalledWith(app);
  });

  it('renders the screen-domain ExtensionDomainSlot after bootstrap succeeds', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      const slot = screen.getByTestId('extension-domain-slot');
      expect(slot.dataset.domainId).toBe(mockScreenDomain.id);
      expect(slot.dataset.registryPresent).toBe('yes');
      expect(slot.dataset.className).toContain('h-full');
    });
  });

  it('reads the screen domain status only once bootstrap has settled, not before', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      expect(mockUseDomainRouteStatus).toHaveBeenLastCalledWith(app.mfeRegistry, FRONTX_SCREEN_DOMAIN);
    });
    // Every call before that point was gated to `undefined` (C1 — no
    // observer-backed status to read before this container's own
    // `ExtensionDomainSlot` has anywhere to mount into).
    expect(mockUseDomainRouteStatus.mock.calls[0]).toEqual([undefined, FRONTX_SCREEN_DOMAIN]);
  });

  it('reuses the settled bootstrap across a real remount rather than re-invoking it (C8)', async () => {
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    // A real remount — unmount, then a LATER, distinct `render()` — not
    // `rerender`, which reuses the same component instance and would pass
    // even with the old per-instance `useRef` guard this test targets.
    const first = render(<MfeScreenContainer />);
    await waitFor(() => {
      expect(screen.getByTestId('extension-domain-slot')).not.toBeNull();
    });
    first.unmount();

    render(<MfeScreenContainer />);
    await waitFor(() => {
      expect(screen.getByTestId('extension-domain-slot')).not.toBeNull();
    });

    expect(mockBootstrapMFE).toHaveBeenCalledTimes(1);
  });

  it('logs an error and renders nothing when bootstrap rejects', async () => {
    const error = new Error('boom');
    mockBootstrapMFE.mockRejectedValue(error);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { MfeScreenContainer } = await import('./MfeScreenContainer');
    render(<MfeScreenContainer />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('extension-domain-slot')).toBeNull();
  });

  it('renders the fallback when every URL entry for the screen domain is unresolved and nothing mounted', async () => {
    mockUseDomainRouteStatus.mockReturnValue({ entries: 1, unresolved: 1 });
    mockUseMountedExtensions.mockReturnValue([]);
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      expect(screen.getByTestId('screen-route-fallback')).not.toBeNull();
    });
  });

  it('renders no fallback when the screen domain carries no URL entry', async () => {
    mockUseDomainRouteStatus.mockReturnValue({ entries: 0, unresolved: 0 });
    mockUseMountedExtensions.mockReturnValue([]);
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      expect(screen.getByTestId('extension-domain-slot')).not.toBeNull();
    });
    expect(screen.queryByTestId('screen-route-fallback')).toBeNull();
  });

  it('renders no fallback once a screen is mounted, even with an unresolved sibling entry', async () => {
    mockUseDomainRouteStatus.mockReturnValue({ entries: 1, unresolved: 1 });
    mockUseMountedExtensions.mockReturnValue([{ id: 'ext.hello-world' }]);
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      expect(screen.getByTestId('extension-domain-slot')).not.toBeNull();
    });
    expect(screen.queryByTestId('screen-route-fallback')).toBeNull();
  });
});
