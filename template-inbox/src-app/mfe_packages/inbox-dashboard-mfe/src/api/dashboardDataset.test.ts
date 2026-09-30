import { describe, expect, it } from 'vitest';
import { LAST_7_DAYS } from './dashboardDataset';
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
});
