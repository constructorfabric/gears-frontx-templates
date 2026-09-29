/**
 * The contact detail's Recent activity timeline.
 *
 * Derived from the contact's own record rather than stored as a second list:
 * every entry the timeline shows - a ticket opened, a conversation started,
 * the sign-up, the day the contact was added - is already a dated fact on the
 * contact, and a stored timeline would be the same facts written twice.
 */

import type { Contact, Conversation } from '../../api/types';
import type { TranslateParams } from '../../shared/i18n';

export type ActivityKind = 'ticket' | 'conversation' | 'signed-up' | 'added';

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  /** The catalogue key of the entry's line, read with `labelParams`. */
  labelKey: string;
  labelParams?: TranslateParams;
  at: string;
};

/**
 * `conversations` are the contact's own threads, already joined from
 * `contact.conversations` - a ref the client holds no conversation for has no
 * date to place on the timeline, so it is simply not there.
 */
export function buildActivity(contact: Contact, conversations: Conversation[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    ...contact.tickets.map(
      (ticket): ActivityEntry => ({
        id: `ticket-${ticket.id}`,
        kind: 'ticket',
        labelKey: 'activity_opened_ticket',
        labelParams: { number: ticket.number },
        at: ticket.openedAt,
      })
    ),
    ...conversations.map(
      (conversation): ActivityEntry => ({
        id: `conversation-${conversation.id}`,
        kind: 'conversation',
        labelKey: 'activity_started_conversation',
        at: conversation.lastActivityAt,
      })
    ),
    { id: 'added', kind: 'added', labelKey: 'activity_added', at: contact.addedAt },
  ];

  // A lead never signed up, and the timeline should not claim otherwise.
  if (contact.signedUpAt !== '') {
    entries.push({ id: 'signed-up', kind: 'signed-up', labelKey: 'activity_signed_up', at: contact.signedUpAt });
  }

  return entries.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
}
