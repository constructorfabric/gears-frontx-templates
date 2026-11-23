import {
  createElement,
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";
import type * as React from "react";
import { UsersIcon } from "lucide-react";

import { validateCreateEventDraft } from "../../core/create-event";
import type { CalendarDate, CreateEventDraft } from "../../core/model";
import { addCalendarDays, weekdayIndex } from "../../core/temporal";
import { parseLocalTime } from "../../core/validation";
import { useCalendarContext } from "../../i18n/calendar-context";
import { useCalendarLocalization } from "../../i18n/calendar-localization";
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import { useCreateEventController } from "../../react/controllers/use-create-event-controller";
import type { CalendarResourceOption } from "../../react/controllers/use-create-event-controller";
import type { ComboboxOption } from "../primitives/combobox/combobox";
import {
  formatTimeZone,
  parseCustomRepeatState,
  formatRepeatHint,
  serializeCustomRepeat,
  REPEAT_PRESET,
  REPEAT_UNIT,
  WEEKDAY_ORDER,
} from "./create-event-format";
import type {
  CustomRepeatState,
  RepeatPreset,
  RepeatUnit,
} from "./create-event-format";
import type {
  CalendarLocationLevel,
  CalendarLocationNode,
  CreateEventKind,
  CreateEventPanelProps,
  ResourceItem,
} from "./create-event-panel";
import {
  createEventErrorMessages,
  firstCreateEventError,
} from "./create-event-validation";

const DEFAULT_START_TIME = parseLocalTime("09:00");
const DEFAULT_END_TIME = parseLocalTime("10:00");
const DEFAULT_NOTIFY_LEAD_MINUTES = 10;
const NOTIFY_LEAD_MINUTES = [5, 10, 15, 30, 60];

const notifyLeadOptions = (t: CalendarTranslate): readonly ResourceItem[] => [
  { label: t("calendar.create_event.notify.lead_now"), value: "0" },
  ...NOTIFY_LEAD_MINUTES.map((minutes) => ({
    label: t("calendar.create_event.notify.lead_minutes", { count: minutes }),
    value: String(minutes),
  })),
];

// Denied, missing and dismissed prompts all leave the reminder without a notification.
const notifyPermissionGranted = async (): Promise<boolean> => {
  if (typeof globalThis.Notification === "undefined") {
    return false;
  }

  if (globalThis.Notification.permission === "granted") {
    return true;
  }

  if (globalThis.Notification.permission === "denied") {
    return false;
  }

  return (await globalThis.Notification.requestPermission()) === "granted";
};

type TimedTimes = Pick<CreateEventDraft, "endDate" | "endTime" | "startTime">;

const rememberTimedTimes = (
  draft: CreateEventDraft,
  timedTimesRef: RefObject<TimedTimes | null>
): void => {
  if (!draft.allDay) {
    timedTimesRef.current = {
      endDate: draft.endDate,
      endTime: draft.endTime,
      startTime: draft.startTime,
    };
  }
};

const filteredResources = (
  resources: readonly CalendarResourceOption[],
  query: string
): readonly CalendarResourceOption[] => {
  if (query === "") {
    return resources;
  }

  const normalizedQuery = query.toLocaleLowerCase();

  return resources.filter((resource) =>
    resource.label.toLocaleLowerCase().includes(normalizedQuery)
  );
};

const resourceLabel = (resource: CalendarResourceOption): ReactNode =>
  resource.kind === "group"
    ? createElement(
        Fragment,
        null,
        createElement(UsersIcon, { "aria-hidden": "true" }),
        resource.label
      )
    : resource.label;

const selectedPeopleForDraft = (
  attendeeIds: readonly string[] | undefined,
  people: readonly CalendarResourceOption[]
): readonly string[] | undefined => {
  if (attendeeIds === undefined) {
    return undefined;
  }

  const validPeopleIds = new Set(people.map((person) => person.id));
  return attendeeIds.filter((id) => validPeopleIds.has(id));
};

const resourcesToItems = (
  resources: readonly CalendarResourceOption[]
): readonly ResourceItem[] =>
  resources.map((resource) => ({
    label: resourceLabel(resource),
    value: resource.id,
  }));

const locationPathTo = (
  nodes: readonly CalendarLocationNode[],
  leafId: string | null | undefined
): readonly string[] => {
  for (const node of nodes) {
    if (node.id === leafId) {
      return [node.id];
    }

    const childPath = locationPathTo(node.children ?? [], leafId);
    if (childPath.length > 0) {
      return [node.id, ...childPath];
    }
  }

  return [];
};

const resolveLocationLevels = (
  nodes: readonly CalendarLocationNode[],
  path: readonly string[]
): readonly CalendarLocationLevel[] => {
  const levels: CalendarLocationLevel[] = [];
  let options = nodes;

  for (let depth = 0; options.length > 0; depth++) {
    const selectedId = path[depth];
    levels.push({ options, selectedId });
    options = options.find((node) => node.id === selectedId)?.children ?? [];
  }

  return levels;
};

const repeatOptions = (t: CalendarTranslate): readonly ResourceItem[] => [
  {
    label: t("calendar.create_event.repeat.none"),
    value: REPEAT_PRESET.none,
  },
  {
    label: t("calendar.create_event.repeat.daily"),
    value: REPEAT_PRESET.daily,
  },
  {
    label: t("calendar.create_event.repeat.weekly"),
    value: REPEAT_PRESET.weekly,
  },
  {
    label: t("calendar.create_event.repeat.biweekly"),
    value: REPEAT_PRESET.biweekly,
  },
  {
    dividerAfter: true,
    label: t("calendar.create_event.repeat.monthly"),
    value: REPEAT_PRESET.monthly,
  },
  {
    label: t("calendar.create_event.repeat.custom"),
    value: REPEAT_PRESET.custom,
  },
];

const resolveRepeatPresetValue = (value: string): RepeatPreset => {
  if (value === REPEAT_PRESET.daily) {
    return REPEAT_PRESET.daily;
  }
  if (value === REPEAT_PRESET.weekly) {
    return REPEAT_PRESET.weekly;
  }
  if (value === REPEAT_PRESET.biweekly) {
    return REPEAT_PRESET.biweekly;
  }
  if (value === REPEAT_PRESET.monthly) {
    return REPEAT_PRESET.monthly;
  }
  if (value === REPEAT_PRESET.custom) {
    return REPEAT_PRESET.custom;
  }
  return REPEAT_PRESET.none;
};

export const resolveRepeatUnit = (value: string): RepeatUnit => {
  if (value === REPEAT_UNIT.day) {
    return REPEAT_UNIT.day;
  }
  if (value === REPEAT_UNIT.month) {
    return REPEAT_UNIT.month;
  }
  return REPEAT_UNIT.week;
};

const recurrenceForPreset = (preset: RepeatPreset): string | null => {
  if (preset === REPEAT_PRESET.daily) {
    return "FREQ=DAILY";
  }
  if (preset === REPEAT_PRESET.weekly) {
    return "FREQ=WEEKLY";
  }
  if (preset === REPEAT_PRESET.biweekly) {
    return "FREQ=WEEKLY;INTERVAL=2";
  }
  if (preset === REPEAT_PRESET.monthly) {
    return "FREQ=MONTHLY";
  }
  return null;
};

const resolveRepeatPreset = (rule: string | null | undefined): RepeatPreset =>
  Object.values(REPEAT_PRESET).find(
    (preset) =>
      preset !== REPEAT_PRESET.custom &&
      recurrenceForPreset(preset) === (rule === "" ? null : (rule ?? null))
  ) ?? REPEAT_PRESET.custom;

const nextDraftForAllDayChange = (
  draft: CreateEventDraft,
  timedTimes: Pick<CreateEventDraft, "endDate" | "endTime" | "startTime">,
  allDay: boolean
): CreateEventDraft => {
  if (allDay) {
    const endDate =
      draft.endDate !== null && draft.endDate > draft.startDate
        ? draft.endDate
        : addCalendarDays(draft.startDate, 1);

    return {
      ...draft,
      allDay: true,
      endDate,
      endTime: null,
      startTime: null,
    };
  }

  return {
    ...draft,
    allDay: false,
    endDate: timedTimes.endDate,
    endTime: draft.endTime ?? timedTimes.endTime ?? DEFAULT_END_TIME,
    startTime: draft.startTime ?? timedTimes.startTime ?? DEFAULT_START_TIME,
  };
};

const toggleAttendee = (
  selectedIds: readonly string[],
  optionValue: string
): readonly string[] =>
  selectedIds.includes(optionValue)
    ? selectedIds.filter((id) => id !== optionValue)
    : [...selectedIds, optionValue];

interface ShellCloseActions {
  readonly dismissDiscard: () => void;
  readonly closeCustomRepeat: () => void;
  readonly requestCancel: () => Promise<boolean>;
}

const closeShell = (
  nextOpen: boolean,
  discardOpen: boolean,
  customRepeatOpen: boolean,
  actions: ShellCloseActions
): void => {
  if (nextOpen) {
    return;
  }

  if (discardOpen) {
    actions.dismissDiscard();
    return;
  }

  if (customRepeatOpen) {
    actions.closeCustomRepeat();
    return;
  }

  void actions.requestCancel();
};

export const useCreateEventPanelContent = (
  props: CreateEventPanelProps
) => {
  const { direction, locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const {
    calendars,
    people,
    locations,
    locationHierarchy,
    conferencingProviders,
    className,
    renderHeader,
    renderFields,
    renderFooter,
    renderError,
    kind = "event",
    onKindChange,
  } = props;

  // Reminders have no event-type field, so the host's types do not apply to them.
  const eventTypeIds =
    kind === "event"
      ? props.eventTypes?.map((eventType) => eventType.id)
      : undefined;
  const controller = useCreateEventController({
    ...props,
    eventTypeIds,
    timeZone,
  });

  const idPrefix = useId();

  const repeatAnchorRef = useRef<HTMLButtonElement | null>(null);

  const [peopleQuery, setPeopleQuery] = useState("");

  const [notifyBlocked, setNotifyBlocked] = useState(false);

  const [locationEditorOpen, setLocationEditorOpen] = useState(() =>
    Boolean(controller.draft.location)
  );

  const draftLocation = controller.draft.location ?? null;

  const [locationPathState, setLocationPathState] = useState(() => ({
    location: draftLocation,
    path: locationPathTo(locationHierarchy ?? [], draftLocation),
  }));

  // A host can set the location after the form opens. The stored path only applies to the
  // location it was built for; otherwise the path is read from the draft again.
  const locationPath =
    locationPathState.location === draftLocation
      ? locationPathState.path
      : locationPathTo(locationHierarchy ?? [], draftLocation);

  const [repeatPreset, setRepeatPreset] = useState<RepeatPreset>(() =>
    resolveRepeatPreset(controller.draft.recurrenceRule)
  );

  const [customRepeat, setCustomRepeat] = useState<CustomRepeatState>(() =>
    parseCustomRepeatState(controller.draft.recurrenceRule)
  );

  const [customRepeatOpen, setCustomRepeatOpen] = useState(false);

  // The editor's rule and preset as they were when it opened, for Cancel.
  const customRepeatAtOpen = useRef<{
    custom: CustomRepeatState;
    preset: RepeatPreset;
    recurrenceRule: CreateEventDraft["recurrenceRule"];
  } | null>(null);

  const timedTimesRef = useRef<TimedTimes>({
    endDate: controller.draft.endDate,
    endTime: controller.draft.endTime,
    startTime: controller.draft.startTime,
  });

  // The notify prompt is awaited, so its write needs the draft as it is when the answer arrives.
  const draftRef = useRef(controller.draft);

  useEffect(() => {
    draftRef.current = controller.draft;
  }, [controller.draft]);

  const fieldId = useCallback(
    (name: string): string => `${idPrefix}-${name}`,
    [idPrefix]
  );

  const draftValidation = validateCreateEventDraft(controller.draft, {
    eventTypeIds,
    eventTypeRequired: props.eventTypeRequired,
  });
  // The end date message follows the draft, the same rule that disables Save, so a before-start
  // end shows as soon as it is entered instead of only after a submit attempt.
  const fieldMessages = createEventErrorMessages(
    { ...controller.errors, endDate: draftValidation.errors.endDate },
    t
  );
  const firstError = firstCreateEventError(controller.errors, t);
  const canSubmit = draftValidation.valid;
  const timeZoneLabel = formatTimeZone(
    controller.draft.timeZone,
    locale,
    t,
    props.now
  );
  const noOptionsLabel = t("calendar.create_event.no_options");
  const timeZoneFieldLabel = t("calendar.create_event.field.timezone");

  const displayedEndDate: CalendarDate | "" =
    controller.draft.endDate === null ||
    controller.draft.endDate === controller.draft.startDate
      ? ""
      : controller.draft.endDate;

  const deferredPeopleQuery = useDeferredValue(peopleQuery);

  const visiblePeopleItems = useMemo(
    () => resourcesToItems(filteredResources(people, deferredPeopleQuery)),
    [deferredPeopleQuery, people]
  );

  const selectedPeopleIds = selectedPeopleForDraft(
    controller.draft.attendeeIds,
    people
  );
  const locationQuery = controller.draft.location ?? "";

  const locationItems = useMemo(() => resourcesToItems(locations), [locations]);

  const locationLevels =
    locationHierarchy === undefined
      ? undefined
      : resolveLocationLevels(locationHierarchy, locationPath);

  const conferencingItems = useMemo(
    () => resourcesToItems(conferencingProviders),
    [conferencingProviders]
  );

  const selectedCalendar = calendars.find(
    (calendar) => calendar.id === controller.draft.calendarId
  );

  const repeatItems = useMemo(() => repeatOptions(t), [t]);

  const repeatHint = formatRepeatHint(
    controller.draft.recurrenceRule,
    controller.draft.startDate,
    t,
    locale
  );

  const formId = fieldId("form");

  const setDraft = useCallback(
    (nextDraft: CreateEventDraft): void => {
      rememberTimedTimes(nextDraft, timedTimesRef);
      controller.setDraft(nextDraft);
    },
    [controller]
  );

  const updateLocation = (value: string): void => {
    setDraft({ ...controller.draft, location: value || null });
  };

  const onSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void controller.submit();
  };

  const onAllDayChange = (allDay: boolean): void => {
    setDraft(
      nextDraftForAllDayChange(
        controller.draft,
        timedTimesRef.current ?? {
          endDate: controller.draft.endDate,
          endTime: controller.draft.endTime,
          startTime: controller.draft.startTime,
        },
        allDay
      )
    );
  };

  const changeCustomRepeat = (
    update: (current: CustomRepeatState) => CustomRepeatState
  ): void => {
    const next = update(customRepeat);

    setCustomRepeat(next);
    setDraft({
      ...controller.draft,
      recurrenceRule: serializeCustomRepeat(next),
    });
  };

  const openCustomRepeat = (): void => {
    const opened =
      customRepeat.byDay.length > 0
        ? customRepeat
        : {
            ...customRepeat,
            byDay: [
              WEEKDAY_ORDER[weekdayIndex(controller.draft.startDate)] ??
                "monday",
            ],
          };

    customRepeatAtOpen.current = {
      custom: opened,
      preset: repeatPreset,
      recurrenceRule: controller.draft.recurrenceRule,
    };
    setCustomRepeat(opened);
    setDraft({
      ...controller.draft,
      recurrenceRule: serializeCustomRepeat(opened),
    });
    setCustomRepeatOpen(true);
  };

  const onRepeatPresetChange = (value: string): void => {
    const nextPreset = resolveRepeatPresetValue(value);
    setRepeatPreset(nextPreset);

    if (nextPreset === REPEAT_PRESET.custom) {
      openCustomRepeat();
      return;
    }

    setCustomRepeatOpen(false);
    setDraft({
      ...controller.draft,
      recurrenceRule: recurrenceForPreset(nextPreset),
    });
  };

  const handleNativeSelectChange = (event: Event): void => {
    const { target } = event;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    if (target.id === fieldId("repeat")) {
      onRepeatPresetChange(target.value);
      return;
    }

    if (target.id === fieldId("repeat-unit")) {
      changeCustomRepeat((current) => ({
        ...current,
        unit: resolveRepeatUnit(target.value),
      }));
    }
  };

  const closeCustomRepeat = (): void => {
    setCustomRepeatOpen(false);
  };

  const cancelCustomRepeat = (): void => {
    const atOpen = customRepeatAtOpen.current;

    if (atOpen !== null) {
      setCustomRepeat(atOpen.custom);
      setRepeatPreset(atOpen.preset);
      setDraft({
        ...controller.draft,
        recurrenceRule: atOpen.recurrenceRule,
      });
    }

    setCustomRepeatOpen(false);
  };

  const onLocationLevelSelect = (level: number, id: string): void => {
    const node = locationLevels?.[level]?.options.find(
      (option) => option.id === id
    );
    if (node === undefined) {
      return;
    }

    const location = (node.children ?? []).length > 0 ? "" : id;
    setLocationPathState({
      location: location || null,
      path: [...locationPath.slice(0, level), id],
    });
    updateLocation(location);
  };

  const onLocationSelection = (value: string): void => {
    const location = locations.find((candidate) => candidate.id === value);

    if (location !== undefined) {
      updateLocation(location.label);
    }
  };

  // Each kind's hidden fields must not survive into the other kind's draft.
  const onKindChangeWithReset = (nextKind: CreateEventKind): void => {
    if (nextKind === "event") {
      setDraft({ ...controller.draft, notify: null, url: null });
    } else {
      setDraft({
        ...controller.draft,
        attendeeIds: [],
        calendarId: null,
        conferencingProviderId: null,
        description: null,
        eventTypeId: null,
        location: null,
      });
    }

    onKindChange?.(nextKind);
  };

  const notifyLeadItems = useMemo(() => notifyLeadOptions(t), [t]);

  const onNotifyChange = async (enabled: boolean): Promise<void> => {
    setNotifyBlocked(false);

    if (!enabled) {
      setDraft({ ...controller.draft, notify: null });
      return;
    }

    if (await notifyPermissionGranted()) {
      setDraft({
        ...draftRef.current,
        notify: { leadMinutes: DEFAULT_NOTIFY_LEAD_MINUTES },
      });
      return;
    }

    setNotifyBlocked(true);
  };

  const onNotifyLeadChange = (value: string): void => {
    setDraft({ ...controller.draft, notify: { leadMinutes: Number(value) } });
  };

  const handleShellOpenChange = (nextOpen: boolean): void => {
    closeShell(nextOpen, controller.isDiscardDialogOpen, customRepeatOpen, {
      closeCustomRepeat,
      dismissDiscard: controller.dismissDiscard,
      requestCancel: controller.requestCancel,
    });
  };

  const onPeopleSelect = (option: ComboboxOption): void => {
    const selectedIds = selectedPeopleIds ?? [];
    const attendeeIds = toggleAttendee(selectedIds, option.value);

    setDraft({
      ...controller.draft,
      attendeeIds,
      optionalAttendeeIds: controller.draft.optionalAttendeeIds?.filter((id) =>
        attendeeIds.includes(id)
      ),
    });
  };

  return {
    calendars,
    canSubmit,
    cancelCustomRepeat,
    changeCustomRepeat,
    className,
    closeCustomRepeat,
    conferencingItems,
    controller: { ...controller, locationLevels, onLocationLevelSelect },
    customRepeat,
    customRepeatOpen,
    direction,
    displayedEndDate,
    fieldId,
    fieldMessages,
    firstError,
    formId,
    handleNativeSelectChange,
    handleShellOpenChange,
    idPrefix,
    kind,
    locale,
    locationEditorOpen,
    locationItems,
    locationQuery,
    noOptionsLabel,
    onAllDayChange,
    notifyBlocked,
    notifyLeadItems,
    onKindChange: onKindChange === undefined ? undefined : onKindChangeWithReset,
    onLocationSelection,
    onNotifyChange,
    onNotifyLeadChange,
    onPeopleSelect,
    onRepeatPresetChange,
    onSubmit,
    peopleQuery,
    renderError,
    renderFields,
    renderFooter,
    renderHeader,
    repeatAnchorRef,
    repeatHint,
    repeatItems,
    repeatPreset,
    selectedCalendar,
    selectedPeopleIds,
    setCustomRepeatOpen,
    setDraft,
    setLocationEditorOpen,
    setPeopleQuery,
    submitError: controller.submitError,
    t,
    timeZoneFieldLabel,
    timeZoneLabel,
    updateLocation,
    visiblePeopleItems,
  };
};
