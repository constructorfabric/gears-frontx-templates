import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@gears-frontx/ui-kit';
import type { ResolvedPerDayPoint } from '../../api/dashboardTypes';
import { weekdayLabel } from '../../shared/format';
import type { Translate } from '../../shared/i18n';
import { chartSummary } from './chartSummary';
import { resolvedPerDayChartConfig } from './dashboardChartConfig';
import { formatCount } from './dashboardSelectors';
import styles from './dashboard.module.css';

export type ResolvedPerDayCardProps = {
  data: ResolvedPerDayPoint[];
  t: Translate;
};

const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const CHART_DIMENSION = { width: 420, height: 220 };

/**
 * Row 2's large stacked bar chart: each day's resolutions split by source -
 * Chat, Mail, Tasks - stacked into one bar. It shows the source breakdown
 * instead of a single-accent "today highlight" bar, since the two
 * treatments fight each other visually; a `ChartTooltipContent` still shows
 * every segment's value on hover, and the legend spells the three sources
 * out.
 */
export function ResolvedPerDayCard({ data, t }: ResolvedPerDayCardProps) {
  const chartData = data.map((point) => ({ ...point, day: weekdayLabel(point.day) }));
  return (
    <Card className={styles.resolvedCard}>
      <CardHeader>
        <CardTitle>{t('resolved_per_day')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={resolvedPerDayChartConfig(t)}
          className={styles.resolvedChart}
          role="img"
          aria-label={chartSummary(
            t('resolved_per_day'),
            chartData.map((point) => ({
              label: point.day,
              value: t('chart_by_source', {
                chat: formatCount(point.chat),
                mail: formatCount(point.mail),
                tasks: formatCount(point.tasks),
              }),
            })),
            t
          )}
          initialDimension={CHART_DIMENSION}
        >
          <BarChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--muted-foreground)"
              fontSize={12}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--muted-foreground)"
              fontSize={12}
              width={24}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="chat" stackId="resolved" fill="var(--color-chat)" />
            <Bar dataKey="mail" stackId="resolved" fill="var(--color-mail)" />
            <Bar dataKey="tasks" stackId="resolved" fill="var(--color-tasks)" radius={[4, 4, 0, 0]} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
