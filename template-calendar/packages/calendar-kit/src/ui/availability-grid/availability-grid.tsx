"use client";

import { clsx } from "clsx";
import { useMemo } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

import { dateTimeFormatter } from "../../core/intl-cache";
import type {
  CalendarAvailabilityCell,
  CalendarCell,
  CalendarCellContext,
  CalendarGridColumn,
  CalendarGridRow,
  CalendarSelectionRange,
} from "../../core/model";
import { useCalendarContext } from "../../i18n/calendar-context";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type {
  CalendarContextProps,
  CalendarTranslate,
} from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { useAvailabilityGridController } from "../../react/controllers/use-availability-grid-controller";
import type { CalendarGridCellKeyDownHandler } from "../../react/slots";
import { CalendarGrid } from "../grid/calendar-grid";

import styles from "./availability-grid.module.css";

export interface AvailabilityGridProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Host availability decisions, one per slot. */
  readonly cells: readonly CalendarAvailabilityCell[];
  /** `span` (default) paints everything between the drag ends; `cells` paints only the cells a drag passes and keeps earlier painting. */
  readonly paintMode?: "span" | "cells";
  /** Column header text: `date` (default) shows the weekday and date, `weekday` only the weekday. */
  readonly headerFormat?: "date" | "weekday";
  /** Height of one row in pixels. Default `43`. */
  readonly rowHeight?: number;
  /** Draws each row's start time beside both edges of the grid. */
  readonly showHourLabels?: boolean;
  /** Makes the hour labels buttons. Receives every cell of that row. */
  readonly onHourClick?: (rowCells: readonly CalendarAvailabilityCell[]) => void;
  /** Makes the column headers buttons. Receives every cell of that day. */
  readonly onDayClick?: (
    columnCells: readonly CalendarAvailabilityCell[]
  ) => void;
  /** Controlled painted range. */
  readonly selectedRange?: CalendarSelectionRange | null;
  /** Initial painted range when uncontrolled. */
  readonly defaultSelectedRange?: CalendarSelectionRange | null;
  /** Called when the painted range changes or clears. */
  readonly onSelectedRangeChange?: (
    range: CalendarSelectionRange | null
  ) => void;
  /** `read-only` keeps navigation but disables painting. Default `paint`. */
  readonly interactionMode?: "paint" | "read-only";
  /** Replaces cell content. The context adds the cell's `available` flag and host `state`. */
  readonly renderCell?: (
    context: CalendarCellContext & {
      readonly available: boolean;
      readonly state: string | undefined;
    }
  ) => ReactNode;
  /** Called once when a paint gesture is committed. */
  readonly onPaintSelect?: (range: CalendarSelectionRange) => void;
}

const DEFAULT_MODE = "paint" as const;
const DEFAULT_HEADER_FORMAT = "date" as const;

interface AvailabilityGridStyle extends CSSProperties {
  readonly "--grid-hour-height"?: string;
}

const formatColumnLabel = (
  cell: CalendarAvailabilityCell,
  locale: string,
  timeZone: NonNullable<CalendarContextProps["timeZone"]>,
  headerFormat: NonNullable<AvailabilityGridProps["headerFormat"]>
): string =>
  dateTimeFormatter(
    locale,
    headerFormat === "weekday"
      ? { timeZone, weekday: "short" }
      : { day: "numeric", month: "short", timeZone, weekday: "short" }
  ).format(new Date(cell.start));

const formatHourLabel = (
  cell: CalendarCell,
  locale: string,
  timeZone: NonNullable<CalendarContextProps["timeZone"]>
): string =>
  dateTimeFormatter(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(cell.start));

const getCellKey = (cell: CalendarCell): string =>
  `${cell.date}:${cell.startTime}:${cell.start}`;

const buildRangeKeys = (
  range: CalendarSelectionRange | null
): ReadonlySet<string> => new Set(range?.cells.map(getCellKey));

const formatCellLabel = (
  cell: CalendarCell,
  locale: string,
  timeZone: NonNullable<CalendarContextProps["timeZone"]>
): string => {
  const start = new Date(cell.start);
  const dateLabel = dateTimeFormatter(locale, {
    dateStyle: "full",
    timeZone,
  }).format(start);
  const timeLabel = dateTimeFormatter(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(start);

  return `${dateLabel} ${timeLabel}`;
};

const AvailabilityGridContent = ({
  cells,
  className,
  defaultSelectedRange,
  headerFormat = DEFAULT_HEADER_FORMAT,
  interactionMode = DEFAULT_MODE,
  onDayClick,
  onHourClick,
  onPaintSelect,
  onSelectedRangeChange,
  paintMode,
  renderCell,
  rowHeight,
  selectedRange,
  showHourLabels = false,
}: AvailabilityGridContentProps) => {
  const { direction, locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const controller = useAvailabilityGridController({
    cells,
    defaultSelectedRange,
    direction,
    interactionMode,
    onPaintSelect,
    onSelectedRangeChange,
    paintMode,
    selectedRange,
  });

  const gridColumns = useMemo<readonly CalendarGridColumn[]>(
    () =>
      controller.columns.map((column) => ({
        key: column.key,
        label: formatColumnLabel(column.cells[0], locale, timeZone, headerFormat),
      })),
    [controller.columns, headerFormat, locale, timeZone]
  );

  const renderColumnHeader = (column: CalendarGridColumn): ReactNode => {
    if (onDayClick === undefined) {
      return column.label;
    }

    const columnCells =
      controller.columns.find((candidate) => candidate.key === column.key)
        ?.cells ?? [];

    return (
      <button
        type="button"
        className={styles.labelButton}
        aria-label={t("calendar.availability.selectDay", { day: column.label })}
        onClick={() => onDayClick(columnCells)}
      >
        {column.label}
      </button>
    );
  };

  const renderRowLabel = (_row: CalendarGridRow, rowIndex: number): ReactNode => {
    const rowCells = (controller.rows[rowIndex]?.cells ?? []).flatMap((cell) =>
      cell === undefined ? [] : [cell]
    );
    const firstCell = rowCells[0];
    if (firstCell === undefined) {
      return null;
    }

    const label = formatHourLabel(firstCell, locale, timeZone);
    if (onHourClick === undefined) {
      return label;
    }

    return (
      <button
        type="button"
        className={styles.labelButton}
        aria-label={t("calendar.availability.selectHour", { time: label })}
        onClick={() => onHourClick(rowCells)}
      >
        {label}
      </button>
    );
  };

  // The controller's rows, so the fall-back hour's second 01:00 is drawn and reachable.
  const gridRows = useMemo<readonly CalendarGridRow[]>(
    () =>
      controller.rows.map((row, rowIndex) => ({
        cells: row.cells.flatMap((cell) => (cell === undefined ? [] : [cell])),
        key: `availability-row-${rowIndex}`,
      })),
    [controller.rows]
  );

  const cellsByKey = useMemo(
    () =>
      new Map(
        controller.columns.flatMap((column) =>
          column.cells.map((cell) => [getCellKey(cell), cell] as const)
        )
      ),
    [controller.columns]
  );

  const selectedKeys = useMemo(
    () => buildRangeKeys(controller.selectedRange),
    [controller.selectedRange]
  );

  const paintKeys = useMemo(
    () => buildRangeKeys(controller.paint),
    [controller.paint]
  );

  const cellAtTarget = (
    target: EventTarget | null
  ): CalendarAvailabilityCell | undefined => {
    const element = target instanceof Element ? target : null;
    const gridCell = element?.closest<HTMLElement>("[data-cell-key]");
    const key = gridCell?.dataset.cellKey;
    return key === undefined ? undefined : cellsByKey.get(key);
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ): void => {
    const cell = cellAtTarget(event.target);
    if (cell === undefined || controller.interactionMode === "read-only") {
      return;
    }

    event.preventDefault();
    controller.beginPaint(cell);
  };

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ): void => {
    const cell = cellAtTarget(event.target);

    if (cell !== undefined) {
      controller.updatePaint(cell);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (
      cellAtTarget(event.target) !== undefined &&
      event.target instanceof Element
    ) {
      event.target.closest<HTMLElement>("[data-cell-key]")?.focus();
    }

    controller.endPaint();
  };

  const handlePointerCancel = (): void => {
    controller.cancelPaint();
  };

  const handleCellKeyDown = (
    event: Parameters<CalendarGridCellKeyDownHandler>[0],
    context: CalendarCellContext
  ): void => {
    const selectionKey =
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "Escape" ||
      (event.shiftKey && event.key.startsWith("Arrow"));

    if (!selectionKey) {
      return;
    }

    const isContextCell = (cell: CalendarCell | undefined): boolean =>
      cell === context.cell;

    const rowIndex = controller.rows.findIndex((row) =>
      row.cells.some(isContextCell)
    );

    const columnIndex =
      controller.rows[rowIndex]?.cells.findIndex(isContextCell) ?? -1;

    if (rowIndex !== -1 && columnIndex !== -1) {
      controller.handleGridKeyDown(event, rowIndex, columnIndex);
    }
  };

  const gridTranslate: CalendarTranslate = (key, values) =>
    key === "calendar.grid.label"
      ? t("calendar.availability.label", values)
      : t(key, values);

  const renderAvailabilityCell = (context: CalendarCellContext): ReactNode => {
    const availabilityCell = cellsByKey.get(context.key);
    const available = availabilityCell?.available ?? true;
    const isSelected =
      selectedKeys.has(context.key) || paintKeys.has(context.key);

    const cellContext: Parameters<
      NonNullable<AvailabilityGridProps["renderCell"]>
    >[0] = {
      ...context,
      available,
      isReadOnly: controller.interactionMode === "read-only",
      isSelected,
      isUnavailable: !available,
      state: availabilityCell?.state,
    };

    return (
      <div
        className={clsx(
          styles.cellContent,
          !available && styles.unavailable,
          isSelected && styles.selected,
          controller.interactionMode === "read-only" && styles.readOnly
        )}
        aria-disabled={available ? undefined : "true"}
      >
        {renderCell?.(cellContext)}
      </div>
    );
  };

  const isEmpty = gridRows.length === 0;

  // Throws like WeekGrid: a zero or NaN height would collapse every cell without a message.
  if (
    rowHeight !== undefined &&
    (!Number.isFinite(rowHeight) || rowHeight <= 0)
  ) {
    throw new RangeError(`rowHeight must be a positive number: ${rowHeight}`);
  }

  const rootStyle: AvailabilityGridStyle | undefined =
    rowHeight === undefined
      ? undefined
      : { "--grid-hour-height": `${rowHeight}px` };

  return (
    <div
      className={clsx(styles.root, className)}
      style={rootStyle}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerMove}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <CalendarScope t={gridTranslate}>
        <CalendarGrid
          columns={gridColumns}
          rows={gridRows}
          getCellKey={getCellKey}
          getCellLabel={(cell) => formatCellLabel(cell, locale, timeZone)}
          onCellKeyDown={handleCellKeyDown}
          renderCell={renderAvailabilityCell}
          renderHeader={renderColumnHeader}
          renderRowLabel={showHourLabels ? renderRowLabel : undefined}
          className={clsx(styles.grid, isEmpty && styles.emptyGrid)}
        />
      </CalendarScope>
      {isEmpty ? (
        <p className={styles.empty}>{t("calendar.availability.empty")}</p>
      ) : null}
    </div>
  );
};

export const AvailabilityGrid = (props: AvailabilityGridProps) => (
  <CalendarScope {...props}>
    <AvailabilityGridContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

type AvailabilityGridContentProps = Omit<
  AvailabilityGridProps,
  keyof CalendarContextProps
>;

AvailabilityGrid.displayName = "AvailabilityGrid";
