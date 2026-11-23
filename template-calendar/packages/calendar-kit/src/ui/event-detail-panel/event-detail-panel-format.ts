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
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import type { EventDetailPanelCopyStatus } from "../../react/public";
import {
  formatRepeatHint,
  parseRule,
} from "../create-event/create-event-format";

// The responses in the design's order; a zero count says nothing, so it is left out.
const RSVP_LABEL_KEYS = [
  ["yes", "calendar.detail.rsvp.yes"],
  ["no", "calendar.detail.rsvp.no"],
  ["awaiting", "calendar.detail.rsvp.awaiting"],
  ["maybe", "calendar.detail.rsvp.maybe"],
] as const;

/** Invited guests: the host's RSVP total when it has one, otherwise the attendee list. */
export const guestCount = (event: CalendarEvent): number =>
  event.rsvp?.invited ?? event.attendees?.length ?? 0;

const rsvpResponseParts = (
  event: CalendarEvent,
  t: CalendarTranslate
): readonly string[] =>
  RSVP_LABEL_KEYS.map(([response, labelKey]) => ({
    count: event.rsvp?.[response] ?? 0,
    labelKey,
  }))
    .filter(({ count }) => count > 0)
    .map(({ count, labelKey }) => t(labelKey, { count }));

/** The participants line as one part per count: "7 invited", "4 yes", "1 no". */
export const attendanceSummaryParts = (
  event: CalendarEvent,
  t: CalendarTranslate
): readonly string[] => [
  t("calendar.detail.invited", { count: guestCount(event) }),
  ...rsvpResponseParts(event, t),
];

/** "7 invited · 4 yes · 1 no", the participants line as text. */
export const formatAttendanceSummary = (
  event: CalendarEvent,
  t: CalendarTranslate
): string => attendanceSummaryParts(event, t).join(" · ");

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

// The rule parts the create form's summary reads. WKST only names the week's first day, which
// the words never mention; saved rules carry it.
const DESCRIBED_REPEAT_KEYS: ReadonlySet<string> = new Set([
  "BYDAY",
  "COUNT",
  "FREQ",
  "INTERVAL",
  "UNTIL",
  "WKST",
]);
const DESCRIBED_FREQUENCIES: ReadonlySet<string> = new Set([
  "DAILY",
  "MONTHLY",
  "WEEKLY",
  "YEARLY",
]);
const POSITIVE_INTEGER = /^[1-9]\d*$/u;

const describesRule = (rule: string): boolean =>
  rule.split(";").every((part) => {
    const [key = "", value = ""] = part.split("=");

    if (key === "FREQ") {
      return DESCRIBED_FREQUENCIES.has(value);
    }
    if (key === "COUNT") {
      return POSITIVE_INTEGER.test(value);
    }
    return DESCRIBED_REPEAT_KEYS.has(key);
  });

/** "Repeats every week on Monday, 12 times", as the create form says it. A rule with parts the
 * summary does not read (BYMONTHDAY, ...) goes to the translation as raw text rather than lose them. */
export const formatRecurrenceSummary = (
  event: CalendarEvent,
  t: CalendarTranslate,
  locale: string
): string | undefined => {
  const rule = (event.recurrenceRule ?? "").trim();
  if (rule === "") {
    return undefined;
  }
  const hostSummary = (event.recurrenceSummary ?? "").trim();
  if (hostSummary !== "") {
    return hostSummary;
  }
  if (!describesRule(rule)) {
    return t("calendar.detail.recurrence", { rule });
  }
  const frequency = formatRepeatHint(rule, event.startDate, t, locale);
  const count = parseRule(rule).get("COUNT");
  if (frequency === undefined || count === undefined) {
    return frequency;
  }
  return t("calendar.detail.repeatCount", { count: Number(count), frequency });
};

const formatViewerDay = (
  date: CalendarDate,
  timeZone: IanaTimeZone,
  locale: string
): string => {
  const dayStart = fromViewerDateTime({ date, time: "00:00", timeZone });
  return formatViewerDate(dayStart, timeZone, locale);
};

const SHORT_24H_TIME = { hour12: false, timeStyle: "short" } as const;

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

  // Date and times come from the same instants in one zone; mixing the viewer's date with the
  // event's own wall-clock times shows a range on the wrong day.
  const date = formatViewerDate(event.start, timeZone, locale);
  const startTime = formatViewerTime(event.start, timeZone, locale, SHORT_24H_TIME);
  if (event.endTime === null) {
    return `${date}, ${startTime}`;
  }
  return `${date}, ${startTime} – ${formatViewerTime(event.end, timeZone, locale, SHORT_24H_TIME)}`;
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
