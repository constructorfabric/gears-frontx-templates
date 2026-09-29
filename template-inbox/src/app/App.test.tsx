import { act } from 'react';
import { apiRegistry } from '@gears-frontx/api';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetQueryCache } from '../api/queries';
import { registerApiServices, resetMockState } from '../api/registry';
import { t } from '../shared/i18n';
import { App } from './App';
import { CONTACTS_ROUTE, DASHBOARD_ROUTE, INBOX_ROUTE, MAIL_ROUTE, navigate } from './routing';

/**
 * The whole app over the real services in mock mode: the rail, the route
 * switch and a screen reading the seed through the query layer, with nothing
 * stood in for.
 */
describe('App', () => {
  beforeEach(() => {
    apiRegistry.reset();
    resetMockState();
    resetQueryCache();
    registerApiServices();
    window.history.replaceState(null, '', DASHBOARD_ROUTE);
  });

  it('names the document after the open section and leaves focus alone on the first load', async () => {
    render(<App />);

    expect(document.title).toBe(t('document_title', { section: t('dashboard') }));
    await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe(t('dashboard')));
    expect(document.activeElement).toBe(document.body);
  });

  it("moves focus to the new screen's heading and renames the document on a route change", async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelector('h1')).not.toBeNull());

    act(() => navigate(MAIL_ROUTE));
    await waitFor(() => expect(document.title).toBe(t('document_title', { section: t('mail') })));
    await waitFor(() => expect(document.activeElement?.tagName).toBe('H1'));
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.activeElement?.textContent).toBe('Inbox');

    act(() => navigate(CONTACTS_ROUTE));
    await waitFor(() => expect(document.activeElement?.textContent).toBe(t('all_contacts')));
    expect(document.title).toBe(t('document_title', { section: t('contacts') }));
  });

  it('switches sections from the rail and marks the current one', async () => {
    const user = userEvent.setup();
    render(<App />);
    const rail = screen.getByRole('navigation', { name: t('sections') });

    expect(within(rail).getByRole('button', { name: t('dashboard') }).getAttribute('aria-current')).toBe('page');
    await user.click(within(rail).getByRole('button', { name: t('mail') }));
    await waitFor(() => expect(window.location.hash).toBe(MAIL_ROUTE));
    expect(within(rail).getByRole('button', { name: t('mail') }).getAttribute('aria-current')).toBe('page');
    expect(within(rail).getByRole('button', { name: t('dashboard') }).getAttribute('aria-current')).toBeNull();
    await screen.findByRole('heading', { level: 1, name: 'Inbox' }, { timeout: 3000 });
  });

  it('toggles the theme from the rail and remembers the choice', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('button', { name: /theme/i });
    const before = toggle.getAttribute('aria-label');

    await user.click(toggle);
    const applied = document.documentElement.getAttribute('data-theme');
    expect(applied === 'light' || applied === 'dark').toBe(true);
    expect(window.localStorage.getItem('frontx.inbox.theme')).toBe(applied);
    expect(screen.getByRole('button', { name: /theme/i }).getAttribute('aria-label')).not.toBe(before);
    document.documentElement.removeAttribute('data-theme');
  });

  it('sends a reply through the real service and keeps it when the chat screen comes back', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', INBOX_ROUTE);
    render(<App />);

    const box = await screen.findByPlaceholderText(t('reply_placeholder'), undefined, { timeout: 3000 });
    await user.type(box, 'Thanks, looking into it now.');
    await user.click(screen.getByRole('button', { name: t('send') }));
    // The post succeeded: the box is cleared and the reply is a message in the thread.
    await waitFor(() => expect((screen.getByPlaceholderText(t('reply_placeholder')) as HTMLTextAreaElement).value).toBe(''), {
      timeout: 3000,
    });
    expect(screen.getAllByText('Thanks, looking into it now.', { ignore: 'textarea' })).toHaveLength(1);

    // Away and back: the reply is read back from the mock store, once.
    act(() => navigate(CONTACTS_ROUTE));
    await screen.findByRole('heading', { level: 1, name: t('all_contacts') }, { timeout: 3000 });
    act(() => navigate(INBOX_ROUTE));
    await screen.findByPlaceholderText(t('reply_placeholder'), undefined, { timeout: 3000 });
    expect(screen.getAllByText('Thanks, looking into it now.', { ignore: 'textarea' })).toHaveLength(1);
  });

  it('composes a mail through the Mail screen and files it under Sent', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', MAIL_ROUTE);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: t('compose') }, { timeout: 3000 }));
    await user.type(screen.getByLabelText(t('compose_to_label')), 'someone@example.com');
    await user.type(screen.getByLabelText(t('compose_subject_label')), 'Quarterly numbers');
    await user.click(screen.getByRole('button', { name: t('send') }));
    await user.click(screen.getByText('Sent'));
    expect(await screen.findByText(/Quarterly numbers/)).toBeTruthy();
  });

  it('renders the dashboard and the contacts directory from the real services', async () => {
    render(<App />);
    expect(await screen.findByRole('img', { name: new RegExp(`^${t('resolved_per_day')}: `) }, { timeout: 3000 })).toBeTruthy();

    act(() => navigate(CONTACTS_ROUTE));
    expect(await screen.findByText(t('people_count', { count: 29 }), undefined, { timeout: 3000 })).toBeTruthy();
  });
});
