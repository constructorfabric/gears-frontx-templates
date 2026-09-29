/**
 * The dashboard's chart color system: one `ChartConfig` per chart, all built
 * from the same five-hue palette so a viewer learns "violet is open
 * conversations, green is resolutions" once and it holds across every card.
 *
 * Every hue is an existing kit token rather than a literal color - `--chart-1`
 * through `--chart-5` don't exist in this kit (see the `chart` component's
 * own doc), and a literal hex would only ever hold for one theme. Reading
 * `--primary`/`--info`/`--success`/`--warning`/`--destructive` instead means
 * the palette resolves through the kit's own light/dark values
 * automatically, the same way every other token-driven color in this app
 * does.
 *
 * Each config is a function of `t`: a series' label is what the tooltip and
 * the legend print, so it comes from the catalogue like any other UI string.
 */

import type { ChartConfig } from '@gears-frontx/ui-kit';
import type { Translate } from '../../shared/i18n';

/**
 * The name a chart's config gives a series id - the one source for a stage's
 * name in a legend, a tooltip, a label on the drawing and the chart's text
 * summary. Falls back to the id for a series the config does not list.
 */
export const seriesLabel = (config: ChartConfig, id: string): string => {
  const label = config[id]?.label;
  return typeof label === 'string' ? label : id;
};

export const DASHBOARD_PALETTE = {
  violet: 'var(--primary)',
  blue: 'var(--info)',
  green: 'var(--success)',
  amber: 'var(--warning)',
  rose: 'var(--destructive)',
} as const;

/** Row 1's three KPI sparklines - one hue AND one chart type per card (area,
 * bar, line), so no two cards look alike. */
export const openConversationsChartConfig = (t: Translate): ChartConfig => ({
  value: { label: t('chart_open_conversations'), color: DASHBOARD_PALETTE.violet },
});

export const resolvedThisWeekChartConfig = (t: Translate): ChartConfig => ({
  value: { label: t('chart_resolved'), color: DASHBOARD_PALETTE.green },
});

export const avgFirstResponseChartConfig = (t: Translate): ChartConfig => ({
  value: { label: t('chart_avg_first_response'), color: DASHBOARD_PALETTE.blue },
});

/** Row 1's fourth card, "Contacts by stage" - a five-segment donut, one hue
 * per lifecycle stage. Reuses the same five palette hues every other chart
 * on this screen draws from, so "violet" still reads the same everywhere. */
export const contactsByStageChartConfig = (t: Translate): ChartConfig => ({
  prospect: { label: t('chart_stage_prospect'), color: DASHBOARD_PALETTE.blue },
  engaged: { label: t('chart_stage_engaged'), color: DASHBOARD_PALETTE.green },
  customer: { label: t('chart_stage_customer'), color: DASHBOARD_PALETTE.amber },
  'at-risk': { label: t('chart_stage_at_risk'), color: DASHBOARD_PALETTE.violet },
  churned: { label: t('chart_stage_churned'), color: DASHBOARD_PALETTE.rose },
});

/** Row 2's large "Resolved per day" stacked bar chart: one hue per
 * resolution source, so a viewer reads Chat/Mail/Tasks the same colors this
 * screen already uses for those domains elsewhere. */
export const resolvedPerDayChartConfig = (t: Translate): ChartConfig => ({
  chat: { label: t('chart_source_chat'), color: DASHBOARD_PALETTE.blue },
  mail: { label: t('chart_source_mail'), color: DASHBOARD_PALETTE.green },
  tasks: { label: t('chart_source_tasks'), color: DASHBOARD_PALETTE.amber },
});

/** Row 2's "New contacts" hero: bars for the inbound volume, a line for the
 * combined total riding over them. */
export const newContactsChartConfig = (t: Translate): ChartConfig => ({
  inbound: { label: t('chart_inbound'), color: DASHBOARD_PALETTE.blue },
  total: { label: t('chart_total'), color: DASHBOARD_PALETTE.violet },
});

/** The Summary card's small gradient-filled trend area. */
export const summaryTrendChartConfig = (t: Translate): ChartConfig => ({
  value: { label: t('chart_activity'), color: DASHBOARD_PALETTE.amber },
});

/** Row 3's "Records created" line chart - one hue per record type, drawn
 * from the same palette every other chart on this screen uses. */
export const recordsCreatedChartConfig = (t: Translate): ChartConfig => ({
  companies: { label: t('chart_companies'), color: DASHBOARD_PALETTE.blue },
  opportunities: { label: t('chart_opportunities'), color: DASHBOARD_PALETTE.amber },
  people: { label: t('chart_people'), color: DASHBOARD_PALETTE.green },
});

/** The funnel row's "Stage funnel" card - one hue per stage, all five palette
 * hues used once each so the funnel reads as five distinct steps. */
export const stageFunnelChartConfig = (t: Translate): ChartConfig => ({
  new: { label: t('chart_funnel_new'), color: DASHBOARD_PALETTE.blue },
  screening: { label: t('chart_funnel_screening'), color: DASHBOARD_PALETTE.green },
  meeting: { label: t('chart_funnel_meeting'), color: DASHBOARD_PALETTE.amber },
  proposal: { label: t('chart_funnel_proposal'), color: DASHBOARD_PALETTE.violet },
  customer: { label: t('chart_funnel_customer'), color: DASHBOARD_PALETTE.rose },
});

/** The funnel row's "Conversion by source" horizontal stacked bar -
 * Won in the palette's blue and Lost in its rose: a cool-versus-warm pair
 * that separates the two outcomes without leaning on green and red. */
export const conversionChartConfig = (t: Translate): ChartConfig => ({
  won: { label: t('chart_won'), color: DASHBOARD_PALETTE.blue },
  lost: { label: t('chart_lost'), color: DASHBOARD_PALETTE.rose },
});
