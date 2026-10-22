import {
  formatViewerDate,
  formatViewerTime,
  formatViewerTimeZoneOffset,
} from "../../core/format";
import type {
  CalendarDate,
  CalendarEvent,
  IanaTimeZone,
} from "../../core/model";
import { addCalendarDays, fromViewerDateTime } from "../../core/temporal";
import { formatTimeOfDay } from "../../core/time-input";
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import type { EventDetailPanelCopyStatus } from "../../react/public";

// The responses in reading order; a zero count says nothing, so it is left out.
const RSVP_LABEL_KEYS = [
  ["yes", "calendar.detail.rsvp.yes"],
  ["no", "calendar.detail.rsvp.no"],
  ["maybe", "calendar.detail.rsvp.maybe"],
  ["awaiting", "calendar.detail.rsvp.awaiting"],
] as const;

/** Invited guests: the host's RSVP total when it has one, otherwise the attendee list. */
export const guestCount = (event: CalendarEvent): number =>
  event.rsvp?.invited ?? event.attendees?.length ?? 0;

export const formatRsvpResponses = (
  event: CalendarEvent,
  t: CalendarTranslate
): string =>
  RSVP_LABEL_KEYS.map(([response, labelKey]) => ({
    count: event.rsvp?.[response] ?? 0,
    labelKey,
  }))
    .filter(({ count }) => count > 0)
    .map(({ count, labelKey }) => t(labelKey, { count }))
    .join(", ");

// The copy button names the result for a moment, as calendar apps do; the status region says it.
export const COPY_STATUS_KEYS = {
  idle: "calendar.detail.copy.link",
  copied: "calendar.detail.copy.copied",
  error: "calendar.detail.copy.failed",
} as const;

export const resolveCopyAnnouncement = (
  copyStatus: EventDetailPanelCopyStatus,
  t: CalendarTranslate
): string => (copyStatus === "idle" ? "" : t(COPY_STATUS_KEYS[copyStatus]));

export const formatRecurrenceSummary = (
  event: CalendarEvent,
  t: CalendarTranslate
): string | undefined => {
  const rule = event.recurrenceRule ?? "";

  if (rule === "" || rule.trim() === "") {
    return undefined;
  }
  return t("calendar.detail.recurrence", { rule });
};

const formatViewerDay = (
  date: CalendarDate,
  timeZone: IanaTimeZone,
  locale: string
): string => {
  const dayStart = fromViewerDateTime({ date, time: "00:00", timeZone });

  return formatViewerDate(dayStart, timeZone, locale);
};

export const formatEventRange = (
  event: CalendarEvent,
  timeZone: IanaTimeZone,
  locale: string
): string => {
  if (event.allDay) {
    const lastDay = addCalendarDays(event.endDate, -1);
    const firstLabel = formatViewerDay(event.startDate, timeZone, locale);

    return event.startDate === lastDay
      ? firstLabel
      : `${firstLabel} – ${formatViewerDay(lastDay, timeZone, locale)}`;
  }

  const date = formatViewerDate(event.start, timeZone, locale);
  const startTime = formatTimeOfDay(event.startTime, locale);

  if (event.endTime === null) {
    return `${date}, ${startTime}`;
  }
  return `${date}, ${startTime} – ${formatTimeOfDay(event.endTime, locale)}`;
};

export const formatComparisonLine = (
  event: CalendarEvent,
  comparisonTimeZone: IanaTimeZone,
  locale: string
): string => {
  if (event.allDay) {
    const dayStart = fromViewerDateTime({
      date: event.startDate,
      time: "00:00",
      timeZone: comparisonTimeZone,
    });

    return `${formatViewerDate(dayStart, comparisonTimeZone, locale)} (${comparisonTimeZone})`;
  }

  const start = formatViewerTime(event.start, comparisonTimeZone, locale);

  const end =
    event.endTime === null
      ? start
      : `${start} – ${formatViewerTime(event.end, comparisonTimeZone, locale)}`;

  return `${end} (${comparisonTimeZone})`;
};

const SHORT_24H_TIME = { hour12: false, timeStyle: "short" } as const;

/** "GMT+3 Sofia, 10:00 - 11:00": one line of the detail's Time zone section. */
export const formatZoneLine = (
  event: Extract<CalendarEvent, { readonly allDay: false }>,
  timeZone: IanaTimeZone,
  locale: string
): string => {
  const offset = formatViewerTimeZoneOffset(event.start, timeZone, locale);
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
  const start = formatViewerTime(event.start, timeZone, locale, SHORT_24H_TIME);
  const end = formatViewerTime(event.end, timeZone, locale, SHORT_24H_TIME);

  return `${offset} ${city}, ${start} - ${end}`;
};
