import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScreenExtension } from '@gears-frontx/react';
import { resolveShellScreens, type ResolvedShellScreens } from '@gears-frontx/frontx-template-shell';
import { Menu } from './Menu';

const mockUseFrontX = vi.fn();
const mockUseMountedExtensions = vi.fn();
const mockBootstrapOnce = vi.fn();
const projectScreens = vi.hoisted(() => ({ current: undefined as ResolvedShellScreens | undefined }));

vi.mock('@/app/mfe/shellScreens', () => ({
  get shellScreens() {
    return projectScreens.current;
  },
}));

vi.mock('@/app/mfe/bootstrapOnce', () => ({
  bootstrapOnce: (...args: unknown[]) => mockBootstrapOnce(...args),
}));

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gears-frontx/react')>()),
  useAppSelector: () => undefined,
  useFrontX: () => mockUseFrontX(),
  useMountedExtensions: () => mockUseMountedExtensions(),
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
 * An extension the registry accepts and the default reader cannot render:
 * `presentation` is not validated anywhere on the registration path when the
 * target domain pins no extension type, so this shape can reach the menu.
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
    mockUseMountedExtensions.mockReturnValue([]);
    mockBootstrapOnce.mockResolvedValue(undefined);
    projectScreens.current = resolveShellScreens();
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

  it('stays blank until bootstrap has settled, then lists the registered screens', async () => {
    let finishBootstrap!: () => void;
    mockBootstrapOnce.mockReturnValue(new Promise<void>((resolve) => (finishBootstrap = resolve)));

    await renderSettled();
    expect(emptyState()).toBeNull();
    expect(screen.queryByText(tasks.presentation.label)).toBeNull();

    await act(async () => {
      finishBootstrap();
    });

    expect(screen.getByText(tasks.presentation.label)).toBeTruthy();
    expect(emptyState()).toBeNull();
  });

  it('shows the empty state when bootstrap settles with nothing registered', async () => {
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([]);

    await renderSettled();

    expect(emptyState()).not.toBeNull();
  });

  it('shows the empty state when bootstrap fails', async () => {
    mockBootstrapOnce.mockRejectedValue(new Error('manifests unavailable'));

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
    // One extension the reader cannot read must cost only itself. Paired with a well-formed extension because a one-element
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

  it("lists what the project's reader returns, built from a field its derived screen type adds", async () => {
    const inbox = {
      ...screenExtension(`${tasks.id}.inbox`, '/inbox', 10, 'Inbox'),
      presentation: { label: 'Inbox', order: 10, group: 'Mail' },
    };
    const readMenuItem = vi.fn((ext: { presentation: { label: string; group: string; order: number } }) => ({
      label: `${ext.presentation.group} / ${ext.presentation.label}`,
      order: ext.presentation.order,
    }));
    projectScreens.current = { ...resolveShellScreens(), readMenuItem: readMenuItem as never };
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([tasks, inbox]);

    await renderSettled();

    expect(readMenuItem).toHaveBeenCalledWith(inbox);
    expect(screen.getByText('Mail / Inbox')).toBeTruthy();
    // The reader's own order puts the inbox (10) ahead of tasks (20).
    const items = screen.getAllByTestId(/^menu-item-/).map((el) => el.getAttribute('data-testid'));
    expect(items).toEqual([`menu-item-${inbox.id}`, `menu-item-${tasks.id}`]);
  });

  it('lists no screens and shows no hint when the project turned the screen domain off', async () => {
    projectScreens.current = resolveShellScreens({ enabled: false });

    await renderSettled();

    expect(app.mfeRegistry.getExtensionsForDomain).not.toHaveBeenCalled();
    expect(screen.queryByTestId(/^menu-item-/)).toBeNull();
    expect(emptyState()).toBeNull();
  });
});
