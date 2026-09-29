import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  endpointTags,
  mutationResult,
  queryResultFor,
  refetchCalls,
  resetApiMocks,
  setQueryState,
} from '../../__test-utils__/apiMocks';
import { stubMatchMedia } from '../../__test-utils__/matchMedia';
import { mails } from '../../api/mailDataset';
import { COMPACT_QUERY, SINGLE_PANE_QUERY } from '../../shared/useMediaQuery';
import { t } from '../../shared/i18n';

vi.mock('../../api/registry', () => ({ getMailApi: () => endpointTags }));
vi.mock('../../api/queries', () => ({
  useApiQuery: queryResultFor,
  useApiMutation: mutationResult,
}));

const { MailScreen } = await import('./MailScreen');

const SEED_SENT_COUNT = mails.filter((mail) => mail.mailboxId === 'sent').length;

afterEach(() => {
  resetApiMocks();
});

/**
 * React tracks a controlled input's previous value on the DOM node itself, so
 * assigning `.value` directly and dispatching a plain `input` event is a
 * no-op - React sees no change to fire `onChange` for. Going through the
 * native value setter first is what makes the dispatch register, the
 * standard workaround for typing into a controlled field under jsdom.
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

describe('MailScreen', () => {
  it('lists the seeded mailboxes and opens on Inbox, with its first mail selected automatically', () => {
    render(<MailScreen t={t} />);

    // "Inbox" is both the mailbox nav row and the list pane's own heading.
    expect(screen.getAllByText('Inbox').length).toBe(2);
    expect(screen.getByText('Drafts')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText('Archive')).toBeTruthy();
    expect(screen.getByText('Trash')).toBeTruthy();
    // Spam is out of the product; the sidebar must never grow a sixth row.
    expect(screen.queryByText('Spam')).toBeNull();

    // Inbox correspondents render; a Drafts-only correspondent does not,
    // because the list opens on Inbox. "Ava Laurent" appears twice now - the
    // list row and the reading pane's own subtitle - because her mail
    // (ml-3, seeded pinned) is the one auto-selected below, ahead of
    // Priya's own more recent row.
    expect(screen.getAllByText('Ava Laurent').length).toBe(2);
    expect(screen.getAllByText('Priya Natarajan').length).toBe(1);
    expect(screen.queryByText('Tariq Haddad')).toBeNull();

    // Inbox's most recently received mail opens on its own: no click needed,
    // the empty state is gone, and the reply box is ready.
    expect(screen.queryByText(t('no_mail_selected_title'))).toBeNull();
    expect(screen.getByPlaceholderText(/^Reply to /)).toBeTruthy();
  });

  it('auto-selects the first mail again on a mailbox switch, without disturbing a hand-picked selection', () => {
    render(<MailScreen t={t} />);

    // Inbox's own pinned mail (ml-3, Ava Laurent), picked automatically
    // ahead of Priya's more recent one.
    expect(screen.queryByText(t('no_mail_selected_title'))).toBeNull();
    expect(screen.getAllByText('Ava Laurent').length).toBe(2);

    // A mail the agent picks by hand must stick while the mailbox does not
    // change: toggling the history disclosure forces a re-render. "Priya
    // Natarajan" is findable once (the list row) before this click.
    act(() => {
      screen.getByText('Priya Natarajan').click();
    });
    expect(screen.getByText(/The headcount section is still rough/)).toBeTruthy();
    act(() => {
      screen.getByText('Devon Ashworth').click();
    });
    expect(screen.getByText(/Let me know if the reset link does not arrive/)).toBeTruthy();
    act(() => {
      screen.getByText(t('earlier_messages', { count: 2 })).click();
    });
    expect(screen.getByText(/Let me know if the reset link does not arrive/)).toBeTruthy();

    // Switching to Sent and back to Inbox re-arms the auto-pick: re-entering
    // the mailbox opens its first mail again rather than restoring the
    // hand-picked one - the documented, acceptable shape of "auto-select on
    // entering a mailbox".
    act(() => {
      screen.getByText('Sent').click();
    });
    act(() => {
      // "Inbox" is both the mailbox nav row and the list pane's own heading
      // once it is the active one again; the nav row is the first match.
      screen.getAllByText('Inbox')[0].click();
    });
    expect(screen.queryByText(t('no_mail_selected_title'))).toBeNull();
    expect(screen.getByPlaceholderText(/^Reply to /)).toBeTruthy();
  });

  it('opens a mail, and keeps its history collapsed until the toggle is used', () => {
    render(<MailScreen t={t} />);
    act(() => {
      screen.getByText('Devon Ashworth').click();
    });

    // The focused (newest) message renders flat; the two earlier ones stay
    // behind the toggle until it is clicked. The sentence checked below is
    // unique to the body - the list row's own preview line shares the
    // message's opening words but is cut short before it.
    expect(screen.getByText(/Let me know if the reset link does not arrive/)).toBeTruthy();
    expect(screen.queryByText(/Could we get staging access set up/)).toBeNull();

    act(() => {
      screen.getByText(t('earlier_messages', { count: 2 })).click();
    });
    expect(screen.getByText(/Could we get staging access set up/)).toBeTruthy();
  });

  it('renders no history toggle for a mail with none', () => {
    render(<MailScreen t={t} />);
    // Ava's mail (Inbox's own pinned, auto-selected first mail) is open by
    // default; hand-pick Priya's instead - it has no history of its own.
    act(() => {
      screen.getByText('Priya Natarajan').click();
    });

    // Unique to the body, not the row's own subject-plus-snippet preview.
    expect(screen.getByText(/The headcount section is still rough/)).toBeTruthy();
    expect(screen.queryByText(/earlier message/)).toBeNull();
  });

  it('filters to unread mail within the selected mailbox', () => {
    render(<MailScreen t={t} />);

    act(() => {
      screen.getByText(/^Unread \(\d+\)$/).click();
    });

    // Unread within Inbox, so Priya's own row shows in the Unread tab's list.
    expect(screen.getByText('Priya Natarajan')).toBeTruthy();
    // Ava's mail is read, so it drops out of the Unread tab's own list -
    // but it is still the one open in the reading pane (auto-selected,
    // pinned), which a tab switch never closes.
    expect(screen.getAllByText('Ava Laurent').length).toBe(1);
  });

  it('filters instantly by correspondent and subject as the search box is typed', () => {
    render(<MailScreen t={t} />);

    const search = screen.getByPlaceholderText(t('search_mail'));
    if (!(search instanceof HTMLInputElement)) throw new Error('search field is not an input');

    act(() => {
      typeInto(search, 'devon');
    });

    expect(screen.getByText('Devon Ashworth')).toBeTruthy();
    // The search narrows the list away from Ava's row, but her mail is
    // still the one auto-selected and open in the reading pane - the same
    // "search narrows the list without closing what is open" rule Chat
    // follows - so one mention of her name remains (the reading pane's).
    expect(screen.getAllByText('Ava Laurent').length).toBe(1);
  });

  it('groups pinned mail under its own label, ahead of the rest, within the current tab', () => {
    render(<MailScreen t={t} />);

    // Inbox opens by default; its two pinned mails (ml-3 Ava Laurent, ml-6
    // Carlos Mendez) render under a "Pinned" label, each with its own pin
    // icon.
    expect(screen.getByText(t('pinned'))).toBeTruthy();
    expect(screen.getAllByLabelText(t('pinned_mail')).length).toBe(2);

    // Carlos Mendez's mail (ml-6) is Inbox's OTHER pinned row and its own
    // least recently received - it still leads Priya's and Devon's more
    // recent, unpinned ones, read off the list pane's own DOM order.
    const listText = screen.getByLabelText('Inbox').textContent ?? '';
    const carlosIndex = listText.indexOf('Carlos Mendez');
    const priyaIndex = listText.indexOf('Priya Natarajan');
    expect(carlosIndex).toBeGreaterThanOrEqual(0);
    expect(priyaIndex).toBeGreaterThan(carlosIndex);

    // Switching to the Unread tab keeps the pinned group's own filtering
    // rule: a pinned-but-read mail (Ava, Carlos) drops out of Unread same
    // as any other read mail would.
    act(() => {
      screen.getByText(/^Unread \(\d+\)$/).click();
    });
    expect(screen.queryByText('Carlos Mendez')).toBeNull();
  });

  it('gates Send on empty input', () => {
    render(<MailScreen t={t} />);
    // Ava's mail (Inbox's own pinned, auto-selected first mail) is open by
    // default; hand-pick Priya's instead.
    act(() => {
      screen.getByText('Priya Natarajan').click();
    });

    const send = screen.getByText(t('send')).closest('button');
    if (send === null) throw new Error('send button not found');
    expect(send.hasAttribute('disabled') || send.getAttribute('aria-disabled') === 'true').toBe(
      true
    );

    const draft = screen.getByPlaceholderText(/^Reply to /);
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error('composer is not a textarea');
    act(() => {
      typeInto(draft, 'Sounds good, thanks.');
    });

    expect(send.hasAttribute('disabled') || send.getAttribute('aria-disabled') === 'true').toBe(
      false
    );

    act(() => {
      send.click();
    });
    // Sending clears the draft and files the reply under Sent.
    expect(draft.value).toBe('');
    act(() => {
      screen.getByText('Sent').click();
    });
    const sentNavButton = within(screen.getByLabelText(t('mail'))).getByText('Sent').closest('button');
    if (sentNavButton === null) throw new Error('Sent nav row not found');
    expect(within(sentNavButton).getByText(String(SEED_SENT_COUNT + 1))).toBeTruthy();
    expect(screen.getAllByText(/^Re: /).length).toBeGreaterThan(0);
  });

  it('composes a mail and sends it into the Sent mailbox, gated on To plus (Subject or Body)', () => {
    render(<MailScreen t={t} />);

    act(() => {
      screen.getByLabelText(t('compose')).click();
    });
    const toField = screen.getByLabelText(t('compose_to_label'));
    const subjectField = screen.getByLabelText(t('compose_subject_label'));
    if (!(toField instanceof HTMLInputElement)) throw new Error('to field is not an input');
    if (!(subjectField instanceof HTMLInputElement)) throw new Error('subject field is not an input');
    expect(document.activeElement).toBe(toField);

    // The reading pane's own reply composer has a "send" button of its own,
    // still in the document (Base UI leaves the underlying page mounted,
    // just `aria-hidden`, while a dialog is open) - `within` the dialog is
    // what keeps this query pointed at the compose dialog's Send instead of
    // colliding with that one.
    const dialog = within(screen.getByRole('dialog'));

    // To alone is not enough - the exact rule is To plus at least one of
    // Subject/Body.
    act(() => {
      typeInto(toField, 'devon@brightlabs.example');
    });
    expect(dialog.getByText(t('send')).closest('button')?.disabled).toBe(true);

    act(() => {
      typeInto(subjectField, 'Follow-up on staging access');
    });
    expect(dialog.getByText(t('send')).closest('button')?.disabled).toBe(false);

    act(() => {
      dialog.getByText(t('send')).click();
    });

    // The dialog closed, and the new mail is a real Sent row - switching
    // there shows it, count included.
    expect(screen.queryByLabelText(t('compose_to_label'))).toBeNull();
    act(() => {
      screen.getByText('Sent').click();
    });
    // The nav row's own badge, scoped to the mailbox sidebar itself - once
    // switched, the list pane's own heading also reads "Sent", and its
    // badge count can coincidentally match another mailbox's digit too.
    const sentNavButton = within(screen.getByLabelText(t('mail'))).getByText('Sent').closest('button');
    if (sentNavButton === null) throw new Error('Sent nav row not found');
    // The badge's own text, matched exactly: a substring check would also
    // pass on "13".
    expect(within(sentNavButton).getByText(String(SEED_SENT_COUNT + 1))).toBeTruthy();
    expect(screen.getByText('devon@brightlabs.example')).toBeTruthy();
    // The list row renders "{subject} - {snippet}" as one combined text
    // node - an exact-match `getByText` on the bare subject would never hit,
    // so this checks the substring instead.
    expect(screen.getAllByText(/Follow-up on staging access/).length).toBeGreaterThan(0);
  });

  it('discards the compose draft on Cancel', () => {
    render(<MailScreen t={t} />);

    act(() => {
      screen.getByLabelText(t('compose')).click();
    });
    const toField = screen.getByLabelText(t('compose_to_label'));
    if (!(toField instanceof HTMLInputElement)) throw new Error('to field is not an input');
    act(() => {
      typeInto(toField, 'devon@brightlabs.example');
    });

    act(() => {
      screen.getByText(t('cancel')).click();
    });
    expect(screen.queryByLabelText(t('compose_to_label'))).toBeNull();

    act(() => {
      screen.getByText('Sent').click();
    });
    // Sent still reads 2 - nothing was appended. Scoped the same way as the
    // note above.
    const sentNavButton = within(screen.getByLabelText(t('mail'))).getByText('Sent').closest('button');
    if (sentNavButton === null) throw new Error('Sent nav row not found');
    expect(within(sentNavButton).getByText(String(SEED_SENT_COUNT))).toBeTruthy();
    expect(screen.queryByText('devon@brightlabs.example')).toBeNull();
  });

  it('shows an error with a retry instead of the panes when a query the first paint needs fails', () => {
    setQueryState('mails', { error: new Error('down') });
    render(<MailScreen t={t} />);

    expect(screen.getByRole('alert').textContent).toContain(t('load_error_title'));
    act(() => {
      screen.getByRole('button', { name: t('retry') }).click();
    });
    expect(refetchCalls).toEqual(['mails']);
  });

  it('says so when the search matches no mail', () => {
    render(<MailScreen t={t} />);
    act(() => {
      typeInto(screen.getByLabelText(t('search_mail')) as HTMLInputElement, 'no such correspondent');
    });

    expect(screen.getAllByText(t('no_matching_mail')).length).toBeGreaterThan(0);
  });

  it('renders the reading pane actions it does not ship disabled, without a pressed state', () => {
    render(<MailScreen t={t} />);

    for (const label of ['archive_mail', 'trash_mail', 'reply_to_mail']) {
      const button = screen.getByLabelText(t(label));
      expect(button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true').toBe(true);
    }
    const star = screen.getByLabelText(t('star_mail'));
    expect(star.hasAttribute('aria-pressed')).toBe(false);
  });

  it('gives the list and the reading pane turns on a narrow screen, with a way back', () => {
    stubMatchMedia([SINGLE_PANE_QUERY]);
    render(<MailScreen t={t} />);

    // The auto-opened mail has the screen; the list is hidden.
    const list = screen.getByLabelText('Inbox', { selector: 'section' });
    expect(list.className).toMatch(/singlePaneHidden/);
    act(() => {
      screen.getByLabelText(t('back_to_mail_list')).click();
    });
    expect(list.className).not.toMatch(/singlePaneHidden/);
    expect(screen.queryByLabelText(t('back_to_mail_list'))).toBeNull();
  });


  it('folds the mailbox column below the compact width, takes it out of the tab order, and opens it from the list header', () => {
    stubMatchMedia([COMPACT_QUERY]);
    render(<MailScreen t={t} />);

    const sidebar = screen.getByLabelText(t('mail'), { selector: 'aside' });
    const toggle = screen.getByLabelText(t('toggle_mailboxes'));
    expect(sidebar.hasAttribute('inert')).toBe(true);
    expect(sidebar.getAttribute('aria-hidden')).toBe('true');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      toggle.click();
    });
    expect(sidebar.hasAttribute('inert')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('says in words which mails are unread', () => {
    render(<MailScreen t={t} />);
    const unreadInInbox = mails.filter((mail) => mail.mailboxId === 'inbox' && !mail.read);

    expect(screen.getAllByText(t('unread_mail'))).toHaveLength(unreadInInbox.length);
  });
});
