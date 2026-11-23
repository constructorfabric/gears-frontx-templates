"use client";

import { clsx } from "clsx";
import { ClockIcon } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

import { isEventActionable, isEventMovable } from "../../core/actionability";
import { arrayAt } from "../../core/array";
import { rangesOverlap } from "../../core/event-overlap";
import { movedTimedEvent } from "../../core/interactions";
import { buildPaintPreviewBlocks } from "../../core/paint-preview";
import {
  formatGridTime,
  formatViewerDate,
  formatViewerDayNumber,
  formatViewerTimeZoneOffset,
  formatViewerWeekdayShort,
} from "../../core/format";
import type {
  CalendarCell,
  CalendarCellContext,
  CalendarColorFamily,
  CalendarSelectionRange,
  CalendarSlotMinutes,
  CalendarTimeWindow,
  CalendarEvent,
  CalendarEventGeometry,
  CalendarEventRenderContext,
  CalendarDate,
  CalendarEventSegment,
  CalendarMoveRequest,
  CalendarResizeRequest,
  IanaTimeZone,
  UtcInstant,
  WeekGridInteractionMode,
} from "../../core/model";
import { compareUtcInstants, toViewerDateTime } from "../../core/temporal";
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
import { useDayGridController } from "../../react/controllers/use-day-grid-controller";
import type { DayGridOverflowTile } from "../../react/controllers/use-day-grid-controller";
import { useEventResize } from "../../react/hooks/use-event-resize";
import { useTouchMove } from "../../react/hooks/use-touch-move";
import type {
  CalendarConflictRenderer,
  CalendarEventRenderer,
  CalendarQuickCreatePayload,
} from "../../react/slots";
import { EventCard } from "../event-card/event-card";
import { CalendarGrid } from "../grid/calendar-grid";
import type { CalendarGridProps } from "../grid/calendar-grid";
import { nowCoversHourLabel } from "../grid/now-label";
import { Button } from "../primitives/button/button";
import { transparentPixel } from "../week-grid/use-week-grid-content";
import { buildEventAnnouncement } from "./day-grid-format";

import styles from "./day-grid.module.css";

interface DayGridBaseProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** The day to show. */
  readonly date: CalendarDate;
  /** Events to lay out. Only the ones overlapping `date` are drawn. */
  readonly events: readonly CalendarEvent[];
  /** Reference instant for the now line and past styling. Default: the wall clock. */
  readonly now?: UtcInstant;
  /** Visible part of the day, on slot boundaries. Default: the whole day. */
  readonly visibleHours?: CalendarTimeWindow;
  /** Length of one row. Default `60`. */
  readonly slotMinutes?: CalendarSlotMinutes;
  /** Working hours; cells outside them are hatched. Also where the grid first scrolls to. Default 08:00–18:00. */
  readonly workingHours?: CalendarTimeWindow;
  /** Repeat the hour labels on the trailing edge, hidden from assistive technology. */
  readonly trailingGutter?: boolean;
  /** Class added to every time cell. */
  readonly cellClassName?: string;
  /** Class added to the day header. */
  readonly columnHeaderClassName?: string;
  /** Class added to every gutter label. */
  readonly gutterClassName?: string;
  /** Controlled mode. `quick-create` opens a form on an empty cell, `paint-and-move` paints a range and moves events, `read-only` disables both. Default `quick-create`. */
  readonly interactionMode?: WeekGridInteractionMode;
  /** Initial mode when uncontrolled. */
  readonly defaultInteractionMode?: WeekGridInteractionMode;
  /** Called when the grid asks to change mode. */
  readonly onInteractionModeChange?: (mode: WeekGridInteractionMode) => void;
  /** Colour family of a painted range. Unset, the range uses the plain selection style. */
  readonly paintColorFamily?: CalendarColorFamily;
  /** Controlled selected event. */
  readonly selectedEventId?: string | null;
  /** Initial selected event when uncontrolled. */
  readonly defaultSelectedEventId?: string | null;
  /** Called when an event is selected or deselected. */
  readonly onSelectedEventIdChange?: (eventId: string | null) => void;
  /** Replaces the default `EventCard`. */
  readonly renderEvent?: CalendarEventRenderer;
  /** Replaces how each conflict renders inside the default card. */
  readonly renderConflict?: CalendarConflictRenderer;
  /** Replaces the content of each empty time cell. */
  readonly renderCell?: CalendarGridProps["renderCell"];
  /** An available event was activated. `anchor` is the card element. */
  readonly onEventSelect?: (
    event: CalendarEvent,
    context: CalendarEventRenderContext,
    anchor?: HTMLElement,
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
}

/**
 * The cap and the tile handler come as a pair. A cap without a handler would hide cards the
 * user cannot reach.
 */
type DayGridOverflowProps =
  | {
      readonly maxEventsPerSlot?: undefined;
      readonly onOverflowSelect?: undefined;
    }
  | {
      /** Most cards that start in one row of the day. Later ones hide behind a `+N` lane tile. */
      readonly maxEventsPerSlot: number;
      /** The `+N` tile was activated. `anchor` is the tile, for a popover. */
      readonly onOverflowSelect: (
        cell: CalendarCell,
        anchor: HTMLElement,
      ) => void;
    };

export type DayGridProps = DayGridBaseProps & DayGridOverflowProps;

interface DayGridStyles extends CSSProperties {
  readonly "--day-grid-slot-count"?: number;
}

const DEFAULT_MODE = "quick-create" as const;

type DayGridContentProps = Omit<DayGridProps, keyof CalendarContextProps>;

type DayGridControllerResult = ReturnType<typeof useDayGridController>;

type DayGridTimedEvent = DayGridControllerResult["timedEvents"][number];

type DayGridEventSelectHandler = (
  event: CalendarEvent,
  context: CalendarEventRenderContext,
  anchor: HTMLElement,
) => void;

interface DayGridEventConfig {
  readonly locale: string;
  readonly handleSelect: DayGridEventSelectHandler;
  readonly readOnly: boolean;
  readonly renderConflict?: CalendarConflictRenderer;
  readonly renderEvent?: CalendarEventRenderer;
  readonly renderTime?: (context: CalendarEventRenderContext) => ReactNode;
  readonly t: CalendarTranslate;
  readonly timeZone: IanaTimeZone;
}

const createSlotCell = (
  slotStarts: readonly UtcInstant[],
  index: number,
  date: CalendarCell["date"],
  timeZone: IanaTimeZone,
  dayEnd: UtcInstant,
): CalendarCell => {
  const start = arrayAt(slotStarts, index);
  const end = arrayAt(slotStarts, index + 1) ?? dayEnd;

  if (start === undefined) {
    throw new Error(`Missing slot cell at index ${index}`);
  }

  return {
    date,
    end,
    endTime: toViewerDateTime(end, timeZone).time,
    start,
    startTime: toViewerDateTime(start, timeZone).time,
  };
};

const isHourStart = (instant: UtcInstant, timeZone: IanaTimeZone): boolean =>
  toViewerDateTime(instant, timeZone).time.endsWith(":00");

const cellKey = (cell: CalendarCell): string => `${cell.date}:${cell.start}`;

const buildCellLabel = (
  cell: CalendarCell,
  workingHour: boolean,
  timeZone: IanaTimeZone,
  locale: string,
  t: CalendarTranslate,
): string =>
  `${formatGridTime(cell.start, timeZone, locale)} ${t(workingHour ? "calendar.day.workingHour" : "calendar.day.nonWorkingHour")}`;

const buildEventTime = (
  context: CalendarEventRenderContext,
  timeZone: IanaTimeZone,
  locale: string,
  t: CalendarTranslate,
): string => {
  if (context.event.allDay) {
    return t("calendar.eventCard.allDay");
  }
  return `${formatGridTime(context.segment.start, timeZone, locale)} – ${formatGridTime(context.segment.end, timeZone, locale)}`;
};

const buildUnavailableCellKeys = (
  cells: readonly CalendarCell[],
  placements: readonly DayGridTimedEvent[],
): ReadonlySet<string> => {
  const unavailable = new Set<string>();

  for (const placement of placements) {
    if (isEventActionable(placement.segment.event)) {
      continue;
    }

    const placementRange = {
      end: placement.segment.end,
      start: placement.segment.start,
    };

    for (const cell of cells) {
      if (rangesOverlap(placementRange, { end: cell.end, start: cell.start })) {
        unavailable.add(cellKey(cell));
      }
    }
  }

  return unavailable;
};

const DAY_GRID_SLOT_HEIGHT = 43;

const eventIdAtTarget = (target: EventTarget | null): string | null => {
  if (!(target instanceof Element)) {
    return null;
  }

  return (
    target.closest<HTMLElement>("[data-event-id]")?.dataset.eventId ?? null
  );
};

const dayEventGeometry = (
  geometry: {
    readonly left: number;
    readonly width: number;
    readonly zIndex: number;
  },
  topPercent: number,
  heightPercent: number,
  slotCount: number,
): CalendarEventGeometry => {
  const dayBlockSize = slotCount * DAY_GRID_SLOT_HEIGHT;

  return {
    height: Math.round((heightPercent / 100) * dayBlockSize),
    inlineSize: geometry.width,
    insetInlineStart: geometry.left,
    top: Math.round((topPercent / 100) * dayBlockSize),
    zIndex: geometry.zIndex,
  };
};

const timedEventStyle = (
  geometry: {
    readonly left: number;
    readonly width: number;
    readonly zIndex: number;
  },
  topPercent: number,
  heightPercent: number,
): CSSProperties => ({
  blockSize: `${heightPercent}%`,
  inlineSize: `calc(${geometry.width}% - var(--calendar-event-inset))`,
  insetBlockStart: `${topPercent}%`,
  insetInlineStart: `${geometry.left}%`,
  zIndex: geometry.zIndex,
});

const buildSharedRenderTime = (
  config: DayGridEventConfig,
): ((context: CalendarEventRenderContext) => ReactNode) =>
  config.renderEvent === undefined
    ? (context) => (
        <span className={clsx(styles.eventTime, "eventTime")}>
          {buildEventTime(context, config.timeZone, config.locale, config.t)}
        </span>
      )
    : () => null;

const renderDayGridEventCard = ({
  config,
  event,
  geometry,
  past,
  positioned,
  segment,
  selected,
}: {
  readonly config: DayGridEventConfig;
  readonly event: CalendarEvent;
  readonly geometry?: CalendarEventGeometry;
  readonly past: boolean;
  readonly positioned?: boolean;
  readonly segment: CalendarEventSegment;
  readonly selected: boolean;
}) => (
  <EventCard
    available={isEventActionable(event)}
    className={styles.dayEvent}
    event={event}
    geometry={geometry}
    onSelect={config.handleSelect}
    past={past}
    positioned={positioned}
    readOnly={config.readOnly}
    renderConflict={config.renderConflict}
    renderTime={config.renderTime}
    renderTitle={config.renderEvent}
    segment={segment}
    selected={selected}
  />
);

interface DayPaintPreview {
  readonly heightPercent: number;
  readonly label: string;
  readonly topPercent: number;
}

interface DropGhost {
  readonly event: CalendarEvent;
  readonly geometry: DayGridTimedEvent["geometry"];
  readonly heightPercent: number;
  readonly segment: CalendarEventSegment;
  readonly slotIndex: number;
}

const DayGridEventLayerImpl = ({
  config,
  currentInstant,
  currentTimeLabel,
  draggingEventId,
  dropGhost,
  movable,
  onOverflowSelect,
  recurringEventsMovable,
  overflowTiles,
  paintPreview,
  slotCount,
  nowPercent,
  onEventFocus,
  resize,
  selectedEventId,
  timedEvents,
}: {
  readonly config: DayGridEventConfig;
  readonly currentInstant: UtcInstant;
  readonly currentTimeLabel: string;
  readonly draggingEventId: string | null;
  readonly dropGhost: DropGhost | null;
  readonly movable: boolean;
  readonly recurringEventsMovable: boolean;
  readonly onOverflowSelect:
    ((slotIndex: number, anchor: HTMLElement) => void) | undefined;
  readonly overflowTiles: readonly DayGridOverflowTile[];
  readonly paintPreview: DayPaintPreview | null;
  readonly slotCount: number;
  readonly nowPercent: number | null;
  readonly onEventFocus: (segment: CalendarEventSegment) => void;
  readonly resize: ReturnType<typeof useEventResize>;
  readonly selectedEventId: string | null;
  readonly timedEvents: readonly DayGridTimedEvent[];
}) => (
  <div className={clsx(styles.eventLayer, "eventLayer")}>
    {timedEvents.map((placement) => {
      const { event } = placement.segment;
      const resizeProps =
        movable &&
        placement.segment.segment === null &&
        isEventActionable(event) &&
        isEventMovable(event, recurringEventsMovable)
          ? resize.handleProps(event)
          : null;
      const style = timedEventStyle(
        placement.geometry,
        placement.topPercent,
        placement.heightPercent,
      );

      return (
        <div
          className={clsx(styles.event, styles.timedEvent, "timedEvent")}
          data-dragging={draggingEventId === event.id ? "" : undefined}
          draggable={
            movable &&
            isEventActionable(event) &&
            isEventMovable(event, recurringEventsMovable)
          }
          key={`${event.id}-${placement.segment.start}`}
          onFocusCapture={() => {
            onEventFocus(placement.segment);
          }}
          onKeyDown={resizeProps?.onKeyDown}
          style={
            resize.preview?.eventId === event.id
              ? { ...style, blockSize: `${resize.preview.blockSize}px` }
              : style
          }
        >
          {renderDayGridEventCard({
            config,
            event,
            geometry: dayEventGeometry(
              placement.geometry,
              placement.topPercent,
              placement.heightPercent,
              slotCount,
            ),
            past:
              compareUtcInstants(placement.segment.end, currentInstant) <= 0,
            positioned: false,
            segment: placement.segment,
            selected: selectedEventId === event.id,
          })}
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
        </div>
      );
    })}
    {onOverflowSelect !== undefined &&
      overflowTiles.map((tile) => (
        <div
          className={clsx(styles.event, styles.timedEvent, "timedEvent")}
          key={`overflow-${tile.slotIndex}`}
          style={timedEventStyle(
            tile.geometry,
            tile.topPercent,
            tile.heightPercent,
          )}
        >
          <Button
            className={styles.overflow}
            data-day-overflow=""
            size="sm"
            type="button"
            variant="tertiary"
            onClick={(clickEvent) => {
              onOverflowSelect(tile.slotIndex, clickEvent.currentTarget);
            }}
          >
            {config.t("calendar.day.overflow", { count: tile.hiddenCount })}
          </Button>
        </div>
      ))}
    {paintPreview !== null && (
      <div
        aria-hidden="true"
        className={styles.paintPreview}
        data-paint-preview=""
        inert
        style={{
          blockSize: `${paintPreview.heightPercent}%`,
          insetBlockStart: `${paintPreview.topPercent}%`,
        }}
      >
        <span className={styles.paintPreviewBar} />
        <span className={styles.paintPreviewTime}>
          <ClockIcon aria-hidden="true" className={styles.paintPreviewIcon} />
          {paintPreview.label}
        </span>
      </div>
    )}
    {dropGhost !== null && (
      <div
        className={clsx(styles.event, styles.timedEvent, styles.dragGhost)}
        aria-hidden="true"
        data-drag-ghost=""
        inert
        style={{
          blockSize: `${dropGhost.heightPercent}%`,
          inlineSize: `calc(${dropGhost.geometry.width}% - var(--calendar-event-inset))`,
          insetBlockStart: `${(dropGhost.slotIndex / slotCount) * 100}%`,
          insetInlineStart: `${dropGhost.geometry.left}%`,
        }}
      >
        {renderDayGridEventCard({
          config,
          event: dropGhost.event,
          geometry: dayEventGeometry(
            dropGhost.geometry,
            (dropGhost.slotIndex / slotCount) * 100,
            dropGhost.heightPercent,
            slotCount,
          ),
          past: compareUtcInstants(dropGhost.segment.end, currentInstant) <= 0,
          positioned: false,
          segment: dropGhost.segment,
          selected: false,
        })}
      </div>
    )}
    {nowPercent !== null && (
      <div
        className={styles.nowLine}
        role="status"
        aria-label={`${config.t("calendar.day.currentTime")}: ${currentTimeLabel}`}
        style={{ insetBlockStart: `${nowPercent}%` }}
      >
        <span className={styles.nowLabel}>{currentTimeLabel}</span>
      </div>
    )}
  </div>
);

const DayGridEventLayer = memo(DayGridEventLayerImpl);
DayGridEventLayer.displayName = "DayGridEventLayer";

const useDayGridAnnouncements = (
  setControllerAnnouncement: (announcement: string) => void,
): {
  readonly announce: (announcement: string) => void;
  readonly liveText: string;
} => {
  const [liveText, setLiveText] = useState("");

  const announce = useCallback(
    (announcement: string): void => {
      setControllerAnnouncement(announcement);
      setLiveText(announcement);
    },
    [setControllerAnnouncement],
  );

  return { announce, liveText };
};

const useDayGridContent = (props: DayGridContentProps) => {
  const { direction, locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const {
    date,
    events,
    interactionMode,
    defaultInteractionMode = DEFAULT_MODE,
    onInteractionModeChange,
    selectedEventId,
    defaultSelectedEventId,
    onSelectedEventIdChange,
    renderEvent,
    renderConflict,
    renderCell,
    onEventSelect,
    onMoveRequest,
    onPaintSelect,
    onQuickCreate,
    onResizeRequest,
    recurringEventsMovable = false,
    maxEventsPerSlot,
    onOverflowSelect,
    now,
    slotMinutes,
    visibleHours,
    workingHours,
  } = props;

  const resolvedDirection = direction === "rtl" ? "rtl" : "ltr";

  const {
    allDaySegments,
    axisRange,
    currentInstant,
    interaction,
    overflowTiles,
    slotStarts,
    interactionMode: resolvedInteractionMode,
    isToday,
    isWorkingDay,
    nowPercent,
    selectedEventId: resolvedSelectedEventId,
    selectEmptyCell,
    selectEvent,
    setAnnouncement,
    setBodyRef,
    timedEvents,
    utcDayRange,
    workingSlots,
  } = useDayGridController({
    date,
    defaultInteractionMode,
    defaultSelectedEventId,
    events,
    interactionMode,
    now,
    onEventSelect,
    onInteractionModeChange,
    onMoveRequest,
    onPaintSelect,
    onQuickCreate,
    onSelectedEventIdChange,
    maxEventsPerSlot,
    selectedEventId,
    slotMinutes,
    timeZone,
    visibleHours,
    workingHours,
  });

  const { announce, liveText } = useDayGridAnnouncements(setAnnouncement);

  const displayedDateLabel = formatViewerDate(
    utcDayRange.start,
    timeZone,
    locale,
    { dateStyle: "full" },
  );

  const gridCells = useMemo(
    () =>
      slotStarts.map((_, index) =>
        createSlotCell(slotStarts, index, date, timeZone, axisRange.end),
      ),
    [axisRange.end, date, slotStarts, timeZone],
  );

  const handleOverflowSelect =
    onOverflowSelect === undefined
      ? undefined
      : (slotIndex: number, anchor: HTMLElement) => {
          const cell = arrayAt(gridCells, slotIndex);

          if (cell === undefined) {
            throw new RangeError(`Missing slot cell at index ${slotIndex}`);
          }

          onOverflowSelect(cell, anchor);
        };

  const cellIndexByKey = useMemo(
    () => new Map(gridCells.map((cell, index) => [cellKey(cell), index])),
    [gridCells],
  );

  const gridRows = useMemo(
    () =>
      gridCells.map((cell, index) => ({ cells: [cell], key: `hour-${index}` })),
    [gridCells],
  );

  const unavailableCellKeys = useMemo(
    () => buildUnavailableCellKeys(gridCells, timedEvents),
    [gridCells, timedEvents],
  );

  const paintKeys = useMemo(
    () => new Set((interaction.paint?.cells ?? []).map(cellKey)),
    [interaction.paint],
  );

  const paintPreview = useMemo(() => {
    const [block] = buildPaintPreviewBlocks(
      interaction.paint?.cells ?? [],
      timeZone,
      locale,
    );
    const startIndex =
      block === undefined
        ? undefined
        : cellIndexByKey.get(cellKey(block.start));

    if (block === undefined || startIndex === undefined) {
      return null;
    }

    return {
      heightPercent: (block.rowCount / slotStarts.length) * 100,
      label: block.label,
      topPercent: (startIndex / slotStarts.length) * 100,
    };
  }, [cellIndexByKey, interaction.paint, locale, slotStarts.length, timeZone]);

  const paintTouchesUnavailable = (interaction.paint?.cells ?? []).some(
    (cell) => unavailableCellKeys.has(cellKey(cell)),
  );

  // Event cards cover the cells, so the slot comes from the pointer's Y, not the event target.
  const slotAtClientY = (
    layout: HTMLElement,
    clientY: number,
  ):
    | { readonly cell: CalendarCell; readonly element: HTMLElement }
    | undefined => {
    const element = Array.from(
      layout.querySelectorAll<HTMLElement>('[role="gridcell"]'),
    ).find((candidate) => {
      const rect = candidate.getBoundingClientRect();

      return clientY >= rect.top && clientY < rect.bottom;
    });
    const key = element?.dataset.cellKey;
    const index = key === undefined ? undefined : cellIndexByKey.get(key);
    const cell = index === undefined ? undefined : arrayAt(gridCells, index);

    return element === undefined || cell === undefined
      ? undefined
      : { cell, element };
  };

  const cellAtClientY = (
    layout: HTMLElement,
    clientY: number,
  ): CalendarCell | undefined => slotAtClientY(layout, clientY)?.cell;

  const resize = useEventResize({
    cells: gridCells,
    onResizeRequest,
    targetAt: (_clientX, clientY, handle) => {
      const layout = handle.closest<HTMLElement>(".timedLayout");
      const slot = layout === null ? undefined : slotAtClientY(layout, clientY);

      if (slot === undefined) {
        return null;
      }

      const rect = slot.element.getBoundingClientRect();

      return { bottom: rect.bottom, cell: slot.cell, top: rect.top };
    },
    timeZone,
  });

  const draggedEventIdRef = useRef<string | null>(null);

  const draggedEventId = interaction.drag?.event.id ?? null;
  const draggedPlacement = timedEvents.find(
    (placement) => placement.segment.event.id === draggedEventId,
  );
  const dropEvent =
    interaction.drag === null ||
    draggedPlacement === undefined ||
    interaction.drag.event.allDay
      ? null
      : movedTimedEvent(
          interaction.drag.event,
          interaction.drag.to.start,
          timeZone,
        );
  const dropGhost: DropGhost | null =
    interaction.drag === null ||
    draggedPlacement === undefined ||
    dropEvent === null
      ? null
      : {
          event: dropEvent,
          geometry: draggedPlacement.geometry,
          heightPercent: draggedPlacement.heightPercent,
          segment: {
            date: interaction.drag.to.date,
            end: dropEvent.end,
            event: dropEvent,
            segment: null,
            start: dropEvent.start,
          },
          slotIndex: cellIndexByKey.get(cellKey(interaction.drag.to)) ?? 0,
        };

  const currentTimeLabel = formatGridTime(currentInstant, timeZone, locale);
  const defaultActiveCell = arrayAt(gridCells, 8);
  const gridLabel = `${displayedDateLabel} ${timeZone}`;

  const gridTranslate = useCallback<CalendarTranslate>(
    (key, values) => {
      if (key === "calendar.grid.label") {
        return gridLabel;
      }

      return t(key, values);
    },
    [gridLabel, t],
  );

  const readOnly = resolvedInteractionMode === "read-only";

  const handleEventCardSelect = useCallback(
    (
      event: CalendarEvent,
      context: CalendarEventRenderContext,
      anchor: HTMLElement,
    ): void => {
      selectEvent(event.id, context, anchor);
    },
    [selectEvent],
  );

  const eventConfig = useMemo<DayGridEventConfig>(() => {
    const config: DayGridEventConfig = {
      handleSelect: handleEventCardSelect,
      locale,
      readOnly,
      renderConflict,
      renderEvent,
      t,
      timeZone,
    };

    return { ...config, renderTime: buildSharedRenderTime(config) };
  }, [
    handleEventCardSelect,
    locale,
    readOnly,
    renderConflict,
    renderEvent,
    t,
    timeZone,
  ]);

  const handleActiveCellChange = (cell: CalendarCell): void => {
    const index = cellIndexByKey.get(cellKey(cell));
    if (index === undefined) {
      return;
    }

    const isWorkingHourValue = workingSlots.at(index) ?? false;
    const label = buildCellLabel(cell, isWorkingHourValue, timeZone, locale, t);

    announce(`${t("calendar.day.focus")}: ${label}`);
  };

  const handleCellKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    context: CalendarCellContext,
  ): void => {
    const index = cellIndexByKey.get(cellKey(context.cell));
    if (index === undefined) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      // The timed layout's keydown handler runs next and would activate this cell a second time.
      event.preventDefault();
      selectEmptyCell(index, event.currentTarget);
    }
  };

  const handleTimedLayoutClick = (
    event: ReactMouseEvent<HTMLDivElement>,
  ): void => {
    // A click in paint-and-move mode paints by pointer gesture, so it must not open a form.
    if (resolvedInteractionMode !== "quick-create") {
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest("[data-event-id]") !== null
    ) {
      return;
    }
    if (!(event.target instanceof Element)) {
      return;
    }

    const cellElement =
      event.target.closest<HTMLDivElement>('[role="gridcell"]');
    const key = cellElement?.dataset.cellKey;
    if (!cellElement || key === undefined) {
      return;
    }

    const index = cellIndexByKey.get(key);

    if (index !== undefined) {
      selectEmptyCell(
        index,
        cellElement,
        new DOMRect(event.clientX, event.clientY, 0, 0),
      );
    }
  };

  const handleTimedLayoutKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (
      event.defaultPrevented ||
      (event.key !== "Enter" && event.key !== " ")
    ) {
      return;
    }
    if (!(event.target instanceof Element)) {
      return;
    }

    const cellElement =
      event.target.closest<HTMLDivElement>('[role="gridcell"]');
    const key = cellElement?.dataset.cellKey;
    if (!cellElement || key === undefined) {
      return;
    }

    const index = cellIndexByKey.get(key);
    if (index === undefined) {
      return;
    }

    event.preventDefault();
    selectEmptyCell(index, cellElement);
  };

  const touchLayoutRef = useRef<HTMLElement | null>(null);

  const startTouchMove = useTouchMove({
    begin: (eventId, pressed) => {
      const placement = timedEvents.find(
        (candidate) => candidate.segment.event.id === eventId,
      );
      const from = gridCells.find(
        (cell) =>
          placement !== undefined &&
          compareUtcInstants(cell.start, placement.segment.start) <= 0 &&
          compareUtcInstants(placement.segment.start, cell.end) < 0,
      );

      if (
        resolvedInteractionMode !== "paint-and-move" ||
        placement === undefined ||
        from === undefined ||
        !isEventActionable(placement.segment.event) ||
        !isEventMovable(placement.segment.event, recurringEventsMovable) ||
        !(pressed instanceof Element)
      ) {
        return false;
      }

      touchLayoutRef.current = pressed.closest<HTMLElement>(".timedLayout");
      draggedEventIdRef.current = eventId;
      interaction.beginMove(placement.segment.event, from);

      return true;
    },
    cancel: () => {
      interaction.cancelMove();
      draggedEventIdRef.current = null;
    },
    cellAt: (_clientX, clientY) =>
      touchLayoutRef.current === null
        ? null
        : (cellAtClientY(touchLayoutRef.current, clientY) ?? null),
    end: () => {
      interaction.endMove();
      draggedEventIdRef.current = null;
    },
    update: (cell) => {
      interaction.updateMove(cell);
    },
  });

  const handleTimedLayoutPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    const pressedEventId = eventIdAtTarget(event.target);

    if (pressedEventId !== null) {
      startTouchMove(event, pressedEventId);
      return;
    }

    const cell = cellAtClientY(event.currentTarget, event.clientY);

    if (cell) {
      interaction.beginPaint(cell);
    }
  };

  const handleTimedLayoutPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    if (
      interaction.state.paintAnchor === null ||
      eventIdAtTarget(event.target) !== null
    ) {
      return;
    }

    const cell = cellAtClientY(event.currentTarget, event.clientY);

    if (cell) {
      interaction.updatePaint(cell);
    }
  };

  const handleTimedLayoutPointerUp = (): void => {
    // A paint released over unavailable time creates nothing, so it is dropped rather than emitted.
    if (paintTouchesUnavailable) {
      interaction.reset();
      return;
    }

    interaction.endPaint();
  };

  // Leaving ends a paint, so the range does not outlive the host's form over the grid.
  const handleTimedLayoutPointerLeave = (): void => {
    if (interaction.state.paintAnchor !== null || interaction.paint !== null) {
      interaction.reset();
    }
  };

  const handleTimedLayoutDragStart = (
    event: ReactDragEvent<HTMLDivElement>,
  ): void => {
    // The browser starts the drag on the draggable frame; the card that names the event sits inside it.
    const card =
      event.target instanceof Element
        ? event.target.querySelector("[data-event-id]")
        : null;
    const eventId = eventIdAtTarget(card ?? event.target);
    const placement = timedEvents.find(
      (candidate) => candidate.segment.event.id === eventId,
    );

    if (
      resolvedInteractionMode !== "paint-and-move" ||
      eventId === null ||
      placement === undefined
    ) {
      return;
    }

    const from = gridCells.find(
      (cell) =>
        compareUtcInstants(cell.start, placement.segment.start) <= 0 &&
        compareUtcInstants(placement.segment.start, cell.end) < 0,
    );

    if (from === undefined) {
      return;
    }

    // The grid's own ghost card is the drag feedback, so the browser's copy of the card is blanked.
    const blankImage = new Image();
    blankImage.src = transparentPixel;
    event.dataTransfer?.setDragImage(blankImage, 0, 0);

    draggedEventIdRef.current = eventId;
    interaction.beginMove(placement.segment.event, from);
  };

  const handleTimedLayoutDragOver = (
    event: ReactDragEvent<HTMLDivElement>,
  ): void => {
    if (draggedEventIdRef.current === null) {
      return;
    }

    event.preventDefault();
    const cell = cellAtClientY(event.currentTarget, event.clientY);

    if (cell) {
      interaction.updateMove(cell);
    }
  };

  const handleTimedLayoutDrop = (
    event: ReactDragEvent<HTMLDivElement>,
  ): void => {
    if (draggedEventIdRef.current === null) {
      return;
    }

    event.preventDefault();
    const cell = cellAtClientY(event.currentTarget, event.clientY);

    if (cell) {
      interaction.updateMove(cell);
      interaction.endMove();
    } else {
      interaction.cancelMove();
    }

    draggedEventIdRef.current = null;
  };

  const handleTimedLayoutDragEnd = (): void => {
    if (draggedEventIdRef.current !== null) {
      interaction.cancelMove();
    }

    draggedEventIdRef.current = null;
  };

  const handleEventFocus = useCallback(
    (segment: CalendarEventSegment): void => {
      const announcement = buildEventAnnouncement(segment, timeZone, locale, t);

      announce(announcement);
    },
    [announce, locale, t, timeZone],
  );

  const liveRegionLabel =
    liveText || `${t("calendar.day.range")}: ${displayedDateLabel}`;

  return {
    allDaySegments,
    cellIndexByKey,
    cellKey,
    currentInstant,
    currentTimeLabel,
    date,
    defaultActiveCell,
    displayedDateLabel,
    eventConfig,
    gridLabel,
    gridRows,
    gridTranslate,
    handleActiveCellChange,
    handleCellKeyDown,
    handleEventFocus,
    handleTimedLayoutClick,
    handleTimedLayoutDragEnd,
    handleTimedLayoutDragOver,
    handleTimedLayoutDragStart,
    handleTimedLayoutDrop,
    handleTimedLayoutKeyDown,
    handleTimedLayoutPointerDown,
    handleTimedLayoutPointerLeave,
    handleTimedLayoutPointerMove,
    handleTimedLayoutPointerUp,
    draggedEventId,
    dropGhost,
    handleOverflowSelect,
    interactionMode: resolvedInteractionMode,
    overflowTiles,
    isToday,
    isWorkingDay,
    liveRegionLabel,
    liveText,
    locale,
    nowPercent,
    paintKeys,
    paintPreview,
    readOnly,
    recurringEventsMovable,
    renderCell,
    resolvedDirection,
    resolvedSelectedEventId,
    resize,
    setBodyRef,
    slotStarts,
    t,
    timeZone,
    timedEvents,
    unavailableCellKeys,
    utcDayRange,
    workingSlots,
  };
};

const DayGridContent = (props: DayGridContentProps) => {
  const view = useDayGridContent(props);

  const {
    allDaySegments,
    cellIndexByKey,
    cellKey: getCellKey,
    currentInstant,
    currentTimeLabel,
    date,
    defaultActiveCell,
    displayedDateLabel,
    eventConfig,
    gridLabel,
    gridRows,
    gridTranslate,
    handleActiveCellChange,
    handleCellKeyDown,
    handleEventFocus,
    handleTimedLayoutClick,
    handleTimedLayoutKeyDown,
    handleTimedLayoutPointerDown,
    handleTimedLayoutPointerLeave,
    handleTimedLayoutPointerMove,
    handleTimedLayoutPointerUp,
    handleTimedLayoutDragEnd,
    handleTimedLayoutDragOver,
    handleTimedLayoutDragStart,
    handleTimedLayoutDrop,
    draggedEventId,
    dropGhost,
    handleOverflowSelect,
    interactionMode,
    overflowTiles,
    paintKeys,
    paintPreview,
    slotStarts,
    isToday,
    isWorkingDay,
    liveRegionLabel,
    liveText,
    locale,
    nowPercent,
    readOnly,
    recurringEventsMovable,
    renderCell,
    resolvedDirection,
    resolvedSelectedEventId,
    resize,
    setBodyRef,
    t,
    timedEvents,
    timeZone,
    unavailableCellKeys,
    utcDayRange,
    workingSlots,
  } = view;

  const {
    cellClassName,
    className,
    columnHeaderClassName,
    gutterClassName,
    paintColorFamily,
    trailingGutter = false,
  } = props;

  const gutterLabels = slotStarts.map((slotStart) => (
    <div className={clsx(styles.gutterHour, gutterClassName)} key={slotStart}>
      {isHourStart(slotStart, timeZone) &&
      !nowCoversHourLabel(slotStart, currentInstant)
        ? formatGridTime(slotStart, timeZone, locale)
        : null}
    </div>
  ));

  const getDayCellLabel = (cell: CalendarCell): string => {
    const index = cellIndexByKey.get(getCellKey(cell)) ?? 0;

    return buildCellLabel(
      cell,
      workingSlots[index] ?? false,
      timeZone,
      locale,
      t,
    );
  };

  const renderDayCell = (context: CalendarCellContext): ReactNode => {
    const index = cellIndexByKey.get(context.key) ?? 0;
    const unavailable = unavailableCellKeys.has(context.key);

    const cellContext: CalendarCellContext = {
      ...context,
      isReadOnly: readOnly,
      isUnavailable: unavailable,
    };

    return (
      <div
        className={clsx(
          styles.cellContent,
          (workingSlots[index] ?? false)
            ? styles.workingHour
            : styles.nonWorkingHour,
          cellClassName,
        )}
        data-paint={paintKeys.has(context.key) ? "" : undefined}
        data-color-family={
          paintKeys.has(context.key) ? paintColorFamily : undefined
        }
      >
        {renderCell?.(cellContext)}
      </div>
    );
  };

  return (
    <section
      className={clsx(
        styles.dayGrid,
        "dayGrid",
        isWorkingDay ? styles.workingDay : styles.nonWorkingDay,
        trailingGutter && styles.trailingGutter,
        className,
      )}
      dir={resolvedDirection}
      aria-label={gridLabel}
      style={{ "--day-grid-slot-count": slotStarts.length } as DayGridStyles}
    >
      <div className={styles.header}>
        <div
          className={clsx(styles.headerGutter, "headerGutter", gutterClassName)}
          title={timeZone}
        >
          {formatViewerTimeZoneOffset(utcDayRange.start, timeZone, locale)}
        </div>
        <div
          className={clsx(styles.headerDay, "headerDay", columnHeaderClassName)}
        >
          <span
            className={clsx(
              styles.weekdayLabel,
              "weekdayLabel",
              isToday && styles.today,
            )}
          >
            {formatViewerWeekdayShort(utcDayRange.start, timeZone, locale)}
          </span>
          <span
            className={clsx(
              styles.dayNumber,
              "dayNumber",
              isToday && styles.today,
            )}
          >
            {formatViewerDayNumber(utcDayRange.start, timeZone, locale)}
          </span>
        </div>
        {trailingGutter && (
          <div
            className={clsx(
              styles.headerGutter,
              styles.trailingGutterCell,
              gutterClassName,
            )}
            aria-hidden="true"
          >
            {formatViewerTimeZoneOffset(utcDayRange.start, timeZone, locale)}
          </div>
        )}
      </div>

      <div
        className={styles.allDay}
        aria-label={`${t("calendar.day.allDayEventsFor")}: ${displayedDateLabel}`}
      >
        <div className={clsx(styles.allDayGutter, gutterClassName)}>
          {t("calendar.event.allDay")}
        </div>
        <div className={styles.allDayTrack}>
          {allDaySegments.map((segment) => (
            <div
              className={clsx(styles.event, styles.allDayEvent)}
              key={`${segment.event.id}-${segment.segment}`}
              onFocusCapture={() => {
                handleEventFocus(segment);
              }}
            >
              {renderDayGridEventCard({
                config: eventConfig,
                event: segment.event,
                past: date >= segment.event.endDate,
                segment,
                selected: resolvedSelectedEventId === segment.event.id,
              })}
            </div>
          ))}
          {allDaySegments.length === 0 && (
            <span className={styles.allDayEmpty}>
              {t("calendar.day.noAllDayEvents")}
            </span>
          )}
        </div>
        {trailingGutter && (
          <div
            className={clsx(
              styles.allDayGutter,
              styles.trailingGutterCell,
              gutterClassName,
            )}
            aria-hidden="true"
          />
        )}
      </div>

      <div
        className={clsx(styles.timedLayout, "timedLayout")}
        role="presentation"
        ref={setBodyRef}
        onClick={handleTimedLayoutClick}
        onDragEnd={handleTimedLayoutDragEnd}
        onDragOver={handleTimedLayoutDragOver}
        onDragStart={handleTimedLayoutDragStart}
        onDrop={handleTimedLayoutDrop}
        onKeyDown={handleTimedLayoutKeyDown}
        onPointerCancel={handleTimedLayoutPointerLeave}
        onPointerDown={handleTimedLayoutPointerDown}
        onPointerLeave={handleTimedLayoutPointerLeave}
        onPointerMove={handleTimedLayoutPointerMove}
        onPointerUp={handleTimedLayoutPointerUp}
      >
        <div className={styles.gutter} aria-hidden="true">
          {gutterLabels}
        </div>
        <div className={clsx(styles.timedGrid, "timedGrid")}>
          <CalendarGrid
            columns={[{ key: "day", label: displayedDateLabel }]}
            rows={gridRows}
            t={gridTranslate}
            className={styles.dayCalendarGrid}
            defaultActiveCellKey={
              defaultActiveCell === undefined
                ? undefined
                : getCellKey(defaultActiveCell)
            }
            getCellKey={getCellKey}
            getCellLabel={getDayCellLabel}
            onActiveCellChange={handleActiveCellChange}
            onCellKeyDown={handleCellKeyDown}
            renderCell={renderDayCell}
          />
          <DayGridEventLayer
            config={eventConfig}
            currentInstant={currentInstant}
            currentTimeLabel={currentTimeLabel}
            draggingEventId={draggedEventId}
            dropGhost={dropGhost}
            movable={interactionMode === "paint-and-move"}
            onOverflowSelect={handleOverflowSelect}
            recurringEventsMovable={recurringEventsMovable}
            overflowTiles={overflowTiles}
            paintPreview={paintPreview}
            slotCount={slotStarts.length}
            nowPercent={nowPercent}
            onEventFocus={handleEventFocus}
            resize={resize}
            selectedEventId={resolvedSelectedEventId}
            timedEvents={timedEvents}
          />
        </div>
        {trailingGutter && (
          <div
            className={clsx(styles.gutter, styles.trailingGutterCell)}
            aria-hidden="true"
          >
            {gutterLabels}
          </div>
        )}
      </div>

      <div
        className={styles.liveRegion}
        role="status"
        aria-label={liveRegionLabel}
        aria-live="polite"
        aria-atomic="true"
      >
        {liveText}
      </div>
    </section>
  );
};

export const DayGrid = (props: DayGridProps) => (
  <CalendarScope {...props}>
    <DayGridContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

DayGrid.displayName = "DayGrid";
