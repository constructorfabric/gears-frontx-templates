import { PlusIcon, SendIcon, SparklesIcon } from 'lucide-react';
import {
  Button,
  Input,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gears-frontx/ui-kit';
import type {
  AgentIdentity,
  Contact,
  Conversation,
  ConversationPriority,
  ConversationStatus,
} from '@inbox-shared/api/types';
import { TEAM_INBOXES } from '@inbox-shared/api/constants';
import { labelOf } from '@inbox-shared/ui/format';
import type { Translate } from '@inbox-shared/i18n/translate';
import { FieldRow } from '@inbox-shared/ui/FieldRow';
import { PresenceAvatar } from '@inbox-shared/ui/PresenceAvatar';
import { DetailsSection } from './DetailsSection';
import { TagEditor } from './TagEditor';
import sharedStyles from '@inbox-shared/ui/shared.module.css';
import styles from './chat.module.css';
import { usePortalContainer } from '@inbox-shared/lifecycle/screenContext';

/**
 * The select's own value for "nobody": `Conversation.assignee` says it with
 * the empty string, which a select item cannot carry. A leading space keeps
 * it from colliding with any person's name.
 */
const UNASSIGNED = ' unassigned';

const PRIORITIES: ConversationPriority[] = ['none', 'low', 'medium', 'high'];
const STATUSES: ConversationStatus[] = ['open', 'snoozed', 'closed'];

const ASSISTANT_PROMPTS = ['assistant_summarize', 'assistant_draft', 'assistant_asking'];

export type CustomerDetailsPanelProps = {
  conversation: Conversation;
  contact: Contact | undefined;
  agent: AgentIdentity | undefined;
  /**
   * Opens the contact's page in the contacts screen. Absent where there is
   * no screen to open it in (the chat rendered outside a shell domain), and
   * the button with it.
   */
  onViewContact?: () => void;
  onAssigneeChange: (assignee: string) => void;
  onTeamInboxChange: (teamInbox: string) => void;
  onPriorityChange: (priority: ConversationPriority) => void;
  onStatusChange: (status: ConversationStatus) => void;
  onToggleSpam: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  isSpam: boolean;
  t: Translate;
};

export function CustomerDetailsPanel({
  conversation,
  contact,
  agent,
  onViewContact,
  onAssigneeChange,
  onTeamInboxChange,
  onPriorityChange,
  onStatusChange,
  onToggleSpam,
  onAddTag,
  onRemoveTag,
  isSpam,
  t,
}: CustomerDetailsPanelProps) {
  const portalContainer = usePortalContainer();
  // The current assignee is always an option, even when it is neither the
  // signed-in agent nor unassigned - otherwise the select would show nothing
  // for a conversation routed to a teammate.
  const assignees = [...new Set([UNASSIGNED, agent?.name ?? '', conversation.assignee])].filter(
    (name) => name !== ''
  );
  const assigneeValue = conversation.assignee === '' ? UNASSIGNED : conversation.assignee;
  const assigneeItems = assignees.map((name) => ({
    value: name,
    label: name === UNASSIGNED ? t('unassigned') : name,
  }));
  // The same rule for the team inbox: a routing value this build has no label
  // for (a backend that added a team) is still an option, under its own value.
  const teamInboxItems = [...new Set<string>([...TEAM_INBOXES, conversation.teamInbox])].map((value) => ({
    value,
    label: TEAM_INBOXES.some((known) => known === value) ? t(`team_inbox_${value}`) : value,
  }));
  const priorityItems = PRIORITIES.map((priority) => ({ value: priority, label: labelOf(priority, t) }));
  const statusItems = STATUSES.map((status) => ({ value: status, label: labelOf(status, t) }));
  const contactName = contact?.name ?? conversation.subject;

  return (
    <aside className={styles.detailsPanel} aria-label={t('customer_details')}>
      <Tabs defaultValue="details">
        <TabsList variant="line">
          <TabsTrigger value="details">{t('details')}</TabsTrigger>
          <TabsTrigger value="assistant">{t('assistant')}</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className={styles.detailsBody}>
            <div className={sharedStyles.contactCard}>
              <PresenceAvatar
                name={contactName}
                presence={contact?.presence ?? 'offline'}
                size="lg"
                t={t}
              />
              <span className={sharedStyles.contactCardName}>{contactName}</span>
              <span className={sharedStyles.identityMeta}>
                {labelOf(contact?.presence ?? 'offline', t)}
              </span>
              {onViewContact === undefined ? null : (
                <Button variant="outline" size="sm" onClick={onViewContact} disabled={!contact}>
                  {t('view_contact')}
                </Button>
              )}
            </div>

            <div className={sharedStyles.stack}>
              <Select
                value={assigneeValue}
                onValueChange={(value) => {
                  if (typeof value === 'string') {
                    onAssigneeChange(value === UNASSIGNED ? '' : value);
                  }
                }}
                items={assigneeItems}
              >
                <SelectTrigger size="sm" aria-label={t('assignee')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={portalContainer}>
                  {assigneeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={conversation.teamInbox}
                onValueChange={(value) => {
                  if (typeof value === 'string') onTeamInboxChange(value);
                }}
                items={teamInboxItems}
              >
                <SelectTrigger size="sm" aria-label={t('team_inbox')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={portalContainer}>
                  {teamInboxItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={conversation.priority}
                onValueChange={(value) => {
                  const match = PRIORITIES.find((priority) => priority === value);
                  if (match) onPriorityChange(match);
                }}
                items={priorityItems}
              >
                <SelectTrigger size="sm" aria-label={t('priority')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={portalContainer}>
                  {priorityItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={conversation.status}
                onValueChange={(value) => {
                  const match = STATUSES.find((status) => status === value);
                  if (match) onStatusChange(match);
                }}
                items={statusItems}
              >
                <SelectTrigger size="sm" aria-label={t('status')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={portalContainer}>
                  {statusItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={onToggleSpam}>
                {isSpam ? t('remove_from_spam') : t('mark_as_spam')}
              </Button>
            </div>

            <DetailsSection title={t('lead_data')}>
              <FieldRow label={t('name')} value={contact?.name ?? ''} />
              <FieldRow label={t('email')} value={contact?.email ?? ''} />
              <FieldRow label={t('company')} value={contact?.company ?? ''} />
              <FieldRow label={t('location')} value={contact?.location ?? ''} />
            </DetailsSection>

            <DetailsSection title={t('conversation_attributes')}>
              <FieldRow label={t('id')} value={conversation.id} />
              <FieldRow label={t('channel')} value={labelOf(conversation.channel, t)} />
              <FieldRow label={t('brand')} value={conversation.brand} />
            </DetailsSection>

            <DetailsSection title={t('tags')}>
              <TagEditor
                tags={conversation.tags}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
                t={t}
              />
            </DetailsSection>

            {/*
              Placeholders: both rows offer to attach a link and the seed data
              populates neither, so they stay affordances rather than becoming
              a feature this template invents.
            */}
            <DetailsSection title={t('links')} defaultOpen={false}>
              <div className={sharedStyles.fieldRow}>
                <span className={sharedStyles.fieldLabel}>{t('tracker_ticket')}</span>
                <Button variant="ghost" size="sm" icon={<PlusIcon />} disabled aria-label={t('attach_link')} />
              </div>
              <div className={sharedStyles.fieldRow}>
                <span className={sharedStyles.fieldLabel}>{t('back_office_tickets')}</span>
                <Button variant="ghost" size="sm" icon={<PlusIcon />} disabled aria-label={t('attach_link')} />
              </div>
            </DetailsSection>

            <DetailsSection title={t('shared_files')}>
              {conversation.sharedFiles.length === 0 ? (
                <span className={sharedStyles.identityMeta}>{t('no_files')}</span>
              ) : (
                <ItemGroup>
                  {conversation.sharedFiles.map((file, fileIndex) => (
                    <Item key={`${fileIndex}-${file.name}`} size="xs">
                      <ItemContent>
                        <ItemTitle>{file.name}</ItemTitle>
                        <ItemDescription>{file.size}</ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </DetailsSection>
          </div>
        </TabsContent>

        {/*
          The Assistant tab is a static surface only. Wiring the
          prompts to a model is out of this template's scope, so the controls
          are present and inert rather than pretending to answer.
        */}
        <TabsContent value="assistant">
          <div className={styles.detailsBody}>
            <div className={sharedStyles.stack}>
              <span className={sharedStyles.contactCardName}>{t('assistant_title')}</span>
              <span className={sharedStyles.identityMeta}>{t('assistant_subtitle')}</span>
            </div>
            <div className={sharedStyles.stack}>
              {ASSISTANT_PROMPTS.map((prompt) => (
                <Button key={prompt} variant="outline" size="sm" icon={<SparklesIcon />} disabled>
                  {t(prompt)}
                </Button>
              ))}
            </div>
            <Input
              disabled
              placeholder={t('assistant_placeholder')}
              aria-label={t('assistant_placeholder')}
              end={<Button variant="ghost" size="sm" icon={<SendIcon />} aria-label={t('send')} disabled />}
            />
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
