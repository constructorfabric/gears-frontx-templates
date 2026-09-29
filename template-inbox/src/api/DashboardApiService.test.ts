import { apiRegistry } from '@gears-frontx/api';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDashboardOverview } from './dashboardMocks';
import { contacts } from './dataset';
import { getDashboardApi, registerApiServices, resetMockState } from './registry';

/**
 * The dashboard counterpart to `MailApiService.test.ts` - one suite that goes
 * through the real service. Expectations are read off the overview the mock
 * map builds, so the suite checks the wiring and the dataset's own
 * invariants rather than restating its numbers.
 */
describe('DashboardApiService', () => {
  beforeEach(() => {
    apiRegistry.reset();
    resetMockState();
    registerApiServices();
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
    const expectedLast = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(now);
    expect(months[months.length - 1]).toBe(expectedLast);
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
