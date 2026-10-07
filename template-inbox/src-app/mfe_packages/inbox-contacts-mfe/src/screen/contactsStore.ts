/**
 * The contacts directory's client-side state, kept outside the screen so
 * leaving the section and coming back returns to the same filter and search.
 * The package's module graph is evaluated once per page load and outlives an
 * unmount, so a module-level store is enough.
 *
 * The table's sort order and page are the kit `DataTable`'s own state, which
 * it does not expose for a caller to hold. They survive a trip to a contact
 * page (the directory stays mounted behind it) but not leaving the section.
 */

import { createStore, useStore } from '@inbox-shared/ui/createStore';
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
