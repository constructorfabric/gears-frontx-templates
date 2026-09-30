import { describe, expect, it } from 'vitest';
import { mailboxes, mailMessages, mails } from './mailDataset';

/** The seed's own rules, the ones its doc comment states and the screen relies on. */
describe('the mail seed', () => {
  it('ships the five mailboxes and no Spam', () => {
    expect(mailboxes.map((mailbox) => mailbox.id)).toEqual(['inbox', 'drafts', 'sent', 'archive', 'trash']);
  });

  it('files every mail in a mailbox it ships, under a unique id', () => {
    const ids = new Set(mailboxes.map((mailbox) => mailbox.id));
    for (const mail of mails) expect(ids.has(mail.mailboxId), mail.id).toBe(true);
    expect(new Set(mails.map((mail) => mail.id)).size).toBe(mails.length);
  });

  it('keeps unread mail to the Inbox', () => {
    const unread = mails.filter((mail) => !mail.read);
    expect(unread.length).toBeGreaterThan(0);
    for (const mail of unread) expect(mail.mailboxId, mail.id).toBe('inbox');
  });

  it("dates every earlier message before the mail it belongs to, and leaves the sent-mail id range free", () => {
    const byId = new Map(mails.map((mail) => [mail.id, mail]));
    for (const message of mailMessages) {
      const mail = byId.get(message.mailId);
      expect(mail, message.id).toBeDefined();
      expect(Date.parse(message.sentAt)).toBeLessThan(Date.parse(mail?.receivedAt ?? ''));
    }
    expect(mails.some((mail) => mail.id.startsWith('ml-sent-'))).toBe(false);
  });
});
