import { apiRegistry } from '@gears-frontx/api';
import { beforeEach, describe, expect, it } from 'vitest';
import { mailboxes as seedMailboxes, mailMessages as seedMailMessages, mails as seedMails } from './mailDataset';
import { getMailApi, registerApiServices, resetMockState } from './registry';

/**
 * The mail counterpart to `InboxApiService.test.ts` - one suite that goes
 * through the real service, so a mock map that stops being reached shows up
 * here rather than as an empty mailbox. Expectations are read off the seed,
 * so editing the content does not break the suite.
 */
describe('MailApiService', () => {
  beforeEach(() => {
    apiRegistry.reset();
    resetMockState();
    registerApiServices();
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
});
