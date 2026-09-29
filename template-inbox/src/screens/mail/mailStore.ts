/**
 * The mail screen's client-side state, kept outside the screen the way
 * `inboxStore` keeps the chat's: leaving the section and coming back returns
 * to the same mailbox, the same open mail, the same search and tab, the same
 * drafts and every mail sent this session.
 *
 * The mail service has no write endpoint, so a reply and a composed mail are
 * held here and laid over the fetched collection under Sent; they last until
 * the page reloads.
 */

import { MAILBOX_INBOX } from '../../api/constants';
import type { Mail, MailboxId } from '../../api/mailTypes';
import { createStore, useStore } from '../../shared/createStore';
import type { MailTab } from './mailSelectors';

export type MailState = {
  mailboxId: MailboxId;
  /** The open mail, as the screen last had it (see `InboxState.selectedId`). */
  selectedMailId: string | null;
  /** The mailbox still owed an automatic first pick (`useAutoSelect`), or `null`. */
  autoSelectOwedTo: string | null;
  search: string;
  tab: MailTab;
  /**
   * Keyed by mail id rather than a single flag, so switching between two
   * mails with history does not collapse the one already left open.
   */
  historyOpenById: Readonly<Record<string, boolean>>;
  /** Unsent reply text per mail id. */
  drafts: Readonly<Record<string, string>>;
  /** Replies and composed mails sent this session, filed under Sent. */
  sentMails: readonly Mail[];
};

const initialState = (): MailState => ({
  mailboxId: MAILBOX_INBOX,
  selectedMailId: null,
  autoSelectOwedTo: MAILBOX_INBOX,
  search: '',
  tab: 'all',
  historyOpenById: {},
  drafts: {},
  sentMails: [],
});

export const mailStore = createStore(initialState);

export const useMail = <Slice>(select: (state: MailState) => Slice): Slice => useStore(mailStore, select);

const set = (patch: Partial<MailState>) => mailStore.update((state) => ({ ...state, ...patch }));

export const mailActions = {
  selectMailbox: (mailboxId: MailboxId) => set({ mailboxId }),
  rememberSelection: (selectedMailId: string | null, autoSelectOwedTo: string | null) =>
    mailStore.update((state) =>
      state.selectedMailId === selectedMailId && state.autoSelectOwedTo === autoSelectOwedTo
        ? state
        : { ...state, selectedMailId, autoSelectOwedTo }
    ),
  setSearch: (search: string) => set({ search }),
  setTab: (tab: MailTab) => set({ tab }),
  toggleHistory: (mailId: string) =>
    mailStore.update((state) => ({
      ...state,
      historyOpenById: { ...state.historyOpenById, [mailId]: !(state.historyOpenById[mailId] ?? false) },
    })),
  setDraft: (mailId: string, draft: string) =>
    mailStore.update((state) =>
      state.drafts[mailId] === draft ? state : { ...state, drafts: { ...state.drafts, [mailId]: draft } }
    ),
  /** Files a sent mail under Sent; `answeredMailId` also clears the draft it was sent from. */
  fileSent: (mail: Mail, answeredMailId?: string) =>
    mailStore.update((state) => ({
      ...state,
      sentMails: [...state.sentMails, mail],
      drafts: answeredMailId === undefined ? state.drafts : { ...state.drafts, [answeredMailId]: '' },
    })),
};
