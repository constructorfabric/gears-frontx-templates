import type { ComponentType } from 'react';
import { ClipboardCheckIcon, CodeIcon, FolderKanbanIcon, HeadsetIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Progress } from '@gears-frontx/ui-kit';
import type { WorkloadMetric } from '@inbox-shared/api/dashboardTypes';
import type { Translate } from '@inbox-shared/i18n/translate';
import { formatCount, workloadPercent } from './dashboardSelectors';
import styles from './dashboard.module.css';

export type WorkloadStripProps = {
  workload: WorkloadMetric[];
  t: Translate;
};

const ICON_BY_METRIC_ID: Record<string, ComponentType> = {
  'support-load': HeadsetIcon,
  'dev-backlog': CodeIcon,
  'crm-tasks': FolderKanbanIcon,
  'qa-reviews': ClipboardCheckIcon,
};

/**
 * Row 4, full width: four related workload metrics side by side,
 * icon+value+Progress each, four blocks so a fourth team dimension (QA) sits
 * alongside Support/Dev/CRM at the same visual weight.
 */
export function WorkloadStrip({ workload, t }: WorkloadStripProps) {
  return (
    <Card className={styles.workloadCard}>
      <CardHeader>
        <CardTitle>{t('team_workload')}</CardTitle>
      </CardHeader>
      <CardContent className={styles.workloadStrip}>
        {workload.map((metric) => {
          const Icon = ICON_BY_METRIC_ID[metric.id] ?? FolderKanbanIcon;
          const percent = workloadPercent(metric);
          return (
            <div className={styles.workloadItem} key={metric.id}>
              <span className={styles.workloadIconChip} aria-hidden="true">
                <Icon />
              </span>
              <div className={styles.workloadItemBody}>
                <div className={styles.workloadItemHead}>
                  <span className={styles.workloadLabel}>{metric.label}</span>
                  <span className={styles.workloadValue}>
                    {t('workload_value', { value: formatCount(metric.value), max: formatCount(metric.max) })}
                  </span>
                </div>
                <Progress value={percent} aria-label={metric.label} className={styles.workloadProgress} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
