import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gears-frontx/ui-kit';
import type { RecordsCreatedPoint } from '../../api/dashboardTypes';
import { monthLabel } from '../../shared/format';
import type { Translate } from '../../shared/i18n';
import { recordsCreatedChartConfig } from './dashboardChartConfig';
import { formatCount, recordsCreatedTotal } from './dashboardSelectors';
import styles from '../../styles/dashboard.module.css';

export type RecordsCreatedCardProps = {
  records: RecordsCreatedPoint[];
  t: Translate;
};

const CHART_DIMENSION = { width: 480, height: 260 };
const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

/**
 * Row 3's hero: a big total, a subtitle, and a 12-month three-line trend -
 * Companies/Opportunities/People, the same "new record" vocabulary a
 * CRM-shaped inbox already tracks. Takes the wider share of row 3 next to
 * `TopAgentsCard`. The Y axis starts at zero and grows with the data, so a
 * busier month is never clipped.
 *
 * The period `Select` renders disabled, the app's convention for a control
 * with no action behind it (the rail's profile entries, the thread header's
 * create-ticket button): this template ships one fixed 12-month window, so
 * the control does not accept a change it would silently ignore.
 */
export function RecordsCreatedCard({ records, t }: RecordsCreatedCardProps) {
  const total = recordsCreatedTotal(records);
  const chartData = records.map((point) => ({ ...point, month: monthLabel(point.month) }));
  const periodItems = [{ value: 'last-12-months', label: t('last_12_months') }];

  return (
    <Card className={styles.recordsCreatedCard}>
      <CardHeader>
        <CardTitle>{t('records_created')}</CardTitle>
        <CardAction>
          <Select defaultValue="last-12-months" disabled items={periodItems}>
            <SelectTrigger size="sm" aria-label={t('records_period')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className={styles.recordsCreatedContent}>
        <div className={styles.recordsCreatedHeadline}>
          <span className={styles.heroValue}>{formatCount(total)}</span>
        </div>
        <p className={styles.recordsCreatedSubtitle}>{t('records_created_subtitle')}</p>
        <ChartContainer
          config={recordsCreatedChartConfig(t)}
          className={styles.recordsChart}
          initialDimension={CHART_DIMENSION}
        >
          <LineChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              stroke="var(--muted-foreground)"
              fontSize={11}
              width={24}
              domain={[0, 'auto']}
              allowDecimals={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="companies"
              stroke="var(--color-companies)"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="opportunities"
              stroke="var(--color-opportunities)"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="people"
              stroke="var(--color-people)"
              strokeWidth={2.5}
              dot={false}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
