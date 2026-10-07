import { useMemo } from 'react';
import { useApiQuery } from '@inbox-shared/api/queries';
import { getInboxApi } from '@inbox-shared/api/registry';
import { getDashboardApi } from '../api/registerDashboardApi';
import type { Translate } from '@inbox-shared/i18n/translate';
import { firstPaintOf, LoadErrorPane, LoadingPane } from '@inbox-shared/ui/QueryStates';
import { ScreenHeading } from '@inbox-shared/ui/ScreenHeading';
import { ActivityTable } from './ActivityTable';
import { ConversionBySourceCard } from './ConversionBySourceCard';
import { KpiRow } from './KpiRow';
import { NewContactsCard } from './NewContactsCard';
import { RecordsCreatedCard } from './RecordsCreatedCard';
import { ResolvedPerDayCard } from './ResolvedPerDayCard';
import { StageFunnelCard } from './StageFunnelCard';
import { SummaryCard } from './SummaryCard';
import { TopAgentsCard } from './TopAgentsCard';
import { WorkloadStrip } from './WorkloadStrip';
import { resolvedActivity } from './dashboardSelectors';
import sharedStyles from '@inbox-shared/ui/shared.module.css';
import styles from './dashboard.module.css';

export type DashboardScreenProps = {
  t: Translate;
};

/**
 * The dashboard's top-level orchestration. Unlike the chat, mail and contacts
 * screens it has no secondary sidebar: a single full-width, scrollable pane
 * holding six rows - KPIs, the resolved/new-contacts/summary trio,
 * records-created plus top agents, the full-width team-workload strip, the
 * stage-funnel plus conversion-by-source pair, and finally the activity table
 * - fed by one `getDashboard` fetch plus the inbox service's own
 * `getContacts` (the activity table reuses those contact identities rather
 * than inventing new people - see `dashboardMocks.ts`).
 */
export function DashboardScreen({ t }: DashboardScreenProps) {
  const dashboardService = getDashboardApi();
  const inboxService = getInboxApi();

  const dashboardQuery = useApiQuery(dashboardService.getDashboard);
  const contactsQuery = useApiQuery(inboxService.getContacts);

  const firstPaint = firstPaintOf([dashboardQuery, contactsQuery]);
  const data = dashboardQuery.data;
  const contacts = contactsQuery.data?.contacts;
  // One list for the summary counts and the table, so they never disagree.
  const activity = useMemo(
    () => (data === undefined || contacts === undefined ? [] : resolvedActivity(data.activity, contacts, data.topAgents)),
    [data, contacts]
  );

  // The same gate and the same panes as the other three screens: each pane
  // fills the section on its own (`emptyPane` is `flex: 1`), so the rail's
  // layout does not jump when the data arrives.
  if (firstPaint.failed) return <LoadErrorPane onRetry={firstPaint.retry} t={t} />;
  if (firstPaint.loading || data === undefined || contacts === undefined) return <LoadingPane />;

  return (
    <div className={styles.dashboardMain}>
      <div className={sharedStyles.paneHeader}>
        <ScreenHeading className={sharedStyles.paneTitle}>{t('dashboard')}</ScreenHeading>
      </div>
      <div className={styles.dashboardBody}>
        <KpiRow kpis={data.kpis} contactsByStage={data.contactsByStage} t={t} />

        <div className={styles.rowTwo}>
          <ResolvedPerDayCard data={data.resolvedPerDay} t={t} />
          <NewContactsCard newContacts={data.newContacts} t={t} />
          <SummaryCard activity={activity} trend={data.summaryTrend} t={t} />
        </div>

        <div className={styles.rowThree}>
          <RecordsCreatedCard records={data.recordsCreated} t={t} />
          <TopAgentsCard agents={data.topAgents} t={t} />
        </div>

        <WorkloadStrip workload={data.workload} t={t} />

        <div className={styles.rowFunnel}>
          <StageFunnelCard stages={data.stageFunnel} t={t} />
          <ConversionBySourceCard sources={data.conversionBySource} t={t} />
        </div>

        <ActivityTable rows={activity} t={t} />
      </div>
    </div>
  );
}
