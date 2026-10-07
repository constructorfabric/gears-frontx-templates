import { describe, expect, it } from 'vitest';
import { contacts, conversations, messages } from '@inbox-shared/api/dataset';

/**
 * The seed's own referential integrity: every id one collection names exists
 * in the collection it points into, the way a backend's foreign keys would
 * guarantee. A dangling id renders as a thread or a row that goes nowhere.
 */
describe('inbox seed dataset', () => {
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const contactIds = new Set(contacts.map((contact) => contact.id));

  it("points every contact's conversation refs at a conversation that contact is part of", () => {
    for (const contact of contacts) {
      for (const ref of contact.conversations) {
        expect(conversationById.get(ref.id)?.contactId, `${contact.id} -> ${ref.id}`).toBe(contact.id);
      }
    }
  });

  it('lists every conversation on its contact, and every contact of a conversation exists', () => {
    for (const conversation of conversations) {
      expect(contactIds.has(conversation.contactId)).toBe(true);
      const contact = contacts.find((candidate) => candidate.id === conversation.contactId);
      expect(contact?.conversations.map((ref) => ref.id)).toContain(conversation.id);
    }
  });

  it("dates each thread's newest message at its conversation's last activity", () => {
    for (const conversation of conversations) {
      const thread = messages.filter((message) => message.conversationId === conversation.id);
      expect(thread.length, conversation.id).toBeGreaterThan(0);
      expect(thread[thread.length - 1].sentAt).toBe(conversation.lastActivityAt);
    }
  });

  it('carries every transcript instant as an ISO string, never display text', () => {
    for (const message of messages) {
      expect(new Date(message.sentAt).toISOString()).toBe(message.sentAt);
    }
  });

  it('uses only the reserved fictional phone range', () => {
    for (const contact of contacts.filter((candidate) => candidate.phone !== '')) {
      expect(contact.phone).toMatch(/^\+1 \d{3} 555 01\d{2}$/);
    }
  });
});
