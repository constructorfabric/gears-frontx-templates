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
import { useApiQuery } from '../../api/queries';
import { getInboxApi } from '../../api/registry';
import type { Translate } from '../../shared/i18n';
import { CONTACTS_ROUTE, contactRoute, navigate } from '../../app/routing';
import { firstPaintOf, LoadErrorPane, LoadingPane } from '../../shared/QueryStates';
import { ScreenHeading } from '../../shared/ScreenHeading';
import { useSidebarToggle } from '../../shared/useSidebarToggle';
import { ContactDetail } from './ContactDetail';
import { ContactFilterSidebar } from './ContactFilterSidebar';
import { ContactsTable } from './ContactsTable';
import { selectContacts } from './contactFilters';
import { contactsActions, useContacts } from './contactsStore';
import sharedStyles from '../../shared/shared.module.css';
import styles from './contacts.module.css';

export type ContactsScreenProps = {
  /**
   * The contact whose page is open, or `null` for the directory. It comes from
   * the URL rather than from state here, which is what makes a person's page a
   * link a thread can point at and a visitor can bookmark.
   */
  openContactId: string | null;
  t: Translate;
};

export function ContactsScreen({ openContactId, t }: ContactsScreenProps) {
  const service = getInboxApi();

  const contactsQuery = useApiQuery(service.getContacts);
  const conversationsQuery = useApiQuery(service.getConversations);

  const filter = useContacts((state) => state.filter);
  const search = useContacts((state) => state.search);

  const filterSidebar = useSidebarToggle();

  const contacts = useMemo(() => contactsQuery.data?.contacts ?? [], [contactsQuery.data]);
  const visibleContacts = useMemo(
    () => selectContacts(contacts, filter, search),
    [contacts, filter, search]
  );

  // Set when a contact page is opened from this directory, so its Back button
  // can step back through history - landing on the directory as it was left,
  // with the entry the browser's own Back would also use - instead of
  // pushing a second directory entry. A page opened from anywhere else (a
  // link, the chat's "View contact") goes to the directory by address.
  const openedFromDirectory = useRef(false);

  const viewContact = useCallback((contactId: string) => {
    openedFromDirectory.current = true;
    navigate(contactRoute(contactId));
  }, []);

  const backToDirectory = () => {
    if (openedFromDirectory.current) {
      openedFromDirectory.current = false;
      window.history.back();
    } else {
      navigate(CONTACTS_ROUTE);
    }
  };

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
        onSelectFilter={contactsActions.setFilter}
        collapsed={filterSidebar.collapsed}
        hidden={!showingDirectory}
        t={t}
      />
      <div className={styles.contactsMain} hidden={!showingDirectory}>
        <div className={sharedStyles.paneHeader}>
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
          <Input
            className={styles.searchField}
            type="search"
            value={search}
            onValueChange={contactsActions.setSearch}
            placeholder={t('search_contacts')}
            icon={<SearchIcon />}
            aria-label={t('search_contacts')}
          />
        </div>
        <div className={styles.contactsBody}>
          <ContactsTable contacts={visibleContacts} onViewContact={viewContact} t={t} />
        </div>
      </div>

      {openContact ? (
        <ContactDetail
          contact={openContact}
          conversations={openContactConversations}
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
              <Button variant="outline" size="sm" onClick={() => navigate(CONTACTS_ROUTE)}>
                {t('back_to_contacts')}
              </Button>
            </EmptyActions>
          </Empty>
        </div>
      ) : null}
    </>
  );
}
