import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockBootstrapMFE = vi.fn();
const mockUseFrontX = vi.fn();
const mockUseMountedExtensions = vi.fn((_domainId: string): Array<{ id: string }> => []);
const mockScreenDomain = { id: 'screen-domain' };
const FRONTX_SCREEN_DOMAIN = 'screen-domain';

vi.mock('./bootstrap', () => ({
  bootstrapMFE: (...args: never[]) => mockBootstrapMFE(...args),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, never>>()),
  useFrontX: () => mockUseFrontX(),
  useMountedExtensions: (domainId: string) => mockUseMountedExtensions(domainId),
  screenDomain: mockScreenDomain,
  FRONTX_SCREEN_DOMAIN,
  ExtensionDomainSlot: ({
    registry,
    domainId,
    className,
    onAttached,
    onDetached,
  }: {
    registry: { mfeRegistry: Record<string, never> } | null;
    domainId: string;
    className?: string;
    onAttached?: (root: Element) => void;
    onDetached?: () => void;
  }) => {
    // The real `ExtensionDomainSlot` attaches/detaches its root once per
    // mount, not on every parent re-render. `MfeScreenContainer` passes a
    // fresh inline arrow for `onAttached`/`onDetached` on every render, so an
    // effect keyed on those props by identity (`[onAttached]`) would fire
    // again on every re-render — reading the LATEST callback through a ref
    // instead, with an empty dependency array, is what makes this fake behave
    // like the real thing (F7).
    const onAttachedRef = useRef(onAttached);
    onAttachedRef.current = onAttached;
    const onDetachedRef = useRef(onDetached);
    onDetachedRef.current = onDetached;
    useEffect(() => {
      // Simulates discovery settling (D4): the mounter's root attaches once
      // the slot mounts, which is what tells `ShellRouting` it may start its
      // observers.
      onAttachedRef.current?.(document.createElement('div'));
      return () => {
        onDetachedRef.current?.();
      };
    }, []);
    return (
      <div
        data-testid="extension-domain-slot"
        data-registry-present={registry ? 'yes' : 'no'}
        data-domain-id={domainId}
        data-class-name={className}
      />
    );
  },
}));

/** A `ShellRouting`-shaped double: only the surface `MfeScreenContainer` reads. */
function fakeRouting(status: { entries: number; unresolved: number } = { entries: 0, unresolved: 0 }) {
  return {
    screen: {
      getStatus: () => status,
      subscribeStatus: () => () => {},
    },
    start: vi.fn(),
    stop: vi.fn(),
  };
}

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
    mockBootstrapMFE.mockResolvedValue(fakeRouting());
    mockUseMountedExtensions.mockReset();
    mockUseMountedExtensions.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing while bootstrap is pending', async () => {
    let resolveBootstrap: ((routing: ReturnType<typeof fakeRouting>) => void) | undefined;
    mockBootstrapMFE.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBootstrap = resolve;
        }),
    );
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    expect(screen.queryByTestId('extension-domain-slot')).toBeNull();

    resolveBootstrap?.(fakeRouting());
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

  it('renders the screen-domain ExtensionDomainSlot after bootstrap succeeds, and starts routing once its root attaches', async () => {
    const routing = fakeRouting();
    mockBootstrapMFE.mockResolvedValue(routing);
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      const slot = screen.getByTestId('extension-domain-slot');
      expect(slot.dataset.domainId).toBe(mockScreenDomain.id);
      expect(slot.dataset.registryPresent).toBe('yes');
      expect(slot.dataset.className).toContain('h-full');
    });
    await waitFor(() => {
      expect(routing.start).toHaveBeenCalledTimes(1);
    });
  });

  it('stops routing once the screen slot detaches (C1)', async () => {
    const routing = fakeRouting();
    mockBootstrapMFE.mockResolvedValue(routing);
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    const { unmount } = render(<MfeScreenContainer />);
    await waitFor(() => {
      expect(routing.start).toHaveBeenCalledTimes(1);
    });
    expect(routing.stop).not.toHaveBeenCalled();

    unmount();

    expect(routing.stop).toHaveBeenCalledTimes(1);
  });

  it('reuses the settled bootstrap across a real remount rather than re-invoking it (C8)', async () => {
    const routing = fakeRouting();
    mockBootstrapMFE.mockResolvedValue(routing);
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
    mockBootstrapMFE.mockResolvedValue(fakeRouting({ entries: 1, unresolved: 1 }));
    mockUseMountedExtensions.mockReturnValue([]);
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      expect(screen.getByTestId('screen-route-fallback')).not.toBeNull();
    });
  });

  it('renders no fallback when the screen domain carries no URL entry', async () => {
    mockBootstrapMFE.mockResolvedValue(fakeRouting({ entries: 0, unresolved: 0 }));
    mockUseMountedExtensions.mockReturnValue([]);
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      expect(screen.getByTestId('extension-domain-slot')).not.toBeNull();
    });
    expect(screen.queryByTestId('screen-route-fallback')).toBeNull();
  });

  it('renders no fallback once a screen is mounted, even with an unresolved sibling entry', async () => {
    mockBootstrapMFE.mockResolvedValue(fakeRouting({ entries: 1, unresolved: 1 }));
    mockUseMountedExtensions.mockReturnValue([{ id: 'ext.hello-world' }]);
    const { MfeScreenContainer } = await import('./MfeScreenContainer');

    render(<MfeScreenContainer />);

    await waitFor(() => {
      expect(screen.getByTestId('extension-domain-slot')).not.toBeNull();
    });
    expect(screen.queryByTestId('screen-route-fallback')).toBeNull();
  });
});
