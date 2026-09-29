/**
 * Identifiers and fixed values the screens share with the API layer.
 *
 * These are part of the contract rather than of the seed content: a screen
 * opens on `CHANNEL_GENERAL`, files a composed mail under `MAILBOX_SENT` and
 * stamps a new conversation with `BRAND` whether the data comes from the seed
 * datasets or from a real backend. Keeping them here is what lets the
 * datasets be imported by the mock maps alone.
 */

import type { MailboxId } from './mailTypes';

export const CHANNEL_GENERAL = 'general';
export const CHANNEL_SUPPORT = 'support';
export const CHANNEL_SALES = 'sales';

/** The brand every conversation in this single-brand workspace belongs to. */
export const BRAND = 'Acme';

/** The routing value of a conversation that belongs to no team inbox. */
export const NO_TEAM_INBOX = 'none';

/**
 * Every team inbox a conversation can be routed to, by routing value. Folders
 * per team inbox are out of scope; the routing value is not. What a value
 * reads as on screen is the catalogue's (`team_inbox_<value>`), never this
 * module's.
 */
export const TEAM_INBOXES = [NO_TEAM_INBOX, 'marketing', 'billing', 'customer_success'] as const;

export const MAILBOX_INBOX: MailboxId = 'inbox';
export const MAILBOX_DRAFTS: MailboxId = 'drafts';
export const MAILBOX_SENT: MailboxId = 'sent';
export const MAILBOX_ARCHIVE: MailboxId = 'archive';
export const MAILBOX_TRASH: MailboxId = 'trash';
