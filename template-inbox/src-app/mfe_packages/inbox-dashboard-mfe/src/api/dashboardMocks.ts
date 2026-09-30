/**
 * Dashboard domain - the mock map for `DashboardApiService`.
 *
 * One entry, matching the one endpoint the service exposes - see its own doc
 * comment for why this screen answers through a single response rather than
 * one per section the way mail's mailboxes/mails/messages do. Nothing here is
 * written to, so the factory answers with a fresh copy of the seed.
 *
 * The activity rows point at the inbox's contacts, and this is the one place
 * the two datasets meet: the ids are read here, from the page-wide mock store
 * the contacts screen answers from too (`mockStore.ts`), and handed to
 * `createActivity`, so neither dataset imports the other and every row names
 * a person the directory lists. The rest of the overview is this package's
 * own seed: no other screen reads it.
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
import type { GetDashboardResponse } from '@inbox-shared/api/dashboardTypes';
import { readInboxMockState } from '@inbox-shared/api/mockStore';
import type { RestMockMap } from '@inbox-shared/api/RestMockPlugin';

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
    activity: createActivity(readInboxMockState().contacts.map((contact) => contact.id)),
  });

export const dashboardMockMap: RestMockMap = {
  'GET /api/dashboard/overview': (): GetDashboardResponse => createDashboardOverview(),
};
