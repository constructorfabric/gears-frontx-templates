"use client";
// @cpt-flow:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-dod:cpt-template-calendar-calendar-kit-dod-week-grid-host-data-boundary:p1
// @cpt-dod:cpt-template-calendar-calendar-kit-dod-week-grid-mode-callbacks:p1
// @cpt-dod:cpt-template-calendar-calendar-kit-dod-week-grid-slots:p1
// @cpt-dod:cpt-template-calendar-calendar-kit-dod-week-grid-keyboard:p1

import { clsx } from "clsx";
import { ClockIcon } from "lucide-react";
import { useRef } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
} from "react";

import { isEventActionable, isEventMovable } from "../../core/actionability";
import { formatGridTime } from "../../core/format";
import type { PaintPreviewBlock } from "../../core/paint-preview";
import { EVENT_CHIP_HEIGHT } from "../../core/grid";
import type {
  CalendarCell,
  CalendarCellContext,
  CalendarCellState,
  CalendarColorFamily,
  CalendarDate,
  CalendarEvent,
  CalendarEventGeometry,
  CalendarEventRenderContext,
  CalendarEventSegment,
  CalendarGridRow,
  CalendarMoveRequest,
  CalendarResizeRequest,
  CalendarSelectionRange,
  CalendarSlotMinutes,
  CalendarTimeRange,
  CalendarTimeWindow,
  UtcInstant,
  WeekGridInteractionMode,
} from "../../core/model";
import { useCalendarContext } from "../../i18n/calendar-context";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import type { useEventResize } from "../../react/hooks/use-event-resize";
import type {
  CalendarConflictRenderer,
  CalendarDetailRenderer,
  CalendarEventRenderer,
  CalendarQuickCreatePayload,
} from "../../react/slots";
import { ConflictIndicator } from "../conflict-indicator/conflict-indicator";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../primitives/alert-dialog/alert-dialog";
import { EventCard } from "../event-card/event-card";
import { buildEventPresentation } from "../event-card/event-presentation";
import type { CalendarGridProps } from "../grid/calendar-grid";
import { baseCellContext, navigateGrid } from "../grid/grid-navigation";
import type { GridCellRecord } from "../grid/grid-navigation";
import { nowCoversHourLabel } from "../grid/now-label";
import { useGridCells } from "../grid/use-grid-cells";
import { Button } from "../primitives/button/button";
import { ScrollRegion } from "../primitives/scroll-region/scroll-region";
import { EMPTY_LIST, useWeekGridContent } from "./use-week-grid-content";
import type {
  WeekGridCellFlags,
  WeekGridContentProps,
  WeekGridDragPreview,
  WeekGridHeaderColumn,
  WeekGridNowLineStyle,
} from "./use-week-grid-content";
import { HOUR_ROW_HEIGHT } from "./week-grid-layout";
import type {
  AllDayPosition,
  CellMeta,
  NowPosition,
  PositionedEvent,
  PositionedTimeRange,
  PositionedOverflow,
} from "./week-grid-layout";

import gridStyles from "../grid/calendar-grid.module.css";
import styles from "./week-grid.module.css";

interface EventFrameHookProps {
  readonly className?: string;
  readonly "data-tone"?: string;
}

interface WeekGridBaseProps<Payload = unknown> extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Any day in the week to show. The week starts on Monday. */
  readonly date: CalendarDate;
  /** Events to lay out. Only the ones overlapping the visible week are drawn. */
  readonly events: readonly CalendarEvent<Payload>[];
  /** Reference instant for the now line and past styling. Default: the wall clock, per minute. */
  readonly now?: UtcInstant;
  /** `5` shows Monday–Friday, `7` the whole week. Default `5`. */
  readonly visibleDays?: 5 | 7;
  /** Visible hours, e.g. `{ start: "06:00", end: "23:00" }`, on slot boundaries. Default: all. */
  readonly visibleHours?: CalendarTimeWindow;
  /** Length of one row. Default `60`. */
  readonly slotMinutes?: CalendarSlotMinutes;
  /** Height of one row in pixels. Default `43`. */
  readonly rowHeight?: number;
  /** Working hours; cells outside them are hatched. Also where the grid first scrolls to. Default 08:00–18:00. */
  readonly workingHours?: CalendarTimeWindow;
  /** Repeat the hour labels on the trailing edge. The copy is hidden from assistive technology. */
  readonly trailingGutter?: boolean;
  /** Class added to every day cell. */
  readonly cellClassName?: string;
  /** Class added to every day header. */
  readonly columnHeaderClassName?: string;
  /** Class on every gutter label: hours, all-day, zone and the trailing copy. */
  readonly gutterClassName?: string;
  /** Controlled interaction mode. Default `quick-create`. */
  readonly interactionMode?: WeekGridInteractionMode;
  /** Initial interaction mode when uncontrolled. */
  readonly defaultInteractionMode?: WeekGridInteractionMode;
  /** Called when the grid asks to change mode. */
  readonly onInteractionModeChange?: (mode: WeekGridInteractionMode) => void;
  /** Controlled selected event. */
  readonly selectedEventId?: string | null;
  /** Initial selected event when uncontrolled. */
  readonly defaultSelectedEventId?: string | null;
  /** Called when an event is selected or deselected. */
  readonly onSelectedEventIdChange?: (eventId: string | null) => void;
  /** Replaces the default `EventCard` for timed and all-day events. Renders inside a button, so the content must not be interactive. */
  readonly renderEvent?: CalendarEventRenderer<Payload>;
  /** Replaces the metadata rows (location, organizer, type) of the default `EventCard`. */
  readonly renderEventMetadata?: CalendarEventRenderer<Payload>;
  /**
   * Class and `data-tone` for the event's card frame, so host CSS can mark a state such as a
   * conflict or a busy block. No inline style: the kit keeps the focus outline out of reach.
   */
  readonly getEventFrameProps?: (
    context: CalendarEventRenderContext<Payload>
  ) => EventFrameHookProps | undefined;
  /** Replaces how each conflict renders inside the default card. */
  readonly renderConflict?: CalendarConflictRenderer;
  /** Renders an inline detail for the selected event. Receives `close`. */
  readonly renderDetail?: CalendarDetailRenderer<Payload>;
  /** Replaces the content of each empty time cell. */
  readonly renderCell?: CalendarGridProps["renderCell"];
  /** Replaces the text of the `+N` tile. Receives the hidden count. */
  readonly renderOverflow?: (
    hiddenCount: number,
    cell: CalendarCell
  ) => ReactNode;
  /** Drawn in cells covered by an unavailable or busy timed event, or in cells `getCellState` marks unavailable. */
  readonly renderUnavailable?: (cell: CalendarCell) => ReactNode;
  /**
   * Host bands drawn behind the timed events. Clipped to `visibleHours`.
   * A band must start before it ends on the same day; overnight or empty bands
   * (e.g. 22:00 to 02:00) are skipped and not drawn. An end of `00:00` means end of day.
   */
  readonly timeRanges?: readonly CalendarTimeRange[];
  /** Renders the content of each band in `timeRanges`. Without it no band is drawn. */
  readonly renderTimeRange?: (
    range: CalendarTimeRange,
    context: { readonly geometry: CalendarEventGeometry }
  ) => ReactNode;
  /** Host state per cell. `unavailable` blocks the cell; it stays focusable. */
  readonly getCellState?: (cell: CalendarCell) => CalendarCellState | undefined;
  /** Replaces the weekday and day number of each day header. The time column keeps its label. */
  readonly renderHeader?: (column: WeekGridHeaderColumn) => ReactNode;
  /** An available event was activated; `anchor` is the card, for a detail popover. */
  readonly onEventSelect?: (
    event: CalendarEvent<Payload>,
    context: CalendarEventRenderContext<Payload>,
    anchor?: HTMLElement
  ) => void;
  /** An empty slot was activated in `quick-create` mode. */
  readonly onQuickCreate?: (payload: CalendarQuickCreatePayload) => void;
  /** A range was painted in `paint-and-move` mode. */
  readonly onPaintSelect?: (range: CalendarSelectionRange) => void;
  /** An event was dropped on a new slot in `paint-and-move` mode. Call `confirm` or `cancel`. */
  readonly onMoveRequest?: (request: CalendarMoveRequest) => void;
  /** A resize handle on timed, single-day, movable events asks the host to move the event's end. */
  readonly onResizeRequest?: (request: CalendarResizeRequest) => void;
  /** Lets recurring events be dragged and resized. The requests carry the event, so the host picks occurrence or series. */
  readonly recurringEventsMovable?: boolean;
  /** Colour family of a painted range. Unset, the painted cells use the plain selection style. */
  readonly paintColorFamily?: CalendarColorFamily;
}
/**
 * The cap and the tile handler come as a pair. A cap without a handler would hide cards the
 * user cannot reach.
 */
type WeekGridOverflowProps =
  | {
      readonly maxEventsPerSlot?: undefined;
      readonly onOverflowSelect?: undefined;
    }
  | {
      /** Most cards that start in one row of a day. Later ones hide behind a `+N` lane tile. */
      readonly maxEventsPerSlot: number;
      /** The `+N` tile was activated. `anchor` is the tile, for a popover. */
      readonly onOverflowSelect: (cell: CalendarCell, anchor: HTMLElement) => void;
    };

export type WeekGridProps<Payload = unknown> = WeekGridBaseProps<Payload> &
  WeekGridOverflowProps;

interface WeekGridInteractionLayerProps {
  readonly currentInstant: UtcInstant;
  readonly nowLineStyle?: WeekGridNowLineStyle;
  readonly nowPosition: NowPosition | null;
  readonly onClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  readonly onDragEnd: (event: ReactDragEvent<HTMLDivElement>) => void;
  readonly onDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  readonly onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  readonly onDragStart: (event: ReactDragEvent<HTMLDivElement>) => void;
  readonly onDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerEnter: (target: EventTarget | null) => void;
  readonly onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (target: EventTarget | null) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly ref?: Ref<HTMLDivElement>;
  readonly timedRows: readonly ReactNode[];
}

const WeekGridInteractionLayer = ({
  currentInstant,
  nowLineStyle,
  nowPosition,
  onClick,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onPointerCancel,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  ref,
  timedRows,
}: WeekGridInteractionLayerProps) => {
  const { locale } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const nowTime = formatGridTime(currentInstant, timeZone, locale);

  return (
    <ScrollRegion
      ref={ref}
      className={styles.interactionSurface}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => {
        onPointerMove(event.target);
      }}
      onPointerEnter={(event) => {
        onPointerEnter(event.target);
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
    >
      {timedRows}
      {nowPosition !== null && (
        <div
          className={styles.nowLine}
          data-now-line
          aria-hidden="true"
          style={nowLineStyle}
        >
          <span className={styles.nowLabel}>{nowTime}</span>
        </div>
      )}
    </ScrollRegion>
  );
};

interface WeekGridRootStyle extends CSSProperties {
  readonly "--grid-hour-height"?: string;
}

interface WeekGridNowStatusProps {
  readonly currentInstant: UtcInstant;
}

/** Names the now line from outside the grid, because a grid may only own rows. */
const WeekGridNowStatus = ({ currentInstant }: WeekGridNowStatusProps) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const nowTime = formatGridTime(currentInstant, timeZone, locale);

  return (
    <div
      className={styles.liveRegion}
      role="status"
      aria-label={`${t("calendar.week.currentTime")}: ${nowTime}`}
    >
      {nowTime}
    </div>
  );
};

interface WeekGridLiveRegionProps {
  readonly text: string;
}

const WeekGridLiveRegion = ({ text }: WeekGridLiveRegionProps) => (
  <div
    className={styles.liveRegion}
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {text}
  </div>
);

interface WeekGridDetailProps<Payload> {
  readonly event: CalendarEvent<Payload> | undefined;
  readonly onClose: () => void;
  readonly renderDetail?: CalendarDetailRenderer<Payload>;
}

const WeekGridDetail = <Payload,>({
  event,
  onClose,
  renderDetail,
}: WeekGridDetailProps<Payload>) =>
  event === undefined || renderDetail === undefined ? null : (
    <div className={styles.detailSlot}>
      {renderDetail({ close: onClose, event })}
    </div>
  );

interface WeekGridHeaderProps {
  readonly columns: readonly WeekGridHeaderColumn[];
  readonly renderHeader?: (column: WeekGridHeaderColumn) => ReactNode;
  readonly trailing: ReactNode;
  readonly columnHeaderClassName?: string;
  readonly gutterClassName?: string;
}

const WeekGridHeader = ({
  columns,
  columnHeaderClassName,
  gutterClassName,
  renderHeader,
  trailing,
}: WeekGridHeaderProps) => {
  const { timeZone } = useCalendarContext();
  const headerCells = columns.map((headerColumn, columnIndex) => {
    const { column, dayNumber, isToday, weekday } = headerColumn;
    const isDayColumn = column.key !== "time";
    const hasBuiltInDay = weekday !== undefined && dayNumber !== undefined;

    return (
      <div
        className={clsx(
          gridStyles.headerCell,
          column.key === "time" ? gutterClassName : columnHeaderClassName
        )}
        key={column.key}
        role="columnheader"
        aria-colindex={columnIndex + 1}
      >
        {column.key === "time" && (
          <span className={styles.headerGutter} title={timeZone}>
            {column.label}
          </span>
        )}
        {isDayColumn && renderHeader?.(headerColumn)}
        {isDayColumn && renderHeader === undefined && hasBuiltInDay && (
          <>
            <span className={clsx(styles.weekday, isToday && styles.today)}>
              {weekday}
            </span>
            <span className={clsx(styles.dayNumber, isToday && styles.today)}>
              {dayNumber}
            </span>
          </>
        )}
        {isDayColumn &&
          renderHeader === undefined &&
          !hasBuiltInDay &&
          column.label}
      </div>
    );
  });

  return (
    <div className={gridStyles.row} role="row" aria-rowindex={1}>
      {headerCells}
      {trailing}
    </div>
  );
};

interface WeekCalendarGridProps extends CalendarGridProps {
  readonly headerColumns: readonly WeekGridHeaderColumn[];
  readonly onFrameRef?: Ref<HTMLDivElement>;
  readonly renderTimedRows: (rows: readonly ReactNode[]) => ReactNode;
  readonly renderTrailingCell?: (row: CalendarGridRow) => ReactNode;
  readonly getCellFlags: (cell: CalendarCell) => WeekGridCellFlags;
  readonly renderDayHeader?: (column: WeekGridHeaderColumn) => ReactNode;
  readonly columnHeaderClassName?: string;
  readonly gutterClassName?: string;
}

const WeekCalendarGrid = (props: WeekCalendarGridProps) => {
  const { direction, t } = useCalendarLocalization();

  const {
    columns,
    headerColumns,
    rows,
    getCellKey,
    getCellFlags,
    getCellLabel,
    activeCellKey,
    defaultActiveCellKey,
    onActiveCellChange,
    isCellNavigable,
    onCellKeyDown,
    renderCell,
    renderDayHeader,
    renderTimedRows,
    renderTrailingCell,
    onFrameRef,
    className,
    columnHeaderClassName,
    gutterClassName,
  } = props;

  const {
    currentActiveCellKey,
    labelsByCell,
    recordsByKey,
    setUncontrolledActiveCellKey,
  } = useGridCells({
    activeCellKey,
    defaultActiveCellKey,
    getCellKey,
    getCellLabel,
    rows,
  });

  const cellElementsRef = useRef(new Map<string, HTMLDivElement>());

  const focusCell = (key: string): void => {
    cellElementsRef.current.get(key)?.focus();
  };

  const setActiveCell = (record: GridCellRecord): void => {
    if (activeCellKey === undefined) {
      setUncontrolledActiveCellKey(record.key);
    }

    onActiveCellChange?.(record.cell);
    focusCell(record.key);
  };

  const handleCellKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    record: GridCellRecord,
    context: CalendarCellContext
  ): void => {
    onCellKeyDown?.(event, context);

    if (event.defaultPrevented) {
      return;
    }

    const navigation = navigateGrid({
      direction,
      getCellKey,
      isCellNavigable,
      key: event.key,
      record,
      recordsByKey,
      rows,
    });

    if (!navigation.handled) {
      return;
    }

    event.preventDefault();

    if (navigation.destination !== undefined) {
      setActiveCell(navigation.destination);
    }
  };

  const renderedRows = rows.map((row, rowIndex) => (
    <div
      className={gridStyles.row}
      key={row.key}
      role="row"
      aria-rowindex={rowIndex + 2}
    >
      {row.cells.map((cell) => {
        const key = getCellKey(cell);
        const record = recordsByKey.get(key);
        if (!record) {
          return null;
        }

        const isFocused = currentActiveCellKey === key;
        const provisionalContext = baseCellContext(cell, key, isFocused);

        const label =
          labelsByCell.get(cell) ?? getCellLabel(cell, provisionalContext);

        const context: CalendarCellContext = {
          ...provisionalContext,
          ...getCellFlags(cell),
          label,
        };

        const handleFocus = (): void => {
          if (activeCellKey === undefined) {
            setUncontrolledActiveCellKey(key);
          }
        };

        const handleKeyDown = (
          event: ReactKeyboardEvent<HTMLDivElement>
        ): void => {
          handleCellKeyDown(event, record, context);
        };

        return (
          <div
            className={gridStyles.cell}
            key={key}
            ref={(element) => {
              if (element) {
                cellElementsRef.current.set(key, element);
              } else {
                cellElementsRef.current.delete(key);
              }
            }}
            role="gridcell"
            data-cell-key={key}
            data-state={context.state}
            aria-colindex={record.columnIndex + 1}
            aria-rowindex={rowIndex + 2}
            aria-label={label}
            tabIndex={isFocused ? 0 : -1}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
          >
            {renderCell(context)}
          </div>
        );
      })}
      {renderTrailingCell?.(row)}
    </div>
  ));

  return (
    <div
      ref={onFrameRef}
      className={clsx(gridStyles.root, className)}
      role="grid"
      aria-label={t("calendar.grid.label")}
      aria-colcount={columns.length}
      aria-rowcount={rows.length + 1}
      dir={direction}
    >
      {columns.length > 0 ? (
        <WeekGridHeader
          columns={headerColumns}
          columnHeaderClassName={columnHeaderClassName}
          gutterClassName={gutterClassName}
          renderHeader={renderDayHeader}
          trailing={
            renderTrailingCell === undefined ? null : (
              <div
                className={clsx(
                  gridStyles.headerCell,
                  styles.trailingGutterCell,
                  gutterClassName
                )}
                aria-hidden="true"
              />
            )
          }
        />
      ) : null}
      {renderedRows[0]}
      {renderTimedRows(renderedRows.slice(1))}
    </div>
  );
};

interface EventFrameProps {
  readonly eventId: string;
  readonly className: string;
  readonly insetBlockStart?: string;
  readonly inlineSize?: string;
  readonly style?: CSSProperties;
  readonly children: ReactNode;
  readonly dragging?: boolean;
  readonly draggable?: boolean;
  readonly onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

const EventFrame = ({
  eventId,
  className,
  insetBlockStart,
  inlineSize,
  style,
  children,
  dragging = false,
  draggable = false,
  onKeyDown,
}: EventFrameProps) => (
  <div
    className={className}
    data-event-id={eventId}
    data-dragging={dragging ? "" : undefined}
    style={{ ...style, inlineSize, insetBlockStart }}
    draggable={draggable}
    onKeyDown={onKeyDown}
  >
    {children}
  </div>
);

interface WeekGridEventProps<Payload> {
  readonly currentInstant: UtcInstant;
  readonly event: CalendarEvent<Payload>;
  readonly geometry: CalendarEventGeometry;
  readonly onSelect: (
    eventId: string,
    context?: CalendarEventRenderContext<Payload>,
    anchor?: HTMLElement
  ) => void;
  readonly readOnly: boolean;
  readonly recurringEventsMovable: boolean;
  readonly renderConflict?: CalendarConflictRenderer;
  readonly renderEvent?: CalendarEventRenderer<Payload>;
  readonly renderEventMetadata?: CalendarEventRenderer<Payload>;
  readonly getEventFrameProps?: WeekGridProps<Payload>["getEventFrameProps"];
  readonly selectedEventId: string | null;
  readonly segment: CalendarEventSegment;
}

const WeekGridEvent = <Payload,>(props: WeekGridEventProps<Payload>) => {
  // @cpt-begin:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const {
    currentInstant,
    event,
    geometry,
    getEventFrameProps,
    onSelect,
    readOnly,
    recurringEventsMovable,
    renderConflict,
    renderEvent,
    renderEventMetadata,
    selectedEventId,
    segment,
  } = props;

  const presentation = buildEventPresentation({
    currentInstant,
    event,
    geometry,
    locale,
    readOnly,
    segment,
    selected: selectedEventId === event.id,
    timeZone,
    translate: t,
  });
  const { context, description, conflicts, isAvailable, isPast } = presentation;
  const frameProps = getEventFrameProps?.(context);

  const handleSelect = (anchor?: HTMLElement): void => {
    onSelect(event.id, context, anchor);
  };

  if (renderEvent !== undefined) {
    const handleKeyDown = (
      keyboardEvent: ReactKeyboardEvent<HTMLButtonElement>
    ): void => {
      if (
        keyboardEvent.repeat ||
        (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ")
      ) {
        return;
      }

      keyboardEvent.preventDefault();

      if (isAvailable) {
        handleSelect(keyboardEvent.currentTarget);
      }
    };

    return (
      <Button
        variant="ghost"
        className={clsx(
          styles.customEvent,
          !isAvailable && styles.unavailable,
          context.isSelected && styles.selectedRing,
          frameProps?.className
        )}
        data-tone={frameProps?.["data-tone"]}
        data-event-id={event.id}
        aria-label={event.title}
        aria-disabled={isAvailable ? undefined : "true"}
        aria-pressed={context.isSelected ? "true" : "false"}
        aria-description={description}
        draggable={
          isAvailable && !readOnly && isEventMovable(event, recurringEventsMovable)
        }
        disabled={!isAvailable}
        focusableWhenDisabled
        onClick={(clickEvent) => {
          handleSelect(clickEvent.currentTarget);
        }}
        onKeyDown={handleKeyDown}
      >
        {renderEvent(context)}
        {conflicts.length > 0 && (
          <ConflictIndicator
            conflicts={conflicts}
            className={styles.customConflicts}
            renderConflict={
              renderConflict === undefined
                ? undefined
                : (conflict): ReactNode => renderConflict(conflict, context)
            }
          />
        )}
      </Button>
    );
  }

  const renderTime = (
    eventContext: CalendarEventRenderContext<Payload>
  ): ReactNode => {
    // The all-day chip shows its title only, as in the design.
    if (eventContext.event.allDay) {
      return null;
    }

    const start = formatGridTime(eventContext.segment.start, timeZone, locale);
    const end = formatGridTime(eventContext.segment.end, timeZone, locale);
    return `${start} – ${end}`;
  };

  return (
    <EventCard
      event={event}
      geometry={geometry}
      positioned={false}
      segment={segment}
      selected={context.isSelected}
      available={isAvailable}
      past={isPast}
      readOnly={readOnly}
      className={frameProps?.className}
      data-tone={frameProps?.["data-tone"]}
      renderConflict={renderConflict}
      renderMetadata={renderEventMetadata}
      renderTime={renderTime}
      onSelect={(_event, _context, anchor) => {
        handleSelect(anchor);
      }}
    />
  );
  // @cpt-end:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
};

interface WeekGridOverflowButtonProps {
  readonly overflow: PositionedOverflow;
  readonly onOverflowSelect?: WeekGridProps["onOverflowSelect"];
  readonly renderOverflow?: WeekGridProps["renderOverflow"];
}

const WeekGridOverflowButton = ({
  overflow,
  onOverflowSelect,
  renderOverflow,
}: WeekGridOverflowButtonProps) => {
  const { t } = useCalendarLocalization();
  const label = t("calendar.week.overflow", { count: overflow.hiddenCount });
  const content =
    renderOverflow?.(overflow.hiddenCount, overflow.cell) ?? label;
  const { geometry } = overflow;
  const style: CSSProperties = {
    blockSize: `${geometry.height}px`,
    insetBlockStart: `${geometry.top}px`,
    insetInlineStart: `${geometry.insetInlineStart}%`,
    inlineSize: `${geometry.inlineSize}%`,
    zIndex: geometry.zIndex,
  };

  // Without a selection handler the tile is only informational, so it is not a button.
  if (onOverflowSelect === undefined) {
    return (
      <span className={styles.overflow} data-week-overflow="" style={style}>
        {content}
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="tertiary"
      size="sm"
      className={styles.overflow}
      aria-label={renderOverflow ? undefined : label}
      data-week-overflow=""
      style={style}
      onClick={(clickEvent) => {
        onOverflowSelect(overflow.cell, clickEvent.currentTarget);
      }}
    >
      {content}
    </Button>
  );
};

interface WeekGridCellContentProps<Payload> {
  readonly allDayPositions: readonly AllDayPosition<Payload>[];
  readonly cellClassName?: string;
  readonly dragPreview: WeekGridDragPreview<Payload> | null;
  readonly gutterClassName?: string;
  readonly context: CalendarCellContext;
  readonly currentInstant: UtcInstant;
  readonly gridCellKey: string;
  readonly meta: CellMeta | undefined;
  readonly onSelect: (
    eventId: string,
    context?: CalendarEventRenderContext<Payload>,
    anchor?: HTMLElement
  ) => void;
  readonly readOnly: boolean;
  readonly recurringEventsMovable: boolean;
  readonly resizable: boolean;
  readonly resize: ReturnType<typeof useEventResize>;
  readonly renderCell?: CalendarGridProps["renderCell"];
  readonly renderConflict?: CalendarConflictRenderer;
  readonly renderEvent?: CalendarEventRenderer<Payload>;
  readonly renderEventMetadata?: CalendarEventRenderer<Payload>;
  readonly getEventFrameProps?: WeekGridProps<Payload>["getEventFrameProps"];
  readonly renderOverflow?: WeekGridProps["renderOverflow"];
  readonly renderUnavailable?: (cell: CalendarCell) => ReactNode;
  readonly renderTimeRange?: WeekGridProps["renderTimeRange"];
  readonly dropTargetKeys: ReadonlySet<string>;
  readonly onOverflowSelect?: WeekGridProps["onOverflowSelect"];
  readonly overflow?: PositionedOverflow;
  readonly paintColorFamily?: CalendarColorFamily;
  readonly paintInvalid: boolean;
  readonly paintPreview: PaintPreviewBlock | undefined;
  readonly selectedEventId: string | null;
  readonly selectedPaintKeys: ReadonlySet<string>;
  readonly timeRangePositions: readonly PositionedTimeRange[];
  readonly timedPositions: readonly PositionedEvent<Payload>[];
  readonly unavailableCellKeys: ReadonlySet<string>;
}

/** `now` is passed only where the now label is drawn: the leading gutter. */
const visibleGutterLabel = (
  meta: CellMeta,
  now?: UtcInstant
): string | null => {
  if (meta.slotIndex === null) {
    return meta.label;
  }

  const covered = now !== undefined && nowCoversHourLabel(meta.cell.start, now);
  return meta.cell.startTime.endsWith(":00") && !covered ? meta.label : null;
};

const WeekGridCellContent = <Payload,>(
  props: WeekGridCellContentProps<Payload>
) => {
  // @cpt-begin:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots

  const {
    allDayPositions,
    cellClassName,
    context,
    currentInstant,
    dragPreview,
    dropTargetKeys,
    gridCellKey,
    gutterClassName,
    meta,
    onSelect,
    readOnly,
    renderCell,
    renderConflict,
    renderEvent,
    renderEventMetadata,
    getEventFrameProps,
    renderOverflow,
    renderUnavailable,
    renderTimeRange,
    onOverflowSelect,
    overflow,
    paintColorFamily,
    paintInvalid,
    paintPreview,
    recurringEventsMovable,
    resizable,
    resize,
    selectedEventId,
    selectedPaintKeys,
    timeRangePositions,
    timedPositions,
    unavailableCellKeys,
  } = props;

  if (meta === undefined) {
    return null;
  }

  if (meta.kind === "gutter") {
    return (
      <span
        className={clsx(
          styles.gutter,
          meta.slotIndex === null && styles.allDayGutter,
          gutterClassName
        )}
      >
        {visibleGutterLabel(meta, currentInstant)}
      </span>
    );
  }

  const unavailable =
    context.isUnavailable || unavailableCellKeys.has(gridCellKey);
  const painted = selectedPaintKeys.has(gridCellKey);
  const dropTarget =
    dragPreview?.targetKey === gridCellKey ? dragPreview : null;

  const cellContext: CalendarCellContext = {
    ...context,
    isReadOnly: readOnly,
    isSelected: painted,
    isUnavailable: unavailable,
  };

  return (
    <>
      <div
        className={clsx(
          styles.cellContent,
          unavailable && styles.unavailableSlot,
          cellClassName
        )}
        data-paint={painted ? "" : undefined}
        data-color-family={painted ? paintColorFamily : undefined}
        data-invalid={painted && paintInvalid ? "" : undefined}
        data-drop-target={dropTargetKeys.has(gridCellKey) ? "" : undefined}
      >
        {renderCell?.(cellContext)}
        {unavailable && renderUnavailable?.(context.cell)}
        {paintPreview !== undefined && (
          <div
            aria-hidden="true"
            className={styles.paintPreview}
            data-paint-preview=""
            inert
            style={{
              blockSize: `calc(${paintPreview.rowCount} * (100% + var(--cal-border-width-1)))`,
              insetBlockStart: "0px",
              insetInlineStart: "0px",
            }}
          >
            <span className={styles.paintPreviewBar} />
            <span className={styles.paintPreviewTime}>
              <ClockIcon aria-hidden="true" className={styles.paintPreviewIcon} />
              {paintPreview.label}
            </span>
          </div>
        )}
        {dropTarget?.ghost !== undefined && (
          <div
            className={clsx(
              styles.eventFrame,
              styles.timedFrame,
              styles.dragGhost
            )}
            aria-hidden="true"
            data-drag-ghost=""
            inert
            style={{
              blockSize: `${dropTarget.ghost.height}px`,
              inlineSize: `${dropTarget.ghost.geometry.inlineSize}%`,
              insetInlineStart: `${dropTarget.ghost.geometry.insetInlineStart}%`,
            }}
          >
            <WeekGridEvent<Payload>
              currentInstant={currentInstant}
              event={dropTarget.ghost.event}
              geometry={dropTarget.ghost.geometry}
              onSelect={onSelect}
              readOnly={readOnly}
              recurringEventsMovable={recurringEventsMovable}
              renderConflict={renderConflict}
              renderEvent={renderEvent}
              renderEventMetadata={renderEventMetadata}
              getEventFrameProps={getEventFrameProps}
              selectedEventId={selectedEventId}
              segment={dropTarget.ghost.segment}
            />
          </div>
        )}
      </div>
      {renderTimeRange !== undefined &&
        timeRangePositions.map((position) => (
          <div
            key={position.range.key}
            className={styles.timeRangeFrame}
            aria-hidden="true"
            style={{
              blockSize: `${position.geometry.height}px`,
              insetBlockStart: `${position.geometry.top}px`,
              insetInlineStart: `${position.geometry.insetInlineStart}%`,
              inlineSize: `${position.geometry.inlineSize}%`,
              zIndex: position.geometry.zIndex,
            }}
          >
            {renderTimeRange(position.range, { geometry: position.geometry })}
          </div>
        ))}
      {overflow !== undefined && (
        <WeekGridOverflowButton
          overflow={overflow}
          onOverflowSelect={onOverflowSelect}
          renderOverflow={renderOverflow}
        />
      )}
      {allDayPositions.map((position) => (
        <EventFrame
          key={`${position.event.id}:${position.startColumn}:${position.endColumn}`}
          eventId={position.event.id}
          className={clsx(styles.eventFrame, styles.allDayFrame)}
          dragging={dragPreview?.eventId === position.event.id}
          draggable={
            !readOnly && !unavailable && isEventMovable(position.event, recurringEventsMovable)
          }
          insetBlockStart={`${position.lane * (EVENT_CHIP_HEIGHT + 2)}px`}
          inlineSize={`${position.endColumn - position.startColumn}00%`}
        >
          <WeekGridEvent<Payload>
            currentInstant={currentInstant}
            event={position.event}
            geometry={position.geometry}
            onSelect={onSelect}
            readOnly={readOnly}
            recurringEventsMovable={recurringEventsMovable}
            renderConflict={renderConflict}
            renderEvent={renderEvent}
            renderEventMetadata={renderEventMetadata}
            getEventFrameProps={getEventFrameProps}
            selectedEventId={selectedEventId}
            segment={position.segment}
          />
        </EventFrame>
      ))}
      {timedPositions.map((position) => {
        const { event } = position;
        const resizeProps =
          resizable &&
          !unavailable &&
          position.segment.segment === null &&
          isEventActionable(event) &&
          isEventMovable(event, recurringEventsMovable)
            ? resize.handleProps(event)
            : null;
        const resizeBlockSize =
          resize.preview?.eventId === event.id
            ? resize.preview.blockSize
            : position.height;

        return (
          <EventFrame
            key={position.segment.event.id + position.segment.date}
            eventId={event.id}
            className={clsx(styles.eventFrame, styles.timedFrame)}
            dragging={dragPreview?.eventId === event.id}
            draggable={
              !readOnly && !unavailable && isEventMovable(event, recurringEventsMovable)
            }
            onKeyDown={resizeProps?.onKeyDown}
            style={{
              blockSize: `${resizeBlockSize}px`,
              insetInlineStart: `${position.geometry.insetInlineStart}%`,
              zIndex: position.geometry.zIndex,
            }}
            insetBlockStart={`${position.top}px`}
            inlineSize={`${position.geometry.inlineSize}%`}
          >
            <WeekGridEvent<Payload>
              currentInstant={currentInstant}
              event={event}
              geometry={position.geometry}
              onSelect={onSelect}
              readOnly={readOnly}
              recurringEventsMovable={recurringEventsMovable}
              renderConflict={renderConflict}
              renderEvent={renderEvent}
              renderEventMetadata={renderEventMetadata}
              getEventFrameProps={getEventFrameProps}
              selectedEventId={selectedEventId}
              segment={position.segment}
            />
            {resizeProps !== null && (
              <div
                className={styles.resizeHandle}
                data-resize-handle=""
                onMouseDown={resizeProps.onMouseDown}
                onPointerCancel={resizeProps.onPointerCancel}
                onPointerDown={resizeProps.onPointerDown}
                onPointerMove={resizeProps.onPointerMove}
                onPointerUp={resizeProps.onPointerUp}
              />
            )}
          </EventFrame>
        );
      })}
    </>
  );
  // @cpt-end:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
};

// @cpt-begin:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-render
const WeekGridContent = <Payload = unknown,>(
  props: WeekGridContentProps<Payload>
) => {
  const {
    allDayPositionsByCell,
    closeDetail,
    controller,
    currentInstant,
    detailVisible,
    dragPreview,
    firstTimedCellKey,
    frameRef,
    getCellLabel,
    gridCellKey,
    gridData,
    handleCellKeyDown,
    handleClick,
    dropTargetKeys,
    handleDragEnd,
    handleDragLeave,
    handleDragOver,
    handleDragStart,
    handleDrop,
    handleEventSelect,
    handleGridActiveCellChange,
    handlePointerCancel,
    handlePointerDown,
    handlePointerLeave,
    handlePointerUp,
    headerColumns,
    getCellFlags,
    isCellNavigable,
    liveRegionText,
    nowLineStyle,
    nowPosition,
    overflowByCell,
    renderCell,
    renderConflict,
    renderEvent,
    renderUnavailable,
    rootClassName,
    scrollRef,
    selectedEvent,
    paintRefused,
    paintTouchesUnavailable,
    resize,
    paintPreviewByCellKey,
    selectedPaintKeys,
    setPaintRefused,
    t,
    timeRangePositionsByCell,
    timedPositionsByCell,
    trailingGutter,
    unavailableCellKeys,
    updatePaintFromTarget,
  } = useWeekGridContent(props);

  const {
    cellClassName,
    columnHeaderClassName,
    gutterClassName,
    onOverflowSelect,
    paintColorFamily,
    getEventFrameProps,
    recurringEventsMovable = false,
    renderDetail,
    renderEventMetadata,
    renderHeader,
    renderOverflow,
    renderTimeRange,
    rowHeight,
  } = props;

  const rootStyle: WeekGridRootStyle = {
    "--grid-hour-height": `${rowHeight ?? HOUR_ROW_HEIGHT}px`,
  };

  const renderTrailingCell = (row: CalendarGridRow): ReactNode => {
    const [gutterCell] = row.cells;

    const meta =
      gutterCell === undefined
        ? undefined
        : gridData.metaByCell.get(gutterCell);

    return (
      <div
        className={clsx(gridStyles.cell, styles.trailingGutterCell)}
        aria-hidden="true"
      >
        {meta === undefined ? null : (
          <span className={clsx(styles.gutter, gutterClassName)}>
            {visibleGutterLabel(meta)}
          </span>
        )}
      </div>
    );
  };

  const renderWeekCell = (context: CalendarCellContext) => (
    <WeekGridCellContent
      allDayPositions={
        allDayPositionsByCell.get(gridCellKey(context.cell)) ?? EMPTY_LIST
      }
      cellClassName={cellClassName}
      dragPreview={dragPreview}
      gutterClassName={gutterClassName}
      context={context}
      currentInstant={currentInstant}
      gridCellKey={gridCellKey(context.cell)}
      meta={gridData.metaByCell.get(context.cell)}
      onSelect={handleEventSelect}
      readOnly={controller.interactionMode === "read-only"}
      recurringEventsMovable={recurringEventsMovable}
      resizable={controller.interactionMode === "paint-and-move"}
      resize={resize}
      renderCell={renderCell}
      renderConflict={renderConflict}
      renderEvent={renderEvent}
      renderEventMetadata={renderEventMetadata}
      getEventFrameProps={getEventFrameProps}
      overflow={overflowByCell.get(gridCellKey(context.cell))}
      onOverflowSelect={onOverflowSelect}
      paintColorFamily={paintColorFamily}
      paintInvalid={paintTouchesUnavailable}
      paintPreview={paintPreviewByCellKey.get(gridCellKey(context.cell))}
      renderOverflow={renderOverflow}
      renderUnavailable={renderUnavailable}
      renderTimeRange={renderTimeRange}
      dropTargetKeys={dropTargetKeys}
      selectedEventId={controller.selectedEventId}
      selectedPaintKeys={selectedPaintKeys}
      timeRangePositions={
        timeRangePositionsByCell.get(gridCellKey(context.cell)) ?? EMPTY_LIST
      }
      timedPositions={
        timedPositionsByCell.get(gridCellKey(context.cell)) ?? EMPTY_LIST
      }
      unavailableCellKeys={unavailableCellKeys}
    />
  );

  const renderTimedRows = (timedRows: readonly ReactNode[]) => (
    <WeekGridInteractionLayer
      currentInstant={currentInstant}
      nowLineStyle={nowLineStyle}
      nowPosition={nowPosition}
      onClick={handleClick}
      onDragEnd={handleDragEnd}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      onDrop={handleDrop}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerEnter={updatePaintFromTarget}
      onPointerLeave={handlePointerLeave}
      onPointerMove={updatePaintFromTarget}
      onPointerUp={handlePointerUp}
      ref={scrollRef}
      timedRows={timedRows}
    />
  );

  return (
    <div className={styles.container} style={rootStyle}>
      <WeekCalendarGrid
        columns={gridData.columns}
        headerColumns={headerColumns}
        rows={gridData.rows}
        className={rootClassName}
        onFrameRef={frameRef}
        defaultActiveCellKey={firstTimedCellKey}
        getCellKey={gridCellKey}
        getCellFlags={getCellFlags}
        getCellLabel={getCellLabel}
        onActiveCellChange={handleGridActiveCellChange}
        isCellNavigable={isCellNavigable}
        onCellKeyDown={handleCellKeyDown}
        renderCell={renderWeekCell}
        renderDayHeader={renderHeader}
        renderTimedRows={renderTimedRows}
        renderTrailingCell={trailingGutter ? renderTrailingCell : undefined}
        columnHeaderClassName={columnHeaderClassName}
        gutterClassName={gutterClassName}
      />
      {nowPosition !== null && (
        <WeekGridNowStatus currentInstant={currentInstant} />
      )}
      <WeekGridLiveRegion text={liveRegionText} />
      <WeekGridDetail
        event={detailVisible ? selectedEvent : undefined}
        onClose={closeDetail}
        renderDetail={renderDetail}
      />
      <AlertDialog open={paintRefused} onOpenChange={setPaintRefused}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("calendar.week.unavailableTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("calendar.week.unavailableMessage")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("calendar.week.unavailableContinue")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
  // @cpt-end:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-render
};

export const WeekGrid = <Payload = unknown,>(props: WeekGridProps<Payload>) => (
  <CalendarScope {...props}>
    <WeekGridContent<Payload> {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

WeekGrid.displayName = "WeekGrid";
