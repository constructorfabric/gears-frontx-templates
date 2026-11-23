import { arrayAt } from "../../core/array";
import { formatCalendarList } from "../../core/format";
import { dateTimeFormatter } from "../../core/intl-cache";
import type { CalendarDate, IanaTimeZone, UtcInstant } from "../../core/model";
import { addCalendarDays, fromViewerDateTime } from "../../core/temporal";
import { parseIanaTimeZone, utcInstant } from "../../core/validation";
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import type { AgendaAnnouncement } from "../../react/controllers/use-agenda-view-controller";
import type {
  AgendaDayGroup,
  AgendaEventRow,
  AgendaWindowRange,
} from "./agenda-rows";

export {
  formatDuration,
  formatGridTime as formatAgendaTime,
  formatRelativeHint,
} from "../../core/format";

export const getRelativeDayLabel = (
  date: CalendarDate,
  todayDate: CalendarDate,
  t: CalendarTranslate
): string | null => {
  if (date === todayDate) {
    return t("calendar.agenda.today");
  }

  if (date === addCalendarDays(todayDate, 1)) {
    return t("calendar.agenda.tomorrow");
  }

  return null;
};

const AGENDA_DATE_PARTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  weekday: "short",
};

const findPart = (
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string => parts.find((part) => part.type === type)?.value ?? "";

export const formatAgendaDate = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string
): string => {
  const validInstant = utcInstant(instant);
  const validTimeZone = parseIanaTimeZone(timeZone);
  const parts = dateTimeFormatter(locale, {
    ...AGENDA_DATE_PARTS,
    timeZone: validTimeZone,
  }).formatToParts(new Date(validInstant));

  const weekday = findPart(parts, "weekday");
  const month = findPart(parts, "month").slice(0, 3);
  const day = findPart(parts, "day");
  return `${weekday}, ${month} ${day}`;
};

const formatAgendaDay = (
  date: CalendarDate,
  timeZone: IanaTimeZone,
  locale: string
): string =>
  formatAgendaDate(
    fromViewerDateTime({ date, time: "00:00", timeZone }),
    timeZone,
    locale
  );

export const formatAgendaEventCount = (
  count: number,
  t: CalendarTranslate
): string => t("calendar.agenda.eventCount", { count });

export const buildLiveAnnouncement = (
  announcement: AgendaAnnouncement | null,
  windowRange: AgendaWindowRange,
  dayGroups: readonly AgendaDayGroup[],
  eventRows: readonly AgendaEventRow[],
  locale: string,
  timeZone: IanaTimeZone,
  t: CalendarTranslate
): string => {
  const firstLabel = formatAgendaDay(windowRange.start, timeZone, locale);
  const lastLabel = formatAgendaDay(
    addCalendarDays(windowRange.endExclusive, -1),
    timeZone,
    locale
  );

  const counts = dayGroups
    .filter((group) => group.rows.length > 0)
    .map((group) =>
      formatCalendarList(locale, [
        formatAgendaDay(group.date, timeZone, locale),
        formatAgendaEventCount(group.rows.length, t),
      ])
    );

  const parts = [`${firstLabel} – ${lastLabel}`, ...counts];

  if (announcement?.kind === "focus") {
    const focusedRow = arrayAt(eventRows, announcement.rowIndex);

    if (focusedRow !== undefined) {
      parts.push(`${focusedRow.event.title} ${t("calendar.agenda.focus")}`);
    }
  }

  return formatCalendarList(locale, parts);
};
