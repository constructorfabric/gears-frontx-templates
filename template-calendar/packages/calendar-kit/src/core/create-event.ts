import type {
  AllDayCreateEventDraft,
  CreateEventDraft,
  TimedCreateEventDraft,
} from "./model";
import { minutesFromLocalTime } from "./time-input";
import { parseLocalTime } from "./validation";

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/u;
const RECURRENCE_UNTIL_PATTERN =
  /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})(?:T(?<hour>\d{2})(?<minute>\d{2})(?<second>\d{2})Z)?$/u;
const RECURRENCE_WEEKDAYS: ReadonlySet<string> = new Set([
  "SU",
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
]);
const SUPPORTED_RECURRENCE_KEYS: ReadonlySet<string> = new Set([
  "FREQ",
  "INTERVAL",
  "COUNT",
  "UNTIL",
  "BYDAY",
]);

export type CreateEventField =
  | "title"
  | "eventTypeId"
  | "startDate"
  | "endDate"
  | "startTime"
  | "endTime"
  | "recurrenceRule"
  | "optionalAttendeeIds"
  | "url";

export type CreateEventValidationError =
  | "required"
  | "before-start"
  | "invalid";

export type CreateEventValidationErrors = Partial<
  Record<CreateEventField, CreateEventValidationError>
>;

export interface CreateEventValidationOptions {
  /** Event type ids the host offers. Empty or omitted means the form has no event-type field. */
  readonly eventTypeIds?: readonly string[];
  /** Requires a pick. Has no effect unless `eventTypeIds` is non-empty. */
  readonly eventTypeRequired?: boolean;
}

interface CreateEventValidation {
  readonly valid: boolean;
  readonly errors: CreateEventValidationErrors;
}

const validateAllDayDraft = (
  draft: AllDayCreateEventDraft,
  errors: CreateEventValidationErrors
): void => {
  if (draft.startTime !== null) {
    errors.startTime = "invalid";
  }

  if (draft.endTime !== null) {
    errors.endTime = "invalid";
  }

  const endDate = draft.endDate ?? undefined;

  if (endDate === undefined || endDate <= draft.startDate) {
    errors.endDate = "before-start";
  }
};

const localTimeMinutes = (value: string): number | null => {
  try {
    return minutesFromLocalTime(parseLocalTime(value));
  } catch {
    return null;
  }
};

const validateTimedDraft = (
  draft: TimedCreateEventDraft,
  errors: CreateEventValidationErrors
): void => {
  const startMinutes = localTimeMinutes(draft.startTime);
  if (startMinutes === null) {
    errors.startTime = "invalid";
    return;
  }

  const endDate = draft.endDate ?? undefined;
  if (endDate !== undefined && endDate < draft.startDate) {
    errors.endDate = "before-start";
    return;
  }

  const endTime = draft.endTime ?? undefined;
  if (endTime === undefined) {
    return;
  }

  const endMinutes = localTimeMinutes(endTime);
  if (endMinutes === null) {
    errors.endTime = "invalid";
    return;
  }

  const sameDate = endDate === undefined || endDate === draft.startDate;

  if (sameDate && endMinutes <= startMinutes) {
    errors.endTime = "before-start";
  }
};

const isPositiveInteger = (value: string): boolean =>
  POSITIVE_INTEGER_PATTERN.test(value);

const parseRecurrenceValues = (rule: string): Map<string, string> | null => {
  if (rule.trim() === "") {
    return null;
  }

  const values = new Map<string, string>();

  for (const field of rule.split(";")) {
    const separator = field.indexOf("=");
    if (separator <= 0 || separator === field.length - 1) {
      return null;
    }

    const key = field.slice(0, separator);
    if (values.has(key)) {
      return null;
    }

    values.set(key, field.slice(separator + 1));
  }

  return values;
};

const isValidUntil = (value: string): boolean => {
  const groups = RECURRENCE_UNTIL_PATTERN.exec(value)?.groups;
  if (groups === undefined) {
    return false;
  }

  const [year, month, day] = [groups.year, groups.month, groups.day].map(Number);
  const [hour, minute, second] = [groups.hour, groups.minute, groups.second].map(
    (part) => Number(part ?? 0)
  );

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second);

  // A rolled-over value (20260230, T246000Z) lands on another field.
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
};

const hasValidByDay = (value: string | undefined): boolean => {
  if (value === undefined) {
    return true;
  }
  return value.split(",").every((weekday) => RECURRENCE_WEEKDAYS.has(weekday));
};

const hasSupportedKeys = (values: ReadonlyMap<string, string>): boolean =>
  [...values.keys()].every((key) => SUPPORTED_RECURRENCE_KEYS.has(key));

export const isValidRecurrenceRule = (rule: string): boolean => {
  const values = parseRecurrenceValues(rule);
  if (values === null) {
    return false;
  }

  const frequency = values.get("FREQ");
  const validFrequency =
    frequency === "DAILY" ||
    frequency === "WEEKLY" ||
    frequency === "MONTHLY" ||
    frequency === "YEARLY";
  const interval = values.get("INTERVAL");
  const count = values.get("COUNT");
  const until = values.get("UNTIL");

  return (
    validFrequency &&
    (interval === undefined || isPositiveInteger(interval)) &&
    (count === undefined || isPositiveInteger(count)) &&
    (until === undefined || isValidUntil(until)) &&
    // RFC 5545: COUNT and UNTIL must not occur in the same rule.
    (count === undefined || until === undefined) &&
    hasValidByDay(values.get("BYDAY")) &&
    hasSupportedKeys(values)
  );
};

const MAX_REMINDER_URL_LENGTH = 2048;
// The host ends at the first `/`, `?` or `#`; an `@` before that is a user name or password.
const REMINDER_URL_PATTERN = /^https?:\/\/[^\s/?#@]+(?:[/?#]\S*)?$/iu;

/** A reminder link the calendar API accepts: http or https, no credentials, at most 2048 characters. */
export const isValidReminderUrl = (url: string): boolean =>
  url.length <= MAX_REMINDER_URL_LENGTH && REMINDER_URL_PATTERN.test(url);

export const validateCreateEventDraft = (
  draft: CreateEventDraft,
  options: CreateEventValidationOptions = {}
): CreateEventValidation => {
  const errors: CreateEventValidationErrors = {};

  if (draft.title.trim() === "") {
    errors.title = "required";
  }

  const eventTypeIds = options.eventTypeIds ?? [];

  if (eventTypeIds.length > 0) {
    if (!draft.eventTypeId) {
      if (options.eventTypeRequired === true) {
        errors.eventTypeId = "required";
      }
    } else if (!eventTypeIds.includes(draft.eventTypeId)) {
      errors.eventTypeId = "invalid";
    }
  }

  const recurrenceRule = draft.recurrenceRule ?? undefined;

  if (recurrenceRule !== undefined && !isValidRecurrenceRule(recurrenceRule)) {
    errors.recurrenceRule = "invalid";
  }

  if (typeof draft.url === "string" && !isValidReminderUrl(draft.url)) {
    errors.url = "invalid";
  }

  const attendeeIds = new Set(draft.attendeeIds ?? []);
  if ((draft.optionalAttendeeIds ?? []).some((id) => !attendeeIds.has(id))) {
    errors.optionalAttendeeIds = "invalid";
  }

  if (draft.allDay) {
    validateAllDayDraft(draft, errors);
  } else {
    validateTimedDraft(draft, errors);
  }

  return { errors, valid: Object.keys(errors).length === 0 };
};
