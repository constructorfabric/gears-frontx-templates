import { useApiQuery } from '../../api/queries';
import { getDashboardApi, getInboxApi } from '../../api/registry';
import type { Translate } from '../../shared/i18n';
import { firstPaintOf, LoadErrorPane, LoadingPane } from '../../shared/QueryStates';
import { ScreenHeading } from '../../shared/ScreenHeading';
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
import sharedStyles from '../../shared/shared.module.css';
import styles from './dashboard.module.css';

export type DashboardScreenProps = {
  t: Translate;
};

/**
 * The dashboard's top-level orchestration - the app's first rail entry and
 * its default landing route. Unlike Chat/Mail/Contacts it has no secondary
 * sidebar: a single full-width, scrollable pane holding six rows - KPIs,
 * the resolved/new-contacts/summary trio, records-created plus top agents,
 * the full-width team-workload strip, the stage-funnel plus
 * conversion-by-source pair, and finally the activity table - fed by one
 * `getDashboard` fetch plus the inbox service's own `getContacts` (the
 * activity table reuses those contact identities rather than inventing new
 * people - see `dashboardDataset.ts`).
 */
export function DashboardScreen({ t }: DashboardScreenProps) {
  const dashboardService = getDashboardApi();
  const inboxService = getInboxApi();

  const dashboardQuery = useApiQuery(dashboardService.getDashboard);
  const contactsQuery = useApiQuery(inboxService.getContacts);

  const firstPaint = firstPaintOf([dashboardQuery, contactsQuery]);
  const data = dashboardQuery.data;
  const contacts = contactsQuery.data?.contacts;

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
          <SummaryCard activity={data.activity} trend={data.summaryTrend} t={t} />
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

        <ActivityTable activity={data.activity} contacts={contacts} agents={data.topAgents} t={t} />
      </div>
    </div>
  );
}
