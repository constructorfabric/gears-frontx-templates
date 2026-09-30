import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetDashboardResponse } from '@inbox-shared/api/dashboardTypes';
import type { InboxMockState } from '@inbox-shared/api/mockStore';
import type { RestMockMap } from '@inbox-shared/api/RestMockPlugin';
import type { GetContactsResponse } from '@inbox-shared/api/types';

type Graph = {
  inboxMockMap: RestMockMap;
  dashboardMockMap: RestMockMap;
  readInboxMockState: () => InboxMockState;
  resetInboxMockState: () => void;
};

/**
 * One module graph of the mock layer, freshly evaluated, the way each screen
 * package gets its own copy of every module it bundles. `vi.resetModules`
 * drops the module cache, so the next dynamic import evaluates the modules
 * again: two calls are two screens in one page, here the contacts screen and
 * the dashboard.
 */
async function loadGraph(): Promise<Graph> {
  vi.resetModules();
  const store = await import('@inbox-shared/api/mockStore');
  const inbox = await import('@inbox-shared/api/mocks');
  const dashboard = await import('./dashboardMocks');
  return { inboxMockMap: inbox.inboxMockMap, dashboardMockMap: dashboard.dashboardMockMap, ...store };
}

const contactIdsOf = (graph: Graph): string[] =>
  (graph.inboxMockMap['GET /api/inbox/contacts'](undefined) as GetContactsResponse).contacts.map((contact) => contact.id);

const activityContactIdsOf = (graph: Graph): string[] =>
  (graph.dashboardMockMap['GET /api/dashboard/overview'](undefined) as GetDashboardResponse).activity.map(
    (item) => item.contactId
  );

describe('the people the contacts screen and the dashboard share', () => {
  beforeEach(async () => {
    (await loadGraph()).resetInboxMockState();
  });

  it('points every dashboard activity row at a contact the contacts screen lists, across two module graphs', async () => {
    const contacts = await loadGraph();
    const dashboard = await loadGraph();

    expect(dashboard.dashboardMockMap).not.toBe(contacts.dashboardMockMap);
    expect(dashboard.readInboxMockState()).toBe(contacts.readInboxMockState());
    const listed = new Set(contactIdsOf(contacts));
    const rows = activityContactIdsOf(dashboard);
    expect(rows.length).toBeGreaterThan(0);
    for (const id of rows) expect(listed.has(id), id).toBe(true);
  });

  it("reads the store's people at request time, not the seed each package bundles", async () => {
    const contacts = await loadGraph();
    const dashboard = await loadGraph();
    const state = contacts.readInboxMockState();
    const [first] = state.contacts;
    state.contacts = [{ ...first, id: 'r-only' }];

    expect(contactIdsOf(contacts)).toEqual(['r-only']);
    expect(new Set(activityContactIdsOf(dashboard))).toEqual(new Set(['r-only']));
  });
});
