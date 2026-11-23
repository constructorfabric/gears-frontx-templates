"use client";

import { clsx } from "clsx";
import {
  ArrowRightIcon,
  BellIcon,
  Clock3Icon,
  Globe2Icon,
  Link2Icon,
  MapPinIcon,
  RefreshCwIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, Ref, RefObject } from "react";
import type * as React from "react";
import { createPortal } from "react-dom";

import type {
  CalendarColorFamily,
  CalendarDate,
  CalendarRef,
  CreateEventDraft,
  UtcInstant,
  Weekday,
} from "../../core/model";
import { addCalendarDays } from "../../core/temporal";
import { isValidReminderUrl } from "../../core/create-event";
import { parseLocalTime } from "../../core/validation";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type {
  CalendarContextProps,
  CalendarTranslate,
} from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import type {
  CalendarResourceOption,
  CreateEventSubmitError,
  UseCreateEventControllerOptions,
  UseCreateEventControllerResult,
  useCreateEventController,
} from "../../react/controllers/use-create-event-controller";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../primitives/alert-dialog/alert-dialog";
import { Button } from "../primitives/button/button";
import { Combobox } from "../primitives/combobox/combobox";
import type { ComboboxOption } from "../primitives/combobox/combobox";
import { DateField as KitDateField } from "../primitives/date-field/date-field";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../primitives/field/field";
import {
  noopCleanup,
  subscribeGlobalEvent,
} from "../primitives/global-event-listener";
import { isNestedLayerEvent } from "../primitives/portal-layer";
import { textFromNode } from "../primitives/react-node-text";
import { swallowNextClick } from "../primitives/popover/popover-internals";
import { Input } from "../primitives/input/input";
import { Radio, RadioGroup } from "../primitives/radio/radio";
import { ScrollRegion } from "../primitives/scroll-region/scroll-region";
import { Select } from "../primitives/select/select";
import { Separator } from "../primitives/separator/separator";
import { Textarea } from "../primitives/textarea/textarea";
import { Toggle } from "../primitives/toggle/toggle";
import {
  dateRangeDayCount,
  formatDateInputText,
  weekdayLabel,
  REPEAT_UNIT,
} from "./create-event-format";
import type {
  CustomRepeatState,
  RepeatEndKind,
  RepeatPreset,
  RepeatUnit,
} from "./create-event-format";
import type { createEventErrorMessages } from "./create-event-validation";
import {
  resolveRepeatUnit,
  useCreateEventPanelContent,
} from "./use-create-event-panel-content";

import styles from "./create-event.module.css";

const SUBMIT_ERROR_ID = "calendar.create_event.submitError";

export type { CalendarResourceOption } from "../../react/controllers/use-create-event-controller";

export type CreateEventPanelHandle = Pick<
  UseCreateEventControllerResult,
  "requestCancel"
>;

/** Event type the host permits. The picked `id` is stored on `draft.eventTypeId`. */
export interface CreateEventTypeOption {
  /** Stable id stored on the draft. */
  readonly id: string;
  /** Display text in the picker. */
  readonly label: string;
  /** Colour family shown as a dot, as calendars show theirs. */
  readonly colorFamily?: CalendarColorFamily;
}

export interface CreateEventPanelProps
  extends
    CalendarContextProps,
    Omit<UseCreateEventControllerOptions, "timeZone"> {
  /** Class added to the component root. */
  readonly className?: string;
  /** Calendars offered in the calendar field. */
  readonly calendars: readonly CalendarRef[];
  /** Event types offered in the event-type field. The field is not rendered when empty or omitted. */
  readonly eventTypes?: readonly CreateEventTypeOption[];
  /** Reference instant for the time-zone offset label. */
  readonly now?: UtcInstant;
  /** People offered in the people combobox. */
  readonly people: readonly CalendarResourceOption[];
  /** Locations offered in the location combobox. */
  readonly locations: readonly CalendarResourceOption[];
  /** Nested locations, one select per level in place of the flat location combobox. */
  readonly locationHierarchy?: readonly CalendarLocationNode[];
  /** Conferencing providers offered in the conferencing select. */
  readonly conferencingProviders: readonly CalendarResourceOption[];
  /** Content added below the header row. */
  readonly renderHeader?: () => ReactNode;
  /** Extra host fields rendered after the kit's fields. Receives the current draft. */
  readonly renderFields?: (draft: CreateEventDraft) => ReactNode;
  /** Content added above the Cancel/Save row. */
  readonly renderFooter?: () => ReactNode;
  /** Replaces how a submit error is shown. */
  readonly renderError?: (error: CreateEventSubmitError) => ReactNode;
  /** Kind the form edits. `reminder` shows the reminder fields and hides the event-only ones. */
  readonly kind?: CreateEventKind;
  /** Shows the Event/Reminder switch in the header and reports the kind the user picks. */
  readonly onKindChange?: (kind: CreateEventKind) => void;
  /** Lets the host close the form through its own unsaved-changes prompt. */
  readonly ref?: Ref<CreateEventPanelHandle>;
}

export type CreateEventKind = "event" | "reminder";

export interface ResourceItem {
  readonly value: string;
  readonly label: ReactNode;
  readonly dividerAfter?: boolean;
}

export interface CalendarLocationNode {
  /** Stable id written to the draft location when this node is the chosen leaf. */
  readonly id: string;
  /** Display text in the level's select. */
  readonly label: string;
  /** Options for the next level. A node without children is a leaf. */
  readonly children?: readonly CalendarLocationNode[];
}

export interface CalendarLocationLevel {
  readonly options: readonly CalendarLocationNode[];
  readonly selectedId: string | undefined;
}

interface CustomRepeatViewProps {
  readonly idPrefix: string;
  readonly repeatAnchorRef: RefObject<HTMLButtonElement | null>;
  readonly state: CustomRepeatState;
  readonly onChangeInterval: (value: string) => void;
  readonly onChangeUnit: (unit: RepeatUnit) => void;
  readonly onChangeEndKind: (kind: RepeatEndKind) => void;
  readonly onChangeEndDate: (value: CalendarDate | "") => void;
  readonly onToggleWeekday: (weekday: Weekday) => void;
  readonly onCancel: () => void;
  readonly onApply: () => void;
}

interface DraftChangeProps {
  readonly draft: CreateEventDraft;
  readonly setDraft: (draft: CreateEventDraft) => void;
}

interface FormHeaderProps {
  readonly kind: CreateEventKind;
  readonly onClose: () => void;
  readonly onKindChange?: (kind: CreateEventKind) => void;
  readonly renderHeader?: () => ReactNode;
  readonly titleId: string;
}

interface FormFooterProps {
  readonly formId: string;
  readonly isSubmitting: boolean;
  readonly canSubmit: boolean;
  readonly onCancel: () => void;
  readonly renderFooter?: () => ReactNode;
}

interface DateFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: CalendarDate | "";
  readonly disabled: boolean;
  readonly invalid?: boolean;
  readonly errorId?: string;
  readonly errorMessage?: string | null;
  readonly className?: string;
  readonly defaultMonthDate?: CalendarDate;
  readonly clearable?: boolean;
  readonly compact?: boolean;
  /** Shown in the empty field until it is focused. */
  readonly placeholder?: string;
  readonly onChange: (value: CalendarDate | "", fromCalendar?: boolean) => void;
}

interface TimeFieldProps {
  readonly id: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly invalid?: boolean;
  readonly errorId?: string;
  readonly errorMessage?: string | null;
  readonly className?: string;
  readonly onChange: (value: string) => void;
}

interface DiscardDialogProps {
  readonly container: Element | DocumentFragment;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

const REPEAT_DISPLAY_WEEKDAYS: readonly Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const CALENDAR_COLOR_CLASSES: ReadonlyMap<string, string> = new Map([
  ["turquoise", styles.calendarColorTurquoise],
  ["purple", styles.calendarColorPurple],
  ["magenta", styles.calendarColorPurple],
  ["orange", styles.calendarColorOrange],
  ["green", styles.calendarColorGreen],
  ["blue", styles.calendarColorBlue],
  ["lavender", styles.calendarColorLavender],
  ["violet", styles.calendarColorViolet],
  ["brown", styles.calendarColorBrown],
  ["pink", styles.calendarColorPink],
]);

const calendarColorClass = (
  colorFamily: CalendarColorFamily
): string | undefined => CALENDAR_COLOR_CLASSES.get(colorFamily);

// The interval field takes 1 to 30, the range the custom repeat has always offered.
const MAX_REPEAT_INTERVAL = 30;

const resolveRepeatEndKind = (value: string): RepeatEndKind =>
  value === "on" ? "on" : "never";

// The unit reads with the interval, as in "every 1 week" or "every 2 weeks".
const repeatUnitOptions = (
  t: CalendarTranslate,
  count: number
): readonly ResourceItem[] => [
  {
    label: t("calendar.create_event.repeat.unit.day", { count }),
    value: REPEAT_UNIT.day,
  },
  {
    label: t("calendar.create_event.repeat.unit.week", { count }),
    value: REPEAT_UNIT.week,
  },
  {
    label: t("calendar.create_event.repeat.unit.month", { count }),
    value: REPEAT_UNIT.month,
  },
];

// Picked dates floor the end to the start. Typed ends stay as typed: a before-start end fails
// validation instead of being replaced, because a floored end shows as the empty same-day field.
const floorEndDate = (draft: CreateEventDraft): CreateEventDraft => {
  // All-day end dates are exclusive, so they must come after the start day.
  const earliestEnd = draft.allDay
    ? addCalendarDays(draft.startDate, 1)
    : draft.startDate;

  return draft.endDate !== null && draft.endDate < earliestEnd
    ? { ...draft, endDate: earliestEnd }
    : draft;
};

const updateDateField = (
  field: "startDate" | "endDate",
  value: CalendarDate | "",
  { draft, setDraft }: DraftChangeProps,
  fromCalendar: boolean
): void => {
  if (value === "") {
    if (field === "endDate") {
      setDraft({ ...draft, endDate: null });
    }

    return;
  }

  const next: CreateEventDraft =
    field === "startDate"
      ? { ...draft, startDate: value }
      : { ...draft, endDate: value };

  setDraft(fromCalendar ? floorEndDate(next) : next);
};

const updateTimeField = (
  field: "startTime" | "endTime",
  value: string,
  { draft, setDraft }: DraftChangeProps
): void => {
  if (draft.allDay) {
    return;
  }

  if (value === "") {
    if (field === "endTime") {
      setDraft({ ...draft, endTime: null });
    }

    return;
  }

  try {
    const time = parseLocalTime(value);

    setDraft(
      field === "startTime"
        ? { ...draft, startTime: time }
        : { ...draft, endTime: time }
    );
  } catch {
    // Wait for the next valid edit.
  }
};

interface KindSwitchProps {
  readonly kind: CreateEventKind;
  readonly onKindChange: (kind: CreateEventKind) => void;
}

const CREATE_EVENT_KINDS: readonly CreateEventKind[] = ["event", "reminder"];

const KIND_LABEL_IDS: Readonly<Record<CreateEventKind, string>> = {
  event: "calendar.create_event.kind.event",
  reminder: "calendar.create_event.kind.reminder",
};

const KindSwitch = ({ kind, onKindChange }: KindSwitchProps) => {
  const { t } = useCalendarLocalization();

  return (
    <div
      className={styles.kindSwitch}
      role="group"
      aria-label={t("calendar.create_event.kind.label")}
    >
      {CREATE_EVENT_KINDS.map((option) => {
        const selected = option === kind;

        return (
          <Button
            key={option}
            type="button"
            variant="tertiary"
            size="m"
            aria-pressed={selected}
            onClick={() => {
              onKindChange(option);
            }}
          >
            {t(KIND_LABEL_IDS[option])}
          </Button>
        );
      })}
    </div>
  );
};

const FormHeader = ({
  kind,
  onClose,
  onKindChange,
  renderHeader,
  titleId,
}: FormHeaderProps) => {
  const { t } = useCalendarLocalization();
  const titleKey = "calendar.event.type.default";
  const title = t(titleKey);

  const actions = (
    <div className={styles.headerActions}>
      <Button
        aria-label={t("calendar.create_event.close")}
        className={styles.closeButton}
        leftIcon={<XIcon aria-hidden="true" />}
        onlyIcon
        size="l"
        type="button"
        variant="ghost"
        onClick={onClose}
      />
    </div>
  );

  return (
    <div className={styles.header}>
      <div className={styles.heading}>
        {onKindChange === undefined ? (
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
        ) : (
          <KindSwitch kind={kind} onKindChange={onKindChange} />
        )}
        {renderHeader?.()}
        {actions}
      </div>
    </div>
  );
};

const FormFooter = ({
  formId,
  isSubmitting,
  canSubmit,
  onCancel,
  renderFooter,
}: FormFooterProps) => {
  const { t } = useCalendarLocalization();

  return (
    <div className={styles.footer}>
      <Separator decorative className={styles.footerDivider} />
      <div className={styles.footerActions}>
        {renderFooter?.()}
        <Button
          type="button"
          variant="secondary"
          size="l"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t("calendar.create_event.cancel")}
        </Button>
        <Button
          type="submit"
          size="l"
          className={styles.saveButton}
          form={formId}
          loading={isSubmitting}
          disabled={!canSubmit}
        >
          {isSubmitting
            ? t("calendar.create_event.saving")
            : t("calendar.create_event.save")}
        </Button>
      </div>
    </div>
  );
};

const DateField = ({
  id,
  label,
  value,
  disabled,
  invalid = false,
  errorId,
  errorMessage,
  className,
  defaultMonthDate,
  clearable = false,
  compact = false,
  placeholder,
  onChange,
}: DateFieldProps) => {
  const { locale } = useCalendarLocalization();

  return (
    <Field className={clsx(styles.field, className)}>
      <FieldLabel htmlFor={id} className={styles.visuallyHidden}>
        {label}
      </FieldLabel>
      <KitDateField
        id={id}
        locale={locale}
        value={value}
        disabled={disabled}
        invalid={invalid}
        displayFormat={(date) => formatDateInputText(date, locale, compact)}
        size={compact ? "m" : "l"}
        defaultMonthDate={defaultMonthDate}
        clearable={clearable}
        placeholder={placeholder}
        aria-describedby={errorId}
        className={styles.control}
        onValueChange={onChange}
      />
      {invalid && errorId !== undefined ? (
        <FieldError id={errorId} role="status">
          {errorMessage}
        </FieldError>
      ) : null}
    </Field>
  );
};

const TimeField = ({
  id,
  label,
  placeholder,
  value,
  disabled,
  invalid = false,
  errorId,
  errorMessage,
  className,
  onChange,
}: TimeFieldProps) => (
  <Field className={clsx(styles.field, className)}>
    <FieldLabel htmlFor={id} className={styles.visuallyHidden}>
      {label}
    </FieldLabel>
    <Input
      id={id}
      type="time"
      size="l"
      value={value}
      placeholder={placeholder ?? label}
      disabled={disabled}
      invalid={invalid}
      aria-describedby={errorId}
      className={clsx(styles.control, value === "" && styles.emptyTime)}
      iconLeft={<Clock3Icon aria-hidden="true" />}
      onValueChange={onChange}
    />
    {invalid && errorId !== undefined ? (
      <FieldError id={errorId} role="status">
        {errorMessage}
      </FieldError>
    ) : null}
  </Field>
);

const CustomRepeatView = ({
  idPrefix,
  repeatAnchorRef,
  state,
  onChangeInterval,
  onChangeUnit,
  onChangeEndKind,
  onChangeEndDate,
  onToggleWeekday,
  onCancel,
  onApply,
}: CustomRepeatViewProps) => {
  const { t } = useCalendarLocalization();
  const intervalId = `${idPrefix}-repeat-interval`;
  const unitId = `${idPrefix}-repeat-unit`;
  const endGroupName = `${idPrefix}-repeat-end`;
  const unitItems = repeatUnitOptions(t, state.interval);
  const intervalRef = useRef<HTMLInputElement>(null);

  // The field may be empty while a number is typed over; it shows the applied interval on blur.
  const [intervalText, setIntervalText] = useState(String(state.interval));

  // Opening the editor moves focus into it; closing hands focus back to the Repeat field.
  useEffect(() => {
    intervalRef.current?.focus();
  }, []);

  useEffect(
    () => () => {
      repeatAnchorRef.current?.focus();
    },
    [repeatAnchorRef]
  );

  const handleIntervalChange = (value: string): void => {
    setIntervalText(value);

    if (value !== "") {
      onChangeInterval(value);
    }
  };

  const endsLabel = t("calendar.create_event.repeat.ends");
  const neverLabel = t("calendar.create_event.repeat.never");
  const onLabel = t("calendar.create_event.repeat.on_date");

  return (
    <div className={styles.repeatView} data-testid="create-event-repeat-view">
      <FieldGroup className={styles.customBody}>
        <div className={styles.repeatIntervalRow}>
          <span className={styles.repeatInlineLabel}>
            {t("calendar.create_event.repeat.every")}
          </span>
          <Input
            ref={intervalRef}
            id={intervalId}
            aria-label={t("calendar.create_event.repeat.every")}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_REPEAT_INTERVAL}
            value={intervalText}
            size="m"
            className={styles.repeatInterval}
            onValueChange={handleIntervalChange}
            onBlur={() => {
              setIntervalText(String(state.interval));
            }}
          />
          <Select
            id={unitId}
            aria-label={t("calendar.create_event.repeat.unit_label", {
              count: state.interval,
              unit: t(`calendar.create_event.repeat.unit.${state.unit}`, {
                count: state.interval,
              }),
            })}
            options={unitItems}
            value={state.unit}
            size="m"
            showSelectedCheck
            className={styles.repeatUnit}
            popupClassName={styles.repeatUnitPopup}
            onValueChange={(value) => {
              onChangeUnit(resolveRepeatUnit(value));
            }}
          />
        </div>
        {/* A legend cannot flex, so this span labels the group. */}
        <div
          className={styles.weekdays}
          role="group"
          aria-labelledby={`${idPrefix}-repeat-on-label`}
        >
          <span
            className={styles.repeatInlineLabel}
            id={`${idPrefix}-repeat-on-label`}
          >
            {t("calendar.create_event.repeat.onWeekdays")}
          </span>
          <div className={styles.weekdayButtons}>
            {REPEAT_DISPLAY_WEEKDAYS.map((weekday) => {
              const label = weekdayLabel(weekday, t);
              const shortLabel = label.slice(0, 2);
              const selected = state.byDay.includes(weekday);

              return (
                <Button
                  key={weekday}
                  type="button"
                  variant="tertiary"
                  size="s"
                  selected={selected}
                  aria-label={label}
                  aria-pressed={selected}
                  onClick={() => {
                    onToggleWeekday(weekday);
                  }}
                >
                  {shortLabel}
                </Button>
              );
            })}
          </div>
        </div>
        <div
          className={styles.ends}
          role="group"
          aria-labelledby={`${idPrefix}-repeat-ends-label`}
        >
          <span
            className={styles.endsLabel}
            id={`${idPrefix}-repeat-ends-label`}
          >
            {endsLabel}
          </span>
          <RadioGroup
            aria-label={endsLabel}
            className={styles.endOptions}
            name={endGroupName}
            value={state.endKind}
            onValueChange={(value) => {
              onChangeEndKind(resolveRepeatEndKind(value));
            }}
          >
            <Radio value="never" label={neverLabel} />
            <Radio value="on" label={onLabel} />
          </RadioGroup>
          {state.endKind === "on" ? (
            <DateField
              id={`${idPrefix}-repeat-end-date`}
              label={t("calendar.create_event.field.end_date")}
              value={state.endDate ?? ""}
              disabled={false}
              className={styles.repeatEndDate}
              compact
              onChange={onChangeEndDate}
            />
          ) : null}
        </div>
        <div className={styles.repeatActions}>
          <Button
            type="button"
            variant="secondary"
            size="l"
            onClick={onCancel}
          >
            {t("calendar.create_event.cancel")}
          </Button>
          <Button
            type="button"
            size="l"
            className={styles.saveButton}
            onClick={onApply}
          >
            {t("calendar.create_event.save")}
          </Button>
        </div>
      </FieldGroup>
    </div>
  );
};

const DiscardDialog = ({
  container,
  open,
  onClose,
  onConfirm,
}: DiscardDialogProps) => {
  const { t } = useCalendarLocalization();

  return (
    <>
      {open
        ? createPortal(
            <div aria-hidden="true" className={styles.discardBackdrop} />,
            container
          )
        : null}
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onClose();
          }
        }}
      >
        <AlertDialogContent
          container={container}
          showBackdrop={false}
          className={styles.discardDialog}
        >
          <AlertDialogHeader className={styles.discardHeader}>
            <AlertDialogTitle className={styles.discardTitle}>
              {t("calendar.create_event.discard.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className={styles.discardDescription}>
              {t("calendar.create_event.discard.message")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={styles.discardFooter}>
            <AlertDialogCancel
              className={styles.discardCancel}
              onClick={onClose}
            >
              {t("calendar.create_event.discard.keep")}
            </AlertDialogCancel>
            <AlertDialogAction
              className={styles.discardAction}
              onClick={onConfirm}
            >
              {t("calendar.create_event.discard.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

interface CalendarColorDotProps {
  readonly colorFamily: CalendarColorFamily;
  readonly testId?: string;
}

const CalendarColorDot = ({ colorFamily, testId }: CalendarColorDotProps) => (
  <span
    aria-hidden="true"
    data-calendar-color={colorFamily}
    data-testid={testId}
    className={clsx(styles.calendarColorDot, calendarColorClass(colorFamily))}
  />
);

interface SubmitErrorProps {
  readonly error: CreateEventSubmitError | null;
  readonly errorId: string;
  readonly renderError: CreateEventPanelProps["renderError"];
}

const SubmitError = ({
  error,
  errorId,
  renderError,
}: SubmitErrorProps): ReactNode => {
  const { t } = useCalendarLocalization();

  if (error === null || error.kind === "conflict") {
    return null;
  }

  const errorMessage = error.message ?? t(SUBMIT_ERROR_ID);

  return renderError ? (
    renderError(error)
  ) : (
    <FieldError id={errorId}>{errorMessage}</FieldError>
  );
};

const fieldErrorId = (
  message: string | null | undefined,
  id: string
): string | undefined => ((message ?? null) === null ? undefined : id);

// Exposes requestCancel through the host's ref. The props are spread so the ref is read here, not in the parent's render.
const CancelHandle = ({
  requestCancel,
  ...props
}: {
  readonly ref?: Ref<CreateEventPanelHandle>;
  readonly requestCancel: () => Promise<boolean>;
}) => {
  useImperativeHandle(props.ref, () => ({ requestCancel }));

  return null;
};

// A dirty form asks before closing on an outside press; the press and its click stop here.
const useOutsidePressGuard = (
  root: HTMLElement | null,
  guarded: boolean,
  onOutsidePress: () => void
): void => {
  const onOutsidePressRef = useRef(onOutsidePress);

  useEffect(() => {
    onOutsidePressRef.current = onOutsidePress;
  }, [onOutsidePress]);

  useEffect(() => {
    if (root === null || !guarded) {
      return noopCleanup;
    }

    // Use the composed path: in a shadow root, event.target is the host here.
    return subscribeGlobalEvent(
      document,
      "pointerdown",
      (event) => {
        const path = event.composedPath();

        if (path.includes(root) || isNestedLayerEvent(root, path)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        swallowNextClick();
        onOutsidePressRef.current();
      },
      true
    );
  }, [guarded, root]);
};

// Escape closes the form wherever focus sits; a listbox owns its own Escape.
const useEscapeClose = (
  root: HTMLElement | null,
  onShellOpenChange: (nextOpen: boolean) => void
): void => {
  const onShellOpenChangeRef = useRef(onShellOpenChange);

  useEffect(() => {
    onShellOpenChangeRef.current = onShellOpenChange;
  }, [onShellOpenChange]);

  useEffect(() => {
    if (root === null) {
      return noopCleanup;
    }

    return subscribeGlobalEvent(document, "keydown", (event) => {
      if (!(event instanceof KeyboardEvent)) {
        return;
      }

      const inListbox =
        event.target instanceof Element &&
        event.target.closest('[role="listbox"]') !== null;

      // A field that closes its own popup on Escape prevents the default, so the form stays open.
      if (event.key === "Escape" && !inListbox && !event.defaultPrevented) {
        onShellOpenChangeRef.current(false);
      }
    });
  }, [root]);
};

const useNativeSelectChange = (
  root: HTMLElement | null,
  onChange: (event: Event) => void
): void => {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (root === null) {
      return noopCleanup;
    }

    return subscribeGlobalEvent(
      root,
      "change",
      (event) => {
        onChangeRef.current(event);
      },
      true
    );
  }, [root]);
};

// The location level state rides on the controller so it reaches the fields without extra props.
type CreateEventFormController = ReturnType<typeof useCreateEventController> & {
  readonly locationLevels: readonly CalendarLocationLevel[] | undefined;
  readonly onLocationLevelSelect: (level: number, id: string) => void;
};

interface CreateEventFormProps {
  readonly calendarItems: readonly {
    readonly icon: ReactNode;
    readonly label: ReactNode;
    readonly value: string;
  }[];
  readonly canSubmit: boolean;
  readonly conferencingItems: readonly ResourceItem[];
  readonly controller: CreateEventFormController;
  readonly displayedEndDate: CalendarDate | "";
  readonly eventTypeItems: readonly {
    readonly icon: ReactNode | undefined;
    readonly label: string;
    readonly value: string;
  }[];
  readonly fieldId: (name: string) => string;
  readonly fieldMessages: ReturnType<typeof createEventErrorMessages>;
  readonly firstError: string | null;
  readonly formId: string;
  readonly kind: CreateEventKind;
  readonly notifyBlocked: boolean;
  readonly notifyLeadItems: readonly ResourceItem[];
  readonly onKindChange?: (kind: CreateEventKind) => void;
  readonly onNotifyChange: (enabled: boolean) => Promise<void>;
  readonly onNotifyLeadChange: (value: string) => void;
  readonly onAllDayChange: (allDay: boolean) => void;
  readonly onLocationSelection: (value: string) => void;
  readonly onPeopleSelect: (option: ComboboxOption) => void;
  readonly onRepeatPresetChange: (value: string) => void;
  readonly onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  readonly locationEditorOpen: boolean;
  readonly locationItems: readonly ResourceItem[];
  readonly locationQuery: string;
  readonly noOptionsLabel: string;
  readonly peopleQuery: string;
  readonly discardOpen: boolean;
  readonly repeatEditing: boolean;
  readonly repeatEditor: ReactNode;
  readonly renderFields?: (draft: CreateEventDraft) => ReactNode;
  readonly renderFooter?: () => ReactNode;
  readonly renderHeader?: () => ReactNode;
  readonly repeatAnchorRef: RefObject<HTMLButtonElement | null>;
  readonly repeatHint: string | undefined;
  readonly repeatItems: readonly ResourceItem[];
  readonly repeatPreset: RepeatPreset;
  readonly selectedCalendar: CalendarRef | undefined;
  readonly selectedPeopleIds: readonly string[] | undefined;
  readonly setPeopleQuery: (query: string) => void;
  readonly setDraft: (draft: CreateEventDraft) => void;
  readonly setLocationEditorOpen: (open: boolean) => void;
  readonly submitErrorContent: ReactNode;
  readonly timeZoneFieldLabel: string;
  readonly timeZoneLabel: string;
  readonly updateLocation: (value: string) => void;
  readonly visiblePeopleItems: readonly ResourceItem[];
}

type CreateEventAdditionalFieldsProps = Pick<
  CreateEventFormProps,
  | "controller"
  | "fieldId"
  | "onLocationSelection"
  | "locationEditorOpen"
  | "locationItems"
  | "locationQuery"
  | "setDraft"
  | "setLocationEditorOpen"
  | "updateLocation"
>;

const CreateEventAdditionalFields = (
  props: CreateEventAdditionalFieldsProps
) => {
  const {
    controller,
    fieldId,
    onLocationSelection,
    locationEditorOpen,
    locationItems,
    locationQuery,
    setDraft,
    setLocationEditorOpen,
    updateLocation,
  } = props;

  const { t } = useCalendarLocalization();

  const changeDescription = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ): void => {
    setDraft({ ...controller.draft, description: event.target.value });
  };

  return (
    <>
      {controller.locationLevels !== undefined ? (
        controller.locationLevels.map((level, index) => (
          <Field className={styles.field} key={index}>
            <Select
              id={fieldId(`location-${index}`)}
              aria-label={t("calendar.create_event.field.location_level", {
                level: index + 1,
              })}
              options={level.options.map((option) => ({
                label: option.label,
                value: option.id,
              }))}
              value={level.selectedId}
              size="l"
              iconLeft={<MapPinIcon aria-hidden="true" />}
              showSelectedCheck
              disabled={controller.isSubmitting}
              placeholder={t("calendar.create_event.placeholder.location_level")}
              onValueChange={(id) => {
                controller.onLocationLevelSelect(index, id);
              }}
            />
          </Field>
        ))
      ) : locationEditorOpen && locationItems.length === 0 ? (
        <Field className={styles.field}>
          <Input
            id={fieldId("location")}
            aria-label={t("calendar.create_event.field.location")}
            value={locationQuery}
            size="l"
            iconLeft={<MapPinIcon aria-hidden="true" />}
            className={styles.control}
            disabled={controller.isSubmitting}
            placeholder={t("calendar.create_event.placeholder.location")}
            onValueChange={updateLocation}
          />
        </Field>
      ) : locationEditorOpen ? (
        <Field className={styles.field}>
          <Combobox
            id={fieldId("location")}
            aria-label={t("calendar.create_event.field.location")}
            value={locationQuery}
            selectedValues={locationQuery === "" ? [] : [locationQuery]}
            options={locationItems}
            embedded
            showChevron
            showSelectedCheck
            size="l"
            iconLeft={<MapPinIcon aria-hidden="true" />}
            className={clsx(styles.control, styles.comboboxField)}
            controlClassName={styles.comboboxFieldControl}
            disabled={controller.isSubmitting}
            placeholder={t("calendar.create_event.placeholder.location")}
            emptyMessage={t("calendar.create_event.location.no_results")}
            onValueChange={updateLocation}
            onSelect={(option) => {
              onLocationSelection(option.value);
            }}
          />
        </Field>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="l"
          leftIcon={<MapPinIcon aria-hidden="true" />}
          className={styles.locationButton}
          onClick={() => {
            setLocationEditorOpen(true);
          }}
        >
          {t("calendar.create_event.location.add")}
        </Button>
      )}

      <Field className={clsx(styles.field, styles.descriptionField)}>
        <FieldLabel
          htmlFor={fieldId("description")}
          className={styles.descriptionLabel}
        >
          {t("calendar.create_event.field.description")}
        </FieldLabel>
        <Textarea
          id={fieldId("description")}
          value={controller.draft.description ?? ""}
          disabled={controller.isSubmitting}
          className={styles.control}
          onChange={changeDescription}
        />
      </Field>
    </>
  );
};

type CreateEventFieldsProps = Omit<
  CreateEventFormProps,
  | "canSubmit"
  | "formId"
  | "onKindChange"
  | "onSubmit"
  | "discardOpen"
  | "renderFooter"
  | "renderHeader"
>;

type CreateEventPeopleFieldProps = Pick<
  CreateEventFieldsProps,
  | "controller"
  | "fieldId"
  | "onPeopleSelect"
  | "peopleQuery"
  | "selectedPeopleIds"
  | "setDraft"
  | "setPeopleQuery"
  | "visiblePeopleItems"
>;

const CreateEventPeopleField = ({
  controller,
  fieldId,
  onPeopleSelect,
  peopleQuery,
  selectedPeopleIds,
  setDraft,
  setPeopleQuery,
  visiblePeopleItems,
}: CreateEventPeopleFieldProps) => {
  const { t } = useCalendarLocalization();
  const optionalIds = controller.draft.optionalAttendeeIds ?? [];

  return (
    <Field className={clsx(styles.field, styles.groupStart)}>
      <Combobox
        id={fieldId("people")}
        aria-label={t("calendar.create_event.field.people")}
        value={peopleQuery}
        options={visiblePeopleItems}
        selectedValues={selectedPeopleIds}
        tags
        embedded
        showChevron
        showSelectedCheck
        size="l"
        iconLeft={<UsersIcon aria-hidden="true" />}
        className={clsx(styles.control, styles.comboboxField)}
        controlClassName={clsx(
          styles.comboboxFieldControl,
          selectedPeopleIds !== undefined && selectedPeopleIds.length > 0
            ? styles.comboboxFieldTags
            : undefined
        )}
        disabled={controller.isSubmitting}
        placeholder={t("calendar.create_event.placeholder.people")}
        emptyMessage={t("calendar.create_event.people.no_results")}
        onValueChange={setPeopleQuery}
        onSelect={onPeopleSelect}
        onTagRemove={(value) => {
          onPeopleSelect({ label: value, value });
        }}
        onClearTags={() => {
          setDraft({
            ...controller.draft,
            attendeeIds: [],
            optionalAttendeeIds: [],
          });
        }}
        renderTagAction={(option) => {
          const isOptional = optionalIds.includes(option.value);
          const optionalLabel = t("calendar.create_event.people.optional");

          return (
            <button
              type="button"
              aria-pressed={isOptional}
              aria-label={`${optionalLabel} ${textFromNode(option.label) || option.value}`}
              disabled={controller.isSubmitting}
              className={styles.optionalToggle}
              onClick={(event) => {
                event.stopPropagation();
                setDraft({
                  ...controller.draft,
                  optionalAttendeeIds: isOptional
                    ? optionalIds.filter((id) => id !== option.value)
                    : [...optionalIds, option.value],
                });
              }}
            >
              {optionalLabel}
            </button>
          );
        }}
      />
    </Field>
  );
};

interface ReminderUrlFieldProps {
  readonly draft: CreateEventDraft;
  readonly disabled: boolean;
  readonly fieldId: (name: string) => string;
  readonly setDraft: (draft: CreateEventDraft) => void;
}

const ReminderUrlField = ({
  draft,
  disabled,
  fieldId,
  setDraft,
}: ReminderUrlFieldProps) => {
  const { t } = useCalendarLocalization();
  // Save is off while the link is wrong, so the reason shows as the user types.
  const invalid = typeof draft.url === "string" && !isValidReminderUrl(draft.url);

  return (
    <Field className={styles.field}>
      <Input
        id={fieldId("url")}
        aria-label={t("calendar.create_event.field.url")}
        invalid={invalid}
        aria-describedby={invalid ? fieldId("url-error") : undefined}
        placeholder={t("calendar.create_event.placeholder.url")}
        value={draft.url ?? ""}
        size="xl"
        disabled={disabled}
        iconLeft={<Link2Icon aria-hidden="true" />}
        onValueChange={(value) => {
          setDraft({ ...draft, url: value === "" ? null : value });
        }}
      />
      {invalid ? (
        <FieldError id={fieldId("url-error")} role="status">
          {t("calendar.create_event.error.invalid")}
        </FieldError>
      ) : null}
    </Field>
  );
};

interface NotifyFieldsProps {
  readonly blocked: boolean;
  readonly disabled: boolean;
  readonly fieldId: (name: string) => string;
  readonly leadItems: readonly ResourceItem[];
  readonly notify: CreateEventDraft["notify"];
  readonly onChange: (enabled: boolean) => Promise<void>;
  readonly onLeadChange: (value: string) => void;
}

const NotifyFields = ({
  blocked,
  disabled,
  fieldId,
  leadItems,
  notify,
  onChange,
  onLeadChange,
}: NotifyFieldsProps) => {
  const { t } = useCalendarLocalization();
  const current = notify ?? null;

  return (
    <>
      <Field className={styles.field}>
        <Toggle
          checked={current !== null}
          disabled={disabled}
          label={t("calendar.create_event.field.notify")}
          size="m"
          type="toggle-first"
          onCheckedChange={(checked) => {
            void onChange(checked);
          }}
        />
      </Field>
      {current === null ? null : (
        <Field className={styles.field}>
          <Select
            id={fieldId("notify-lead")}
            aria-label={t("calendar.create_event.field.notify_lead")}
            options={leadItems}
            value={String(current.leadMinutes)}
            size="xl"
            showSelectedCheck
            iconLeft={<BellIcon aria-hidden="true" />}
            disabled={disabled}
            onValueChange={onLeadChange}
          />
        </Field>
      )}
      {blocked ? (
        <FieldError id={fieldId("notify-error")} role="status">
          {t("calendar.create_event.notify.blocked")}
        </FieldError>
      ) : null}
    </>
  );
};

const CreateEventFields = (props: CreateEventFieldsProps) => {
  const {
    kind,
    notifyBlocked,
    notifyLeadItems,
    onNotifyChange,
    onNotifyLeadChange,
    calendarItems,
    conferencingItems,
    controller,
    displayedEndDate,
    eventTypeItems,
    fieldId,
    fieldMessages,
    firstError,
    onAllDayChange,
    onPeopleSelect,
    onRepeatPresetChange,
    noOptionsLabel,
    peopleQuery,
    onLocationSelection,
    locationEditorOpen,
    locationItems,
    locationQuery,
    renderFields,
    repeatAnchorRef,
    repeatEditing,
    repeatEditor,
    repeatHint,
    repeatItems,
    repeatPreset,
    selectedCalendar,
    selectedPeopleIds,
    setPeopleQuery,
    setDraft,
    setLocationEditorOpen,
    submitErrorContent,
    timeZoneFieldLabel,
    timeZoneLabel,
    updateLocation,
    visiblePeopleItems,
  } = props;

  const { t } = useCalendarLocalization();

  const isReminder = kind === "reminder";

  const dayCount = dateRangeDayCount(
    controller.draft.startDate,
    displayedEndDate === "" ? null : displayedEndDate
  );

  const fieldUpdateContext = { draft: controller.draft, setDraft };

  const changeStartTime = (value: string): void => {
    updateTimeField("startTime", value, fieldUpdateContext);
  };

  const changeEndTime = (value: string): void => {
    updateTimeField("endTime", value, fieldUpdateContext);
  };

  const changeStartDate = (value: CalendarDate | "", fromCalendar = false): void => {
    updateDateField("startDate", value, fieldUpdateContext, fromCalendar);
  };

  const changeEndDate = (value: CalendarDate | "", fromCalendar = false): void => {
    updateDateField("endDate", value, fieldUpdateContext, fromCalendar);
  };

  const changeConferencingProvider = (value: string): void => {
    setDraft({ ...controller.draft, conferencingProviderId: value });
  };

  const peopleField = (
    <CreateEventPeopleField
      controller={controller}
      fieldId={fieldId}
      onPeopleSelect={onPeopleSelect}
      peopleQuery={peopleQuery}
      selectedPeopleIds={selectedPeopleIds}
      setDraft={setDraft}
      setPeopleQuery={setPeopleQuery}
      visiblePeopleItems={visiblePeopleItems}
    />
  );

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Runs after the controller's layout effect records the opener, so closing returns focus there.
  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const titleField = (
    <Field className={styles.field}>
      <Input
        id={fieldId("title")}
        aria-label={t("calendar.create_event.field.title")}
        placeholder={t("calendar.create_event.field.title")}
        ref={titleInputRef}
        value={controller.draft.title}
        size="l"
        invalid={fieldMessages.title !== null}
        aria-describedby={fieldErrorId(
          fieldMessages.title,
          fieldId("title-error")
        )}
        disabled={controller.isSubmitting}
        onValueChange={(value) => {
          setDraft({ ...controller.draft, title: value });
        }}
      />
      {fieldMessages.title === null ? null : (
        <FieldError id={fieldId("title-error")} role="status">
          {fieldMessages.title}
        </FieldError>
      )}
    </Field>
  );

  const calendarField = (
    <Field className={styles.field}>
      <Select
        id={fieldId("calendar")}
        aria-label={t("calendar.create_event.field.calendar")}
        emptyMessage={noOptionsLabel}
        options={calendarItems}
        value={controller.draft.calendarId ?? ""}
        size="xl"
        showSelectedCheck
        popupClassName={styles.calendarPopup}
        iconLeft={
          selectedCalendar === undefined ? undefined : (
            <CalendarColorDot colorFamily={selectedCalendar.colorFamily} />
          )
        }
        disabled={controller.isSubmitting}
        placeholder={t("calendar.create_event.placeholder.calendar")}
        onValueChange={(value) => {
          setDraft({ ...controller.draft, calendarId: value });
        }}
      />
    </Field>
  );

  const selectedEventType = eventTypeItems.find(
    (item) => item.value === controller.draft.eventTypeId
  );

  const eventTypeErrorId = fieldId("event-type-error");

  const eventTypeField =
    eventTypeItems.length === 0 ? null : (
      <Field className={styles.field}>
        <Select
          id={fieldId("event-type")}
          aria-label={t("calendar.create_event.field.event_type")}
          aria-describedby={fieldErrorId(
            fieldMessages.eventTypeId,
            eventTypeErrorId
          )}
          options={eventTypeItems}
          value={controller.draft.eventTypeId ?? ""}
          size="l"
          showSelectedCheck
          iconLeft={selectedEventType?.icon}
          disabled={controller.isSubmitting}
          placeholder={t("calendar.create_event.placeholder.event_type")}
          onValueChange={(value) => {
            setDraft({ ...controller.draft, eventTypeId: value });
          }}
        />
        {fieldMessages.eventTypeId === null ? null : (
          <FieldError id={eventTypeErrorId} role="status">
            {fieldMessages.eventTypeId}
          </FieldError>
        )}
      </Field>
    );

  const calendarRows = (
    <>
      <div className={clsx(styles.timeRow, styles.groupStart)}>
        <TimeField
          id={fieldId("start-time")}
          label={t("calendar.create_event.field.start_time")}
          placeholder={
            isReminder
              ? t("calendar.create_event.placeholder.start")
              : undefined
          }
          value={controller.draft.startTime ?? ""}
          disabled={controller.isSubmitting || controller.draft.allDay}
          className={styles.rowField}
          onChange={changeStartTime}
        />
        <ArrowRightIcon aria-hidden="true" className={styles.rowArrow} />
        <TimeField
          id={fieldId("end-time")}
          label={t("calendar.create_event.field.end_time")}
          placeholder={
            isReminder ? t("calendar.create_event.placeholder.end") : undefined
          }
          value={controller.draft.endTime ?? ""}
          invalid={fieldMessages.endTime !== null}
          errorId={fieldErrorId(
            fieldMessages.endTime,
            fieldId("end-time-error")
          )}
          errorMessage={fieldMessages.endTime}
          disabled={controller.isSubmitting || controller.draft.allDay}
          className={styles.rowField}
          onChange={changeEndTime}
        />
        <Toggle
          checked={controller.draft.allDay}
          disabled={controller.isSubmitting}
          label={t("calendar.create_event.all_day")}
          size="m"
          type="toggle-first"
          onCheckedChange={onAllDayChange}
        />
      </div>

      <div className={styles.dateRow}>
        <DateField
          id={fieldId("start-date")}
          label={t("calendar.create_event.field.start_date")}
          value={controller.draft.startDate}
          disabled={controller.isSubmitting}
          className={styles.rowField}
          onChange={changeStartDate}
        />
        <ArrowRightIcon aria-hidden="true" className={styles.rowArrow} />
        <DateField
          id={fieldId("end-date")}
          label={t("calendar.create_event.field.end_date")}
          placeholder={t("calendar.create_event.field.end_date")}
          value={displayedEndDate}
          invalid={fieldMessages.endDate !== null}
          errorId={fieldErrorId(
            fieldMessages.endDate,
            fieldId("end-date-error")
          )}
          errorMessage={fieldMessages.endDate}
          disabled={controller.isSubmitting}
          defaultMonthDate={controller.draft.startDate}
          clearable
          className={styles.rowField}
          onChange={changeEndDate}
        />
        {/* Always rendered to hold the four columns; as in the design, empty until the dates span
            a day. */}
        <span className={styles.dayCount}>
          {dayCount > 0 && !isReminder
            ? t("calendar.create_event.dayCount", { count: dayCount })
            : null}
        </span>
      </div>
    </>
  );

  const repeatField = (
    <Field
      className={clsx(
        styles.field,
        styles.groupStart,
        repeatEditing && styles.dimmed
      )}
    >
      <Select
        ref={repeatAnchorRef}
        id={fieldId("repeat")}
        aria-label={t("calendar.create_event.field.repeat")}
        options={repeatItems}
        value={repeatPreset}
        size="xl"
        showSelectedCheck
        iconLeft={<RefreshCwIcon aria-hidden="true" />}
        disabled={controller.isSubmitting}
        placeholder={t("calendar.create_event.repeat.none")}
        onValueChange={onRepeatPresetChange}
        onReselect={onRepeatPresetChange}
        aria-describedby={
          repeatHint === undefined ? undefined : fieldId("repeat-hint")
        }
      />
      {repeatHint === undefined ? null : (
        <p id={fieldId("repeat-hint")} className={styles.repeatHint}>
          {repeatHint}
        </p>
      )}
      {fieldMessages.recurrenceRule === null ? null : (
        <FieldError id={fieldId("repeat-error")} role="status">
          {fieldMessages.recurrenceRule}
        </FieldError>
      )}
    </Field>
  );

  const timeZoneField = (
    <Field className={styles.field}>
      <Input
        id={fieldId("timezone")}
        aria-label={timeZoneFieldLabel}
        value={timeZoneLabel}
        size="l"
        readOnly
        iconLeft={<Globe2Icon aria-hidden="true" />}
      />
    </Field>
  );

  return (
    <ScrollRegion className={styles.body}>
      <FieldGroup className={styles.fields}>
        {/* The other fields take no input while the repeat editor is open, as in the design. */}
        <div
          className={clsx(styles.fields, repeatEditing && styles.dimmed)}
          inert={repeatEditing}
        >
          {titleField}
          {isReminder ? (
            <ReminderUrlField
              draft={controller.draft}
              disabled={controller.isSubmitting}
              fieldId={fieldId}
              setDraft={setDraft}
            />
          ) : null}
          {isReminder ? null : calendarField}
          {isReminder ? null : eventTypeField}
          {calendarRows}
          {isReminder ? (
            <div className={clsx(styles.fields, styles.groupStart)}>
              <NotifyFields
                blocked={notifyBlocked}
                disabled={controller.isSubmitting}
                fieldId={fieldId}
                leadItems={notifyLeadItems}
                notify={controller.draft.notify}
                onChange={onNotifyChange}
                onLeadChange={onNotifyLeadChange}
              />
            </div>
          ) : null}
        </div>

        {repeatField}
        {repeatEditor}

        <div
          className={clsx(styles.fields, repeatEditing && styles.dimmed)}
          inert={repeatEditing}
        >
          {timeZoneField}
          {isReminder ? null : (
            <>
              {peopleField}

          {/* Without providers there is nothing to pick; a draft's existing conferencingProviderId is left as is. */}
          {conferencingItems.length === 0 ? null : (
            <Field className={styles.field}>
              <Select
                id={fieldId("conferencing")}
                aria-label={t("calendar.create_event.field.conferencing")}
                emptyMessage={noOptionsLabel}
                options={conferencingItems}
                value={controller.draft.conferencingProviderId ?? ""}
                size="xl"
                showSelectedCheck
                iconLeft={<Link2Icon aria-hidden="true" />}
                disabled={controller.isSubmitting}
                placeholder={t("calendar.create_event.placeholder.conferencing")}
                onValueChange={changeConferencingProvider}
              />
            </Field>
          )}

          <Separator decorative className={styles.separator} />

          <CreateEventAdditionalFields
            controller={controller}
            fieldId={fieldId}
            onLocationSelection={onLocationSelection}
            locationEditorOpen={locationEditorOpen}
            locationItems={locationItems}
            locationQuery={locationQuery}
            setDraft={setDraft}
            setLocationEditorOpen={setLocationEditorOpen}
            updateLocation={updateLocation}
          />
            </>
          )}

          {firstError === null ? null : (
            <FieldError id={fieldId("form-error")}>{firstError}</FieldError>
          )}
          {submitErrorContent}
          {renderFields?.(controller.draft)}
        </div>
      </FieldGroup>
    </ScrollRegion>
  );
};

const CreateEventForm = ({
  canSubmit,
  formId,
  onSubmit,
  discardOpen,
  onKindChange,
  renderFooter,
  renderHeader,
  ...fieldProps
}: CreateEventFormProps) => {
  const { controller, fieldId, kind } = fieldProps;

  return (
    <>
      <FormHeader
        kind={kind}
        onClose={() => {
          void controller.requestCancel();
        }}
        onKindChange={onKindChange}
        renderHeader={renderHeader}
        titleId={fieldId("title-heading")}
      />
      <form
        id={formId}
        className={styles.form}
        onSubmit={onSubmit}
        inert={discardOpen}
      >
        <CreateEventFields {...fieldProps} />
      </form>
      <FormFooter
        formId={formId}
        isSubmitting={controller.isSubmitting}
        canSubmit={canSubmit}
        onCancel={() => {
          void controller.requestCancel();
        }}
        renderFooter={renderFooter}
      />
    </>
  );
};

interface CreateEventPanelOverlayProps {
  readonly className?: string;
  readonly content: ReactNode;
  readonly controller: ReturnType<typeof useCreateEventController>;
  readonly handleNativeSelectChange: (event: Event) => void;
  readonly handleShellOpenChange: (nextOpen: boolean) => void;
}

const CreateEventPanelOverlay = ({
  className,
  content,
  controller,
  handleNativeSelectChange,
  handleShellOpenChange,
}: CreateEventPanelOverlayProps) => {
  const { direction, t } = useCalendarLocalization();
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useNativeSelectChange(root, handleNativeSelectChange);
  useEscapeClose(root, handleShellOpenChange);
  useOutsidePressGuard(root, controller.isDirty, () => {
    void controller.requestCancel();
  });

  if (!controller.isOpen) {
    return null;
  }

  return (
    <section
      ref={setRoot}
      aria-label={t("calendar.create_event.create_dialog")}
      dir={direction}
      className={clsx(styles.panel, className)}
    >
      {content}
      {root === null ? null : (
        <DiscardDialog
          container={root}
          open={controller.isDiscardDialogOpen}
          onClose={() => {
            controller.dismissDiscard();
          }}
          onConfirm={() => {
            controller.confirmDiscard();
          }}
        />
      )}
    </section>
  );
};

const CreateEventPanelContent = (props: CreateEventPanelProps) => {
  const view = useCreateEventPanelContent(props);

  const {
    kind,
    notifyBlocked,
    notifyLeadItems,
    onKindChange,
    onNotifyChange,
    onNotifyLeadChange,
    cancelCustomRepeat,
    changeCustomRepeat,
    closeCustomRepeat,
    calendars,
    canSubmit,
    className,
    conferencingItems,
    controller,
    customRepeat,
    customRepeatOpen,
    displayedEndDate,
    fieldId,
    fieldMessages,
    firstError,
    formId,
    handleNativeSelectChange,
    handleShellOpenChange,
    idPrefix,
    locationEditorOpen,
    locationItems,
    locationQuery,
    noOptionsLabel,
    onAllDayChange,
    onLocationSelection,
    onPeopleSelect,
    onRepeatPresetChange,
    onSubmit,
    peopleQuery,
    repeatAnchorRef,
    repeatHint,
    repeatItems,
    repeatPreset,
    renderError,
    renderFields,
    renderFooter,
    renderHeader,
    selectedCalendar,
    selectedPeopleIds,
    setDraft,
    setLocationEditorOpen,
    setPeopleQuery,
    submitError,
    timeZoneFieldLabel,
    timeZoneLabel,
    updateLocation,
    visiblePeopleItems,
  } = view;

  const { t } = useCalendarLocalization();


  const calendarItems = useMemo(
    () =>
      calendars.map((calendar) => ({
        icon: (
          <CalendarColorDot
            colorFamily={calendar.colorFamily}
            testId={`calendar-color-${calendar.id}`}
          />
        ),
        label: (
          <>
            <span>{t("calendar.create_event.calendarField")}</span>{" "}
            {calendar.name}
          </>
        ),
        value: calendar.id,
      })),
    [calendars, t]
  );

  const eventTypeItems = useMemo(
    () =>
      (props.eventTypes ?? []).map((eventType) => ({
        icon:
          eventType.colorFamily === undefined ? undefined : (
            <CalendarColorDot colorFamily={eventType.colorFamily} />
          ),
        label: eventType.label,
        value: eventType.id,
      })),
    [props.eventTypes]
  );

  const submitErrorContent = (
    <SubmitError
      error={submitError}
      errorId={fieldId("submit-error")}
      renderError={renderError}
    />
  );

  const changeRepeatInterval = (value: string): void => {
    const parsed = Math.trunc(Number(value));

    changeCustomRepeat((current) => ({
      ...current,
      interval: Number.isFinite(parsed)
        ? Math.min(MAX_REPEAT_INTERVAL, Math.max(1, parsed))
        : 1,
    }));
  };

  const changeRepeatUnit = (unit: RepeatUnit): void => {
    changeCustomRepeat((current) => ({ ...current, unit }));
  };

  const changeRepeatEndKind = (endKind: RepeatEndKind): void => {
    changeCustomRepeat((current) => ({
      ...current,
      endDate:
        endKind === "on" && current.endDate === null
          ? addCalendarDays(controller.draft.startDate, 1)
          : current.endDate,
      endKind,
    }));
  };

  const changeRepeatEndDate = (value: CalendarDate | ""): void => {
    changeCustomRepeat((current) => ({
      ...current,
      endDate: value === "" ? null : value,
    }));
  };

  const toggleRepeatWeekday = (weekday: Weekday): void => {
    changeCustomRepeat((current) => ({
      ...current,
      byDay: current.byDay.includes(weekday)
        ? current.byDay.filter((candidate) => candidate !== weekday)
        : [...current.byDay, weekday],
    }));
  };

  const repeatEditor = customRepeatOpen ? (
    <CustomRepeatView
      idPrefix={idPrefix}
      repeatAnchorRef={repeatAnchorRef}
      state={customRepeat}
      onChangeInterval={changeRepeatInterval}
      onChangeUnit={changeRepeatUnit}
      onChangeEndKind={changeRepeatEndKind}
      onChangeEndDate={changeRepeatEndDate}
      onToggleWeekday={toggleRepeatWeekday}
      onCancel={cancelCustomRepeat}
      onApply={closeCustomRepeat}
    />
  ) : null;

  const formContent = (
    <CreateEventForm
      calendarItems={calendarItems}
      canSubmit={canSubmit && !customRepeatOpen}
      conferencingItems={conferencingItems}
      controller={controller}
      discardOpen={controller.isDiscardDialogOpen}
      displayedEndDate={displayedEndDate}
      eventTypeItems={eventTypeItems}
      fieldId={fieldId}
      fieldMessages={fieldMessages}
      firstError={firstError ?? null}
      formId={formId}
      kind={kind}
      notifyBlocked={notifyBlocked}
      notifyLeadItems={notifyLeadItems}
      onKindChange={onKindChange}
      onNotifyChange={onNotifyChange}
      onNotifyLeadChange={onNotifyLeadChange}
      onAllDayChange={onAllDayChange}
      onLocationSelection={onLocationSelection}
      onPeopleSelect={onPeopleSelect}
      onRepeatPresetChange={onRepeatPresetChange}
      onSubmit={onSubmit}
      locationEditorOpen={locationEditorOpen}
      locationItems={locationItems}
      locationQuery={locationQuery}
      noOptionsLabel={noOptionsLabel}
      peopleQuery={peopleQuery}
      renderFields={renderFields}
      renderFooter={renderFooter}
      renderHeader={renderHeader}
      repeatAnchorRef={repeatAnchorRef}
      repeatEditing={customRepeatOpen}
      repeatEditor={repeatEditor}
      repeatHint={customRepeatOpen ? undefined : repeatHint}
      repeatItems={repeatItems}
      repeatPreset={repeatPreset}
      selectedCalendar={selectedCalendar}
      selectedPeopleIds={selectedPeopleIds}
      setPeopleQuery={setPeopleQuery}
      setDraft={setDraft}
      setLocationEditorOpen={setLocationEditorOpen}
      submitErrorContent={submitErrorContent}
      timeZoneFieldLabel={timeZoneFieldLabel}
      timeZoneLabel={timeZoneLabel}
      updateLocation={updateLocation}
      visiblePeopleItems={visiblePeopleItems}
    />
  );

  return (
    <>
      <CancelHandle {...props} requestCancel={controller.requestCancel} />
      <CreateEventPanelOverlay
        className={className}
        content={formContent}
        controller={controller}
        handleNativeSelectChange={handleNativeSelectChange}
        handleShellOpenChange={handleShellOpenChange}
      />
    </>
  );
};

export const CreateEventPanel = (props: CreateEventPanelProps) => (
  <CalendarScope {...props}>
    <CreateEventPanelContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);
