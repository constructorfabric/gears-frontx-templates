import {
  calendarDate,
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
} from "@gears-frontx/calendar-kit";
import type {
  CalendarAvailabilityCell,
  CalendarColorFamily,
  CalendarEvent,
} from "@gears-frontx/calendar-kit";

export const viewerZone = parseIanaTimeZone("Europe/Istanbul");

interface TimedEventInput {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly colorFamily?: CalendarColorFamily;
  readonly location?: string;
}

// Hosts map API rows in one place, as map-host-events.ts does.
export const timedEvent = ({
  id,
  title,
  date,
  start,
  end,
  colorFamily = "turquoise",
  location,
}: TimedEventInput): CalendarEvent => {
  const day = calendarDate(date);
  const startTime = parseLocalTime(start);
  const endTime = parseLocalTime(end);

  return {
    allDay: false,
    colorFamily,
    end: fromViewerDateTime({ date: day, time: endTime, timeZone: viewerZone }),
    endDate: day,
    endTime,
    id,
    location: location ?? null,
    start: fromViewerDateTime({
      date: day,
      time: startTime,
      timeZone: viewerZone,
    }),
    startDate: day,
    startTime,
    timeZone: viewerZone,
    title,
  };
};

// One available slot per hour from `fromHour` up to, not including, `toHour`.
export const hourCells = (
  date: string,
  fromHour: number,
  toHour: number
): CalendarAvailabilityCell[] => {
  const day = calendarDate(date);

  return Array.from({ length: toHour - fromHour }, (_, index) => {
    const startTime = parseLocalTime(hhmm(fromHour + index));
    const endTime = parseLocalTime(hhmm(fromHour + index + 1));

    return {
      available: true,
      date: day,
      end: fromViewerDateTime({ date: day, time: endTime, timeZone: viewerZone }),
      endTime,
      start: fromViewerDateTime({
        date: day,
        time: startTime,
        timeZone: viewerZone,
      }),
      startTime,
    };
  });
};

const hhmm = (hour: number): string => `${String(hour).padStart(2, "0")}:00`;

export const isWeekend = (date: string): boolean => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();

  return day === 0 || day === 6;
};

// `endDate` is exclusive, as the event model requires for all-day events.
export const allDayEvent = ({
  endDate,
  id,
  startDate,
  title,
}: {
  readonly endDate: string;
  readonly id: string;
  readonly startDate: string;
  readonly title: string;
}): CalendarEvent => ({
  allDay: true,
  colorFamily: "turquoise",
  endDate: calendarDate(endDate),
  endTime: null,
  id,
  location: null,
  startDate: calendarDate(startDate),
  startTime: null,
  timeZone: viewerZone,
  title,
});
