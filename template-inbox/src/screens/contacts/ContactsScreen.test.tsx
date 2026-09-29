import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  endpointTags,
  mutationResult,
  queryResultFor,
  refetchCalls,
  resetApiMocks,
  setQueryState,
} from '../../__test-utils__/apiMocks';
import { stubMatchMedia } from '../../__test-utils__/matchMedia';
import { renderScreen } from '../../__test-utils__/renderScreen';
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

afterEach(() => {
  resetApiMocks();
});

describe('ContactsScreen', () => {
  it('pages the seeded contacts and counts every filter from the same collection', () => {
    const screen = renderScreen(<ContactsScreen openContactId={null} t={t} />);

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
    const screen = renderScreen(<ContactsScreen openContactId="r-26" t={t} />);

    // The detail pane, not the table: Amara is on page two of the list, and
    // the qualification card only exists on a contact's own page.
    expect(screen.getAllByText('Amara Nwosu').length).toBeGreaterThan(0);
    expect(screen.getByText(t('qualification'))).toBeTruthy();
  });

  it('gives the whole pane to a contact page by dropping the directory filters', () => {
    const list = renderScreen(<ContactsScreen openContactId={null} t={t} />);
    expect(list.getByLabelText(t('contact_filters'))).toBeTruthy();
    list.unmount();

    const detail = renderScreen(<ContactsScreen openContactId="r-1" t={t} />);
    expect(detail.queryByRole('complementary', { name: t('contact_filters') })).toBeNull();
  });

  it("lists a contact's conversations from the inbox's own collection", () => {
    const contact = contacts.find((candidate) => candidate.conversations.length > 0);
    if (contact === undefined) throw new Error('the seed has no contact with a conversation');
    const conversation = conversations.find((candidate) => candidate.id === contact.conversations[0].id);

    const screen = renderScreen(<ContactsScreen openContactId={contact.id} t={t} />);
    expect(screen.getAllByText(conversation?.subject ?? '').length).toBeGreaterThan(0);
    expect(screen.getByText(t('conversations_count', { count: contact.conversations.length }))).toBeTruthy();
  });

  it('says a contact was not found, instead of showing the directory, for an id the directory lacks', () => {
    const screen = renderScreen(<ContactsScreen openContactId="r-missing" t={t} />);

    expect(screen.getByText(t('contact_not_found_title'))).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: t('contact_filters') })).toBeNull();
  });

  it('shows an error with a retry, rather than an empty directory, when the contacts fail to load', () => {
    setQueryState('contacts', { error: new Error('down') });
    const screen = renderScreen(<ContactsScreen openContactId={null} t={t} />);

    expect(screen.getByRole('alert').textContent).toContain(t('load_error_title'));
    expect(screen.queryByText(t('no_contacts'))).toBeNull();
    act(() => {
      screen.getByRole('button', { name: t('retry') }).click();
    });
    expect(refetchCalls).toEqual(['contacts']);
  });


  it('keeps the filter column open on a wide screen and lets the header toggle fold it', () => {
    const screen = renderScreen(<ContactsScreen openContactId={null} t={t} />);
    const sidebar = screen.getByLabelText(t('contact_filters'));

    expect(sidebar.hasAttribute('inert')).toBe(false);
    act(() => {
      screen.getByLabelText(t('toggle_contact_filters')).click();
    });
    expect(sidebar.hasAttribute('inert')).toBe(true);
    expect(sidebar.getAttribute('aria-hidden')).toBe('true');
  });

  it('starts the filter column folded below the compact width, and the toggle opens it', () => {
    stubMatchMedia([COMPACT_QUERY]);
    const screen = renderScreen(<ContactsScreen openContactId={null} t={t} />);
    const sidebar = screen.getByLabelText(t('contact_filters'));

    expect(sidebar.hasAttribute('inert')).toBe(true);
    act(() => {
      screen.getByLabelText(t('toggle_contact_filters')).click();
    });
    expect(sidebar.hasAttribute('inert')).toBe(false);
  });

  it('renders one screen heading, the directory title', () => {
    const screen = renderScreen(<ContactsScreen openContactId={null} t={t} />);
    const headings = screen.getAllByRole('heading', { level: 1 });

    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe(t('all_contacts'));
  });

  it('keeps the directory as it was behind a contact page, and Back steps back through history', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const screen = renderScreen(<ContactsScreen openContactId={null} t={t} />);

    // Page two of the directory, then a contact from it.
    act(() => {
      screen.getByText(t('next_page')).click();
    });
    expect(screen.getByText('Amara Nwosu')).toBeTruthy();
    act(() => {
      screen.getAllByLabelText(t('view_contact'))[0].click();
    });
    const openedId = decodeURIComponent(window.location.hash.replace('#/contacts/', ''));
    screen.rerender(<ContactsScreen openContactId={openedId} t={t} />);
    expect(screen.getByText(t('qualification'))).toBeTruthy();

    act(() => {
      screen.getByLabelText(t('back_to_contacts')).click();
    });
    expect(back).toHaveBeenCalledTimes(1);

    // The route comes back to the directory: still on page two.
    screen.rerender(<ContactsScreen openContactId={null} t={t} />);
    expect(screen.getByText('Amara Nwosu')).toBeTruthy();
  });
});
