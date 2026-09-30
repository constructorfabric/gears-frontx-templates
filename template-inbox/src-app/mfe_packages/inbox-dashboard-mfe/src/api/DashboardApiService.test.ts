import { apiRegistry, createFrontX, effects, mock } from '@gears-frontx/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { contacts } from '@inbox-shared/api/dataset';
import { resetInboxMockState } from '@inbox-shared/api/mockStore';
import { registerInboxApi } from '@inbox-shared/api/registry';
import { createDashboardOverview } from './dashboardMocks';
import { getDashboardApi, registerDashboardApi } from './registerDashboardApi';

/**
 * The suite that goes through the real service rather than around it, with
 * the app built the way `init.ts` builds it: the screen suite replaces
 * `useApiQuery`, so this is where a package that forgot the framework's
 * `mock()` plugin, or registered the service after `build()`, would show.
 * Expectations are read off the overview the mock map builds, so the suite
 * checks the wiring and the dataset's own invariants rather than restating
 * its numbers.
 */
describe('DashboardApiService', () => {
  beforeAll(() => {
    apiRegistry.reset();
    registerInboxApi();
    registerDashboardApi();
    apiRegistry.initialize();
    createFrontX().use(effects()).use(mock({ enabledByDefault: true })).build();
  });

  beforeEach(() => {
    resetInboxMockState();
  });

  it('answers the whole dashboard snapshot from the seeded dataset instead of the network', async () => {
    const overview = await getDashboardApi().getDashboard.fetch();
    expect(overview).toEqual(createDashboardOverview());
  });

  it('points every activity row at a seeded contact and a roster agent', async () => {
    const { activity, topAgents } = await getDashboardApi().getDashboard.fetch();
    const contactIds = new Set(contacts.map((contact) => contact.id));
    const agentIds = new Set(topAgents.map((agent) => agent.id));

    expect(activity.length).toBeGreaterThan(0);
    for (const item of activity) {
      expect(contactIds.has(item.contactId)).toBe(true);
      expect(agentIds.has(item.ownerAgentId)).toBe(true);
    }
  });

  it('plots twelve distinct consecutive calendar months, oldest first', async () => {
    const { recordsCreated } = await getDashboardApi().getDashboard.fetch();
    const months = recordsCreated.map((point) => point.month);

    expect(new Set(months).size).toBe(12);
    const now = new Date();
    const last = new Date(months[months.length - 1]);
    expect([last.getFullYear(), last.getMonth(), last.getDate()]).toEqual([now.getFullYear(), now.getMonth(), 1]);
    months.slice(1).forEach((month, index) => {
      const previous = new Date(months[index]);
      const current = new Date(month);
      expect((current.getFullYear() - previous.getFullYear()) * 12 + current.getMonth() - previous.getMonth()).toBe(1);
    });
  });

  it('keeps "Resolved per day"\'s per-source stack consistent with the "Resolved this week" KPI', async () => {
    const { kpis, resolvedPerDay } = await getDashboardApi().getDashboard.fetch();
    const resolvedThisWeek = kpis.find((kpi) => kpi.id === 'resolved-this-week');

    expect(resolvedThisWeek).toBeDefined();
    // Every day's chat+mail+tasks stack matches that same day's entry in the
    // KPI card's own series - the two never carry independently-drifting
    // numbers (see `RESOLVED_PER_DAY_TOTAL` in `dashboardDataset.ts`).
    resolvedPerDay.forEach((point, index) => {
      expect(point.chat + point.mail + point.tasks).toBe(resolvedThisWeek?.series[index]);
    });
  });
});
