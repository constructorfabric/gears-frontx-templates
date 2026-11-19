/**
 * A deep link opens a modal, end to end through the real runtime: the
 * framework's `microfrontends()` plugin builds the registry with the router of
 * `@gears-frontx/routing`, the container registers the popup domain the shell
 * presents as a modal extension domain (`modalDomain.ts`) together with the
 * extensions of the manifest aggregate, and the dialog layer presents what
 * the domain mounts. Nothing routing or mounting related is stubbed. Only the
 * loading of a remote is: the handler is the real `MfeHandlerMF` with `load`
 * answering an inline lifecycle instead of fetching a Module Federation
 * bundle.
 *
 * One case per file, like `deepLink.test.tsx`: the page-load record is a realm
 * slot the module reset cannot clear, so a file simulates one page load, and
 * the deep link only counts on the first routed-domain start of the file.
 * The host-driven cases (registration, `mount_ext`/`unmount_ext` chains, the
 * non-cancelable modal) share `modalDomain.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import styles from './MfeScreenContainer.module.css';
import {
  buildApp,
  extensionId,
  makeModalAggregate,
  mountedModalText,
  renderContainer,
  teardownModalSuite,
} from './__test-utils__/modalHarness';

describe('a modal deep link through the real router', () => {
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

  it('a deep link opens the full-size modal, which covers the viewport and closes on Escape', async () => {
    window.history.replaceState(null, '', '/?popup=terms');
    const built = await buildApp();
    registry = built.registry;
    const { modalState } = await import('./modalDomain');
    await renderContainer(built.react, built.app);

    const dialog = await screen.findByRole('dialog', { name: 'Terms of use' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // size "full": the layer carries the covers-the-viewport presentation.
    expect(dialog.className).toContain(styles.modalFull);
    expect(modalState.getSnapshot()).toBe(extensionId('terms'));
    await waitFor(() => expect(mountedModalText(document.body)).toEqual(['modal ./terms']));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('popup')).toBe('terms'));

    // A cancelable modal names the way out and answers Escape with the
    // unmount the host would send.
    expect(within(dialog).getByRole('button', { name: 'Close' })).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(modalState.getSnapshot()).toBeUndefined();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('popup')).toBeNull());
    await waitFor(() => expect(mountedModalText(document.body)).toEqual([]));
  });
});
