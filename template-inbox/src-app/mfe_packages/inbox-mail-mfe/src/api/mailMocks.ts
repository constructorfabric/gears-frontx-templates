/**
 * Mail domain - the mock map for `MailApiService`.
 *
 * Same shape as the inbox's `mocks.ts`: keys are the full `METHOD /path`,
 * every read hands back a whole collection, and selection stays a
 * client-side concern (see `mailSelectors.ts`). The mailboxes and the earlier
 * messages are never written to, so they are served from the seed; the mails
 * are, since a sent mail joins them, so they are served from the page-wide
 * mail state (`mailMockStore.ts`). Every factory answers with a copy, so
 * nothing a screen does to a response reaches the state.
 */

import type { JsonValue } from '@gears-frontx/react';
import { isMockReply, mockReply, type MockReply, type RestMockMap } from '@inbox-shared/api/RestMockPlugin';
import { MAILBOX_SENT } from './constants';
import { mailboxes, mailMessages } from './mailDataset';
import { readMailMockState } from './mailMockStore';
import type {
  GetMailboxesResponse,
  GetMailMessagesResponse,
  GetMailsResponse,
  Mail,
  SendMailRequest,
  SendMailResponse,
} from './mailTypes';

const readString = (body: JsonValue | undefined, field: string): string | null => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const value = body[field];
  return typeof value === 'string' ? value : null;
};

/**
 * The request a well-formed send carries, or the 400 a backend would give one
 * it rejects: a recipient address is required, and so is a subject or a body
 * (an address alone is no mail, a bare subject line already is).
 */
const readSentMail = (body: JsonValue | undefined): SendMailRequest | MockReply => {
  const correspondentEmail = readString(body, 'correspondentEmail')?.trim() ?? '';
  const subject = readString(body, 'subject') ?? '';
  const text = readString(body, 'body') ?? '';
  if (correspondentEmail === '') return mockReply(400, { error: 'A mail needs a recipient address.' });
  if (subject.trim() === '' && text.trim() === '') {
    return mockReply(400, { error: 'A mail needs a subject or a body.' });
  }
  return {
    correspondentName: readString(body, 'correspondentName')?.trim() || correspondentEmail,
    correspondentEmail,
    subject,
    body: text,
    inReplyTo: readString(body, 'inReplyTo'),
  };
};

/**
 * Files the mail under Sent and answers with it. A real backend assigns the id
 * and the instant exactly here, which is why neither is taken from the request.
 */
const acceptSentMail = (request: SendMailRequest): Mail => {
  const state = readMailMockState();
  state.sentMailCount += 1;
  const mail: Mail = {
    id: `ml-sent-${state.sentMailCount}`,
    mailboxId: MAILBOX_SENT,
    correspondentName: request.correspondentName,
    correspondentEmail: request.correspondentEmail,
    subject: request.subject,
    snippet: request.body || request.subject,
    body: request.body,
    receivedAt: new Date().toISOString(),
    read: true,
    starred: false,
    pinned: false,
  };
  state.mails.push(mail);
  state.revision += 1;
  return mail;
};

export const mailMockMap: RestMockMap = {
  'GET /api/mail/mailboxes': (): GetMailboxesResponse => structuredClone({ mailboxes }),
  'GET /api/mail/mails': (): GetMailsResponse => structuredClone({ mails: readMailMockState().mails }),
  'GET /api/mail/messages': (): GetMailMessagesResponse => structuredClone({ mailMessages }),
  'POST /api/mail/mails': (body) => {
    const request = readSentMail(body);
    if (isMockReply(request)) return request;
    const response: SendMailResponse = { mail: structuredClone(acceptSentMail(request)) };
    return response;
  },
};
