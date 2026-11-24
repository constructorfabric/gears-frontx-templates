import type { CSSProperties } from 'react';

// The kit chart container stretched over its cell, with no aspect ratio of its own: the cartesian, pie, radar and
// waterfall charts fill the box the cell gives them.
export const FILL = { '--chart-aspect-ratio': 'auto', blockSize: '100%', inlineSize: '100%' } as CSSProperties;

// Tick text in the chart's chrome colour: Recharts paints it #666, which fails contrast on a dark card.
export const TICK = { fill: 'var(--muted-foreground)' };

// About the width of one tick character at the kit chart's tick size, and the height of a tick line with a gap: the
// estimates the cartesian and the radar charts judge their tick labels with.
export const TICK_CHAR_WIDTH = 6.5;
export const TICK_TEXT_HEIGHT = 15;

/**
 * The row a click on a chart picks: the index of the hovered band, axis or point, or null for a click outside any,
 * which carries no index and must not pick row 0.
 */
export function pickIndexOf(state: { activeTooltipIndex?: number | string | null }): number | null {
  if (state.activeTooltipIndex === null || state.activeTooltipIndex === undefined) return null;
  const index = Number(state.activeTooltipIndex);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/** The characters a category label keeps before its ellipsis at least: a tick with less room is left unlabelled. */
export const MIN_LABEL_CHARS = 4;

/** The characters of tick text that fit in `room` pixels at the tick size. */
export const charsIn = (room: number) => Math.max(0, Math.floor(room / TICK_CHAR_WIDTH));

/** `text` cut to at most `max` characters, the last of them an ellipsis; a text that fits stays whole. */
export function cutLabel(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`;
}
