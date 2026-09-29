import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  endpointTags,
  mutationResult,
  queryResultFor,
  refetchCalls,
  resetApiMocks,
  setQueryState,
} from '../../__test-utils__/apiMocks';
import { stubMatchMedia } from '../../__test-utils__/matchMedia';
import { COMPACT_QUERY } from '../../shared/useMediaQuery';
import { act } from 'react';
import { contacts, conversations } from '../../api/dataset';
import { t } from '../../shared/i18n';

vi.mock('../../api/registry', () => ({ getInboxApi: () => endpointTags }));
vi.mock('../../api/queries', () => ({
  useApiQuery: queryResultFor,
  useApiMutation: mutationResult,
}));

const { ContactsScreen } = await import('./ContactsScreen');
const { contactsStore } = await import('./contactsStore');

afterEach(() => {
  resetApiMocks();
});

describe('ContactsScreen', () => {
  it('pages the seeded contacts and counts every filter from the same collection', () => {
    render(<ContactsScreen openContactId={null} t={t} />);

    // The five filter counts the seed data yields: 29 all, 19 users, 10 leads,
    // 26 active, 8 new.
    for (const count of ['29', '19', '10', '26', '8']) {
      expect(screen.getAllByText(count).length).toBeGreaterThan(0);
    }

    // 25 rows per page, so the first row is on screen and the 26th is not.
    expect(screen.getByText('Grace Park')).toBeTruthy();
    expect(screen.queryByText('Amara Nwosu')).toBeNull();
  });

  it('opens the contact the route names, even one off the first page', () => {
    render(<ContactsScreen openContactId="r-26" t={t} />);

    // The detail pane, not the table: Amara is on page two of the list, and
    // the qualification card only exists on a contact's own page.
    expect(screen.getAllByText('Amara Nwosu').length).toBeGreaterThan(0);
    expect(screen.getByText(t('qualification'))).toBeTruthy();
  });

  it('gives the whole pane to a contact page by dropping the directory filters', () => {
    const list = render(<ContactsScreen openContactId={null} t={t} />);
    expect(screen.getByLabelText(t('contact_filters'))).toBeTruthy();
    list.unmount();

    render(<ContactsScreen openContactId="r-1" t={t} />);
    expect(screen.queryByRole('complementary', { name: t('contact_filters') })).toBeNull();
  });

  it("lists a contact's conversations from the inbox's own collection", () => {
    const contact = contacts.find((candidate) => candidate.conversations.length > 0);
    if (contact === undefined) throw new Error('the seed has no contact with a conversation');
    const conversation = conversations.find((candidate) => candidate.id === contact.conversations[0].id);

    render(<ContactsScreen openContactId={contact.id} t={t} />);
    expect(screen.getAllByText(conversation?.subject ?? '').length).toBeGreaterThan(0);
    expect(screen.getByText(t('conversations_count', { count: contact.conversations.length }))).toBeTruthy();
  });

  it('says a contact was not found, instead of showing the directory, for an id the directory lacks', () => {
    render(<ContactsScreen openContactId="r-missing" t={t} />);

    expect(screen.getByRole('heading', { level: 1, name: t('contact_not_found_title') })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: t('contact_filters') })).toBeNull();
  });

  it('shows an error with a retry, rather than an empty directory, when the contacts fail to load', () => {
    setQueryState('contacts', { error: new Error('down') });
    render(<ContactsScreen openContactId={null} t={t} />);

    expect(screen.getByRole('alert').textContent).toContain(t('load_error_title'));
    expect(screen.queryByText(t('no_contacts'))).toBeNull();
    act(() => {
      screen.getByRole('button', { name: t('retry') }).click();
    });
    expect(refetchCalls).toEqual(['contacts']);
  });


  it('keeps the filter column open on a wide screen and lets the header toggle fold it', () => {
    render(<ContactsScreen openContactId={null} t={t} />);
    const sidebar = screen.getByLabelText(t('contact_filters'));

    expect(sidebar.hasAttribute('inert')).toBe(false);
    act(() => {
      screen.getByLabelText(t('toggle_contact_filters')).click();
    });
    expect(sidebar.hasAttribute('inert')).toBe(true);
    expect(sidebar.getAttribute('aria-hidden')).toBe('true');
  });

  it('opens the filter column as a sheet over the directory below the compact width, and a pick folds it', async () => {
    stubMatchMedia([COMPACT_QUERY]);
    render(<ContactsScreen openContactId={null} t={t} />);
    const toggle = screen.getByLabelText(t('toggle_contact_filters'));

    expect(screen.queryByLabelText(t('contact_filters'), { selector: 'aside' })).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      toggle.click();
    });
    const sheet = await screen.findByRole('dialog', { name: t('contacts') });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    act(() => {
      within(sheet).getByText(t('filter_leads')).click();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(contactsStore.get().filter).toBe('leads');
    // The directory heading stays the one screen heading.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('renders one screen heading, the directory title', () => {
    render(<ContactsScreen openContactId={null} t={t} />);
    const headings = screen.getAllByRole('heading', { level: 1 });

    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe(t('all_contacts'));
  });

  it('keeps the directory as it was behind a contact page, and Back steps back through history', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const view = render(<ContactsScreen openContactId={null} t={t} />);

    // Page two of the directory, then a contact from it.
    act(() => {
      screen.getByText(t('next_page')).click();
    });
    expect(screen.getByText('Amara Nwosu')).toBeTruthy();
    act(() => {
      screen.getAllByLabelText(t('view_contact'))[0].click();
    });
    const openedId = decodeURIComponent(window.location.hash.replace('#/contacts/', ''));
    view.rerender(<ContactsScreen openContactId={openedId} t={t} />);
    expect(screen.getByText(t('qualification'))).toBeTruthy();

    act(() => {
      screen.getByLabelText(t('back_to_contacts')).click();
    });
    expect(back).toHaveBeenCalledTimes(1);

    // The route comes back to the directory: still on page two.
    view.rerender(<ContactsScreen openContactId={null} t={t} />);
    expect(screen.getByText('Amara Nwosu')).toBeTruthy();
  });

  it('narrows the directory by search and by filter, and counts what is left', async () => {
    const user = userEvent.setup();
    render(<ContactsScreen openContactId={null} t={t} />);

    await user.type(screen.getByLabelText(t('search_contacts')), 'Grace');
    expect(screen.getByText(t('people_count', { count: 1 }))).toBeTruthy();
    expect(screen.getByText('Grace Park')).toBeTruthy();

    await user.clear(screen.getByLabelText(t('search_contacts')));
    await user.click(screen.getByText(t('filter_leads')));
    const leads = contacts.filter((contact) => contact.type === 'lead');
    expect(screen.getByText(t('people_count', { count: leads.length }))).toBeTruthy();
  });

  it('sorts the directory by a column header', async () => {
    const user = userEvent.setup();
    render(<ContactsScreen openContactId={null} t={t} />);
    // The row's text also carries the avatar's initials, so the name is found
    // among the seeded names rather than read off the start of the row.
    const firstName = () => {
      const text = screen.getAllByRole('row')[1].textContent ?? '';
      return contacts
        .map((contact) => contact.name)
        .filter((name) => text.includes(name))
        .sort((a, b) => b.length - a.length)[0];
    };

    await user.click(screen.getByRole('button', { name: t('name') }));
    // The table compares text by code point, as a plain sort does.
    const ascending = contacts.map((contact) => contact.name).sort();
    expect(firstName()).toBe(ascending[0]);
    await user.click(screen.getByRole('button', { name: t('name') }));
    expect(firstName()).toBe(ascending[ascending.length - 1]);
  });

  it("keeps a contact's private note editable on its page", async () => {
    const user = userEvent.setup();
    render(<ContactsScreen openContactId="r-1" t={t} />);
    const notes = screen.getByLabelText<HTMLTextAreaElement>(t('notes'));

    await user.clear(notes);
    await user.type(notes, 'Prefers mail');
    expect(notes.value).toBe('Prefers mail');
  });
  it('keeps the filter and the search across a remount', async () => {
    const user = userEvent.setup();
    const first = render(<ContactsScreen openContactId={null} t={t} />);
    await user.click(screen.getByText(t('filter_leads')));
    await user.type(screen.getByLabelText(t('search_contacts')), 'Grace');
    first.unmount();

    render(<ContactsScreen openContactId={null} t={t} />);
    expect(screen.getByLabelText<HTMLInputElement>(t('search_contacts')).value).toBe('Grace');
    expect(screen.getByText(t('people_count', { count: 1 }))).toBeTruthy();
  });
});
