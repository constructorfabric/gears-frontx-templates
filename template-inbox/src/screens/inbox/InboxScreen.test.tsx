import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen as domScreen } from '@testing-library/dom';
import {
  endpointTags,
  mutationResult,
  queryResultFor,
  mutateMock,
  mutationCalls,
  refetchCalls,
  resetApiMocks,
  setQueryState,
} from '../../__test-utils__/apiMocks';
import { renderScreen } from '../../__test-utils__/renderScreen';
import { conversations, messages } from '../../api/dataset';
import { messageDayLabel, messageTimeOfDay } from '../../shared/format';

vi.mock('../../api/registry', () => ({ getInboxApi: () => endpointTags }));
vi.mock('../../api/queries', () => ({
  useApiQuery: queryResultFor,
  useApiMutation: mutationResult,
}));

const { InboxScreen } = await import('./InboxScreen');

const t = (key: string) => key;

afterEach(() => {
  resetApiMocks();
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

// `screen` (from `renderScreen`) only ever queries inside its own mounted
// container - but the kit's Dialog portals its popup straight to
// `document.body` by default (dialog.md), a sibling of that container, not
// a descendant. `domScreen`, `@testing-library/dom`'s own document-wide
// singleton, is what reaches the dialog's own fields and buttons once one
// is open.

describe('InboxScreen', () => {
  it('lists the seeded channels and conversations, and opens the first conversation of the default channel automatically', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

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
    expect(screen.queryByText('empty_title')).toBeNull();
    expect(screen.getByPlaceholderText('reply_placeholder')).toBeTruthy();
  });

  it('auto-selects the first conversation again on a channel switch, without disturbing a selection made while staying in one', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

    act(() => {
      screen.getByText('Support').click();
    });
    // Support's pinned conversation (c-1, "Silver Sunshine from India") is
    // auto-selected ahead of c-9 - its own most-recently-active row - the
    // pin overriding recency even though c-1 is itself snoozed and offers
    // no suggested replies.
    expect(screen.queryByText('empty_title')).toBeNull();
    expect(screen.queryByLabelText('suggested_replies')).toBeNull();
    expect(screen.getAllByText('Silver Sunshine from India').length).toBeGreaterThan(0);

    // A conversation the agent picks by hand must stick while the channel
    // does not change.
    act(() => {
      screen.getByText('Suspicious attachment').click();
    });
    expect(screen.queryByLabelText('suggested_replies')).toBeNull();

    // An unrelated re-render while staying in the same channel (toggling the
    // details panel) must not reset the hand-picked selection back to the
    // channel's auto-picked conversation.
    act(() => {
      screen.getByLabelText('toggle_details').click();
    });
    expect(screen.queryByLabelText('suggested_replies')).toBeNull();

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
    expect(screen.queryByText('empty_title')).toBeNull();
    expect(screen.getByPlaceholderText('reply_placeholder')).toBeTruthy();
  });

  it('offers the thread its suggested replies and drafts the one that is clicked', () => {
    const screen = renderScreen(<InboxScreen t={t} />);
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
    const draft = screen.getByPlaceholderText('reply_placeholder');
    expect(draft instanceof HTMLTextAreaElement).toBe(true);
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error('composer is not a textarea');
    expect(draft.value).toBe('');
    act(() => {
      chip.click();
    });
    expect(draft.value).toBe('Share your browser?');
  });

  it('offers no suggested reply on a spam-tagged thread', () => {
    const screen = renderScreen(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    act(() => {
      screen.getByText('Suspicious attachment').click();
    });

    // The composer is there to reply with; the assistant just has nothing
    // worth suggesting, so the row itself is absent. The thread sits in a
    // normal channel - spam is a tag here, not a destination.
    expect(screen.getByPlaceholderText('reply_placeholder')).toBeTruthy();
    expect(screen.queryByLabelText('suggested_replies')).toBeNull();
  });

  it('renders every rich message type in a transcript: image, file, and an inline link', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

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
    // caption text both render, and the caption doubles as its alt text.
    const image = screen.getByAltText(
      'Here is how the license page renders on our side, for reference.'
    );
    expect(image instanceof HTMLImageElement).toBe(true);
    if (image instanceof HTMLImageElement) {
      expect(image.src).toContain('/message-assets/preview-chart.svg');
    }

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
    const screen = renderScreen(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('Support').click();
    });
    act(() => {
      screen.getAllByText('Dark mode toggle not persisting')[0].click();
    });

    // Read off the seed rather than written down: the thread's timestamps are
    // offsets from the load-time anchor, so which days it spans depends on
    // the hour the suite runs at.
    const thread = messages.filter((message) => message.conversationId === 'c-9');
    const dayLabels = [...new Set(thread.map((message) => messageDayLabel(message.timestamp)))];
    for (const label of dayLabels) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }

    // The time of day sits in the bubble; there is no meta line under it.
    expect(screen.queryByText(/ - (Seen|Not seen)$/)).toBeNull();
    expect(screen.getAllByText(messageTimeOfDay(thread[1].timestamp)).length).toBeGreaterThan(0);
  });

  it('groups pinned conversations under their own label, ahead of the rest', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

    // General opens by default; its own pinned conversation (c-11, the
    // showcase thread) renders under a "Pinned" label, ahead of its two
    // unpinned siblings.
    expect(screen.getByText('pinned')).toBeTruthy();
    expect(screen.getByLabelText('pinned_conversation')).toBeTruthy();

    act(() => {
      screen.getByText('Sales').click();
    });
    // Sales' own pinned conversation (c-2, "Refund request...") leads its
    // list even though c-7 ("Purple Bow...") is more recently active -
    // both a rendering and an ordering check, read off the list pane's own
    // DOM order (row order is not otherwise observable through RTL's
    // query API).
    const listText = screen.getByLabelText('conversations').textContent ?? '';
    const refundIndex = listText.indexOf('Refund request');
    const purpleBowIndex = listText.indexOf('Purple Bow');
    expect(refundIndex).toBeGreaterThanOrEqual(0);
    expect(purpleBowIndex).toBeGreaterThan(refundIndex);
  });

  it('sends a thread reader to the customer page as a link the URL can carry', () => {
    const screen = renderScreen(<InboxScreen t={t} />);
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
      screen.getByText('view_contact').click();
    });

    // The jump is a route change, not screen-local state: that is what lets the
    // same address be reloaded, bookmarked and shared.
    expect(window.location.hash).toBe('#/contacts/r-3');
  });

  it('creates a channel from the dialog and switches into it, on the existing empty state', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

    act(() => {
      screen.getByLabelText('new_channel').click();
    });
    const nameField = domScreen.getByLabelText('channel_name');
    if (!(nameField instanceof HTMLInputElement)) throw new Error('channel name is not an input');

    // Empty name: the create action stays disabled rather than creating a
    // blank channel.
    expect(domScreen.getByText('create_channel').closest('button')?.disabled).toBe(true);

    act(() => {
      typeInto(nameField, 'Design Reviews');
    });
    expect(domScreen.getByText('create_channel').closest('button')?.disabled).toBe(false);

    act(() => {
      domScreen.getByText('create_channel').click();
    });

    // The dialog closed (its portalled content is gone from the whole
    // document, not just this screen's own container), the new channel is
    // a real row in the sidebar (not a stub - it carries its own item
    // count), and it is the one now open, landing on the same empty state
    // any zero-conversation channel shows.
    expect(domScreen.queryByText('channel_name')).toBeNull();
    expect(screen.getAllByText('Design Reviews').length).toBeGreaterThan(0);
    expect(screen.queryByText('empty_title')).toBeTruthy();
  });

  it('opens the new-chat dialog focused on the contact field, gated on a pick', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

    act(() => {
      screen.getByLabelText('new_chat').click();
    });
    // Base UI's Combobox popup needs real layout (ResizeObserver-driven
    // positioning) to open, which jsdom does not provide - the filtered
    // contact list itself is exercised in the live app instead (see the
    // final report), not in this suite. What IS reliably testable here:
    // the dialog opens with focus already on the contact field, and Start
    // stays gated with nothing picked yet.
    const contactField = domScreen.getByLabelText('new_chat_contact_label');
    expect(document.activeElement).toBe(contactField);
    expect(domScreen.getByText('start_chat').closest('button')?.disabled).toBe(true);

    act(() => {
      domScreen.getByText('cancel').click();
    });
    // Cancel discards: no conversation was created - General's channel-nav
    // badge and its own pane count are both still "3".
    expect(domScreen.queryByLabelText('new_chat_contact_label')).toBeNull();
    expect(screen.getAllByText('3').length).toBe(2);
  });

  it('shows an error with a retry instead of the panes when a query the first paint needs fails', () => {
    setQueryState('messages', { error: new Error('down') });
    const screen = renderScreen(<InboxScreen t={t} />);

    expect(screen.getByRole('alert').textContent).toContain('load_error_title');
    expect(screen.queryByText('General')).toBeNull();
    act(() => {
      screen.getByRole('button', { name: 'retry' }).click();
    });
    expect(refetchCalls).toEqual(['messages']);
  });

  it('waits for every query before the first paint', () => {
    setQueryState('contacts', { isLoading: true });
    const screen = renderScreen(<InboxScreen t={t} />);

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('General')).toBeNull();
  });

  it('clears the draft after a send only if it still holds what was sent', () => {
    const screen = renderScreen(<InboxScreen t={t} />);
    const box = screen.getByPlaceholderText('reply_placeholder');

    act(() => typeInto(box as HTMLTextAreaElement, 'First answer'));
    act(() => {
      screen.getByText('send').click();
    });
    const latestOptions = () => mutationCalls[mutationCalls.length - 1];
    const [request] = mutateMock.mock.calls[mutateMock.mock.calls.length - 1];
    expect(request).toMatchObject({ body: 'First answer', kind: 'reply' });

    // Typed while the post is in flight: a new draft, not the sent one.
    act(() => typeInto(screen.getByPlaceholderText('reply_placeholder') as HTMLTextAreaElement, 'Follow-up'));
    act(() => {
      latestOptions().onSuccess?.(
        { message: { ...messages[0], id: 'm-sent-1', conversationId: request.conversationId, body: 'First answer' } } as never,
        request as never
      );
    });
    expect((screen.getByPlaceholderText('reply_placeholder') as HTMLTextAreaElement).value).toBe('Follow-up');

    // The next send's success clears it, because nothing changed meanwhile.
    act(() => {
      screen.getByText('send').click();
    });
    const [second] = mutateMock.mock.calls[mutateMock.mock.calls.length - 1];
    act(() => {
      latestOptions().onSuccess?.(
        { message: { ...messages[0], id: 'm-sent-2', conversationId: second.conversationId, body: 'Follow-up' } } as never,
        second as never
      );
    });
    expect((screen.getByPlaceholderText('reply_placeholder') as HTMLTextAreaElement).value).toBe('');
  });

  it('takes no reply on a closed conversation', () => {
    const screen = renderScreen(<InboxScreen t={t} />);
    act(() => {
      screen.getByText('close').click();
    });
    // Closing clears the selection; opening the thread again shows it closed.
    act(() => {
      screen.getAllByText('Design feedback on dashboard')[0].click();
    });

    const box = screen.getByPlaceholderText('conversation_closed_placeholder');
    expect((box as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('marks and unmarks spam from the thread header menu, and renders the actions it does not ship disabled', () => {
    const screen = renderScreen(<InboxScreen t={t} />);

    const ticket = screen.getByLabelText('create_ticket');
    expect(ticket.hasAttribute('disabled') || ticket.getAttribute('aria-disabled') === 'true').toBe(true);

    act(() => {
      screen.getByLabelText('more_actions').click();
    });
    act(() => {
      domScreen.getByRole('menuitem', { name: 'mark_as_spam' }).click();
    });
    // The details panel's own toggle reads the same tag.
    expect(screen.getAllByText('remove_from_spam').length).toBeGreaterThan(0);

    act(() => {
      screen.getByLabelText('more_actions').click();
    });
    act(() => {
      domScreen.getByRole('menuitem', { name: 'remove_from_spam' }).click();
    });
    expect(screen.queryAllByText('remove_from_spam')).toHaveLength(0);
  });

  it('names the unread count in the badge label', () => {
    const withTemplate = (key: string) => (key === 'unread_messages_count' ? 'Unread: {count}' : key);
    const screen = renderScreen(<InboxScreen t={withTemplate} />);
    const unread = conversations.find(
      (conversation) => conversation.unreadCount > 0 && conversation.channelId === 'general'
    );

    expect(unread).toBeDefined();
    expect(screen.getByLabelText(`Unread: ${unread?.unreadCount}`)).toBeTruthy();
  });
});
