import { describe, expect, it } from 'vitest';

import { contrast, distance, hexOfOklch, SERIES_TEN, seriesColor, seriesHex, SURFACE, type Scheme } from './palette';

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

  it('generates the same colours past the ten on every load', () => {
    // Pinned values: a changed grid, order or tie-break moves the colours a dashboard already shows.
    expect([10, 11, 23].map((position) => seriesHex(position, 'light'))).toEqual(['#026b13', '#115f82', '#a457ac']);
    expect([10, 23, 99].map((position) => seriesHex(position, 'dark'))).toEqual(['#c798cb', '#0e8c41', '#51a5c0']);
  });

  it('gives the grey of the lightness for an OKLCH colour of chroma 0', () => {
    expect(hexOfOklch(0.5, 0, 120)).toBe('#636363');
    expect(hexOfOklch(1, 0, 0)).toBe('#ffffff');
    expect(hexOfOklch(0, 0, 0)).toBe('#000000');
  });

  it('writes each position as its host custom property with the template colour of the same position as the fallback', () => {
    // The CSS the charts receive: a host that sets three colours gives positions 1 to 3 their colour, and position 4
    // and later fall back to the template's colour of that position (the ten, then the generator), never to the
    // host's first colour. jsdom does not resolve var() or light-dark(), so this checks the expression itself.
    expect(seriesColor(0)).toBe(`var(--dashboard-chart-1, light-dark(${SERIES_TEN.light[0]}, ${SERIES_TEN.dark[0]}))`);
    expect(seriesColor(3)).toBe(`var(--dashboard-chart-4, light-dark(${SERIES_TEN.light[3]}, ${SERIES_TEN.dark[3]}))`);
    expect(seriesColor(14)).toBe(`var(--dashboard-chart-15, light-dark(${seriesHex(14, 'light')}, ${seriesHex(14, 'dark')}))`);
  });
});
