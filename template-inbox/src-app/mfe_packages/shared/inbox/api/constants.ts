/**
 * Identifiers and fixed values the screens share with the API layer.
 *
 * These are part of the contract rather than of the seed content: the chat
 * screen opens on `CHANNEL_GENERAL`, and a new conversation is stamped with
 * `BRAND` and routed to `NO_TEAM_INBOX` whether the data comes from the seed
 * dataset or from a real backend. Keeping them here is what lets the dataset
 * be imported by the mock maps alone.
 */

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
