import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScreenExtension } from '@gears-frontx/react';
import { Menu } from './Menu';
import { screenState } from '@/app/mfe/screenState';

const mockUseFrontX = vi.fn();
const mockBootstrapSettled = vi.fn();

vi.mock('@/app/mfe/bootstrapOnce', () => ({
  bootstrapSettled: () => mockBootstrapSettled(),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gears-frontx/react')>()),
  useAppSelector: () => undefined,
  useFrontX: () => mockUseFrontX(),
}));

const screenExtension = (
  id: string,
  route: string,
  order: number,
  label: string = id
): ScreenExtension => ({
  id,
  domain: 'screen-domain',
  entry: `${id}.entry`,
  route,
  presentation: { label, order },
});

/**
 * An extension the registry accepts and the menu cannot render: `presentation`
 * is asserted by a cast rather than validated anywhere on the registration
 * path, so this shape reaches the menu in a real boot.
 */
const withoutPresentation = (id: string) => ({ id, domain: 'screen-domain', entry: `${id}.entry` });

// Shaped like a real registry id - dots, tildes and all - so the test id
// assertion below stands as evidence that the id goes in verbatim rather than
// through a slug step that would flatten exactly this punctuation.
const tasks = screenExtension(
  'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.tasks.v1',
  '/tasks',
  20,
  'Tasks'
);

describe('Menu', () => {
  let app: {
    mfeRegistry: {
      getExtensionsForDomain: ReturnType<typeof vi.fn>;
      executeActionsChain: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    app = {
      mfeRegistry: {
        getExtensionsForDomain: vi.fn().mockReturnValue([tasks]),
        executeActionsChain: vi.fn().mockReturnValue(undefined),
      },
    };
    mockUseFrontX.mockReturnValue(app);
    screenState.set(undefined);
    mockBootstrapSettled.mockResolvedValue(undefined);
  });

  const emptyState = () => screen.queryByText(/No screens yet/);

  /** Renders and lets the bootstrap promise the menu awaits settle. */
  const renderSettled = async () => {
    await act(async () => {
      render(<Menu />);
    });
  };

  it('mounts the screen a menu item names when that item is clicked through its test id', async () => {
    await renderSettled();

    // Driven through the test id an unattended browser run addresses this item
    // by, spelled out rather than built with `menuItemTestId`: the point is to
    // hold the published derivation - the `menu-item-` prefix and the
    // extension id verbatim after it - which a shared helper on both sides
    // would let drift unnoticed.
    await userEvent.click(screen.getByTestId(`menu-item-${tasks.id}`));

    expect(app.mfeRegistry.executeActionsChain).toHaveBeenCalledTimes(1);
    const chain = app.mfeRegistry.executeActionsChain.mock.calls[0][0] as {
      action: { payload: { subject: string } };
    };
    expect(chain.action.payload.subject).toBe(tasks.id);
  });

  it('highlights the screen that is mounted, and follows it when another replaces it', async () => {
    const other = screenExtension('ext.other', '/other', 10, 'Other');
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([other, tasks]);
    await renderSettled();

    const active = (id: string) => screen.getByTestId(`menu-item-${id}`).getAttribute('data-active');
    expect(active(tasks.id)).toBe('false');
    expect(active(other.id)).toBe('false');

    await act(async () => {
      screenState.set(tasks.id);
    });
    expect(active(tasks.id)).toBe('true');
    expect(active(other.id)).toBe('false');

    await act(async () => {
      screenState.set(other.id);
    });
    expect(active(tasks.id)).toBe('false');
    expect(active(other.id)).toBe('true');
  });

  it('marks only the mounted screen as the current page', async () => {
    const inbox = screenExtension(`${tasks.id}.inbox`, '/inbox', 30, 'Inbox');
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([tasks, inbox]);
    await renderSettled();

    await act(async () => {
      screenState.set(inbox.id);
    });

    expect(screen.getByTestId(`menu-item-${inbox.id}`).getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId(`menu-item-${tasks.id}`).hasAttribute('aria-current')).toBe(false);
  });

  it('stays blank until bootstrap has settled, then lists the registered screens', async () => {
    let finishBootstrap!: () => void;
    mockBootstrapSettled.mockReturnValue(new Promise<void>((resolve) => (finishBootstrap = resolve)));

    await renderSettled();
    expect(emptyState()).toBeNull();
    expect(screen.queryByText(tasks.presentation.label)).toBeNull();

    await act(async () => {
      finishBootstrap();
    });

    expect(screen.getByText(tasks.presentation.label)).toBeTruthy();
    expect(emptyState()).toBeNull();
  });

  it('stays blank, with no empty state, while nothing starts the bootstrap (a shell without a screen container)', async () => {
    mockBootstrapSettled.mockReturnValue(new Promise<void>(() => {}));

    await renderSettled();

    expect(screen.queryByTestId(/^menu-item-/)).toBeNull();
    expect(emptyState()).toBeNull();
    expect(app.mfeRegistry.getExtensionsForDomain).not.toHaveBeenCalled();
  });

  it('shows the empty state when bootstrap settles with nothing registered', async () => {
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([]);

    await renderSettled();

    expect(emptyState()).not.toBeNull();
  });

  it('shows the empty state when bootstrap fails', async () => {
    mockBootstrapSettled.mockRejectedValue(new Error('manifests unavailable'));

    await renderSettled();

    expect(emptyState()).not.toBeNull();
    expect(app.mfeRegistry.getExtensionsForDomain).not.toHaveBeenCalled();
  });

  it('shows the empty state when the app carries no MFE registry at all', async () => {
    // `mfeRegistry` is optional on the app: a project without the
    // microfrontends plugin has no screens coming.
    mockUseFrontX.mockReturnValue({ mfeRegistry: undefined });

    await renderSettled();

    expect(emptyState()).not.toBeNull();
  });

  it('still lists the well-formed screens when a sibling extension carries no presentation metadata', async () => {
    // `presentation` is asserted by a cast and checked nowhere on the path from
    // the manifest to `registry.registerExtension`; one such sibling must cost
    // only itself. Paired with a well-formed extension because a one-element
    // sort never calls the comparator that would dereference it.
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([tasks, withoutPresentation('broken')]);

    await renderSettled();

    expect(screen.getByText(tasks.presentation.label)).toBeTruthy();
    expect(emptyState()).toBeNull();
  });

  it('shows the empty state when every registered extension lacks presentation metadata', async () => {
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([
      withoutPresentation('broken-one'),
      withoutPresentation('broken-two'),
    ]);

    await renderSettled();

    expect(emptyState()).not.toBeNull();
  });
});
