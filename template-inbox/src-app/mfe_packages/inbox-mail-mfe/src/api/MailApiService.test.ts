import { apiRegistry, createFrontX, effects, mock } from '@gears-frontx/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mailboxes as seedMailboxes, mailMessages as seedMailMessages, mails as seedMails } from './mailDataset';
import { MAIL_MOCK_STATE_KEY, mailMockRevision, resetMailMockState } from './mailMockStore';
import type { SendMailRequest } from './mailTypes';
import { getMailApi, registerMailApi } from './registerMailApi';

const REPLY: SendMailRequest = {
  correspondentName: 'Priya Natarajan',
  correspondentEmail: 'priya@northstar.example',
  subject: 'Re: Q3 planning doc ready for review',
  body: 'Looks good to me.',
  inReplyTo: 'ml-1',
};

/**
 * The suite that goes through the real service rather than around it, with
 * the app built the way `init.ts` builds it: the screen suite replaces
 * `useApiQuery`, so this is where a mock map that stops being reached, or a
 * package that forgot the framework's `mock()` plugin, shows up rather than
 * as an empty mailbox. Expectations are read off the seed, so editing the
 * content does not break the suite.
 */
describe('MailApiService', () => {
  beforeAll(() => {
    apiRegistry.reset();
    registerMailApi();
    apiRegistry.initialize();
    createFrontX().use(effects()).use(mock({ enabledByDefault: true })).build();
  });

  beforeEach(() => {
    resetMailMockState();
  });

  it('answers the mailbox list from the seeded dataset instead of the network', async () => {
    const { mailboxes } = await getMailApi().getMailboxes.fetch();
    expect(mailboxes).toEqual(seedMailboxes);
  });

  it('serves every mail the mailbox counts are computed from', async () => {
    const { mails } = await getMailApi().getMails.fetch();
    expect(mails).toEqual(seedMails);
    expect(mails.filter((mail) => !mail.read).length).toBeGreaterThan(0);
  });

  it('serves the history behind every mail that carries one', async () => {
    const { mailMessages } = await getMailApi().getMailMessages.fetch();
    expect(mailMessages).toEqual(seedMailMessages);

    const mailIds = new Set(seedMails.map((mail) => mail.id));
    for (const message of mailMessages) {
      expect(mailIds.has(message.mailId)).toBe(true);
    }
  });

  it('files a sent mail under Sent with the id and instant the server assigns, and serves it from then on', async () => {
    const before = mailMockRevision();
    const { mail } = await getMailApi().sendMail.fetch(REPLY);

    expect(mail).toMatchObject({
      id: 'ml-sent-1',
      mailboxId: 'sent',
      correspondentName: REPLY.correspondentName,
      correspondentEmail: REPLY.correspondentEmail,
      subject: REPLY.subject,
      body: REPLY.body,
      snippet: REPLY.body,
      read: true,
      starred: false,
      pinned: false,
    });
    expect(Number.isNaN(Date.parse(mail.receivedAt))).toBe(false);
    expect(mailMockRevision()).toBe(before + 1);

    const { mails } = await getMailApi().getMails.fetch();
    expect(mails).toHaveLength(seedMails.length + 1);
    expect(mails[mails.length - 1]).toEqual(mail);
  });

  it('names a composed mail after its address when no name comes with it, and previews a bare subject', async () => {
    const { mail } = await getMailApi().sendMail.fetch({
      correspondentName: '',
      correspondentEmail: 'devon@brightlabs.example',
      subject: 'Staging access',
      body: '',
      inReplyTo: null,
    });
    expect(mail.correspondentName).toBe('devon@brightlabs.example');
    expect(mail.snippet).toBe('Staging access');
  });

  it('rejects a mail without a recipient, or without a subject and a body, and keeps nothing', async () => {
    await expect(getMailApi().sendMail.fetch({ ...REPLY, correspondentEmail: ' ' })).rejects.toThrow();
    await expect(getMailApi().sendMail.fetch({ ...REPLY, subject: '', body: '  ' })).rejects.toThrow();

    const { mails } = await getMailApi().getMails.fetch();
    expect(mails).toEqual(seedMails);
    expect(mailMockRevision()).toBe(0);
  });

  it('keeps the page-wide state on globalThis, so a second evaluation of the mock layer finds the sent mail', async () => {
    await getMailApi().sendMail.fetch(REPLY);
    expect(Reflect.has(globalThis, MAIL_MOCK_STATE_KEY)).toBe(true);

    vi.resetModules();
    const fresh = await import('./mailMocks');
    const answer = fresh.mailMockMap['GET /api/mail/mails'](undefined) as { mails: { id: string }[] };
    expect(answer.mails.map((mail) => mail.id)).toContain('ml-sent-1');
  });
});
