/**
 * Mail domain - API contracts.
 *
 * A sibling of the inbox's `types.ts` (`@inbox-shared/api/types`), not an
 * extension of it: mail shares no collection with the chat and contacts
 * domain, so it gets its own contracts, its own dataset and its own service
 * (`MailApiService`) rather than a new field bolted onto `Conversation`, and
 * all of them live in this package, the only one that reads mail.
 *
 * Every shape here crosses the mock boundary as JSON, same constraint as
 * the inbox's types: no `Date`, no `Map`, no method on any field.
 */

/** No Spam mailbox: this product does not ship one. */
export type MailboxId = 'inbox' | 'drafts' | 'sent' | 'archive' | 'trash';

export type Mailbox = {
  id: MailboxId;
  label: string;
};

/**
 * One mail, list row and reading-pane header in one shape. `body` and
 * `receivedAt` describe the newest message in the thread - the one the
 * reading pane renders flat, outside any card - and `snippet` is that same
 * message's own preview text, truncated by the list row's line clamp.
 * Anything older is a separate `MailMessage` row keyed by `mailId`.
 */
export type Mail = {
  id: string;
  mailboxId: MailboxId;
  correspondentName: string;
  correspondentEmail: string;
  subject: string;
  snippet: string;
  /** The newest message's body, pre-wrap text. */
  body: string;
  /** ISO instant of the newest message. */
  receivedAt: string;
  read: boolean;
  starred: boolean;
  /** Pins the mail to its own group at the top of the mailbox's list, ahead
   * of every unpinned row regardless of tab or sort. */
  pinned: boolean;
};

/**
 * An earlier message in a mail's history, oldest first. Only mails with a
 * history worth collapsing get any rows here - most mails have none, and the
 * reading pane's "N earlier messages" toggle simply does not render for them.
 */
export type MailMessage = {
  id: string;
  mailId: string;
  correspondentName: string;
  correspondentEmail: string;
  /** ISO instant, formatted for display by the reading pane, like `Message.sentAt`. */
  sentAt: string;
  body: string;
};

export type GetMailboxesResponse = { mailboxes: Mailbox[] };
export type GetMailsResponse = { mails: Mail[] };
export type GetMailMessagesResponse = { mailMessages: MailMessage[] };

/**
 * A mail to send: a reply to an open mail or one composed from scratch. The
 * server assigns the id and the instant and files it under Sent, which is why
 * neither is taken from the request. `inReplyTo` names the mail a reply
 * answers, `null` for a composed one.
 */
export type SendMailRequest = {
  correspondentName: string;
  correspondentEmail: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
};

export type SendMailResponse = { mail: Mail };
