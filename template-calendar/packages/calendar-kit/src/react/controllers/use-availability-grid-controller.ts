import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  buildAvailabilityColumns,
  buildAvailabilityRange,
  buildAvailabilityRows,
} from "../../core/availability";
import type {
  AvailabilityColumn,
  AvailabilityRow,
} from "../../core/availability";
import { isGridNavigationKey, stepGridPosition } from "../../core/grid-keys";
import type {
  CalendarAvailabilityCell,
  CalendarDirection,
  CalendarSelectionRange,
} from "../../core/model";
import { useControlledValue } from "../hooks/use-controlled-value";

export interface UseAvailabilityGridControllerOptions {
  readonly cells: readonly CalendarAvailabilityCell[];
  readonly direction?: CalendarDirection;
  readonly selectedRange?: CalendarSelectionRange | null;
  readonly defaultSelectedRange?: CalendarSelectionRange | null;
  readonly onSelectedRangeChange?: (
    range: CalendarSelectionRange | null
  ) => void;
  readonly interactionMode?: "paint" | "read-only";
  readonly onPaintSelect?: (range: CalendarSelectionRange) => void;
}

export interface AvailabilityFocusedCell {
  readonly rowIndex: number;
  readonly columnIndex: number;
}

export interface UseAvailabilityGridControllerResult {
  readonly interactionMode: "paint" | "read-only";
  readonly columns: readonly AvailabilityColumn[];
  readonly rows: readonly AvailabilityRow[];
  readonly selectedRange: CalendarSelectionRange | null;
  readonly paint: CalendarSelectionRange | null;
  readonly focusedCell: AvailabilityFocusedCell;
  readonly getCell: (
    rowIndex: number,
    columnIndex: number
  ) => CalendarAvailabilityCell | undefined;
  readonly setFocusedCell: (position: AvailabilityFocusedCell) => void;
  readonly beginPaint: (cell: CalendarAvailabilityCell) => void;
  readonly updatePaint: (cell: CalendarAvailabilityCell) => void;
  readonly endPaint: () => void;
  readonly cancelPaint: () => void;
  readonly clearSelection: () => void;
  readonly handleGridKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number
  ) => void;
}

const DEFAULT_INTERACTION_MODE = "paint" as const;

const FIRST_CELL: AvailabilityFocusedCell = { columnIndex: 0, rowIndex: 0 };

export const useAvailabilityGridController = (
  options: UseAvailabilityGridControllerOptions
): UseAvailabilityGridControllerResult => {
  const direction = options.direction ?? "ltr";
  const interactionMode = options.interactionMode ?? DEFAULT_INTERACTION_MODE;

  const columns = useMemo(
    () => buildAvailabilityColumns(options.cells),
    [options.cells]
  );

  const cellsSignature = useMemo(
    () =>
      options.cells
        .map(
          (cell) => `${cell.date}:${cell.start}:${cell.end}:${cell.available}`
        )
        .join("|"),
    [options.cells]
  );

  const selectedState = useControlledValue<CalendarSelectionRange | null>({
    defaultValue: options.defaultSelectedRange ?? null,
    onChange: options.onSelectedRangeChange,
    value: options.selectedRange,
  });

  const [paintState, setPaintState] = useState<{
    readonly signature: string;
    readonly range: CalendarSelectionRange | null;
  }>({ range: null, signature: cellsSignature });

  // Focus and the keyboard anchor point into one cell list; a new list (the next week)
  // drops both, the same way it drops a pending paint.
  const [focusState, setFocusState] = useState<{
    readonly signature: string;
    readonly position: AvailabilityFocusedCell;
  }>({ position: FIRST_CELL, signature: cellsSignature });

  const keyboardAnchorRef = useRef<{
    readonly signature: string;
    readonly cell: CalendarAvailabilityCell;
  } | null>(null);

  const paintAnchorRef = useRef<CalendarAvailabilityCell | null>(null);
  const paintRef = useRef<CalendarSelectionRange | null>(null);
  const paintSignatureRef = useRef(cellsSignature);

  const rows = useMemo(() => buildAvailabilityRows(columns), [columns]);

  const focusedCell =
    focusState.signature === cellsSignature ? focusState.position : FIRST_CELL;

  const paint =
    interactionMode === "read-only" || paintState.signature !== cellsSignature
      ? null
      : paintState.range;

  const setCurrentPaint = (range: CalendarSelectionRange | null): void => {
    paintRef.current = range;
    paintSignatureRef.current = cellsSignature;
    setPaintState({ range, signature: cellsSignature });
  };

  const getCell = (
    rowIndex: number,
    columnIndex: number
  ): CalendarAvailabilityCell | undefined =>
    rows[rowIndex]?.cells[columnIndex];

  const focusCell = (
    position: AvailabilityFocusedCell,
    cell: CalendarAvailabilityCell
  ): void => {
    setFocusState({ position, signature: cellsSignature });
    keyboardAnchorRef.current = { cell, signature: cellsSignature };
  };

  const setFocusedCell = (position: AvailabilityFocusedCell): void => {
    const cell = getCell(position.rowIndex, position.columnIndex);

    if (cell !== undefined) {
      focusCell(position, cell);
    }
  };

  /**
   * The cell a key moves to. Up and down skip slots the column has no cell for (the
   * spring-forward hour, sparse days); a sideways move lands on the nearest row the
   * target column has, preferring the later one.
   */
  const findMoveTarget = (
    key: string,
    from: AvailabilityFocusedCell
  ): AvailabilityFocusedCell | undefined => {
    const step = stepGridPosition(key, direction, from, columns.length);

    if (step.columnIndex < 0 || step.columnIndex >= columns.length) {
      return undefined;
    }

    if (step.rowIndex !== from.rowIndex) {
      const rowStep = step.rowIndex - from.rowIndex;

      for (
        let rowIndex = step.rowIndex;
        rowIndex >= 0 && rowIndex < rows.length;
        rowIndex += rowStep
      ) {
        if (getCell(rowIndex, step.columnIndex) !== undefined) {
          return { columnIndex: step.columnIndex, rowIndex };
        }
      }

      return undefined;
    }

    for (let distance = 0; distance < rows.length; distance += 1) {
      for (const rowIndex of [from.rowIndex + distance, from.rowIndex - distance]) {
        if (getCell(rowIndex, step.columnIndex) !== undefined) {
          return { columnIndex: step.columnIndex, rowIndex };
        }
      }
    }

    return undefined;
  };

  const commitRange = (range: CalendarSelectionRange): void => {
    selectedState.setValue(range);
    options.onPaintSelect?.(range);
  };

  const beginPaint = (cell: CalendarAvailabilityCell): void => {
    if (interactionMode === "read-only") {
      return;
    }

    const range = buildAvailabilityRange(options.cells, cell, cell);

    if (range === null) {
      return;
    }

    paintAnchorRef.current = cell;
    setCurrentPaint(range);
  };

  const updatePaint = (cell: CalendarAvailabilityCell): void => {
    const anchor =
      paintSignatureRef.current === cellsSignature
        ? paintAnchorRef.current
        : null;

    if (interactionMode === "read-only" || anchor === null) {
      return;
    }

    const range = buildAvailabilityRange(options.cells, anchor, cell);

    if (range !== null) {
      setCurrentPaint(range);
    }
  };

  const endPaint = (): void => {
    const range =
      paintSignatureRef.current === cellsSignature ? paintRef.current : null;

    if (interactionMode === "read-only" || range === null) {
      paintAnchorRef.current = null;
      setCurrentPaint(null);

      return;
    }

    paintAnchorRef.current = null;
    setCurrentPaint(null);
    commitRange(range);
  };

  const cancelPaint = (): void => {
    paintAnchorRef.current = null;
    setCurrentPaint(null);
  };

  const clearSelection = (): void => {
    if (interactionMode === "read-only") {
      return;
    }

    selectedState.setValue(null);
  };

  const moveFocus = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number
  ): void => {
    event.preventDefault();

    const from = { columnIndex, rowIndex };
    const target = findMoveTarget(event.key, from);
    const nextCell =
      target === undefined
        ? undefined
        : getCell(target.rowIndex, target.columnIndex);

    if (target === undefined || nextCell === undefined) {
      return;
    }

    const storedAnchor = keyboardAnchorRef.current;
    const anchor =
      storedAnchor?.signature === cellsSignature
        ? storedAnchor.cell
        : (getCell(rowIndex, columnIndex) ?? nextCell);

    setFocusState({ position: target, signature: cellsSignature });

    if (!event.shiftKey || interactionMode !== "paint") {
      keyboardAnchorRef.current = { cell: nextCell, signature: cellsSignature };

      return;
    }

    keyboardAnchorRef.current = { cell: anchor, signature: cellsSignature };

    // An unpaintable span keeps the previous selection.
    const range = buildAvailabilityRange(options.cells, anchor, nextCell);

    if (range !== null) {
      commitRange(range);
    }
  };

  const handleGridKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number
  ): void => {
    if (isGridNavigationKey(event.key)) {
      moveFocus(event, rowIndex, columnIndex);

      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (event.repeat || interactionMode === "read-only") {
        return;
      }

      const cell = getCell(rowIndex, columnIndex);

      if (cell !== undefined) {
        const range = buildAvailabilityRange(options.cells, cell, cell);

        if (range !== null) {
          commitRange(range);
        }
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();

      if (interactionMode === "paint") {
        clearSelection();
        cancelPaint();
      }
    }
  };

  return {
    beginPaint,
    cancelPaint,
    clearSelection,
    columns,
    endPaint,
    focusedCell,
    getCell,
    handleGridKeyDown,
    interactionMode,
    paint,
    rows,
    selectedRange: selectedState.value,
    setFocusedCell,
    updatePaint,
  };
};
