import { useCallback, useMemo, useRef } from 'react';
import { PanelLeftIcon, SearchIcon, UserXIcon } from 'lucide-react';
import {
  Button,
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
} from '@gears-frontx/ui-kit';
import { useApiQuery } from '@inbox-shared/api/queries';
import { getInboxApi } from '@inbox-shared/api/registry';
import { cx } from '@inbox-shared/ui/cx';
import type { Translate } from '@inbox-shared/i18n/translate';
import { firstPaintOf, LoadErrorPane, LoadingPane } from '@inbox-shared/ui/QueryStates';
import { ScreenHeading } from '@inbox-shared/ui/ScreenHeading';
import { useSidebarToggle } from '@inbox-shared/ui/useSidebarToggle';
import { conversationStarts } from './contactActivity';
import { ContactDetail } from './ContactDetail';
import { ContactFilterSidebar } from './ContactFilterSidebar';
import { ContactsTable } from './ContactsTable';
import { useContactsNavigation } from './contactsNavigation';
import { selectContacts } from './contactFilters';
import { contactsActions, useContacts } from './contactsStore';
import sharedStyles from '@inbox-shared/ui/shared.module.css';
import styles from './contacts.module.css';

export type ContactsScreenProps = {
  /**
   * The contact whose page is open, or `null` for the directory. It comes from
   * the screen's route (`/$contactId`) rather than from state here, which is
   * what makes a person's page a link a thread can point at and a visitor can
   * bookmark.
   */
  openContactId: string | null;
  t: Translate;
};

export function ContactsScreen({ openContactId, t }: ContactsScreenProps) {
  const service = getInboxApi();
  const navigation = useContactsNavigation();

  const contactsQuery = useApiQuery(service.getContacts);
  const conversationsQuery = useApiQuery(service.getConversations);
  // The transcript dates when each of a contact's conversations started.
  const messagesQuery = useApiQuery(service.getMessages);

  const filter = useContacts((state) => state.filter);
  const search = useContacts((state) => state.search);

  const filterSidebar = useSidebarToggle();

  const contacts = useMemo(() => contactsQuery.data?.contacts ?? [], [contactsQuery.data]);
  const visibleContacts = useMemo(
    () => selectContacts(contacts, filter, search),
    [contacts, filter, search]
  );

  // The contact whose page this directory opened last, so that page's Back
  // button can step back through history - landing on the directory as it
  // was left, with the entry the browser's own Back would also use - instead
  // of pushing a second directory entry. Only while that same page is the
  // one open: a page the address opened otherwise (a link, the chat's "View
  // contact", the browser's Back and Forward to another person) goes to the
  // directory by address, since the entry behind it is not the directory.
  const openedFromDirectory = useRef<string | null>(null);

  const viewContact = useCallback(
    (contactId: string) => {
      openedFromDirectory.current = contactId;
      navigation.openContact(contactId);
    },
    [navigation]
  );

  const backToDirectory = () => {
    const stepBack = openedFromDirectory.current !== null && openedFromDirectory.current === openContactId;
    openedFromDirectory.current = null;
    if (stepBack) {
      window.history.back();
    } else {
      navigation.openDirectory();
    }
  };

  const conversationStartedAt = useMemo(
    () => conversationStarts(messagesQuery.data?.messages ?? []),
    [messagesQuery.data]
  );

  // The transcript only dates the timeline, which falls back to each
  // conversation's last activity without it, so a failed or slow transcript
  // never holds the directory back.
  const firstPaint = firstPaintOf([contactsQuery, conversationsQuery]);
  if (firstPaint.failed) return <LoadErrorPane onRetry={firstPaint.retry} t={t} />;
  if (firstPaint.loading) return <LoadingPane />;

  const openContact = contacts.find((contact) => contact.id === openContactId) ?? null;

  const conversationsById = new Map(
    (conversationsQuery.data?.conversations ?? []).map((conversation) => [conversation.id, conversation])
  );
  const openContactConversations = (openContact?.conversations ?? []).flatMap((ref) => {
    const conversation = conversationsById.get(ref.id);
    return conversation ? [conversation] : [];
  });

  const showingDirectory = openContactId === null;

  return (
    <>
      {/*
        The directory stays mounted while a contact page is open, hidden, so
        Back returns to the same filter, search, sort order and page. The
        filter column belongs to the directory, not to one person, so it
        hides with it and the contact page gets the whole width.
      */}
      <ContactFilterSidebar
        contacts={contacts}
        selectedFilter={filter}
        onSelectFilter={(nextFilter) => {
          contactsActions.setFilter(nextFilter);
          filterSidebar.dismiss();
        }}
        column={filterSidebar}
        hidden={!showingDirectory}
        t={t}
      />
      <div className={styles.contactsMain} hidden={!showingDirectory}>
        <div className={cx(sharedStyles.paneHeader, styles.contactsHeader)}>
          <Button
            variant="ghost"
            size="sm"
            icon={<PanelLeftIcon />}
            aria-label={t('toggle_contact_filters')}
            aria-expanded={!filterSidebar.collapsed}
            onClick={filterSidebar.toggle}
          />
          <span className={styles.contactsHeaderText}>
            <ScreenHeading className={sharedStyles.paneTitle}>{t('all_contacts')}</ScreenHeading>
            <span className={sharedStyles.paneCount}>
              {t('people_count', { count: visibleContacts.length })}
            </span>
          </span>
          <span className={sharedStyles.spacer} />
          <span className={styles.searchField}>
            <Input
              type="search"
              value={search}
              onValueChange={contactsActions.setSearch}
              placeholder={t('search_contacts')}
              icon={<SearchIcon />}
              aria-label={t('search_contacts')}
            />
          </span>
        </div>
        <div className={styles.contactsBody}>
          <ContactsTable contacts={visibleContacts} onViewContact={viewContact} t={t} />
        </div>
      </div>

      {openContact ? (
        <ContactDetail
          contact={openContact}
          conversations={openContactConversations}
          conversationStartedAt={conversationStartedAt}
          onBack={backToDirectory}
          t={t}
        />
      ) : null}

      {/* An address naming a contact the directory does not hold says so,
          rather than quietly showing the directory as if no one had been
          asked for. */}
      {!showingDirectory && openContact === null ? (
        <div className={sharedStyles.emptyPane}>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserXIcon />
              </EmptyMedia>
              <EmptyTitle>
                <ScreenHeading className={sharedStyles.inlineHeading}>{t('contact_not_found_title')}</ScreenHeading>
              </EmptyTitle>
              <EmptyDescription>{t('contact_not_found_description')}</EmptyDescription>
            </EmptyHeader>
            <EmptyActions>
              <Button variant="outline" size="sm" onClick={navigation.openDirectory}>
                {t('back_to_contacts')}
              </Button>
            </EmptyActions>
          </Empty>
        </div>
      ) : null}
    </>
  );
}
