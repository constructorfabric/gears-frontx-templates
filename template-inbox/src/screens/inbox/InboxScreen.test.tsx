import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  endpointTags,
  latestMutation,
  latestVariables,
  mutationResult,
  queryResultFor,
  refetchCalls,
  resetApiMocks,
  setQueryState,
  succeedMutation,
} from '../../__test-utils__/apiMocks';
import { contacts, conversations, messages } from '../../api/dataset';
import type { Conversation, PostMessageRequest } from '../../api/types';
import { messageDayLabel, messageTimeOfDay } from '../../shared/format';
import { stubMatchMedia } from '../../__test-utils__/matchMedia';
import { COMPACT_QUERY, SINGLE_PANE_QUERY } from '../../shared/useMediaQuery';
import { t } from '../../shared/i18n';

vi.mock('../../api/registry', () => ({ getInboxApi: () => endpointTags }));
vi.mock('../../api/queries', () => ({
  useApiQuery: queryResultFor,
  useApiMutation: mutationResult,
}));

const { InboxScreen } = await import('./InboxScreen');
const { inboxStore } = await import('./inboxStore');

// `inboxStore` outlives a mount by design; `vitest.setup.ts` resets it (and
// every other store) after each test, so each case starts from the initial
// channel and selection.
afterEach(() => {
  resetApiMocks();
});

const replyBox = () => screen.getByPlaceholderText<HTMLTextAreaElement>(t('reply_placeholder'));

/** A conversation as the server answers a create: empty, open, in `channelId`. */
const startedConversation = (id: string, channelId: string, contactId: string): Conversation => ({
  ...conversations[0],
  id,
  channelId,
  contactId,
  subject: contacts.find((contact) => contact.id === contactId)?.name ?? '',
  snippet: '',
  unreadCount: 0,
  status: 'open',
  starred: false,
  snoozed: false,
  pinned: false,
  tags: [],
  suggestedReplies: [],
});

/**
 * React tracks a controlled input's previous value on the DOM node itself, so
 * assigning `.value` directly and dispatching a plain `input` event is a
 * no-op - React sees no change to fire `onChange` for. Going through the
 * native value setter first is what makes the dispatch register, the same
 * workaround `MailScreen.test.tsx` uses for its own controlled fields.
 */
function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

// Queries go through Testing Library's document-wide `screen`, which also
// reaches what the kit portals to `document.body` - dialogs, menus and
// their fields - once it is open.

describe('InboxScreen', () => {
  it('lists the seeded channels and conversations, and opens the first conversation of the default channel automatically', () => {
    render(<InboxScreen t={t} />);

    // "General" is both the channel row and the open pane's own heading.
    expect(screen.getAllByText('General').length).toBe(2);
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Sales')).toBeTruthy();
    // "Design feedback on dashboard" appears twice - the list row and the
    // open thread's own subject line - because it is General's most
    // recently active conversation, auto-selected below.
    expect(screen.getAllByText('Design feedback on dashboard').length).toBe(2);
    // The list opens on General, so a Support-channel subject is not in the pane.
    expect(screen.queryByText('Dark mode toggle not persisting')).toBeNull();
    // General's most recently active conversation opens on its own: no click
    // needed, the empty state is gone, and the composer is ready.
    expect(screen.queryByText(t('empty_title'))).toBeNull();
    expect(screen.getByPlaceholderText(t('reply_placeholder'))).toBeTruthy();
  });

  it('auto-selects the first conversation again on a channel switch, without disturbing a selection made while staying in one', () => {
    render(<InboxScreen t={t} />);

    act(() => {
      screen.getByText('Support').click();
    });
    // Support's pinned conversation (c-1, "Silver Sunshine from India") is
    // auto-selected ahead of c-9 - its own most-recently-active row - the
    // pin overriding recency even though c-1 is itself snoozed and offers
    // no suggested replies.
    expect(screen.queryByText(t('empty_title'))).toBeNull();
    expect(screen.queryByLabelText(t('suggested_replies'))).toBeNull();
    expect(screen.getAllByText('Silver Sunshine from India').length).toBeGreaterThan(0);

    // A conversation the agent picks by hand must stick while the channel
    // does not change.
    act(() => {
      screen.getByText('Suspicious attachment').click();
    });
    expect(screen.queryByLabelText(t('suggested_replies'))).toBeNull();

    // An unrelated re-render while staying in the same channel (toggling the
    // details panel) must not reset the hand-picked selection back to the
    // channel's auto-picked conversation.
    act(() => {
      screen.getByLabelText(t('toggle_details')).click();
    });
    expect(screen.queryByLabelText(t('suggested_replies'))).toBeNull();

    // Leaving for Sales and coming straight back to Support re-arms the
    // auto-pick: re-entering the channel opens its first conversation again
    // rather than restoring the hand-picked one - the documented, acceptable
    // shape of "auto-select on entering a channel".
    act(() => {
      screen.getByText('Sales').click();
    });
    act(() => {
      screen.getByText('Support').click();
    });
    expect(screen.queryByText(t('empty_title'))).toBeNull();
    expect(screen.getByPlaceholderText(t('reply_placeholder'))).toBeTruthy();
  });

  it('offers the thread its suggested replies and drafts the one that is clicked', () => {
    render(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    // Support's auto-selected row is its pinned conversation (c-1), not
    // this one, so this click actually switches the thread rather than
    // being a no-op re-selection.
    act(() => {
      screen.getAllByText('Dark mode toggle not persisting')[0].click();
    });

    const chip = screen.getByText('Share your browser?');
    expect(screen.getByText('Clear local storage?')).toBeTruthy();

    // The chip drafts, it does not send: the text lands in the reply box.
    // Found by its placeholder, because the tab and its panel answer to the
    // "reply" label too.
    const draft = screen.getByPlaceholderText(t('reply_placeholder'));
    expect(draft instanceof HTMLTextAreaElement).toBe(true);
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error('composer is not a textarea');
    expect(draft.value).toBe('');
    act(() => {
      chip.click();
    });
    expect(draft.value).toBe('Share your browser?');
  });

  it('offers no suggested reply on a spam-tagged thread', () => {
    render(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    act(() => {
      screen.getByText('Suspicious attachment').click();
    });

    // The composer is there to reply with; the assistant just has nothing
    // worth suggesting, so the row itself is absent. The thread sits in a
    // normal channel - spam is a tag here, not a destination.
    expect(screen.getByPlaceholderText(t('reply_placeholder'))).toBeTruthy();
    expect(screen.queryByLabelText(t('suggested_replies'))).toBeNull();
  });

  it('renders every rich message type in a transcript: image, file, and an inline link', () => {
    const view = render(<InboxScreen t={t} />);

    // "Design feedback on dashboard" (c-11, General's most active thread, open
    // by default) is the showcase thread: its m-11-3 is a file-only message
    // carrying TWO attachments at once - a bare card per file, no bubble.
    // Both names also appear in the customer panel's own "Shared files" list
    // (`conversation.sharedFiles`, a separate field), hence two matches each.
    expect(screen.getAllByText('dashboard-mockup.png').length).toBe(2);
    expect(screen.getAllByText('248 KB').length).toBe(2);
    expect(screen.getAllByText('design-spec.pdf').length).toBe(2);
    expect(screen.getAllByText('92 KB').length).toBe(2);
    // Its own m-11-4 embeds an inline link too, right in the default thread.
    const showcaseLink = screen.getByText('our roadmap');
    expect(showcaseLink.tagName).toBe('A');

    act(() => {
      screen.getByText('Sales').click();
    });
    act(() => {
      screen.getAllByText('Purple Bow from United States')[0].click();
    });
    // c-7's last message (m-7-3) is an image with a caption - the <img> and
    // the caption both render, and the image carries an empty alt because
    // the caption beside it already says what it shows.
    expect(screen.getAllByText(/Here is how the license page renders on our side/).length).toBe(2);
    const image = view.container.querySelector('img[src$="/message-assets/preview-chart.svg"]');
    expect(image?.getAttribute('alt')).toBe('');

    act(() => {
      screen.getByText('Support').click();
    });
    act(() => {
      screen.getAllByText('Dark mode toggle not persisting')[0].click();
    });
    // c-9's last message (m-9-9) embeds one inline link - rendered as a real
    // anchor, not markdown text, and opened in a new tab so it never replaces
    // the app itself.
    const link = screen.getByText('our help page');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://example.com/help');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('groups a transcript into one divider per calendar day, and puts the time inside the bubble', () => {
    render(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    act(() => {
      screen.getAllByText('Dark mode toggle not persisting')[0].click();
    });

    // Read off the seed rather than written down: the thread's instants are
    // offsets from the load-time anchor, so which days it spans depends on
    // the hour the suite runs at.
    const thread = messages.filter((message) => message.conversationId === 'c-9');
    const dayLabels = [...new Set(thread.map((message) => messageDayLabel(message.sentAt)))];
    for (const label of dayLabels) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }

    // The time of day sits in the bubble; there is no meta line under it.
    expect(screen.queryByText(/ - (Seen|Not seen)$/)).toBeNull();
    expect(screen.getAllByText(messageTimeOfDay(thread[1].sentAt)).length).toBeGreaterThan(0);
  });

  it('groups pinned conversations under their own label, ahead of the rest', () => {
    render(<InboxScreen t={t} />);

    // General opens by default; its own pinned conversation (c-11, the
    // showcase thread) renders under a "Pinned" label, ahead of its two
    // unpinned siblings.
    expect(screen.getByText(t('pinned'))).toBeTruthy();
    expect(screen.getByLabelText(t('pinned_conversation'))).toBeTruthy();

    act(() => {
      screen.getByText('Sales').click();
    });
    // Sales' own pinned conversation (c-2, "Refund request...") leads its
    // list even though c-7 ("Purple Bow...") is more recently active -
    // both a rendering and an ordering check, read off the list pane's own
    // DOM order (row order is not otherwise observable through RTL's
    // query API).
    const listText = screen.getByLabelText(t('conversations')).textContent ?? '';
    const refundIndex = listText.indexOf('Refund request');
    const purpleBowIndex = listText.indexOf('Purple Bow');
    expect(refundIndex).toBeGreaterThanOrEqual(0);
    expect(purpleBowIndex).toBeGreaterThan(refundIndex);
  });

  it('sends a thread reader to the customer page as a link the URL can carry', () => {
    render(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    // Support's auto-selected row is its pinned conversation (c-1), not
    // this one, so this click actually switches the thread rather than
    // being a no-op re-selection.
    act(() => {
      screen.getAllByText('Dark mode toggle not persisting')[0].click();
    });
    act(() => {
      screen.getByText(t('view_contact')).click();
    });

    // The jump is a route change, not screen-local state: that is what lets the
    // same address be reloaded, bookmarked and shared.
    expect(window.location.hash).toBe('#/contacts/r-3');
  });

  it('creates a channel from the dialog and switches into it, on the existing empty state', () => {
    render(<InboxScreen t={t} />);

    act(() => {
      screen.getByLabelText(t('new_channel')).click();
    });
    const nameField = screen.getByLabelText(t('channel_name'));
    if (!(nameField instanceof HTMLInputElement)) throw new Error('channel name is not an input');

    // Empty name: the create action stays disabled rather than creating a
    // blank channel.
    expect(screen.getByText(t('create_channel')).closest('button')?.disabled).toBe(true);

    act(() => {
      typeInto(nameField, 'Design Reviews');
    });
    expect(screen.getByText(t('create_channel')).closest('button')?.disabled).toBe(false);

    act(() => {
      screen.getByText(t('create_channel')).click();
    });

    // The dialog closed (its portalled content is gone from the whole
    // document, not just this screen's own container), the new channel is
    // a real row in the sidebar (not a stub - it carries its own item
    // count), and it is the one now open, landing on the same empty state
    // any zero-conversation channel shows.
    expect(screen.queryByText(t('channel_name'))).toBeNull();
    expect(screen.getAllByText('Design Reviews').length).toBeGreaterThan(0);
    expect(screen.queryByText(t('empty_title'))).toBeTruthy();
  });

  it('opens the new-chat dialog focused on the contact field, gated on a pick', () => {
    render(<InboxScreen t={t} />);

    act(() => {
      screen.getByLabelText(t('new_chat')).click();
    });
    // Base UI's Combobox popup needs real layout (ResizeObserver-driven
    // positioning) to open, which jsdom does not provide - the filtered
    // contact list itself is exercised in the live app instead (see the
    // final report), not in this suite. What IS reliably testable here:
    // the dialog opens with focus already on the contact field, and Start
    // stays gated with nothing picked yet.
    const contactField = screen.getByLabelText(t('new_chat_contact_label'));
    expect(document.activeElement).toBe(contactField);
    expect(screen.getByText(t('start_chat')).closest('button')?.disabled).toBe(true);

    act(() => {
      screen.getByText(t('cancel')).click();
    });
    // Cancel discards: no conversation was created - General's channel-nav
    // badge and its own pane count are both still "3".
    expect(screen.queryByLabelText(t('new_chat_contact_label'))).toBeNull();
    expect(screen.getAllByText('3').length).toBe(2);
  });

  it('shows an error with a retry instead of the panes when a query the first paint needs fails', () => {
    setQueryState('messages', { error: new Error('down') });
    render(<InboxScreen t={t} />);

    expect(screen.getByRole('alert').textContent).toContain(t('load_error_title'));
    expect(screen.queryByText('General')).toBeNull();
    act(() => {
      screen.getByRole('button', { name: t('retry') }).click();
    });
    expect(refetchCalls).toEqual(['messages']);
  });

  it('waits for every query before the first paint', () => {
    setQueryState('contacts', { isLoading: true });
    render(<InboxScreen t={t} />);

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('General')).toBeNull();
  });

  it('clears the draft after a send only if it still holds what was sent', () => {
    render(<InboxScreen t={t} />);
    const box = screen.getByPlaceholderText<HTMLTextAreaElement>(t('reply_placeholder'));

    act(() => typeInto(box, 'First answer'));
    act(() => {
      screen.getByText(t('send')).click();
    });
    const request = latestVariables('postMessage') as PostMessageRequest;
    expect(request).toMatchObject({ body: 'First answer', kind: 'reply' });

    // Typed while the post is in flight: a new draft, not the sent one.
    act(() => typeInto(screen.getByPlaceholderText<HTMLTextAreaElement>(t('reply_placeholder')), 'Follow-up'));
    act(() => {
      succeedMutation(
        'postMessage',
        { message: { ...messages[0], id: 'm-sent-1', conversationId: request.conversationId, body: 'First answer' } },
        request
      );
    });
    expect(screen.getByPlaceholderText<HTMLTextAreaElement>(t('reply_placeholder')).value).toBe('Follow-up');

    // The next send's success clears it, because nothing changed meanwhile.
    act(() => {
      screen.getByText(t('send')).click();
    });
    const second = latestVariables('postMessage') as PostMessageRequest;
    act(() => {
      succeedMutation(
        'postMessage',
        { message: { ...messages[0], id: 'm-sent-2', conversationId: second.conversationId, body: 'Follow-up' } },
        second
      );
    });
    expect(screen.getByPlaceholderText<HTMLTextAreaElement>(t('reply_placeholder')).value).toBe('');
  });

  it('takes no reply on a closed conversation', () => {
    render(<InboxScreen t={t} />);
    act(() => {
      screen.getByText(t('close')).click();
    });
    // Closing clears the selection; opening the thread again shows it closed.
    act(() => {
      screen.getAllByText('Design feedback on dashboard')[0].click();
    });

    const box = screen.getByPlaceholderText<HTMLTextAreaElement>(t('conversation_closed_placeholder'));
    expect(box.disabled).toBe(true);
  });

  it('marks and unmarks spam from the thread header menu, and renders the actions it does not ship disabled', () => {
    render(<InboxScreen t={t} />);

    const ticket = screen.getByLabelText(t('create_ticket'));
    expect(ticket.hasAttribute('disabled') || ticket.getAttribute('aria-disabled') === 'true').toBe(true);

    act(() => {
      screen.getByLabelText(t('more_actions')).click();
    });
    act(() => {
      screen.getByRole('menuitem', { name: t('mark_as_spam') }).click();
    });
    // The details panel's own toggle reads the same tag.
    expect(screen.getAllByText(t('remove_from_spam')).length).toBeGreaterThan(0);

    act(() => {
      screen.getByLabelText(t('more_actions')).click();
    });
    act(() => {
      screen.getByRole('menuitem', { name: t('remove_from_spam') }).click();
    });
    expect(screen.queryAllByText(t('remove_from_spam'))).toHaveLength(0);
  });

  it('names the unread count in the badge label', () => {
    render(<InboxScreen t={t} />);
    const unread = conversations.find(
      (conversation) => conversation.unreadCount > 0 && conversation.channelId === 'general'
    );

    expect(unread).toBeDefined();
    expect(screen.getByLabelText(t('unread_messages_count', { count: unread?.unreadCount ?? 0 }))).toBeTruthy();
  });

  it('closes the new-channel dialog with Escape and gives focus back to the button that opened it', async () => {
    render(<InboxScreen t={t} />);
    const trigger = screen.getByLabelText(t('new_channel'));

    act(() => {
      trigger.focus();
      trigger.click();
    });
    const nameField = screen.getByLabelText(t('channel_name'));
    await waitFor(() => expect(document.activeElement).toBe(nameField));

    act(() => {
      fireEvent.keyDown(nameField, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByLabelText(t('channel_name'))).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('opens the thread menu from the keyboard, and Escape closes it back onto its trigger', async () => {
    render(<InboxScreen t={t} />);
    const trigger = screen.getByLabelText(t('more_actions'));

    act(() => {
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    });
    const item = await screen.findByRole('menuitem', { name: t('mark_as_spam') });
    act(() => {
      fireEvent.keyDown(item, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: t('mark_as_spam') })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('adds a tag with Enter and returns focus to the add button, and Escape drops the draft', () => {
    render(<InboxScreen t={t} />);

    act(() => {
      screen.getByText(t('add_tag')).click();
    });
    const field = screen.getByPlaceholderText<HTMLInputElement>(t('add_tag'));
    act(() => typeInto(field, 'vip'));
    act(() => {
      fireEvent.keyDown(field, { key: 'Enter' });
    });
    expect(screen.getByLabelText(t('remove_tag', { tag: 'vip' }))).toBeTruthy();
    expect(document.activeElement?.textContent).toBe(t('add_tag'));

    act(() => {
      screen.getByText(t('add_tag')).click();
    });
    const second = screen.getByPlaceholderText<HTMLInputElement>(t('add_tag'));
    act(() => typeInto(second, 'discarded'));
    act(() => {
      fireEvent.keyDown(second, { key: 'Escape' });
    });
    expect(screen.queryByLabelText(t('remove_tag', { tag: 'discarded' }))).toBeNull();
    expect(document.activeElement?.textContent).toBe(t('add_tag'));
  });

  it('folds the channel column from the list header and takes it out of the tab order', () => {
    render(<InboxScreen t={t} />);
    const sidebar = screen.getByLabelText(t('channels'), { selector: 'aside' });
    const toggle = screen.getByLabelText(t('toggle_channels'));

    expect(sidebar.hasAttribute('inert')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    act(() => {
      toggle.click();
    });
    expect(sidebar.hasAttribute('inert')).toBe(true);
    expect(sidebar.getAttribute('aria-hidden')).toBe('true');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('names the pinned icon and the read receipts as images', () => {
    render(<InboxScreen t={t} />);
    expect(screen.getByLabelText(t('pinned_conversation')).getAttribute('role')).toBe('img');
    // The default thread carries seen receipts, so the loop has something to check.
    const receipts = screen.getAllByLabelText(t('message_read'));
    expect(receipts.length).toBeGreaterThan(0);
    for (const receipt of receipts) {
      expect(receipt.getAttribute('role')).toBe('img');
    }
  });

  it('keeps the channel, the open conversation, drafts and thread changes across a remount', () => {
    const first = render(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    act(() => {
      screen.getAllByText('Dark mode toggle not persisting')[0].click();
    });
    act(() => typeInto(screen.getByPlaceholderText<HTMLTextAreaElement>(t('reply_placeholder')), 'Half a reply'));
    act(() => {
      screen.getByLabelText(t('star_conversation')).click();
    });
    first.unmount();

    // What "View contact" and Back do: the screen unmounts and mounts again.
    render(<InboxScreen t={t} />);
    expect(screen.getAllByText('Dark mode toggle not persisting').length).toBe(2);
    expect(screen.getByPlaceholderText<HTMLTextAreaElement>(t('reply_placeholder')).value).toBe('Half a reply');
    expect(screen.getByLabelText(t('star_conversation')).getAttribute('aria-pressed')).toBe('true');
  });

  it('says a failed send did not go out and keeps the draft, until the next send goes through', () => {
    render(<InboxScreen t={t} />);
    act(() => typeInto(screen.getByPlaceholderText<HTMLTextAreaElement>(t('reply_placeholder')), 'Lost?'));
    act(() => {
      screen.getByText(t('send')).click();
    });
    const request = latestVariables('postMessage');
    act(() => {
      latestMutation('postMessage').onError?.(new Error('offline'), request as never);
    });

    expect(screen.getByRole('alert').textContent).toContain(t('send_failed_title'));
    expect(screen.getByPlaceholderText<HTMLTextAreaElement>(t('reply_placeholder')).value).toBe('Lost?');

    act(() => {
      screen.getByText(t('send')).click();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('settles the automatic pick on an empty channel, so a conversation started there stays open', () => {
    render(<InboxScreen t={t} />);
    act(() => {
      screen.getByLabelText(t('new_channel')).click();
    });
    act(() => typeInto(screen.getByLabelText<HTMLInputElement>(t('channel_name')), 'Empty'));
    act(() => {
      screen.getByText(t('create_channel')).click();
    });
    expect(screen.getByText(t('empty_title'))).toBeTruthy();

    // The server answers a start in the new channel: the conversation opens
    // with its reply box focused, and nothing replaces it with another pick.
    const { channelId } = inboxStore.get();
    act(() => {
      succeedMutation('createConversation', { conversation: startedConversation('c-new-1', channelId, 'r-3') }, {});
    });
    expect(screen.queryByText(t('empty_title'))).toBeNull();
    expect(document.activeElement).toBe(replyBox());

    // Leaving and re-entering General still opens its first conversation.
    act(() => {
      screen.getByText('General').click();
    });
    expect(screen.queryByText(t('empty_title'))).toBeNull();
    expect(screen.getAllByText('Design feedback on dashboard').length).toBe(2);
  });

  it('snoozes and unsnoozes from the thread header, and the status select follows', async () => {
    const user = userEvent.setup();
    render(<InboxScreen t={t} />);
    const snooze = screen.getByRole('button', { name: t('snooze_conversation') });

    await user.click(snooze);
    expect(snooze.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('combobox', { name: t('status') }).textContent).toContain(t('label_snoozed'));
    await user.click(snooze);
    expect(snooze.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('combobox', { name: t('status') }).textContent).toContain(t('label_open'));
  });

  it('changes the priority and the team inbox from the details panel selects', async () => {
    const user = userEvent.setup();
    render(<InboxScreen t={t} />);

    await user.click(screen.getByRole('combobox', { name: t('priority') }));
    await user.click(await screen.findByRole('option', { name: t('label_high') }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: t('priority') }).textContent).toContain(t('label_high')));

    await user.click(screen.getByRole('combobox', { name: t('team_inbox') }));
    await user.click(await screen.findByRole('option', { name: t('team_inbox_billing') }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: t('team_inbox') }).textContent).toContain(t('team_inbox_billing'))
    );
  });

  it('gives the list and the thread turns on a narrow screen, with a way back', async () => {
    stubMatchMedia([SINGLE_PANE_QUERY, COMPACT_QUERY]);
    const user = userEvent.setup();
    render(<InboxScreen t={t} />);

    const list = screen.getByRole('region', { name: t('conversations') });
    expect(list.className).toMatch(/singlePaneHidden/);
    // Below the compact width the channel column starts folded.
    expect(screen.getByLabelText(t('channels'), { selector: 'aside' }).hasAttribute('inert')).toBe(true);

    await user.click(screen.getByRole('button', { name: t('back_to_list') }));
    expect(list.className).not.toMatch(/singlePaneHidden/);
    expect(screen.queryByRole('button', { name: t('back_to_list') })).toBeNull();
  });
  it("lays the agent's changes over a started conversation, and Close closes it like any other", () => {
    render(<InboxScreen t={t} />);
    act(() => {
      succeedMutation('createConversation', { conversation: startedConversation('c-new-1', 'general', 'r-3') }, {});
    });
    const opened = contacts.find((contact) => contact.id === 'r-3')?.name ?? '';
    expect(screen.getAllByText(opened).length).toBeGreaterThan(0);

    act(() => {
      screen.getByLabelText(t('star_conversation')).click();
    });
    expect(screen.getByLabelText(t('star_conversation')).getAttribute('aria-pressed')).toBe('true');

    act(() => {
      screen.getByText(t('close')).click();
    });
    expect(screen.getByText(t('empty_title'))).toBeTruthy();
    expect(screen.getByRole('region', { name: t('conversations') }).querySelector('[aria-current="true"]')).toBeNull();
  });

  it('keeps a closed thread closed across a remount instead of opening the first one again', () => {
    const first = render(<InboxScreen t={t} />);
    act(() => {
      screen.getByText(t('close')).click();
    });
    expect(screen.getByText(t('empty_title'))).toBeTruthy();
    first.unmount();

    render(<InboxScreen t={t} />);
    expect(screen.getByText(t('empty_title'))).toBeTruthy();
  });

  it('focuses the reply box of a started conversation once, not of every thread opened after it', () => {
    render(<InboxScreen t={t} />);
    act(() => {
      succeedMutation('createConversation', { conversation: startedConversation('c-new-1', 'general', 'r-3') }, {});
    });
    expect(document.activeElement).toBe(replyBox());

    act(() => {
      replyBox().blur();
      screen.getAllByText('Design feedback on dashboard')[0].click();
    });
    expect(document.activeElement).not.toBe(replyBox());
  });

  it('leaves a conversation started before a channel switch in its own channel, without opening it', () => {
    render(<InboxScreen t={t} />);
    // The agent starts a chat in General, then moves to Support before the
    // server answers.
    act(() => {
      screen.getByText('Support').click();
    });
    const supportSelection = inboxStore.get().selectedId;
    act(() => {
      succeedMutation('createConversation', { conversation: startedConversation('c-new-1', 'general', 'r-3') }, {});
    });

    expect(inboxStore.get().selectedId).toBe(supportSelection);
    expect(inboxStore.get().selectedId).not.toBe('c-new-1');
    expect(screen.queryByText('Noah Williams')).toBeNull();
    expect(document.activeElement).not.toBe(replyBox());

    // Back in General, the started chat is in the list.
    act(() => {
      screen.getByText('General').click();
    });
    expect(screen.getAllByText('Noah Williams').length).toBeGreaterThan(0);
  });

  it('says a conversation could not be started when the create fails', () => {
    render(<InboxScreen t={t} />);
    act(() => {
      latestMutation('createConversation').onError?.(new Error('down'), {} as never);
    });
    expect(screen.getByRole('alert').textContent).toContain(t('start_chat_failed_title'));
  });

  it('clears the sent draft even when the post lands after the screen unmounted', () => {
    const first = render(<InboxScreen t={t} />);
    act(() => typeInto(replyBox(), 'Sent while leaving'));
    act(() => {
      screen.getByText(t('send')).click();
    });
    const request = latestVariables('postMessage') as PostMessageRequest;
    first.unmount();

    // What the real hook runs once the caller is gone: `afterSuccess` only.
    act(() => {
      latestMutation('postMessage').afterSuccess?.(
        { message: { ...messages[0], id: 'm-sent-1', conversationId: request.conversationId, body: request.body } } as never,
        request as never
      );
    });
    render(<InboxScreen t={t} />);
    expect(replyBox().value).toBe('');
  });
  it('gives the open thread the screen heading while the list is hidden on a narrow screen', () => {
    stubMatchMedia([SINGLE_PANE_QUERY, COMPACT_QUERY]);
    render(<InboxScreen t={t} />);
    const visible = screen.getAllByRole('heading', { level: 1 }).filter((heading) => heading.getClientRects().length > 0);

    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toBe('Design feedback on dashboard');
  });
});
