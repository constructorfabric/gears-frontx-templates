import { describe, expect, it } from 'vitest';
import { resetStores } from '@inbox-shared/ui/createStore';
import { contactsActions, contactsStore } from './contactsStore';

describe('contactsStore', () => {
  it('starts on every contact with no search', () => {
    expect(contactsStore.get()).toEqual({ filter: 'all', search: '' });
  });

  it('keeps the filter and the search the directory set, until the stores reset', () => {
    contactsActions.setFilter('leads');
    contactsActions.setSearch('Grace');
    expect(contactsStore.get()).toEqual({ filter: 'leads', search: 'Grace' });

    resetStores();
    expect(contactsStore.get()).toEqual({ filter: 'all', search: '' });
  });
});
