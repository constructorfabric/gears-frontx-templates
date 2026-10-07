import { describe, expect, it } from 'vitest';
import { conversionBySource, kpiCards, LAST_7_DAYS, workload } from './dashboardDataset';
import catalogue from '../i18n/en.json';
import {
  KPI_FOOTER_LABEL_KEYS,
  KPI_LABEL_KEYS,
  LEAD_SOURCE_LABEL_KEYS,
  WORKLOAD_LABEL_KEYS,
} from '../screen/datasetLabels';
import { ANCHOR_MS } from '@inbox-shared/api/seedClock';

describe('dashboard seed dataset', () => {
  it('plots seven consecutive calendar days ending today', () => {
    const days = LAST_7_DAYS.map((instant) => {
      const date = new Date(instant);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    });
    const today = new Date(ANCHOR_MS);

    expect(days).toHaveLength(7);
    expect(days[6]).toBe(new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime());
    for (let index = 1; index < days.length; index += 1) {
      const previous = new Date(days[index - 1]);
      const expected = new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 1).getTime();
      expect(days[index]).toBe(expected);
    }
  });

  it('names every KPI card, workload metric and lead source through the catalogue', () => {
    const named = (keys: Readonly<Record<string, string>>, id: string) => {
      const key = keys[id];
      return key !== undefined && key in catalogue;
    };
    for (const kpi of kpiCards) {
      expect(named(KPI_LABEL_KEYS, kpi.id), kpi.id).toBe(true);
      expect(named(KPI_FOOTER_LABEL_KEYS, kpi.id), kpi.id).toBe(true);
    }
    for (const metric of workload) expect(named(WORKLOAD_LABEL_KEYS, metric.id), metric.id).toBe(true);
    for (const source of conversionBySource) expect(named(LEAD_SOURCE_LABEL_KEYS, source.id), source.id).toBe(true);
  });
});
