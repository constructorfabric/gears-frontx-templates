import type {
  CreateEventField,
  CreateEventValidationError,
  CreateEventValidationErrors,
} from "../../core/create-event";
import type { CalendarTemporalProps } from "../../react/slots";

export type CreateEventErrorTranslate = CalendarTemporalProps["t"];

const VALIDATION_FIELDS: readonly CreateEventField[] = [
  "title",
  "eventTypeId",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "recurrenceRule",
  "optionalAttendeeIds",
  "url",
];

const ERROR_MESSAGE_IDS: Readonly<Record<CreateEventValidationError, string>> =
  {
    "before-start": "calendar.create_event.error.endBeforeStart",
    invalid: "calendar.create_event.error.invalid",
    required: "calendar.create_event.error.required",
  };

export const resolveCreateEventError = (
  error: CreateEventValidationError,
  field: CreateEventField,
  t: CreateEventErrorTranslate
): string =>
  t(
    field === "eventTypeId" && error === "required"
      ? "calendar.create_event.error.event_type_required"
      : ERROR_MESSAGE_IDS[error]
  );

const messageFor = (
  errors: CreateEventValidationErrors,
  field: CreateEventField,
  t: CreateEventErrorTranslate
): string | null => {
  const error = errors[field];
  return error ? resolveCreateEventError(error, field, t) : null;
};

export const firstCreateEventError = (
  errors: CreateEventValidationErrors,
  t: CreateEventErrorTranslate
): string | undefined => {
  for (const field of VALIDATION_FIELDS) {
    const message = messageFor(errors, field, t);
    if (message !== null) {
      return message;
    }
  }

  return undefined;
};

export const createEventErrorMessages = (
  errors: CreateEventValidationErrors,
  t: CreateEventErrorTranslate
): Readonly<Record<CreateEventField, string | null>> => ({
  endDate: messageFor(errors, "endDate", t),
  endTime: messageFor(errors, "endTime", t),
  eventTypeId: messageFor(errors, "eventTypeId", t),
  optionalAttendeeIds: messageFor(errors, "optionalAttendeeIds", t),
  recurrenceRule: messageFor(errors, "recurrenceRule", t),
  startDate: messageFor(errors, "startDate", t),
  startTime: messageFor(errors, "startTime", t),
  title: messageFor(errors, "title", t),
  url: messageFor(errors, "url", t),
});
