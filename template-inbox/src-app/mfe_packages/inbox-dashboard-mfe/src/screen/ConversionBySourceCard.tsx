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
import type { ConversionSource } from '@inbox-shared/api/dashboardTypes';
import type { Translate } from '@inbox-shared/i18n/translate';
import { chartSummary } from './chartSummary';
import { conversionChartConfig } from './dashboardChartConfig';
import { conversionWonPercent, formatCount, formatPercent } from './dashboardSelectors';
import styles from './dashboard.module.css';
import { leadSourceLabel } from './datasetLabels';

export type ConversionBySourceCardProps = {
  sources: ConversionSource[];
  t: Translate;
};

const CHART_DIMENSION = { width: 560, height: 220 };
const CHART_MARGIN = { top: 8, right: 16, bottom: 0, left: 0 };

/**
 * The funnel row's right card, roughly twice the funnel's width: one
 * horizontal stacked bar per lead source, split Won/Lost. The headline
 * percent is every source's won share of its own won-plus-lost total, computed in
 * `conversionWonPercent` rather than stored.
 */
export function ConversionBySourceCard({ sources, t }: ConversionBySourceCardProps) {
  const wonPercent = conversionWonPercent(sources);
  // The bars' category axis reads a row's `label`, named here in the
  // screen's language.
  const rows = sources.map((source) => ({ ...source, label: leadSourceLabel(source.id, t) }));

  return (
    <Card className={styles.conversionCard}>
      <CardHeader>
        <CardTitle>{t('conversion_by_source')}</CardTitle>
      </CardHeader>
      <CardContent className={styles.conversionContent}>
        <div className={styles.recordsCreatedHeadline}>
          <span className={styles.heroValue}>{formatPercent(wonPercent)}</span>
        </div>
        <p className={styles.recordsCreatedSubtitle}>{t('conversion_by_source_subtitle')}</p>
        <ChartContainer
          config={conversionChartConfig(t)}
          className={styles.conversionChart}
          role="img"
          aria-label={chartSummary(
            t('conversion_by_source'),
            rows.map((source) => ({
              label: source.label,
              value: t('chart_won_lost', { won: formatCount(source.won), lost: formatCount(source.lost) }),
            })),
            t
          )}
          initialDimension={CHART_DIMENSION}
        >
          <BarChart data={rows} layout="vertical" margin={CHART_MARGIN}>
            <CartesianGrid horizontal={false} vertical strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--muted-foreground)"
              fontSize={12}
            />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--muted-foreground)"
              fontSize={12}
              width={72}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="won" stackId="conversion" fill="var(--color-won)" radius={[4, 0, 0, 4]} />
            <Bar dataKey="lost" stackId="conversion" fill="var(--color-lost)" radius={[0, 4, 4, 0]} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
