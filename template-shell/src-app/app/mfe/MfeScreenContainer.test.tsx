import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
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
  }: {
    registry: { mfeRegistry: Record<string, never> } | null;
    domainId: string;
    className?: string;
    onAttached?: (root: Element) => void;
  }) => {
    // Simulates discovery settling (D4): the mounter's root attaches once the
    // slot mounts, which is what tells `ShellRouting` it may start its
    // observers.
    useEffect(() => {
      onAttached?.(document.createElement('div'));
    }, [onAttached]);
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
  };
}

describe('MfeScreenContainer', () => {
  let app: { mfeRegistry: Record<string, never> };

  beforeEach(() => {
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
