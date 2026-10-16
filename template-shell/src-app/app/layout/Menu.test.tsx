import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { eventBus, type ScreenExtension } from '@gears-frontx/react';
import {
  resolveShellScreens,
  type ResolvedShellScreens,
  type ScreenMenuItemReader,
} from '@gears-frontx/frontx-template-shell';
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

  it("lists what the project's reader returns, including a field beyond the flat presentation", async () => {
    // The flat order (30) sorts the inbox after tasks (20); only the reader's
    // own order (10) puts it first.
    const inbox = {
      ...screenExtension(`${tasks.id}.inbox`, '/inbox', 30, 'Inbox'),
      presentation: { label: 'Inbox', order: 30, group: 'Mail', menuOrder: 10 },
    };
    const readMenuItem = vi.fn<ScreenMenuItemReader>((ext) => {
      const p = (ext as { presentation?: { label: string; group?: string; menuOrder?: number } }).presentation;
      return p && { label: p.group ? `${p.group} / ${p.label}` : p.label, order: p.menuOrder ?? 20 };
    });
    projectScreens.current = { ...resolveShellScreens(), readMenuItem };
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([tasks, inbox]);

    await renderSettled();

    expect(readMenuItem).toHaveBeenCalledWith(inbox, { language: 'en' });
    expect(screen.getByText('Mail / Inbox')).toBeTruthy();
    const items = screen.getAllByTestId(/^menu-item-/).map((el) => el.getAttribute('data-testid'));
    expect(items).toEqual([`menu-item-${inbox.id}`, `menu-item-${tasks.id}`]);
  });

  it('leaves out only the screen a project reader throws on, and logs it', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = screenExtension(`${tasks.id}.broken`, '/broken', 5, 'Broken');
    projectScreens.current = {
      ...resolveShellScreens(),
      readMenuItem: (ext) => {
        if (ext.id === broken.id) throw new Error('no group');
        return { label: 'Tasks' };
      },
    };
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([broken, tasks]);

    try {
      await renderSettled();

      expect(screen.getByTestId(`menu-item-${tasks.id}`)).toBeTruthy();
      expect(screen.queryByTestId(`menu-item-${broken.id}`)).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(broken.id), expect.any(Error));
    } finally {
      errorSpy.mockRestore();
    }
  });

  describe('language', () => {
    const switchLanguage = async (language: string) => {
      await act(async () => {
        eventBus.emit('i18n/language/changed', { language });
      });
    };

    const translatedTasks = { ...tasks, presentation: { ...tasks.presentation, labels: { de: 'Aufgaben' } } };

    it('relabels the menu when the language switches, and back', async () => {
      app.mfeRegistry.getExtensionsForDomain.mockReturnValue([translatedTasks]);
      await renderSettled();
      expect(screen.getByTestId(`menu-item-${tasks.id}`).textContent).toBe('Tasks');

      await switchLanguage('de');
      expect(screen.getByTestId(`menu-item-${tasks.id}`).textContent).toBe('Aufgaben');

      await switchLanguage('fr');
      expect(screen.getByTestId(`menu-item-${tasks.id}`).textContent).toBe('Tasks');
    });

    it('starts in the language the shell already has', async () => {
      app.mfeRegistry.getExtensionsForDomain.mockReturnValue([translatedTasks]);
      mockUseFrontX.mockReturnValue({ ...app, i18nRegistry: { getLanguage: () => 'de' } });

      await renderSettled();

      expect(screen.getByTestId(`menu-item-${tasks.id}`).textContent).toBe('Aufgaben');
    });

    it("hands the current language to the project's reader", async () => {
      const readMenuItem = vi.fn<ScreenMenuItemReader>((_ext, { language }) => ({ label: `Tasks (${language})` }));
      projectScreens.current = { ...resolveShellScreens(), readMenuItem };
      await renderSettled();

      await switchLanguage('ja');

      expect(readMenuItem).toHaveBeenLastCalledWith(tasks, { language: 'ja' });
      expect(screen.getByText('Tasks (ja)')).toBeTruthy();
    });
  });

  it('marks only the mounted screen as the current page', async () => {
    const inbox = screenExtension(`${tasks.id}.inbox`, '/inbox', 30, 'Inbox');
    app.mfeRegistry.getExtensionsForDomain.mockReturnValue([tasks, inbox]);
    mockUseMountedExtensions.mockReturnValue([inbox]);

    await renderSettled();

    expect(screen.getByTestId(`menu-item-${inbox.id}`).getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId(`menu-item-${tasks.id}`).hasAttribute('aria-current')).toBe(false);
  });

  it('lists no screens and shows no hint when the project turned the screen domain off', async () => {
    projectScreens.current = resolveShellScreens({ enabled: false });

    await renderSettled();

    // Bootstrap still runs, from the screen container; the menu has nothing to wait for.
    expect(mockBootstrapOnce).not.toHaveBeenCalled();
    expect(app.mfeRegistry.getExtensionsForDomain).not.toHaveBeenCalled();
    expect(screen.queryByTestId(/^menu-item-/)).toBeNull();
    expect(emptyState()).toBeNull();
  });
});
