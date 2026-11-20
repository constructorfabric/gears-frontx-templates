/**
 * The modal domain's host-driven cases, end to end through the real runtime:
 * the framework's `microfrontends()` plugin builds the registry with the
 * router of `@gears-frontx/routing`, the container registers the popup domain
 * the shell presents as a modal extension domain (`modalDomain.ts`) together
 * with the extensions of the manifest aggregate, and the dialog layer presents
 * what the domain mounts. Nothing routing or mounting related is stubbed. Only
 * the loading of a remote is: the handler is the real `MfeHandlerMF` with
 * `load` answering an inline lifecycle instead of fetching a Module
 * Federation bundle.
 *
 * The host drives the domain the way a menu item would, through
 * `registry.executeActionsChain`, after the container's slots have attached -
 * so these cases need no page-load address, and they share one file. The
 * deep-link case lives alone in `modalDomainDeepLink.test.tsx`: the page-load
 * record is a realm slot the module reset cannot clear, so a file simulates
 * one page load, and every case here imports the shell's modules afresh
 * (screenDomainOrder.test.tsx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import styles from './MfeScreenContainer.module.css';
import {
  POPUP_DOMAIN,
  buildApp,
  extensionId,
  makeModalAggregate,
  mountedModalText,
  renderContainer,
  teardownModalSuite,
} from './__test-utils__/modalHarness';

describe('the modal domain through the real runtime', () => {
  let registry: Awaited<ReturnType<typeof buildApp>>['registry'] | undefined;

  beforeEach(() => {
    registry = undefined;
    vi.resetModules();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(makeModalAggregate()))),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(async () => {
    await teardownModalSuite(registry);
  });

  it('the modal container registers the popup domain and admits its modal extensions', async () => {
    const built = await buildApp();
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    await renderContainer(built.react, built.app);

    await waitFor(() => expect(registry?.getDomain(POPUP_DOMAIN)).toBeDefined());
    const admitted = await waitFor(() => {
      const ids = registry?.getExtensionsForDomain(POPUP_DOMAIN).map((extension) => extension.id) ?? [];
      expect(ids).toContain(extensionId('terms'));
      expect(ids).toContain(extensionId('locked'));
      return ids;
    });
    expect(admitted).toHaveLength(2);

    // The domain's slot sits inside the dialog layer, closed while no modal
    // is mounted.
    const layer = document.querySelector('[data-modal-layer]');
    expect(layer).not.toBeNull();
    expect(layer?.getAttribute('data-modal-open')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(modalState.getSnapshot()).toBeUndefined();
  });

  it('mount_ext shows the modal and unmount_ext removes it', async () => {
    const built = await buildApp();
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    await renderContainer(built.react, built.app);
    // The layer is up, so the bootstrap has settled and the domain's slot has
    // attached its root in the same commit; a flush lets those effects land
    // before the host drives the domain.
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain({
        action: {
          type: built.react.FRONTX_ACTION_MOUNT_EXT,
          target: POPUP_DOMAIN,
          payload: { subject: extensionId('terms') },
        },
      });
    });
    // The layer opens as the dialog the presentation names, and the mount
    // lands in the domain's slot.
    await screen.findByRole('dialog', { name: 'Terms of use' });
    expect(modalState.getSnapshot()).toBe(extensionId('terms'));
    await waitFor(() => expect(mountedModalText(document.body)).toEqual(['modal ./terms']));
    // The modal's host carries the theme host attribute, as a screen's does
    // (screenThemeHost.test.tsx): the managed theme rule can reach the
    // extension in its shadow root only through it.
    const host = document.querySelector(`[data-extension-id="${extensionId('terms')}"]`);
    expect(host?.hasAttribute(built.react.FRONTX_THEME_HOST_ATTRIBUTE)).toBe(true);
    // The routed domain owns its URL entries: the opened modal is addressable.
    expect(new URLSearchParams(window.location.search).get('popup')).toBe('terms');

    act(() => {
      registry?.executeActionsChain({
        action: {
          type: built.react.FRONTX_ACTION_UNMOUNT_EXT,
          target: POPUP_DOMAIN,
          payload: { subject: extensionId('terms') },
        },
      });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('popup')).toBeNull());
    await waitFor(() => expect(mountedModalText(document.body)).toEqual([]));
  });

  it('a non-cancelable modal has no close button and ignores Escape until the host unmounts it', async () => {
    const built = await buildApp();
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    await renderContainer(built.react, built.app);
    await act(async () => {});

    act(() => {
      registry?.executeActionsChain({
        action: {
          type: built.react.FRONTX_ACTION_MOUNT_EXT,
          target: POPUP_DOMAIN,
          payload: { subject: extensionId('locked') },
        },
      });
    });
    const dialog = await screen.findByRole('dialog', { name: 'Session locked' });
    // size "medium": the layer carries the centred-panel presentation.
    expect(dialog.className).toContain(styles.modalMedium);
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: 'Session locked' })).not.toBeNull();
    expect(modalState.getSnapshot()).toBe(extensionId('locked'));
    expect(mountedModalText(document.body)).toEqual(['modal ./locked']);

    act(() => {
      registry?.executeActionsChain({
        action: {
          type: built.react.FRONTX_ACTION_UNMOUNT_EXT,
          target: POPUP_DOMAIN,
          payload: { subject: extensionId('locked') },
        },
      });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(mountedModalText(document.body)).toEqual([]));
  });
});
