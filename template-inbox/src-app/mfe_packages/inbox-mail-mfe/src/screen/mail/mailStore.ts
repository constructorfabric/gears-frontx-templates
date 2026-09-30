/**
 * The mail screen's client-side state, kept outside the screen the way
 * `chatStore` keeps the chat's: the shell unmounts the screen when another
 * one takes its place, but the package's module graph is evaluated once per
 * page load, so leaving the section and coming back returns to the same
 * mailbox, the same open mail, the same search and tab and the same drafts.
 *
 * A sent mail is not the client's: the mail service files it under Sent (the
 * page-wide mail mock state keeps it, `api/mailMockStore.ts`), and the next
 * read of the mails returns it. Only the draft it was sent from is cleared
 * here.
 */

import { createStore, useStore } from '@inbox-shared/ui/createStore';
import { MAILBOX_INBOX } from '../../api/constants';
import type { MailboxId } from '../../api/mailTypes';
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
};

const initialState = (): MailState => ({
  mailboxId: MAILBOX_INBOX,
  selectedMailId: null,
  autoSelectOwedTo: MAILBOX_INBOX,
  search: '',
  tab: 'all',
  historyOpenById: {},
  drafts: {},
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
  /**
   * Clears the reply draft of `mailId` once the reply sent from it succeeded,
   * unless the draft was edited since: what is in the box then is a new reply,
   * not the one that went out.
   */
  clearDraftIfSent: (mailId: string, sentBody: string) =>
    mailStore.update((state) =>
      (state.drafts[mailId] ?? '').trim() === sentBody
        ? { ...state, drafts: { ...state.drafts, [mailId]: '' } }
        : state
    ),
};
