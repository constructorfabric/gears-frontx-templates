import { arrayAt, sortCopy } from "./array";
import { compareCalendarCells, normalizeCalendarCell } from "./calendar-cell";
import type {
  CalendarAvailabilityCell,
  CalendarDate,
  CalendarSelectionRange,
} from "./model";
import { compareUtcInstants } from "./temporal";

export interface AvailabilityColumn {
  readonly key: string;
  readonly date: CalendarDate;
  readonly cells: readonly CalendarAvailabilityCell[];
}

export const buildAvailabilityColumns = (
  cells: readonly CalendarAvailabilityCell[]
): readonly AvailabilityColumn[] => {
  const columns = new Map<CalendarDate, CalendarAvailabilityCell[]>();

  for (const cell of cells) {
    if (normalizeCalendarCell(cell) === null) {
      continue;
    }

    const column = columns.get(cell.date);

    if (column === undefined) {
      columns.set(cell.date, [cell]);
    } else {
      column.push(cell);
    }
  }

  return sortCopy([...columns.entries()], ([left], [right]) =>
    left.localeCompare(right)
  ).map(([date, columnCells]) => ({
    cells: sortCopy(columnCells, compareCalendarCells),
    date,
    key: date,
  }));
};

export interface AvailabilityRow {
  readonly key: string;
  /** One slot per column; `undefined` where that day has no cell at this wall-clock time. */
  readonly cells: readonly (CalendarAvailabilityCell | undefined)[];
}

/**
 * Lines the columns up by wall-clock start. A wall-clock time that repeats within a day
 * (the fall-back hour) gets a row per occurrence, so every cell has exactly one row.
 */
export const buildAvailabilityRows = (
  columns: readonly AvailabilityColumn[]
): readonly AvailabilityRow[] => {
  const rows = new Map<
    string,
    {
      readonly startTime: string;
      readonly occurrence: number;
      readonly cells: (CalendarAvailabilityCell | undefined)[];
    }
  >();

  for (const [columnIndex, column] of columns.entries()) {
    const occurrences = new Map<string, number>();

    for (const cell of column.cells) {
      const occurrence = occurrences.get(cell.startTime) ?? 0;
      occurrences.set(cell.startTime, occurrence + 1);

      const key = `${cell.startTime}#${occurrence}`;
      const row = rows.get(key) ?? {
        cells: Array.from({ length: columns.length }, () => undefined),
        occurrence,
        startTime: cell.startTime,
      };

      row.cells[columnIndex] = cell;
      rows.set(key, row);
    }
  }

  return sortCopy(
    [...rows.entries()],
    ([, left], [, right]) =>
      left.startTime.localeCompare(right.startTime) ||
      left.occurrence - right.occurrence
  ).map(([key, row]) => ({ cells: row.cells, key }));
};

export const buildAvailabilityRange = (
  cells: readonly CalendarAvailabilityCell[],
  anchor: CalendarAvailabilityCell,
  active: CalendarAvailabilityCell
): CalendarSelectionRange | null => {
  if (
    normalizeCalendarCell(anchor) === null ||
    normalizeCalendarCell(active) === null ||
    !anchor.available ||
    !active.available
  ) {
    return null;
  }

  const anchorBeforeActive = compareCalendarCells(anchor, active) <= 0;

  const lowerBound = anchorBeforeActive ? anchor.start : active.start;

  const upperBound = anchorBeforeActive ? active.end : anchor.end;

  const rangeCells: CalendarAvailabilityCell[] = [];

  for (const cell of cells) {
    if (
      normalizeCalendarCell(cell) === null ||
      !cell.available ||
      compareUtcInstants(cell.start, lowerBound) < 0 ||
      compareUtcInstants(cell.end, upperBound) > 0
    ) {
      continue;
    }

    rangeCells.push(cell);
  }

  const sortedRangeCells = sortCopy(rangeCells, compareCalendarCells);
  const start = arrayAt(sortedRangeCells, 0);
  const end = arrayAt(sortedRangeCells, -1);

  if (start === undefined || end === undefined) {
    return null;
  }

  return { cells: sortedRangeCells, end, start };
};
