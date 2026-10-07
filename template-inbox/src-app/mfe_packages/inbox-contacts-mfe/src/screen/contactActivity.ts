/**
 * The contact detail's Recent activity timeline.
 *
 * Derived from the contact's own record rather than stored as a second list:
 * every entry the timeline shows - a ticket opened, a conversation started,
 * the sign-up, the day the contact was added - is already a dated fact on the
 * contact, and a stored timeline would be the same facts written twice.
 */

import type { Contact, Conversation, Message } from '@inbox-shared/api/types';
import type { TranslateParams } from '@inbox-shared/i18n/translate';

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
 * When each conversation started: its first message's time, by conversation
 * id. A conversation with no message yet (one just started) has no entry, and
 * then it started at its own last activity, the moment it was created.
 */
export function conversationStarts(messages: readonly Message[]): ReadonlyMap<string, string> {
  const starts = new Map<string, string>();
  for (const message of messages) {
    const known = starts.get(message.conversationId);
    if (known === undefined || Date.parse(message.sentAt) < Date.parse(known)) {
      starts.set(message.conversationId, message.sentAt);
    }
  }
  return starts;
}

/**
 * `conversations` are the contact's own threads, already joined from
 * `contact.conversations` - a ref the client holds no conversation for has no
 * date to place on the timeline, so it is simply not there. `startedAt` dates
 * each "started a conversation" entry (see `conversationStarts`).
 */
export function buildActivity(
  contact: Contact,
  conversations: Conversation[],
  startedAt: ReadonlyMap<string, string>
): ActivityEntry[] {
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
        at: startedAt.get(conversation.id) ?? conversation.lastActivityAt,
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
