import { useCallback, useMemo, useState } from 'react';
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
import { selectContacts, type ContactFilter } from './contactFilters';
import styles from '../../styles/workspace.module.css';

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

  const [filter, setFilter] = useState<ContactFilter>('all');
  const [search, setSearch] = useState('');

  const filterSidebar = useSidebarToggle();

  const contacts = useMemo(() => contactsQuery.data?.contacts ?? [], [contactsQuery.data]);
  const visibleContacts = useMemo(
    () => selectContacts(contacts, filter, search),
    [contacts, filter, search]
  );

  const viewContact = useCallback(
    (contactId: string) => navigate(contactRoute(contactId)),
    []
  );

  const firstPaint = firstPaintOf([contactsQuery, conversationsQuery]);
  if (firstPaint.failed) return <LoadErrorPane onRetry={firstPaint.retry} t={t} />;
  if (firstPaint.loading) return <LoadingPane />;

  const openContact = contacts.find((contact) => contact.id === openContactId) ?? null;

  // An address naming a contact the directory does not hold says so, rather
  // than quietly showing the directory as if no one had been asked for.
  if (openContactId !== null && openContact === null) {
    return (
      <div className={styles.emptyPane}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserXIcon />
            </EmptyMedia>
            <EmptyTitle>{t('contact_not_found_title')}</EmptyTitle>
            <EmptyDescription>{t('contact_not_found_description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyActions>
            <Button variant="outline" size="sm" onClick={() => navigate(CONTACTS_ROUTE)}>
              {t('back_to_contacts')}
            </Button>
          </EmptyActions>
        </Empty>
      </div>
    );
  }
  const conversationsById = new Map(
    (conversationsQuery.data?.conversations ?? []).map((conversation) => [conversation.id, conversation])
  );
  const openContactConversations = (openContact?.conversations ?? []).flatMap((ref) => {
    const conversation = conversationsById.get(ref.id);
    return conversation ? [conversation] : [];
  });

  return (
    <>
      {/*
        The filter list belongs to the directory, not to one person: on a
        contact's own page it is dropped and the whole pane goes to the
        record. Keeping it here costs the ticket-subject column most of its
        width, so it leaves with the list rather than collapsing behind it.
      */}
      {openContact ? null : (
        <ContactFilterSidebar
          contacts={contacts}
          selectedFilter={filter}
          onSelectFilter={setFilter}
          collapsed={filterSidebar.collapsed}
          t={t}
        />
      )}

      {openContact ? (
        <ContactDetail
          contact={openContact}
          conversations={openContactConversations}
          onBack={() => navigate(CONTACTS_ROUTE)}
          t={t}
        />
      ) : (
        <div className={styles.contactsMain}>
          <div className={styles.paneHeader}>
            <Button
              variant="ghost"
              size="sm"
              icon={<PanelLeftIcon />}
              aria-label={t('toggle_contact_filters')}
              aria-expanded={!filterSidebar.collapsed}
              onClick={filterSidebar.toggle}
            />
            <span className={styles.contactsHeaderText}>
              <ScreenHeading className={styles.paneTitle}>{t('all_contacts')}</ScreenHeading>
              <span className={styles.paneCount}>
                {t('people_count', { count: visibleContacts.length })}
              </span>
            </span>
            <span className={styles.spacer} />
            <Input
              className={styles.searchField}
              type="search"
              value={search}
              onValueChange={setSearch}
              placeholder={t('search_contacts')}
              icon={<SearchIcon />}
              aria-label={t('search_contacts')}
            />
          </div>
          <div className={styles.contactsBody}>
            <ContactsTable contacts={visibleContacts} onViewContact={viewContact} t={t} />
          </div>
        </div>
      )}
    </>
  );
}
