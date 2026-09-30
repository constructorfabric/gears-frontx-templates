/**
 * The address tokens of the inbox screens: what the shell writes for a screen
 * in the page URL (`?screen=<token>`) and what `openScreen` names to open
 * one. Each equals the `presentation.route` of that screen's extension in its
 * package's `mfe.json`, without the leading slash; a test in
 * `inbox-contacts-mfe` holds every package's manifest to it.
 */
export const INBOX_SCREENS = {
  contacts: 'contacts',
  dashboard: 'dashboard',
  chat: 'chat',
  mail: 'mail',
} as const;

export type InboxScreenToken = (typeof INBOX_SCREENS)[keyof typeof INBOX_SCREENS];
