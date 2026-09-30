/**
 * The mailbox identifiers the mail screen and its API share.
 *
 * Part of the contract rather than of the seed content: the screen opens on
 * `MAILBOX_INBOX` and a sent mail is filed under `MAILBOX_SENT` whether the
 * data comes from the seed dataset or from a real backend. Only this package
 * reads them, so they live here rather than in the shared folder.
 */

import type { MailboxId } from './mailTypes';

export const MAILBOX_INBOX: MailboxId = 'inbox';
export const MAILBOX_DRAFTS: MailboxId = 'drafts';
export const MAILBOX_SENT: MailboxId = 'sent';
export const MAILBOX_ARCHIVE: MailboxId = 'archive';
export const MAILBOX_TRASH: MailboxId = 'trash';
