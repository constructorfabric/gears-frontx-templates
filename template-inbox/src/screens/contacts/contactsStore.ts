/**
 * The contacts directory's client-side state, kept outside the screen the way
 * `inboxStore` and `mailStore` keep theirs: leaving the section and coming
 * back returns to the same filter and search.
 *
 * The table's sort order and page are the kit `DataTable`'s own state, which
 * it does not expose for a caller to hold. They survive a trip to a contact
 * page (the directory stays mounted behind it) but not leaving the section.
 */

import { createStore, useStore } from '../../shared/createStore';
import type { ContactFilter } from './contactFilters';

export type ContactsState = {
  filter: ContactFilter;
  search: string;
};

export const contactsStore = createStore((): ContactsState => ({ filter: 'all', search: '' }));

export const useContacts = <Slice>(select: (state: ContactsState) => Slice): Slice =>
  useStore(contactsStore, select);

export const contactsActions = {
  setFilter: (filter: ContactFilter) => contactsStore.update((state) => ({ ...state, filter })),
  setSearch: (search: string) => contactsStore.update((state) => ({ ...state, search })),
};
