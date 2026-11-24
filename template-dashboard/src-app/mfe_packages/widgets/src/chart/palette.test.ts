import { describe, expect, it } from 'vitest';

import { contrast, distance, SERIES_TEN, seriesColor, seriesHex, SURFACE, type Scheme } from './palette';

const SCHEMES: Scheme[] = ['light', 'dark'];

describe('series palette', () => {
  it.each(SCHEMES)('keeps the first 24 colours of the %s theme apart: no two closer than 8 in OKLab (x100)', (scheme) => {
    const colours = Array.from({ length: 24 }, (_, position) => seriesHex(position, scheme));
    for (let one = 0; one < colours.length; one++) {
      for (let other = one + 1; other < colours.length; other++) expect(distance(colours[one], colours[other]), `${one} and ${other}`).toBeGreaterThanOrEqual(8);
    }
  });

  it.each(SCHEMES)('keeps neighbours among the ten of the %s theme at least 15 apart, the tenth beside the first too', (scheme) => {
    const ten = SERIES_TEN[scheme];
    for (let at = 0; at < ten.length; at++) expect(distance(ten[at], ten[(at + 1) % ten.length]), `${at}`).toBeGreaterThanOrEqual(15);
  });

  it.each(SCHEMES)('keeps the first 24 colours of the %s theme at 3:1 or more against the chart surface', (scheme) => {
    for (let position = 0; position < 24; position++) expect(contrast(seriesHex(position, scheme), SURFACE[scheme]), `${position}`).toBeGreaterThanOrEqual(3);
  });

  it.each(SCHEMES)('does not come back to an earlier colour of the %s theme within 200 series', (scheme) => {
    const colours = Array.from({ length: 200 }, (_, position) => seriesHex(position, scheme));
    expect(new Set(colours).size).toBe(200);
  });

  it('gives the same colours on every call', () => {
    expect(Array.from({ length: 30 }, (_, position) => seriesColor(position))).toEqual(Array.from({ length: 30 }, (_, position) => seriesColor(position)));
  });

  it('puts the host colour of the position first and the template colour of the same position behind it', () => {
    // A host that sets three colours: positions 1 to 3 take them, position 4 and later take the template's colour
    // of that position (the ten, then the generator), never the host's first colour again.
    expect(seriesColor(0)).toBe(`var(--dashboard-chart-1, light-dark(${SERIES_TEN.light[0]}, ${SERIES_TEN.dark[0]}))`);
    expect(seriesColor(3)).toBe(`var(--dashboard-chart-4, light-dark(${SERIES_TEN.light[3]}, ${SERIES_TEN.dark[3]}))`);
    expect(seriesColor(14)).toBe(`var(--dashboard-chart-15, light-dark(${seriesHex(14, 'light')}, ${seriesHex(14, 'dark')}))`);
  });
});
