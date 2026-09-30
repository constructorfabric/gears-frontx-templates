import type { ReactElement } from 'react';
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  CircleIcon,
  MessageCircleIcon,
  TicketIcon,
  UserCheckIcon,
  UserPlusIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  StatusDot,
  Textarea,
} from '@gears-frontx/ui-kit';
import type { Contact, Conversation, TicketPriority } from '@inbox-shared/api/types';
import { absoluteDate, labelOf, longRelativeTime } from '@inbox-shared/ui/format';
import type { Translate } from '@inbox-shared/i18n/translate';
import { FieldRow } from '@inbox-shared/ui/FieldRow';
import { PresenceAvatar } from '@inbox-shared/ui/PresenceAvatar';
import { ScreenHeading } from '@inbox-shared/ui/ScreenHeading';
import { buildActivity, type ActivityKind } from './contactActivity';
import sharedStyles from '@inbox-shared/ui/shared.module.css';
import styles from './contacts.module.css';

const ACTIVITY_ICON: Record<ActivityKind, ReactElement> = {
  ticket: <TicketIcon />,
  conversation: <MessageCircleIcon />,
  'signed-up': <UserCheckIcon />,
  added: <UserPlusIcon />,
};

const PRIORITY_TONE: Record<TicketPriority, 'danger' | 'warning' | 'neutral'> = {
  urgent: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

type CheckRowProps = { label: string; done: boolean };

/**
 * One line of the lead-qualification checklist. Derived from whether the field
 * is filled in rather than stored: a "complete" flag that disagreed with the
 * record it summarises would be worse than no flag.
 */
function CheckRow({ label, done }: CheckRowProps) {
  return (
    <div className={styles.checkRow}>
      <span className={done ? styles.checkOn : styles.checkOff}>
        {done ? <CircleCheckIcon /> : <CircleIcon />}
      </span>
      <span>{label}</span>
    </div>
  );
}

export type ContactDetailProps = {
  contact: Contact;
  /**
   * The contact's conversations, joined from `contact.conversations` against
   * the inbox's own collection; a ref with no conversation behind it is left
   * out rather than rendered.
   */
  conversations: Conversation[];
  /** When each conversation started, by id (`conversationStarts`). */
  conversationStartedAt: ReadonlyMap<string, string>;
  onBack: () => void;
  t: Translate;
};

export function ContactDetail({ contact, conversations, conversationStartedAt, onBack, t }: ContactDetailProps) {
  const activity = buildActivity(contact, conversations, conversationStartedAt);

  return (
    <div className={styles.contactsMain}>
      <div className={sharedStyles.paneHeader}>
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeftIcon />}
          aria-label={t('back_to_contacts')}
          onClick={onBack}
        />
        <PresenceAvatar name={contact.name} presence={contact.presence} size="lg" t={t} />
        <ScreenHeading className={sharedStyles.paneTitle}>{contact.name}</ScreenHeading>
        <Badge variant={contact.type === 'lead' ? 'warning' : 'info'}>
          {labelOf(contact.type, t)}
        </Badge>
        <span className={sharedStyles.paneCount}>{labelOf(contact.presence, t)}</span>
      </div>

      <div className={styles.contactsBody}>
        <div className={styles.detailColumns}>
          <div className={styles.detailColumn}>
            <Card size="sm">
              <CardContent>
                <div className={sharedStyles.contactCard}>
                  <PresenceAvatar name={contact.name} presence={contact.presence} size="lg" t={t} />
                  <span className={sharedStyles.contactCardName}>{contact.name}</span>
                  <span className={sharedStyles.identityMeta}>{contact.email}</span>
                  <Badge variant={contact.type === 'lead' ? 'warning' : 'info'}>
                    {labelOf(contact.type, t)}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('details')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={sharedStyles.stack}>
                  <FieldRow label={t('company')} value={contact.company} />
                  <FieldRow label={t('job_title')} value={contact.jobTitle} />
                  <FieldRow label={t('phone')} value={contact.phone} />
                  <FieldRow label={t('location')} value={contact.location} />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('qualification')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={sharedStyles.stack}>
                  <CheckRow label={t('name')} done={contact.name !== ''} />
                  <CheckRow label={t('email')} done={contact.email !== ''} />
                  <CheckRow label={t('phone')} done={contact.phone !== ''} />
                  <CheckRow label={t('company')} done={contact.company !== ''} />
                  <CheckRow label={t('job_title')} done={contact.jobTitle !== ''} />
                  <CheckRow label={t('location')} done={contact.location !== ''} />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('activity')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={sharedStyles.stack}>
                  <FieldRow label={t('signed_up')} value={absoluteDate(contact.signedUpAt)} />
                  <FieldRow label={t('last_seen')} value={longRelativeTime(contact.lastSeenAt, t)} />
                  <FieldRow label={t('added')} value={absoluteDate(contact.addedAt)} />
                  <FieldRow label={t('tickets')} value={String(contact.tickets.length)} />
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('tags')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={sharedStyles.chipRow}>
                  {contact.tags.length === 0 ? (
                    <span className={sharedStyles.identityMeta}>{t('no_tags')}</span>
                  ) : (
                    contact.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('notes')}</CardTitle>
              </CardHeader>
              <CardContent>
                {/*
                  Uncontrolled and keyed by contact: the note is a private
                  scratchpad, and this template ships no
                  endpoint that would persist an edit.
                */}
                <Textarea
                  key={contact.id}
                  rows={4}
                  defaultValue={contact.notes}
                  placeholder={t('notes_placeholder')}
                  aria-label={t('notes')}
                />
              </CardContent>
            </Card>
          </div>

          <div className={styles.detailColumn}>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('tickets_count', { count: contact.tickets.length })}</CardTitle>
              </CardHeader>
              <CardContent>
                {contact.tickets.length === 0 ? (
                  <span className={sharedStyles.identityMeta}>{t('no_tickets')}</span>
                ) : (
                  <ItemGroup>
                    {contact.tickets.map((ticket) => (
                      <Item key={ticket.id} size="sm">
                        <ItemContent>
                          <div className={sharedStyles.rowLine}>
                            <ItemTitle className={sharedStyles.lineTitle}>{ticket.subject}</ItemTitle>
                          </div>
                          <ItemDescription>
                            {t('ticket_meta', { number: ticket.number, date: absoluteDate(ticket.openedAt) })}
                          </ItemDescription>
                        </ItemContent>
                        <div className={styles.ticketRow}>
                          <StatusDot tone={PRIORITY_TONE[ticket.priority]} label={labelOf(ticket.priority, t)} />
                          <Badge variant="secondary">{labelOf(ticket.status, t)}</Badge>
                        </div>
                      </Item>
                    ))}
                  </ItemGroup>
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  {t('conversations_count', { count: conversations.length })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {conversations.length === 0 ? (
                  <span className={sharedStyles.identityMeta}>{t('no_conversations')}</span>
                ) : (
                  <ItemGroup>
                    {conversations.map((conversation) => (
                      <Item key={conversation.id} size="sm">
                        <ItemContent>
                          <div className={sharedStyles.rowLine}>
                            <ItemTitle className={sharedStyles.lineTitle}>
                              {conversation.subject}
                            </ItemTitle>
                            <span className={sharedStyles.rowTime}>
                              {t('conversation_meta', {
                                channel: labelOf(conversation.channel, t),
                                time: longRelativeTime(conversation.lastActivityAt, t),
                              })}
                            </span>
                          </div>
                          <ItemDescription className={sharedStyles.rowText}>
                            {conversation.snippet}
                          </ItemDescription>
                        </ItemContent>
                      </Item>
                    ))}
                  </ItemGroup>
                )}
              </CardContent>
            </Card>
          </div>

          <div className={styles.detailColumn}>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('recent_activity')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={sharedStyles.stack}>
                  {activity.map((entry) => (
                    <div key={entry.id} className={styles.timelineItem}>
                      <span className={styles.timelineIcon}>{ACTIVITY_ICON[entry.kind]}</span>
                      <span className={styles.timelineLines}>
                        <span>{t(entry.labelKey, entry.labelParams)}</span>
                        <span className={styles.timelineMeta}>
                          {longRelativeTime(entry.at, t)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
