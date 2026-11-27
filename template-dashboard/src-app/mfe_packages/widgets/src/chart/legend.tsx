import type { LegendPayload } from 'recharts';
import { ChartLegend, ChartLegendContent } from '@gears-frontx/ui-kit';

import type { LegendPosition } from '../types';
import styles from '../widgets.module.css';

// The series palette of every chart that draws with it, in one place (`palette.ts`): this module carries the
// ui-kit chart legend, which a widget drawn without a chart library imports nothing of.
export { seriesColor } from './palette';

// Room between the plot and a legend beside it, so an x tick centred on the plot's edge stays clear of the legend.
const LEGEND_GAP = 16;

/**
 * The rank of a legend item by the number of its series or slice key (`s0`, `s1` ... `s10`, `p0` ... `p10`): the
 * series or slice order. The library's own sorting compares the keys as text, which lists `p10` before `p2`.
 */
const byKeyNumber = (item: LegendPayload) => Number(/(\d+)$/.exec(String(item.value ?? ''))?.[1] ?? Number.MAX_SAFE_INTEGER);

/**
 * The chart legend at the asked position, or none. Its items follow `order` when given (the rank of each item), and
 * the series or slice order otherwise.
 */
export function legendOf(position: LegendPosition | undefined, nameKey?: string, order?: (item: LegendPayload) => number) {
  const at = position ?? 'bottom';
  if (at === 'none') return null;
  const side = at === 'left' || at === 'right';
  return (
    <ChartLegend
      layout={side ? 'vertical' : 'horizontal'}
      align={side ? at : 'center'}
      verticalAlign={side ? 'middle' : at}
      itemSorter={order ?? byKeyNumber}
      // A legend never takes more than half the chart, so the plot or the pie keeps room in a short cell; the rest scrolls.
      wrapperStyle={side ? { maxInlineSize: '50%', maxBlockSize: '100%', overflowY: 'auto', [at === 'right' ? 'paddingInlineStart' : 'paddingInlineEnd']: LEGEND_GAP } : { maxBlockSize: '50%', overflowY: 'auto' }}
      content={<ChartLegendContent nameKey={nameKey} className={side ? `${styles.legend} ${styles.legendSide}` : styles.legend} />}
    />
  );
}
