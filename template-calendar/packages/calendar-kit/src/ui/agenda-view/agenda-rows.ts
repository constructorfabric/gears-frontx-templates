import { isEventActionable } from "../../core/actionability";
import { sortCopy } from "../../core/array";
import {
  segmentAllDayEventAcrossViewerDates,
  segmentEventsAcrossViewerDates,
} from "../../core/grid";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarEventRenderContext,
  CalendarEventSegment,
  IanaTimeZone,
  UtcInstant,
  ViewerDaySegmentKind,
} from "../../core/model";
import {
  AGENDA_WINDOW_DAYS,
  addCalendarDays,
  buildDayWindow,
  compareUtcInstants,
  fromViewerDateTime,
  toViewerDateTime,
} from "../../core/temporal";

type TimedCalendarEvent = Extract<CalendarEvent, { readonly allDay: false }>;

type AllDayCalendarEvent = Extract<CalendarEvent, { readonly allDay: true }>;

export interface AgendaWindowRange {
  readonly start: CalendarDate;
  readonly endExclusive: CalendarDate;
}

interface AgendaAllDayRow {
  readonly kind: "allday";
  readonly key: string;
  readonly event: AllDayCalendarEvent;
  readonly date: CalendarDate;
  readonly start: null;
  readonly end: null;
  readonly segment: ViewerDaySegmentKind | null;
  readonly focusIndex: number;
  readonly past: boolean;
  readonly now: boolean;
}

interface AgendaTimedRow {
  readonly kind: "timed";
  readonly key: string;
  readonly event: TimedCalendarEvent;
  readonly date: CalendarDate;
  readonly start: UtcInstant;
  readonly end: UtcInstant;
  readonly segment: ViewerDaySegmentKind | null;
  readonly focusIndex: number;
  readonly past: boolean;
  readonly now: boolean;
}

export type AgendaEventRow = AgendaAllDayRow | AgendaTimedRow;

export interface AgendaDayGroup {
  readonly date: CalendarDate;
  /** The day's rows in start order; all-day rows come first. Empty on a day without events. */
  readonly rows: readonly AgendaEventRow[];
  /** Where the now line sits among `rows`; `rows.length` when every row has started. Null off today and on an empty day. */
  readonly nowIndex: number | null;
}

interface AgendaModel {
  readonly windowRange: AgendaWindowRange;
  readonly dayGroups: readonly AgendaDayGroup[];
  readonly eventRows: readonly AgendaEventRow[];
  readonly hasEvents: boolean;
}

interface BuildAgendaModelInput {
  readonly date: CalendarDate;
  readonly timeZone: IanaTimeZone;
  readonly events: readonly CalendarEvent[];
  readonly now: UtcInstant;
}

interface AgendaRowFlags {
  readonly past: boolean;
  readonly now: boolean;
}

type RawAgendaRow =
  | {
      readonly kind: "timed";
      readonly event: TimedCalendarEvent;
      readonly date: CalendarDate;
      readonly start: UtcInstant;
      readonly end: UtcInstant;
      readonly segment: ViewerDaySegmentKind | null;
      readonly sortStart: UtcInstant;
    }
  | {
      readonly kind: "allday";
      readonly event: AllDayCalendarEvent;
      readonly date: CalendarDate;
      readonly start: null;
      readonly end: null;
      readonly segment: ViewerDaySegmentKind | null;
      readonly sortStart: UtcInstant;
    };

const compareRawRows = (left: RawAgendaRow, right: RawAgendaRow): number => {
  if (left.date !== right.date) {
    return left.date < right.date ? -1 : 1;
  }

  const byStart = compareUtcInstants(left.sortStart, right.sortStart);

  if (byStart !== 0) {
    return byStart;
  }

  // An all-day row starts at the day's midnight, so it ties with a timed row starting then.
  if (left.kind !== right.kind) {
    return left.kind === "allday" ? -1 : 1;
  }

  return 0;
};

const resolveRowFlags = (
  row: RawAgendaRow,
  now: UtcInstant,
  todayDate: CalendarDate
): AgendaRowFlags => {
  if (row.kind === "timed") {
    const past = compareUtcInstants(row.end, now) <= 0;
    const inProgress = !past && compareUtcInstants(row.start, now) <= 0;
    return { now: inProgress, past };
  }

  // All-day rows never carry a live now state.
  return { now: false, past: row.date < todayDate };
};

const toEventRow = (
  row: RawAgendaRow,
  focusIndex: number,
  now: UtcInstant,
  todayDate: CalendarDate
): AgendaEventRow => {
  const key = `${row.event.id}:${row.date}:${row.segment ?? "single"}`;
  const flags = resolveRowFlags(row, now, todayDate);
  if (row.kind === "allday") {
    return {
      date: row.date,
      end: null,
      event: row.event,
      focusIndex,
      key,
      kind: "allday",
      segment: row.segment,
      start: null,
      ...flags,
    };
  }

  return {
    date: row.date,
    end: row.end,
    event: row.event,
    focusIndex,
    key,
    kind: "timed",
    segment: row.segment,
    start: row.start,
    ...flags,
  };
};

const toCalendarEventSegment = (row: AgendaEventRow): CalendarEventSegment => {
  if (row.kind === "timed") {
    return {
      date: row.date,
      end: row.end,
      event: row.event,
      segment: row.segment,
      start: row.start,
    };
  }

  const start = fromViewerDateTime({
    date: row.date,
    time: "00:00",
    timeZone: row.event.timeZone,
  });

  const end = fromViewerDateTime({
    date: addCalendarDays(row.date, 1),
    time: "00:00",
    timeZone: row.event.timeZone,
  });

  return { date: row.date, end, event: row.event, segment: row.segment, start };
};

const buildWindowDates = (start: CalendarDate): CalendarDate[] => {
  const dates: CalendarDate[] = [];

  for (let offset = 0; offset < AGENDA_WINDOW_DAYS; offset += 1) {
    dates.push(addCalendarDays(start, offset));
  }

  return dates;
};

const findNowIndex = (rows: readonly AgendaEventRow[], now: UtcInstant): number => {
  const nextStart = rows.findIndex(
    (row) => row.kind === "timed" && compareUtcInstants(row.start, now) > 0
  );

  return nextStart === -1 ? rows.length : nextStart;
};

const collectRawRows = (
  events: readonly CalendarEvent[],
  windowDates: readonly CalendarDate[],
  timeZone: IanaTimeZone
): RawAgendaRow[] => {
  const rawRows: RawAgendaRow[] = [];

  for (const event of events) {
    if (event.allDay) {
      if (event.endDate <= event.startDate) {
        throw new RangeError(
          `All-day event must end after it starts: ${event.id}`
        );
      }

      for (const segment of segmentAllDayEventAcrossViewerDates(
        event,
        windowDates,
        timeZone
      )) {
        rawRows.push({
          date: segment.date,
          end: null,
          event: segment.event.source,
          kind: "allday",
          segment: segment.segment,
          sortStart: segment.start,
          start: null,
        });
      }

      continue;
    }

    if (compareUtcInstants(event.start, event.end) >= 0) {
      throw new RangeError(`Timed event must end after it starts: ${event.id}`);
    }

    for (const segment of segmentEventsAcrossViewerDates(
      [event],
      windowDates,
      timeZone
    )) {
      rawRows.push({
        date: segment.date,
        end: segment.end,
        event: segment.event,
        kind: "timed",
        segment: segment.segment,
        sortStart: segment.start,
        start: segment.start,
      });
    }
  }

  return rawRows;
};

const buildDayGroups = (
  windowDates: readonly CalendarDate[],
  eventRows: readonly AgendaEventRow[],
  now: UtcInstant,
  todayDate: CalendarDate
): AgendaDayGroup[] =>
  windowDates.map((windowDate) => {
    const rows = eventRows.filter((row) => row.date === windowDate);

    return {
      date: windowDate,
      nowIndex:
        windowDate === todayDate && rows.length > 0
          ? findNowIndex(rows, now)
          : null,
      rows,
    };
  });

export const buildAgendaModel = (input: BuildAgendaModelInput): AgendaModel => {
  const { date, timeZone, events, now } = input;
  const windowRange = buildDayWindow(date, AGENDA_WINDOW_DAYS, timeZone);
  const windowDates = buildWindowDates(windowRange.start);
  const todayDate = toViewerDateTime(now, timeZone).date;
  const rawRows = collectRawRows(events, windowDates, timeZone);
  const sortedRawRows = sortCopy(rawRows, compareRawRows);

  const eventRows = sortedRawRows.map((row, index) =>
    toEventRow(row, index, now, todayDate)
  );

  const dayGroups = buildDayGroups(windowDates, eventRows, now, todayDate);

  return {
    dayGroups,
    eventRows,
    hasEvents: eventRows.length > 0,
    windowRange,
  };
};

export const isRowAvailable = (row: AgendaEventRow): boolean =>
  isEventActionable(row.event);

export const buildAgendaRenderContext = (
  row: AgendaEventRow,
  isSelected: boolean
): CalendarEventRenderContext => ({
  conflicts: row.event.conflicts ?? [],
  event: row.event,
  isAvailable: isRowAvailable(row),
  isPast: row.past,
  isReadOnly: false,
  isSelected,
  segment: toCalendarEventSegment(row),
});
