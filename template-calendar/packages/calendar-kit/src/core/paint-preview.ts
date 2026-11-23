import { arrayAt } from "./array";
import { formatGridTime } from "./format";
import type { CalendarCell, IanaTimeZone } from "./model";

export interface PaintPreviewBlock {
  /** First painted cell of the block. */
  readonly start: CalendarCell;
  /** Painted rows in the block, one per slot. */
  readonly rowCount: number;
  /** Viewer-time range in the grid's time format, e.g. "15:00 – 16:30". */
  readonly label: string;
}

/**
 * Splits painted cells, in time order, into one block per calendar date. A paint is one
 * contiguous span in time, so each date's cells are a single run from its top row down.
 */
export const buildPaintPreviewBlocks = (
  cells: readonly CalendarCell[],
  timeZone: IanaTimeZone,
  locale: string
): readonly PaintPreviewBlock[] => {
  const runs: CalendarCell[][] = [];

  for (const cell of cells) {
    const run = arrayAt(runs, -1);

    if (run !== undefined && arrayAt(run, 0)?.date === cell.date) {
      run.push(cell);
    } else {
      runs.push([cell]);
    }
  }

  return runs.map((run) => {
    const first = arrayAt(run, 0);
    const last = arrayAt(run, -1);

    if (first === undefined || last === undefined) {
      throw new RangeError("A paint run is never empty.");
    }

    return {
      label: `${formatGridTime(first.start, timeZone, locale)} – ${formatGridTime(last.end, timeZone, locale)}`,
      rowCount: run.length,
      start: first,
    };
  });
};
