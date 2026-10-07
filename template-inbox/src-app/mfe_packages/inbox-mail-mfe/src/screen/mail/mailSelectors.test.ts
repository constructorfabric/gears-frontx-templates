import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mail } from '../../api/mailTypes';
import { countInMailbox, countUnreadInMailbox, selectMails } from './mailSelectors';

const mail = (overrides: Partial<Mail>): Mail => ({
  id: 'ml-0',
  mailboxId: 'inbox',
  correspondentName: 'Test Sender',
  correspondentEmail: 'sender@example.com',
  subject: 'Subject',
  snippet: 'Snippet',
  body: 'Body',
  receivedAt: new Date(NOW).toISOString(),
  read: true,
  starred: false,
  pinned: false,
  ...overrides,
});

// A fixed instant, with explicit and distinct `receivedAt` values from it:
// the ordering assertions below need ml-1 strictly more recent than ml-2, and
// nothing here may depend on when the suite runs. `beforeEach` pins the
// clock to the same instant for any code under test that reads it.
const NOW = Date.parse('2026-08-21T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
const mails: Mail[] = [
  mail({
    id: 'ml-1',
    mailboxId: 'inbox',
    read: false,
    correspondentName: 'Priya Natarajan',
    subject: 'Q3 planning',
    receivedAt: new Date(NOW).toISOString(),
  }),
  mail({
    id: 'ml-2',
    mailboxId: 'inbox',
    read: true,
    correspondentName: 'Devon Ashworth',
    subject: 'Staging access',
    receivedAt: new Date(NOW - 60_000).toISOString(),
  }),
  mail({ id: 'ml-3', mailboxId: 'drafts', read: true, correspondentName: 'Ava Laurent', subject: 'Invoice' }),
];

describe('selectMails', () => {
  it('narrows to the selected mailbox', () => {
    expect(selectMails(mails, 'inbox', 'all', '').map((m) => m.id)).toEqual(['ml-1', 'ml-2']);
    expect(selectMails(mails, 'drafts', 'all', '').map((m) => m.id)).toEqual(['ml-3']);
  });

  it('filters to unread within the selected mailbox', () => {
    expect(selectMails(mails, 'inbox', 'unread', '').map((m) => m.id)).toEqual(['ml-1']);
  });

  it('filters by correspondent and subject, case-insensitively', () => {
    expect(selectMails(mails, 'inbox', 'all', 'devon').map((m) => m.id)).toEqual(['ml-2']);
    expect(selectMails(mails, 'inbox', 'all', 'PLANNING').map((m) => m.id)).toEqual(['ml-1']);
    expect(selectMails(mails, 'inbox', 'all', 'nothing matches')).toEqual([]);
  });

  it('sorts a pinned mail ahead of a more recent unpinned one', () => {
    const withPin: Mail[] = [
      mail({ id: 'ml-old', mailboxId: 'inbox', receivedAt: new Date(NOW - 120_000).toISOString(), pinned: true }),
      mail({ id: 'ml-new', mailboxId: 'inbox', receivedAt: new Date(NOW).toISOString(), pinned: false }),
    ];
    // ml-old is the LEAST recent of the two, yet leads because it is pinned -
    // the pin overrides the date sort entirely, not just tie-breaks it.
    expect(selectMails(withPin, 'inbox', 'all', '').map((m) => m.id)).toEqual(['ml-old', 'ml-new']);
  });
});

describe('mailbox counts', () => {
  it('counts every mail and every unread mail in a mailbox', () => {
    expect(countInMailbox(mails, 'inbox')).toBe(2);
    expect(countInMailbox(mails, 'drafts')).toBe(1);
    expect(countInMailbox(mails, 'sent')).toBe(0);
    expect(countUnreadInMailbox(mails, 'inbox')).toBe(1);
    expect(countUnreadInMailbox(mails, 'drafts')).toBe(0);
  });
});
