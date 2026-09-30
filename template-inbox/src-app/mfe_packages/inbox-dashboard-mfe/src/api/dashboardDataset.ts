/**
 * Dashboard domain - the seeded content, and the only module that holds any.
 *
 * Same discipline as `dataset.ts` and `mailDataset.ts`: imported by
 * `dashboardMocks.ts` alone, and every instant is an offset back from the
 * shared anchor in `seedClock.ts`, so the activity table keeps reading
 * "2h ago" on any run day. The activity rows point at the inbox dataset's
 * contacts (`contactId`) rather than inventing a second set of people; the
 * mock map hands those ids to `createActivity`, so this module imports no
 * other dataset.
 *
 * Every number a card displays is either read straight from a field here or
 * computed from one (a sum, an average, a delta) in the screen that renders
 * it - nothing is hardcoded in a component.
 */

import type {
  ActivityItem,
  ActivityKind,
  ActivityStatus,
  ContactStageSegment,
  ConversionSource,
  DashboardKpiCard,
  FunnelStage,
  NewContactsSeries,
  RecordsCreatedPoint,
  ResolvedPerDayPoint,
  TopAgent,
  WorkloadMetric,
} from '@inbox-shared/api/dashboardTypes';
import { ANCHOR_MS, daysAgo, hoursAgo } from '@inbox-shared/api/seedClock';

/** The last 7 calendar days including today, oldest first, as ISO instants -
 * every chart on this screen that plots a week shares this set so the x-axes
 * agree. The charts write the weekday names themselves, in the app's locale.
 * Calendar days, not 24-hour steps (the same reasoning as `MONTHS_12`): a
 * daylight-saving change inside the week makes one day 23 or 25 hours long,
 * and a fixed step would then skip a day or name one twice. */
export const LAST_7_DAYS: string[] = (() => {
  const anchor = new Date(ANCHOR_MS);
  return Array.from({ length: 7 }, (_, index) =>
    new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() - (6 - index),
      anchor.getHours(),
      anchor.getMinutes()
    ).toISOString()
  );
})();

/**
 * The daily breakdown behind both row 2's "Resolved per day" stacked bar
 * chart and row 1's "Resolved this week" KPI - three sources per day (Chat/
 * Mail/Tasks) so the bar chart can stack them, while the KPI's own series
 * (`RESOLVED_PER_DAY_TOTAL`, below) is derived by summing the three every
 * day rather than carrying its own, independently-driftable number. Defined
 * ahead of `kpiCards` so that card can read the derived total directly.
 */
const RESOLVED_PER_DAY_CHAT = [7, 9, 10, 13, 10, 8, 9];
const RESOLVED_PER_DAY_MAIL = [5, 6, 8, 9, 7, 6, 7];
const RESOLVED_PER_DAY_TASKS = [4, 5, 6, 7, 5, 4, 5];
const RESOLVED_PER_DAY_TOTAL = RESOLVED_PER_DAY_CHAT.map(
  (chat, index) => chat + RESOLVED_PER_DAY_MAIL[index] + RESOLVED_PER_DAY_TASKS[index]
);

export const kpiCards: DashboardKpiCard[] = [
  {
    id: 'open-conversations',
    unit: 'count',
    chartType: 'area',
    valueMode: 'last',
    // Trending down over the week - a shrinking backlog, which is the good
    // direction for an open-item count (see `goodWhenPositive` below).
    series: [34, 32, 33, 29, 27, 26, 24],
    previousValue: 33,
    goodWhenPositive: false,
    footerValue: 3,
    footerUnit: 'count',
  },
  {
    id: 'resolved-this-week',
    unit: 'count',
    chartType: 'bar',
    valueMode: 'sum',
    series: RESOLVED_PER_DAY_TOTAL,
    // A slightly softer week than the one before it - deliberately, so this
    // row's badges are not four identical greens.
    previousValue: 165,
    goodWhenPositive: true,
    footerValue: 2,
    footerUnit: 'count',
  },
  {
    id: 'avg-first-response',
    unit: 'minutes',
    chartType: 'line',
    valueMode: 'last',
    // Trending down - a faster response time, the good direction for a
    // duration metric.
    series: [14, 13, 15, 12, 11, 10, 9],
    previousValue: 13,
    goodWhenPositive: false,
    footerValue: 4,
    footerUnit: 'minutes',
  },
];

/**
 * Row 1's fourth card, "Contacts by stage" - a five-segment donut. Counts
 * are seeded directly
 * (`dataset.ts`'s `contacts` collection carries no lifecycle-stage field of
 * its own, the same way `workload`/`topAgents` are their own seeded
 * collections rather than derived from another one); every percentage the
 * card shows is computed from these counts at render, never stored (see
 * `contactsByStagePercent`).
 */
export const contactsByStage: ContactStageSegment[] = [
  { id: 'prospect', count: 15 },
  { id: 'engaged', count: 14 },
  { id: 'customer', count: 20 },
  { id: 'at-risk', count: 7 },
  { id: 'churned', count: 4 },
];

/**
 * "Resolved per day", row 2's stacked bar chart: each day's resolutions
 * split by source (Chat/Mail/Tasks). Every day's three segments sum to the
 * same total the "Resolved this week" KPI card sums across the whole week
 * (`RESOLVED_PER_DAY_TOTAL` above) - both describe the same underlying
 * resolutions, one stacked by source and one as a period sum.
 */
export const resolvedPerDay: ResolvedPerDayPoint[] = LAST_7_DAYS.map((day, index) => ({
  day,
  chat: RESOLVED_PER_DAY_CHAT[index],
  mail: RESOLVED_PER_DAY_MAIL[index],
  tasks: RESOLVED_PER_DAY_TASKS[index],
}));

export const newContacts: NewContactsSeries = {
  series: LAST_7_DAYS.map((day, index) => ({
    day,
    inbound: [9, 11, 8, 14, 12, 16, 19][index],
    outbound: [3, 4, 5, 6, 7, 8, 9][index],
  })),
  previousTotal: 108,
};

/** The Summary card's small trend line - overall activity volume, not just
 * resolutions, so it reads differently from `resolvedPerDay` beside it. */
export const summaryTrend: number[] = [30, 34, 31, 38, 36, 41, 44];

/** The last 12 calendar months, oldest first, each as the ISO instant its
 * first day starts - "Records created"'s own x-axis, independent of
 * `LAST_7_DAYS` since this card plots a full year rather than a week. */
const MONTHS_12: string[] = (() => {
  const anchor = new Date(ANCHOR_MS);
  // Calendar months, not 30-day steps: day 1 of each month, so eleven steps
  // back can neither skip a short month nor name a long one twice.
  return Array.from({ length: 12 }, (_, index) =>
    new Date(anchor.getFullYear(), anchor.getMonth() - (11 - index), 1).toISOString()
  );
})();

/**
 * "Records created" - row 3's line chart. Three record types with distinct
 * shapes, on purpose: Companies stays low and steady, Opportunities is the
 * wavy one with a late spike, People climbs toward the most recent month -
 * three lines that read as different instruments rather than the same trend
 * repeated three times. The card's headline total is computed from these
 * (see `recordsCreatedTotal`), never stored separately.
 */
export const recordsCreated: RecordsCreatedPoint[] = MONTHS_12.map((month, index) => ({
  month,
  companies: [5, 3, 4, 5, 5, 4, 3, 6, 5, 4, 5, 3][index],
  opportunities: [7, 10, 6, 9, 11, 7, 9, 8, 8, 8, 7, 18][index],
  people: [10, 6, 7, 9, 9, 7, 10, 8, 8, 10, 8, 14][index],
}));

/**
 * The "Stage funnel" card - a widening-to-narrowing pipeline of
 * CRM-neutral stages, oldest (widest) first. Every later stage's percentage
 * is computed relative to `New`'s own count at render (see
 * `funnelStagePercent`), never stored as its own field.
 */
export const stageFunnel: FunnelStage[] = [
  { id: 'new', count: 120 },
  { id: 'screening', count: 104 },
  { id: 'meeting', count: 86 },
  { id: 'proposal', count: 65 },
  { id: 'customer', count: 46 },
];

/**
 * The "Conversion by source" card - five lead sources, each with
 * a won/lost split. The card's headline percent is `won / (won + lost)`
 * across every source, computed at render (see `conversionWonPercent`),
 * never stored as its own field.
 */
export const conversionBySource: ConversionSource[] = [
  { id: 'inbound', won: 45, lost: 15 },
  { id: 'outbound', won: 28, lost: 32 },
  { id: 'referral', won: 32, lost: 8 },
  { id: 'event', won: 20, lost: 20 },
  { id: 'partner', won: 15, lost: 5 },
];

export const workload: WorkloadMetric[] = [
  { id: 'support-load', value: 34, max: 50 },
  { id: 'dev-backlog', value: 18, max: 40 },
  { id: 'crm-tasks', value: 26, max: 35 },
  { id: 'qa-reviews', value: 12, max: 20 },
];

/**
 * The agent roster: the "Top agents" ranking, and the agent each activity row
 * belongs to (`ActivityItem.ownerAgentId`). Alex Rivera is the agent `dataset.ts`
 * seeds as the signed-in user in Chat and Mail - the dashboard is that
 * agent's own team's view.
 */
export const topAgents: TopAgent[] = [
  { id: 'agent-alex-rivera', name: 'Alex Rivera', resolvedCount: 42 },
  { id: 'agent-nina-petrov', name: 'Nina Petrov', resolvedCount: 38 },
  { id: 'agent-sam-okafor', name: 'Sam Okafor', resolvedCount: 31 },
  { id: 'agent-jordan-blake', name: 'Jordan Blake', resolvedCount: 27 },
  { id: 'agent-yusuf-demir', name: 'Yusuf Demir', resolvedCount: 19 },
];

/**
 * "Recent activity", row 6's table. Generated from a small cycle of kinds,
 * statuses and agents rather than handwritten row by row - the table needs
 * enough rows for pagination to mean something (26, three pages at the
 * kit's default page size of 10), and a hand-typed list that long would
 * carry no more information than this deterministic cycle does. Every
 * `contactId` is one of the ids the caller passes (the seeded contacts),
 * every `ownerAgentId` is a `topAgents` id, and every timestamp is
 * anchor-relative like the rest of this file.
 */
const ACTIVITY_KINDS: ActivityKind[] = ['chat', 'mail', 'task'];
const ACTIVITY_STATUSES: ActivityStatus[] = ['open', 'pending', 'resolved', 'escalated', 'resolved'];
const ACTIVITY_ROW_COUNT = 26;

export const createActivity = (contactIds: readonly string[]): ActivityItem[] =>
  contactIds.length === 0
    ? []
    : Array.from({ length: ACTIVITY_ROW_COUNT }, (_, index) => ({
        id: `act-${index + 1}`,
        contactId: contactIds[index % contactIds.length],
        kind: ACTIVITY_KINDS[index % ACTIVITY_KINDS.length],
        status: ACTIVITY_STATUSES[index % ACTIVITY_STATUSES.length],
        ownerAgentId: topAgents[index % topAgents.length].id,
        occurredAt:
          index % 5 === 0 ? daysAgo(1 + (index % 6)) : hoursAgo(1 + ((index * 3) % 30)),
      }));
