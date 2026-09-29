import { describe, expect, it } from 'vitest';
import { contacts, conversations, messages } from '../../api/dataset';
import { buildActivity, conversationStarts } from './contactActivity';

describe('contact activity', () => {
  it("dates a started conversation at its first message, not at its latest activity", () => {
    const conversation = conversations.find((candidate) => candidate.id === 'c-9');
    const contact = contacts.find((candidate) => candidate.id === conversation?.contactId);
    if (conversation === undefined || contact === undefined) throw new Error('seed lacks c-9 or its contact');
    const thread = messages.filter((message) => message.conversationId === 'c-9');

    const entry = buildActivity(contact, [conversation], conversationStarts(messages)).find(
      (candidate) => candidate.id === 'conversation-c-9'
    );

    expect(thread.length).toBeGreaterThan(1);
    expect(entry?.at).toBe(thread[0].sentAt);
    expect(entry?.at).not.toBe(conversation.lastActivityAt);
  });

  it('dates a conversation with no message yet at its own last activity', () => {
    const [conversation] = conversations;
    const contact = contacts.find((candidate) => candidate.id === conversation.contactId);
    if (contact === undefined) throw new Error('seed contact missing');

    const entry = buildActivity(contact, [conversation], new Map()).find(
      (candidate) => candidate.id === `conversation-${conversation.id}`
    );
    expect(entry?.at).toBe(conversation.lastActivityAt);
  });
});
