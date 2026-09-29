import { Cell, Pie, PieChart } from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@gears-frontx/ui-kit';
import type { ContactStageSegment } from '../../api/dashboardTypes';
import type { Translate } from '../../shared/i18n';
import { contactsByStageChartConfig, seriesLabel } from './dashboardChartConfig';
import { contactsByStagePercent, formatCount, formatPercent } from './dashboardSelectors';
import styles from './dashboard.module.css';

export type ContactsByStageCardProps = {
  segments: ContactStageSegment[];
  t: Translate;
};

const DONUT_DIMENSION = { width: 160, height: 160 };

/**
 * Row 1's fourth card: a
 * thick-ring donut of contact lifecycle stages plus a template-level legend
 * list under it (dot, label, count, percent) - a segmented donut with a
 * count+percent legend. The kit's `ChartLegendContent` only renders a
 * swatch-plus-label row, not the count/percent columns, so the legend
 * here is plain markup fed from the same `segments` data instead.
 */
export function ContactsByStageCard({ segments, t }: ContactsByStageCardProps) {
  const chartConfig = contactsByStageChartConfig(t);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('contacts_by_stage')}</CardTitle>
      </CardHeader>
      <CardContent className={styles.stageCardContent}>
        <ChartContainer
          config={chartConfig}
          className={styles.stageDonut}
          // The legend below lists every segment's count and share in text,
          // so the donut itself is decoration to assistive technology.
          aria-hidden="true"
          initialDimension={DONUT_DIMENSION}
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="id" />} />
            <Pie
              data={segments}
              dataKey="count"
              nameKey="id"
              innerRadius="65%"
              outerRadius="100%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {segments.map((segment) => (
                <Cell key={segment.id} fill={`var(--color-${segment.id})`} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className={styles.stageLegend}>
          {segments.map((segment) => (
            <li className={styles.stageLegendRow} key={segment.id}>
              <span
                className={styles.stageLegendDot}
                style={{ background: `var(--color-${segment.id})` }}
                aria-hidden="true"
              />
              <span className={styles.stageLegendLabel}>{seriesLabel(chartConfig, segment.id)}</span>
              <span className={styles.stageLegendCount}>{formatCount(segment.count)}</span>
              <span className={styles.stageLegendPercent}>
                {formatPercent(contactsByStagePercent(segment, segments))}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
