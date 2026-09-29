/**
 * Dashboard domain - the mock map for `DashboardApiService`.
 *
 * One entry, matching the one endpoint the service exposes - see its own doc
 * comment for why this screen answers through a single response rather than
 * one per section the way mail's mailboxes/mails/messages do. Nothing here is
 * written to, so the factory answers with a fresh copy of the seed.
 *
 * The activity rows point at the inbox dataset's contacts, and this is the one
 * place the two datasets meet: the ids are read here and handed to
 * `createActivity`, so neither dataset imports the other.
 */

import {
  contactsByStage,
  conversionBySource,
  createActivity,
  kpiCards,
  newContacts,
  recordsCreated,
  resolvedPerDay,
  stageFunnel,
  summaryTrend,
  topAgents,
  workload,
} from './dashboardDataset';
import type { GetDashboardResponse } from './dashboardTypes';
import { contacts } from './dataset';
import type { RestMockMap } from './RestMockPlugin';

const activity = createActivity(contacts.map((contact) => contact.id));

/** The whole overview response, exactly as the endpoint serves it. */
export const createDashboardOverview = (): GetDashboardResponse =>
  structuredClone({
    kpis: kpiCards,
    resolvedPerDay,
    newContacts,
    summaryTrend,
    recordsCreated,
    contactsByStage,
    workload,
    stageFunnel,
    conversionBySource,
    topAgents,
    activity,
  });

export const dashboardMockMap: RestMockMap = {
  'GET /api/dashboard/overview': (): GetDashboardResponse => createDashboardOverview(),
};
