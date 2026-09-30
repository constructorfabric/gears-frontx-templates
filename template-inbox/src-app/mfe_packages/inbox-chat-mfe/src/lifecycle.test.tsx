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
import { conversations } from '@inbox-shared/api/dataset';
import { InboxScreenLifecycle } from '@inbox-shared/lifecycle/InboxScreenLifecycle';
import { INBOX_SCREENS } from '@inbox-shared/navigation/screens';
import lifecycle, { ChatLifecycle } from './lifecycle';
import { t } from './test-support/translate';

const EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.inbox_chat.screens.chat.v1';

type Mounted = { shadowRoot: ShadowRoot; screen: ReturnType<typeof within>; setTheme: (theme: string) => void };

type LifecycleHooks = {
  initializeStyles: (container: ShadowRoot) => void;
  renderContent: (bridge: ReturnType<typeof createMfeBridgeFixture>['bridge']) => React.ReactNode;
};

const hooks = lifecycle as unknown as LifecycleHooks;

/**
 * Puts the lifecycle's styles and content into a shadow root at a page
 * address carrying `route` inside the screen domain's entry for the chat,
 * the parts of a mount this package owns: the base class's own mount (the
 * FrontX provider, host style adoption) is the shell's and tested there. The
 * screen reads the real service, answered by its mock plugin the way
 * `init.ts` switches it on.
 */
function mountAt(route: string | undefined, composed = true): Mounted {
  const address = route === undefined ? `/?screen=${INBOX_SCREENS.chat}` : `/?screen=${INBOX_SCREENS.chat};route=${route}`;
  window.history.replaceState(null, '', composed ? address : '/');
  const fixture = createMfeBridgeFixture({
    extDomainId: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
    extensionId: EXTENSION_ID,
    initialProperties: {
      [FRONTX_SHARED_PROPERTY_THEME]: 'light',
      [FRONTX_SHARED_PROPERTY_LANGUAGE]: 'en',
      ...(composed
        ? { [FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES]: { [EXTENSION_ID]: { domainKey: 'screen', extension: INBOX_SCREENS.chat } } }
        : {}),
    },
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  hooks.initializeStyles.call(lifecycle, shadowRoot);
  const container = document.createElement('div');
  shadowRoot.appendChild(container);
  render(<>{hooks.renderContent.call(lifecycle, fixture.bridge)}</>, { container });
  return {
    shadowRoot,
    screen: within(container),
    setTheme: (theme) => act(() => fixture.setProperty(FRONTX_SHARED_PROPERTY_THEME, theme)),
  };
}

/** The chat opens on the General channel, whose heading is the screen's one h1. */
const openedChat = (mounted: Mounted) => mounted.screen.findByRole('heading', { level: 1, name: 'General' });

/** General's most recently active conversation, the one the chat opens on its own. */
const OPENED_CONVERSATION = conversations.find((conversation) => conversation.subject === 'Design feedback on dashboard');

afterEach(() => {
  // Testing Library's cleanup unmounts the trees; the hosts go with the body.
  document.body.replaceChildren();
});

describe('ChatLifecycle', () => {
  it('is the inbox screen lifecycle, exported as the module default', () => {
    expect(lifecycle).toBeInstanceOf(ChatLifecycle);
    expect(lifecycle).toBeInstanceOf(InboxScreenLifecycle);
  });

  it("anchors the kit's tokens on the shadow host, including the dark block", () => {
    const { shadowRoot } = mountAt(undefined);
    const css = Array.from(shadowRoot.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(css).toContain(':host');
    expect(css).toContain('--background');
    expect(css).toContain(":host(:not([data-theme='light']))");
  });

  it('renders the channels, the list and the opened thread from the mocked service, inside a frame carrying the kit theme scope', async () => {
    const mounted = mountAt(undefined);
    const { shadowRoot, screen, setTheme } = mounted;

    expect(await openedChat(mounted)).toBeTruthy();
    expect(screen.getByLabelText(t('channels'))).toBeTruthy();
    expect(screen.getByLabelText(t('conversations'))).toBeTruthy();
    expect(screen.getAllByText('Design feedback on dashboard').length).toBe(2);
    expect(screen.getByPlaceholderText(t('reply_placeholder'))).toBeTruthy();
    const frame = shadowRoot.querySelector('[data-theme]');
    expect(frame?.getAttribute('data-theme')).toBe('light');
    expect(frame?.getAttribute('dir')).toBe('ltr');

    setTheme('dark');
    expect(frame?.getAttribute('data-theme')).toBe('dark');
  });

  it('shows every chat image from the package itself, so no image request leaves the shadow root', async () => {
    const user = userEvent.setup();
    const mounted = mountAt(undefined);
    await openedChat(mounted);

    // Sales' "Purple Bow" thread carries the seed's image message.
    await user.click(mounted.screen.getByText('Sales'));
    await user.click((await mounted.screen.findAllByText('Purple Bow from United States'))[0]);
    await waitFor(() => expect(mounted.shadowRoot.querySelectorAll('img').length).toBeGreaterThan(0));

    for (const image of Array.from(mounted.shadowRoot.querySelectorAll('img'))) {
      expect(image.getAttribute('src') ?? '').toMatch(/^data:/);
    }
  });

  it('opens the dialogs, the selects and the combobox inside the shadow root, in the portal node', async () => {
    const user = userEvent.setup();
    const mounted = mountAt(undefined);
    await openedChat(mounted);
    const portal = mounted.shadowRoot.querySelector('[data-inbox-portal]');
    expect(portal?.getRootNode()).toBe(mounted.shadowRoot);
    expect(portal?.parentElement?.firstElementChild).toBe(portal);

    await user.click(mounted.screen.getByLabelText(t('new_channel')));
    const channelDialog = await within(portal as HTMLElement).findByRole('dialog');
    expect(within(channelDialog).getByText(t('new_channel'))).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(within(portal as HTMLElement).queryByRole('dialog')).toBeNull());

    await user.click(mounted.screen.getByRole('combobox', { name: t('priority') }));
    expect(await within(portal as HTMLElement).findByRole('option', { name: t('label_high') })).toBeTruthy();
    await user.keyboard('{Escape}');

    await user.click(mounted.screen.getByLabelText(t('new_chat')));
    const chatDialog = await within(portal as HTMLElement).findByRole('dialog');
    await user.type(within(chatDialog).getByLabelText(t('new_chat_contact_label')), 'Grace');
    expect(await within(portal as HTMLElement).findByRole('option', { name: 'Grace Park' })).toBeTruthy();
    expect(document.body.querySelector(':scope > [role="dialog"], :scope > [role="listbox"]')).toBeNull();
  });

  it("opens the conversation's contact in the contacts screen, in the chat's place in the page address", async () => {
    const user = userEvent.setup();
    const mounted = mountAt(undefined);
    await openedChat(mounted);

    await user.click(mounted.screen.getByText(t('view_contact')));

    expect(OPENED_CONVERSATION).toBeDefined();
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      `/?screen=${INBOX_SCREENS.contacts};route=${OPENED_CONVERSATION?.contactId ?? ''}`
    );
  });

  it('offers no contact link when the shell broadcast no entry address, and matches the real URL', async () => {
    const mounted = mountAt(undefined, false);

    expect(await openedChat(mounted)).toBeTruthy();
    expect(mounted.screen.getByLabelText(t('customer_details'))).toBeTruthy();
    expect(mounted.screen.queryByText(t('view_contact'))).toBeNull();
  });

  it("answers an address that names no page of the screen with the screen's own not-found, in place of the chat", async () => {
    const { shadowRoot, screen } = mountAt('thread');

    await waitFor(() => expect(shadowRoot.querySelector('[data-testid="chat-route-not-found"]')).not.toBeNull());
    expect(screen.queryByRole('heading', { level: 1, name: 'General' })).toBeNull();
  });

  it('moves focus to the heading when the screen opens from something the user activated', async () => {
    const menuItem = document.createElement('button');
    document.body.appendChild(menuItem);
    menuItem.focus();

    const mounted = mountAt(undefined);
    const heading = await openedChat(mounted);
    await waitFor(() => expect(mounted.shadowRoot.activeElement).toBe(heading));
  });

  it('names the document after the section', async () => {
    const mounted = mountAt(undefined);
    await openedChat(mounted);

    expect(t('nav_label')).toBe('Chat');
    expect(document.title).toBe('Chat - Workspace');
  });
});
