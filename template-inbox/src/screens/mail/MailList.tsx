import { MailSearchIcon, PanelLeftIcon, PinIcon, SearchIcon, StarIcon } from 'lucide-react';
import {
  Button,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  SidebarGroupLabel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gears-frontx/ui-kit';
import type { Mail, MailboxId } from '../../api/mailTypes';
import type { Translate } from '../../shared/i18n';
import { IdentityAvatar } from '../../shared/IdentityAvatar';
import { cx } from '../../shared/cx';
import { shortRelativeTime } from '../../shared/format';
import { ScreenHeading } from '../../shared/ScreenHeading';
import { splitPinned } from '../../shared/splitPinned';
import { isMailTab, selectMails, type MailTab } from './mailSelectors';
import sharedStyles from '../../shared/shared.module.css';
import styles from './mail.module.css';

export type MailListProps = {
  mails: Mail[];
  mailboxId: MailboxId;
  mailboxLabel: string;
  tab: MailTab;
  onTabChange: (tab: MailTab) => void;
  selectedMailId: string | null;
  onSelectMail: (mailId: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  /** Hidden while the reading pane has the screen to itself. */
  hidden: boolean;
  onToggleMailboxes: () => void;
  /** Whether the mailbox column is open, for the toggle's own state. */
  mailboxesOpen: boolean;
  t: Translate;
};

/**
 * The mail counterpart to `ConversationList`: the same row shape
 * (`.conversationRow`, the two `.rowLine`s, `.rowTitleText` /
 * `.rowPreviewText`), with subject and snippet on one preview line rather
 * than a third line. Unread is typography only: a bold, full-opacity row
 * versus a normal, dimmed one, no dot.
 */
export function MailList({
  mails,
  mailboxId,
  mailboxLabel,
  tab,
  onTabChange,
  selectedMailId,
  onSelectMail,
  search,
  onSearchChange,
  hidden,
  onToggleMailboxes,
  mailboxesOpen,
  t,
}: MailListProps) {
  const allMails = selectMails(mails, mailboxId, 'all', search);
  const unreadMails = selectMails(mails, mailboxId, 'unread', search);

  const renderRow = (mail: Mail) => (
    <Item
      key={mail.id}
      className={cx(
        sharedStyles.conversationRow,
        mail.read && styles.mailRowRead,
        mail.id === selectedMailId && sharedStyles.rowSelected
      )}
      variant={mail.id === selectedMailId ? 'muted' : 'default'}
      render={
        <button
          type="button"
          onClick={() => onSelectMail(mail.id)}
          aria-current={mail.id === selectedMailId ? 'true' : undefined}
        />
      }
    >
      <ItemMedia>
        <IdentityAvatar name={mail.correspondentName} size="lg" />
      </ItemMedia>
      <ItemContent>
        <div className={sharedStyles.rowLine}>
          <ItemTitle className={cx(sharedStyles.lineTitle, sharedStyles.rowText, sharedStyles.rowTitleText, styles.correspondentText)}>
            {/* Read or unread shows as weight and opacity; this says it in words. */}
            {mail.read ? null : <span className={sharedStyles.visuallyHidden}>{t('unread_mail')}</span>}
            {mail.correspondentName}
          </ItemTitle>
          <span className={styles.rowTimeGroup}>
            {mail.pinned ? (
              <PinIcon className={sharedStyles.pinIcon} role="img" aria-label={t('pinned_mail')} />
            ) : null}
            {mail.starred ? (
              <StarIcon className={styles.starIcon} role="img" aria-label={t('starred_mail')} />
            ) : null}
            <span className={sharedStyles.rowTime}>{shortRelativeTime(mail.receivedAt)}</span>
          </span>
        </div>
        <div className={sharedStyles.rowLine}>
          <ItemDescription className={cx(sharedStyles.rowText, sharedStyles.rowPreviewText, styles.subjectText)}>
            {t('mail_preview', { subject: mail.subject, snippet: mail.snippet })}
          </ItemDescription>
        </div>
      </ItemContent>
    </Item>
  );

  // `rows` already sorts pinned mails first (mailSelectors.ts's own
  // comparator does this regardless of tab/search), so splitting it here is
  // a plain filter, not a re-sort.
  const renderRows = (rows: Mail[]) => {
    if (rows.length === 0) {
      return (
        <div className={sharedStyles.listBody}>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MailSearchIcon />
              </EmptyMedia>
              <EmptyTitle>{t('no_matching_mail')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      );
    }
    const { pinned: pinnedMails, others: otherMails } = splitPinned(rows);
    return (
      <div className={sharedStyles.listBody}>
        {pinnedMails.length > 0 ? (
          <>
            <SidebarGroupLabel>{t('pinned')}</SidebarGroupLabel>
            <ItemGroup className={sharedStyles.conversationGroup}>
              {pinnedMails.map(renderRow)}
            </ItemGroup>
          </>
        ) : null}
        <ItemGroup className={sharedStyles.conversationGroup}>{otherMails.map(renderRow)}</ItemGroup>
      </div>
    );
  };

  return (
    <section className={cx(sharedStyles.listPane, hidden && sharedStyles.singlePaneHidden)} aria-label={mailboxLabel}>
      <div className={sharedStyles.paneHeader}>
        <Button
          variant="ghost"
          size="sm"
          icon={<PanelLeftIcon />}
          aria-label={t('toggle_mailboxes')}
          aria-expanded={mailboxesOpen}
          onClick={onToggleMailboxes}
        />
        <ScreenHeading className={sharedStyles.paneTitle}>{mailboxLabel}</ScreenHeading>
        <span className={sharedStyles.paneCount}>{allMails.length}</span>
      </div>

      <div className={sharedStyles.paneRow}>
        <Input
          className={sharedStyles.grow}
          type="search"
          value={search}
          onValueChange={onSearchChange}
          placeholder={t('search_mail')}
          icon={<SearchIcon />}
          aria-label={t('search_mail')}
        />
      </div>

      <Tabs
        className={styles.tabsFill}
        value={tab}
        onValueChange={(value) => {
          if (isMailTab(value)) onTabChange(value);
        }}
      >
        <TabsList variant="line" className={sharedStyles.paneRow}>
          <TabsTrigger value="all">{t('all_mail')}</TabsTrigger>
          <TabsTrigger value="unread">
            {t('unread_mail_count', { count: unreadMails.length })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all" className={styles.tabsPanel}>
          {renderRows(allMails)}
        </TabsContent>
        <TabsContent value="unread" className={styles.tabsPanel}>
          {renderRows(unreadMails)}
        </TabsContent>
      </Tabs>
    </section>
  );
}
