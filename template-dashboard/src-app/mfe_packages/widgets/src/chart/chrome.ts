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

/**
 * The characters a cut category label keeps before its ellipsis at least, so a labelled tick has room for this many
 * plus one: the cartesian chart labels only every n-th category (the axis thins) when a slot cannot hold that.
 */
export const MIN_LABEL_CHARS = 4;

/** The characters of tick text that fit in `room` pixels at the tick size. */
export const charsIn = (room: number) => Math.max(0, Math.floor(room / TICK_CHAR_WIDTH));

/** The user-perceived characters of `text`: a letter with its combining marks, or an emoji sequence, is one. */
const charactersOf = (text: string): string[] =>
  typeof Intl.Segmenter === 'function' ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), ({ segment }) => segment) : Array.from(text);

/**
 * `text` cut to at most `max` characters, the last of them an ellipsis; a text that fits stays whole. A character is
 * a grapheme cluster, so a combining mark or an emoji sequence is never split. With `max` 1 it is the ellipsis alone,
 * with `max` 0 or less the empty string.
 */
export function cutLabel(text: string, max: number): string {
  const chars = charactersOf(text);
  if (chars.length <= max) return text;
  if (max < 2) return max === 1 ? '…' : '';
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}
