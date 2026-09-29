import { act } from 'react';
import { apiRegistry } from '@gears-frontx/api';
import { waitFor } from '@testing-library/dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderScreen } from '../__test-utils__/renderScreen';
import { resetQueryCache } from '../api/queries';
import { registerApiServices, resetMockState } from '../api/registry';
import { t } from '../shared/i18n';
import { App } from './App';
import { CONTACTS_ROUTE, DASHBOARD_ROUTE, MAIL_ROUTE, navigate } from './routing';

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
    renderScreen(<App />);

    expect(document.title).toBe(t('document_title', { section: t('dashboard') }));
    await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe(t('dashboard')));
    expect(document.activeElement).toBe(document.body);
  });

  it("moves focus to the new screen's heading and renames the document on a route change", async () => {
    renderScreen(<App />);
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
});
