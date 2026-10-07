import { act } from 'react';
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SHARED_PROPERTY_THEME,
} from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { InboxScreenLifecycle } from '@inbox-shared/lifecycle/InboxScreenLifecycle';
import { INBOX_SCREENS } from '@inbox-shared/navigation/screens';
import { mails } from './api/mailDataset';
import lifecycle, { MailLifecycle } from './lifecycle';
import { t } from './test-support/translate';

const EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.inbox_mail.screens.mail.v1';

type Mounted = {
  shadowRoot: ShadowRoot;
  screen: ReturnType<typeof within>;
  setTheme: (theme: string) => void;
  unmount: () => void;
};

type LifecycleHooks = {
  initializeStyles: (container: ShadowRoot) => void;
  renderContent: (bridge: ReturnType<typeof createMfeBridgeFixture>['bridge']) => React.ReactNode;
};

const hooks = lifecycle as unknown as LifecycleHooks;

/**
 * Puts the lifecycle's styles and content into a shadow root at a page
 * address carrying `route` inside the screen domain's entry for the mail,
 * the parts of a mount this package owns: the base class's own mount (the
 * FrontX provider, host style adoption) is the shell's and tested there. The
 * screen reads the real service, answered by its mock plugin the way
 * `init.ts` switches it on.
 */
function mountAt(route?: string): Mounted {
  const address = route === undefined ? `/?screen=${INBOX_SCREENS.mail}` : `/?screen=${INBOX_SCREENS.mail};route=${route}`;
  window.history.replaceState(null, '', address);
  const fixture = createMfeBridgeFixture({
    extDomainId: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
    extensionId: EXTENSION_ID,
    initialProperties: {
      [FRONTX_SHARED_PROPERTY_THEME]: 'light',
      [FRONTX_SHARED_PROPERTY_LANGUAGE]: 'en',
      [FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES]: { [EXTENSION_ID]: { domainKey: 'screen', extension: INBOX_SCREENS.mail } },
    },
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  hooks.initializeStyles.call(lifecycle, shadowRoot);
  const container = document.createElement('div');
  shadowRoot.appendChild(container);
  const view = render(<>{hooks.renderContent.call(lifecycle, fixture.bridge)}</>, { container });
  return {
    shadowRoot,
    screen: within(container),
    setTheme: (theme) => act(() => fixture.setProperty(FRONTX_SHARED_PROPERTY_THEME, theme)),
    unmount: () => {
      view.unmount();
      host.remove();
    },
  };
}

/** The screen's one h1: the list pane's heading, named after the open mailbox. */
const openedMailbox = (mounted: Mounted, mailbox = 'Inbox') =>
  mounted.screen.findByRole('heading', { level: 1, name: mailbox });

/** The Sent row of the mailbox column, whose badge counts what Sent holds. */
const sentNavRow = (mounted: Mounted): HTMLElement => {
  const row = within(mounted.screen.getByRole('navigation')).getByText('Sent').closest('button');
  if (row === null) throw new Error('Sent nav row not found');
  return row;
};

/**
 * Sets a controlled field's value the way typing does: through the native
 * setter, which React tracks, then an `input` event.
 */
function fill(field: HTMLElement, value: string): void {
  if (!(field instanceof HTMLInputElement)) throw new Error('not an input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

const SEED_SENT_COUNT = mails.filter((mail) => mail.mailboxId === 'sent').length;

afterEach(() => {
  // Testing Library's cleanup unmounts the trees; the hosts go with the body.
  document.body.replaceChildren();
});

describe('MailLifecycle', () => {
  it('is the inbox screen lifecycle, exported as the module default', () => {
    expect(lifecycle).toBeInstanceOf(MailLifecycle);
    expect(lifecycle).toBeInstanceOf(InboxScreenLifecycle);
  });

  it("anchors the kit's tokens on the shadow host, including the dark block", () => {
    const { shadowRoot } = mountAt();
    const css = Array.from(shadowRoot.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(css).toContain(':host');
    expect(css).toContain('--background');
    expect(css).toContain(":host(:not([data-theme='light']))");
  });

  it('renders the mailboxes, the list and the opened mail from the mocked service, inside a frame carrying the kit theme scope', async () => {
    const mounted = mountAt();
    const { shadowRoot, screen, setTheme } = mounted;

    expect(await openedMailbox(mounted)).toBeTruthy();
    for (const mailbox of ['Drafts', 'Sent', 'Archive', 'Trash']) {
      expect(within(screen.getByRole('navigation')).getByText(mailbox)).toBeTruthy();
    }
    expect(screen.getByLabelText(t('search_mail'))).toBeTruthy();
    expect(await screen.findByPlaceholderText(/^Reply to /)).toBeTruthy();
    const frame = shadowRoot.querySelector('[data-theme]');
    expect(frame?.getAttribute('data-theme')).toBe('light');
    expect(frame?.getAttribute('dir')).toBe('ltr');

    setTheme('dark');
    expect(frame?.getAttribute('data-theme')).toBe('dark');
  });

  it('opens the compose dialog inside the shadow root, in the portal node, on the recipient field', async () => {
    const user = userEvent.setup();
    const mounted = mountAt();
    await openedMailbox(mounted);
    const portal = mounted.shadowRoot.querySelector('[data-inbox-portal]');
    expect(portal?.getRootNode()).toBe(mounted.shadowRoot);

    await user.click(mounted.screen.getByLabelText(t('compose')));
    const dialog = await within(portal as HTMLElement).findByRole('dialog');
    const toField = within(dialog).getByLabelText(t('compose_to_label'));
    await waitFor(() => expect(mounted.shadowRoot.activeElement).toBe(toField));
    expect(document.body.querySelector(':scope > [role="dialog"]')).toBeNull();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(within(portal as HTMLElement).queryByRole('dialog')).toBeNull());
  });

  it('keeps a sent mail and the selected mailbox when the screen unmounts and mounts again', async () => {
    const user = userEvent.setup();
    const first = mountAt();
    await openedMailbox(first);

    await user.click(first.screen.getByLabelText(t('compose')));
    const portal = first.shadowRoot.querySelector<HTMLElement>('[data-inbox-portal]');
    if (portal === null) throw new Error('portal node not found');
    const dialog = within(await within(portal).findByRole('dialog'));
    // Filled through the fields' value setter rather than user-event, whose
    // focus handling reads the document's active element, which inside a
    // shadow root is only the host, so its typing into a second field of a
    // focus-trapped dialog lands nowhere.
    act(() => fill(dialog.getByLabelText(t('compose_to_label')), 'devon@brightlabs.example'));
    act(() => fill(dialog.getByLabelText(t('compose_subject_label')), 'Staging access follow-up'));
    act(() => dialog.getByRole('button', { name: t('send') }).click());
    await waitFor(() => expect(within(portal).queryByRole('dialog')).toBeNull());

    await user.click(sentNavRow(first));
    await openedMailbox(first, 'Sent');
    await waitFor(() => expect(within(sentNavRow(first)).getByText(String(SEED_SENT_COUNT + 1))).toBeTruthy());
    first.unmount();

    // A new mount: the screen's own state starts over, so the sent mail can
    // only come back from the service, which reads it from the page-wide
    // mail state; the mailbox comes back from the screen's store.
    const second = mountAt();
    expect(await openedMailbox(second, 'Sent')).toBeTruthy();
    await waitFor(() => expect(within(sentNavRow(second)).getByText(String(SEED_SENT_COUNT + 1))).toBeTruthy());
    expect((await second.screen.findAllByText(/Staging access follow-up/)).length).toBeGreaterThan(0);
  });

  it("answers an address that names no page of the screen with the screen's own not-found, in place of the mail", async () => {
    const { shadowRoot, screen } = mountAt('ml-1');

    await waitFor(() => expect(shadowRoot.querySelector('[data-testid="mail-route-not-found"]')).not.toBeNull());
    expect(screen.queryByRole('heading', { level: 1, name: 'Inbox' })).toBeNull();
  });

  it('moves focus to the heading when the screen opens from something the user activated', async () => {
    const menuItem = document.createElement('button');
    document.body.appendChild(menuItem);
    menuItem.focus();

    const mounted = mountAt();
    const heading = await openedMailbox(mounted);
    await waitFor(() => expect(mounted.shadowRoot.activeElement).toBe(heading));
  });

  it('names the document after the section', async () => {
    const mounted = mountAt();
    await openedMailbox(mounted);

    expect(t('nav_label')).toBe('Mail');
    expect(document.title).toBe('Mail - Workspace');
  });
});
