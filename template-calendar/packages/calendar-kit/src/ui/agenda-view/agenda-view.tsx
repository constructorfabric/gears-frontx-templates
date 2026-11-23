"use client";

import { clsx } from "clsx";
import {
  CircleAlertIcon,
  TimerIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import {
  createContext,
  Fragment,
  memo,
  useContext,
  useId,
  useMemo,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import {
  formatCalendarList,
  formatDuration,
  formatRelativeHint,
} from "../../core/format";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarEventRenderContext,
  UtcInstant,
} from "../../core/model";
import { fromViewerDateTime } from "../../core/temporal";
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
import { useAgendaViewController } from "../../react/controllers/use-agenda-view-controller";
import { isSafeHttpUrl } from "../../react/controllers/use-event-detail-panel-controller";
import type { CalendarEventRenderer } from "../../react/slots";
import { Avatar, AvatarOverflow } from "../primitives/avatar/avatar";
import { Button } from "../primitives/button/button";
import {
  buildLiveAnnouncement,
  formatAgendaDate,
  formatAgendaTime,
  getRelativeDayLabel,
} from "./agenda-format";
import { buildAgendaRenderContext, isRowAvailable } from "./agenda-rows";
import type {
  AgendaDayGroup as AgendaDayGroupData,
  AgendaEventRow,
} from "./agenda-rows";

import styles from "./agenda-view.module.css";

export interface AgendaViewProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** First day of the 30-day window. */
  readonly date: CalendarDate;
  /** Events to list. Days without events still render. */
  readonly events: readonly CalendarEvent[];
  /** Reference instant for the now line, past rows and the live Join. Default: the wall clock. */
  readonly now?: UtcInstant;
  /** Controlled selected event. */
  readonly selectedEventId?: string | null;
  /** Initial selected event when uncontrolled. */
  readonly defaultSelectedEventId?: string | null;
  /** Called when an event is selected or deselected. */
  readonly onSelectedEventIdChange?: (eventId: string | null) => void;
  /** Replaces the body of an event row; the time gutter and colour bar stay. */
  readonly renderEvent?: CalendarEventRenderer;
  /** Replaces a day's heading. */
  readonly renderDayHeader?: (date: CalendarDate) => ReactNode;
  /** An available event was activated. `anchor` is the row element. */
  readonly onEventSelect?: (
    event: CalendarEvent,
    context: CalendarEventRenderContext,
    anchor?: HTMLElement
  ) => void;
}

interface AgendaDayGroupProps {
  readonly group: AgendaDayGroupData;
  readonly renderDayHeader?: (date: CalendarDate) => ReactNode;
  readonly todayDate: CalendarDate;
}

interface AgendaInteractionContextValue {
  readonly currentInstant: UtcInstant;
  readonly focusedRowIndex: number;
  readonly onFocusRow: (index: number) => void;
  readonly onRowKeyDown: (
    event: ReactKeyboardEvent,
    index: number,
    eventId: string
  ) => void;
  readonly onSelectRow: (eventId: string, anchor?: HTMLElement) => void;
  readonly renderEvent?: CalendarEventRenderer;
  readonly selectedEventId: string | null;
  readonly setRowRef: (index: number, element: HTMLElement | null) => void;
}

const AgendaInteractionContext =
  createContext<AgendaInteractionContextValue | null>(null);

const useAgendaInteraction = (): AgendaInteractionContextValue => {
  const value = useContext(AgendaInteractionContext);
  if (value === null) {
    throw new Error("AgendaEventButton must be rendered inside AgendaView");
  }

  return value;
};

const buildEventDescription = (
  row: AgendaEventRow,
  locale: string,
  t: CalendarTranslate
): string => {
  const parts = [
    ...(row.past ? [t("calendar.event.past")] : []),
    ...(isRowAvailable(row) ? [] : [t("calendar.event.unavailable")]),
  ];

  return formatCalendarList(locale, parts);
};

const buildRelativeHint = (
  row: AgendaEventRow,
  currentInstant: UtcInstant,
  locale: string,
  t: CalendarTranslate
): string | null => {
  if (row.kind !== "timed" || row.past) {
    return null;
  }

  if (row.now) {
    return t("calendar.agenda.now");
  }

  return t("calendar.agenda.startsIn", {
    duration: formatRelativeHint(row.start, currentInstant, locale),
  });
};

const AGENDA_AVATAR_LIMIT = 6;

const formatAgendaDuration = (
  start: UtcInstant,
  end: UtcInstant,
  locale: string
): string => formatDuration(start, end, locale).replaceAll(" ", " ");

interface AgendaEventContentProps {
  readonly relativeHint: string | null;
  readonly row: AgendaEventRow;
}

const AgendaEventContent = ({ relativeHint, row }: AgendaEventContentProps) => {
  const { locale, t } = useCalendarLocalization();

  const title =
    row.event.title.trim() !== ""
      ? row.event.title
      : t(
          row.event.access === "busy"
            ? "calendar.event.busy"
            : "calendar.event.type.default"
        );

  const isTimed = row.kind === "timed";
  const { organizer } = row.event;
  const attendees = row.event.attendees ?? [];
  const attendeeCount = attendees.length;
  const shownAttendees = attendees.slice(0, AGENDA_AVATAR_LIMIT);
  const hiddenAttendeeCount = attendeeCount - shownAttendees.length;

  return (
    <>
      <span className={styles.eventTitle}>{title}</span>
      <span className={styles.eventMetadata}>
        {isTimed && (
          <span className={styles.metadataRow} data-agenda-metadata="timing">
            <span className={styles.metadataGroup}>
              <TimerIcon aria-hidden="true" className={styles.metadataIcon} />
              <span>{formatAgendaDuration(row.start, row.end, locale)}</span>
            </span>
            {relativeHint !== null && (
              <span className={styles.relativeHint}>{relativeHint}</span>
            )}
          </span>
        )}
        {(organizer?.trim() ?? "") !== "" && (
          <span className={styles.metadataRow} data-agenda-metadata="organizer">
            <UserIcon aria-hidden="true" className={styles.metadataIcon} />
            <span>{organizer}</span>
          </span>
        )}
        {attendeeCount > 0 && (
          <span className={styles.metadataRow} data-agenda-metadata="attendees">
            <UsersIcon aria-hidden="true" className={styles.metadataIcon} />
            <span>{attendeeCount.toLocaleString(locale)}</span>
          </span>
        )}
      </span>
      {attendeeCount > 0 && (
        <span className={styles.avatars} data-agenda-avatars>
          {shownAttendees.map((attendee) => (
            <Avatar
              className={styles.avatar}
              decorative
              key={attendee.id}
              locale={locale}
              name={attendee.displayName}
            />
          ))}
          {hiddenAttendeeCount > 0 && (
            <AvatarOverflow
              className={styles.avatar}
              count={hiddenAttendeeCount}
              label={t("calendar.agenda.attendees")}
            />
          )}
        </span>
      )}
    </>
  );
};

const AgendaReminderContent = ({ event }: { readonly event: CalendarEvent }) => {
  const { t } = useCalendarLocalization();
  const title =
    event.title.trim() === "" ? t("calendar.event.type.default") : event.title;

  return (
    <>
      <span className={styles.reminderTitle}>
        {t("calendar.agenda.reminderTitle", { title })}
      </span>
      {event.notify && (
        <span className={styles.reminderNotice}>
          <CircleAlertIcon aria-hidden="true" className={styles.metadataIcon} />
          <span>{t("calendar.agenda.earlyNotification")}</span>
        </span>
      )}
    </>
  );
};

const COLOR_CLASSES: ReadonlyMap<string, string> = new Map([
  ["blue", styles.colorBlue],
  ["lavender", styles.colorLavender],
  ["violet", styles.colorViolet],
  ["turquoise", styles.colorTurquoise],
  ["purple", styles.colorPurple],
  ["orange", styles.colorOrange],
  ["brown", styles.colorBrown],
]);

const SEGMENT_CLASSES: ReadonlyMap<AgendaEventRow["segment"], string> = new Map(
  [
    ["start", styles.segmentStart],
    ["middle", styles.segmentMiddle],
    ["end", styles.segmentEnd],
  ]
);

const resolveColorClass = (
  colorFamily: CalendarEvent["colorFamily"]
): string | undefined => COLOR_CLASSES.get(colorFamily);

const resolveSegmentClass = (
  segment: AgendaEventRow["segment"]
): string | undefined => SEGMENT_CLASSES.get(segment);

interface AgendaEventButtonProps {
  readonly row: AgendaEventRow;
}

const AgendaEventButtonImpl = ({ row }: AgendaEventButtonProps) => {
  const {
    currentInstant,
    focusedRowIndex,
    onFocusRow,
    onRowKeyDown,
    onSelectRow,
    renderEvent,
    selectedEventId,
    setRowRef,
  } = useAgendaInteraction();

  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const descriptionId = useId();
  const selected = selectedEventId === row.event.id;
  const available = isRowAvailable(row);
  const context = buildAgendaRenderContext(row, selected);
  const description = buildEventDescription(row, locale, t);
  const relativeHint = buildRelativeHint(row, currentInstant, locale, t);

  const isReminder = row.event.eventType === "reminder";
  const defaultContent = isReminder ? (
    <AgendaReminderContent event={row.event} />
  ) : (
    <AgendaEventContent relativeHint={relativeHint} row={row} />
  );
  const eventContent = renderEvent ? renderEvent(context) : defaultContent;

  // As designed, only the event in progress offers Join.
  const joinUrl =
    row.now && isSafeHttpUrl(row.event.joinUrl) ? row.event.joinUrl : null;

  return (
    <span className={clsx(styles.slotRow, "slotRow")}>
      <Button
        ref={(element: HTMLButtonElement | null) => {
          setRowRef(row.focusIndex, element);
        }}
        aria-describedby={description.length > 0 ? descriptionId : undefined}
        aria-disabled={available ? undefined : "true"}
        aria-pressed={selected ? "true" : "false"}
        className={clsx(
          styles.agendaEvent,
          isReminder
            ? styles.reminder
            : resolveColorClass(row.event.colorFamily),
          resolveSegmentClass(row.segment),
          selected && styles.selected,
          row.past && styles.past,
          row.now && styles.now,
          !available && styles.unavailable
        )}
        data-event-id={row.event.id}
        data-selected={selected ? "true" : undefined}
        onClick={(clickEvent) => {
          onSelectRow(row.event.id, clickEvent.currentTarget);
        }}
        onFocus={() => {
          onFocusRow(row.focusIndex);
        }}
        onKeyDown={(event) => {
          onRowKeyDown(event, row.focusIndex, row.event.id);
        }}
        tabIndex={focusedRowIndex === row.focusIndex ? 0 : -1}
        type="button"
        size="content"
        variant="outline"
      >
        <span
          className={clsx(styles.slot, isReminder && styles.slotReminder, "slot")}
          data-agenda-slot
        >
          {!isReminder && (
            <span
              className={clsx(
                styles.slotTimes,
                "slotTimes",
                row.kind === "allday" && styles.slotTimesAllDay
              )}
            >
              {row.kind === "timed" ? (
                <>
                  <span className={styles.slotTimeStart} data-slot-time>
                    {formatAgendaTime(row.start, timeZone, locale)}
                  </span>
                  <span className={styles.slotTimeEnd} data-slot-time>
                    {formatAgendaTime(row.end, timeZone, locale)}
                  </span>
                </>
              ) : (
                <span className={styles.slotTimeAllDay} data-slot-time>
                  {t("calendar.agenda.allDay")}
                </span>
              )}
            </span>
          )}
          <span aria-hidden="true" className={styles.slotBar} />
          <span className={clsx(styles.slotBody, "slotBody")}>
            {eventContent}
            {description.length > 0 && (
              <span id={descriptionId} className={styles.srOnly}>
                {description}
              </span>
            )}
          </span>
        </span>
      </Button>
      {joinUrl !== null && (
        <a
          className={clsx(styles.joinButton, "joinButton")}
          href={joinUrl}
          rel="noreferrer"
          target="_blank"
        >
          {t("calendar.detail.join")}
        </a>
      )}
    </span>
  );
};

const AgendaEventButton = memo(AgendaEventButtonImpl);

const AgendaNowLine = ({
  currentInstant,
}: {
  readonly currentInstant: UtcInstant;
}) => {
  const { locale } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const currentTimeLabel = formatAgendaTime(currentInstant, timeZone, locale);

  return (
    <div
      aria-hidden="true"
      className={clsx(styles.nowLine, "nowLine")}
      data-current-time={currentTimeLabel}
      data-testid="agenda-now-line"
    >
      <span className={styles.nowGutter} aria-hidden="true">
        {currentTimeLabel}
      </span>
      <span className={styles.nowRule} aria-hidden="true" />
    </div>
  );
};

const AgendaDayGroup = ({
  group,
  renderDayHeader,
  todayDate,
}: AgendaDayGroupProps) => {
  const { currentInstant } = useAgendaInteraction();
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const dayStart = fromViewerDateTime({
    date: group.date,
    time: "00:00",
    timeZone,
  });
  const isToday = group.date === todayDate;
  const relativeLabel = getRelativeDayLabel(group.date, todayDate, t);
  const dateLabel = formatAgendaDate(dayStart, timeZone, locale);

  return (
    <li
      className={styles.dayGroup}
      data-agenda-date={group.date}
      data-today={isToday}
    >
      <div className={styles.dayHeader} data-today={isToday}>
        {renderDayHeader ? (
          renderDayHeader(group.date)
        ) : (
          <>
            {relativeLabel !== null && (
              <span className={styles.dayRelative} data-agenda-relative-label>
                {relativeLabel}
              </span>
            )}
            <span className={clsx(styles.dayDate, "dayDate")}>{dateLabel}</span>
          </>
        )}
      </div>

      <div className={styles.dayEvents}>
        {group.rows.length === 0 && (
          <p className={styles.noEvents}>{t("calendar.agenda.emptyDay")}</p>
        )}
        {group.rows.map((row, index) => (
          <Fragment key={row.key}>
            {group.nowIndex === index && (
              <AgendaNowLine currentInstant={currentInstant} />
            )}
            <AgendaEventButton row={row} />
          </Fragment>
        ))}
        {group.nowIndex === group.rows.length && (
          <AgendaNowLine currentInstant={currentInstant} />
        )}
      </div>
    </li>
  );
};

const AgendaViewContent = ({
  className,
  date,
  defaultSelectedEventId,
  events,
  now,
  onEventSelect,
  onSelectedEventIdChange,
  renderDayHeader,
  renderEvent,
  selectedEventId,
}: AgendaViewContentProps) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const controller = useAgendaViewController({
    date,
    defaultSelectedEventId,
    events,
    now,
    onEventSelect,
    onSelectedEventIdChange,
    selectedEventId,
    timeZone,
  });

  const agendaInteraction = useMemo<AgendaInteractionContextValue>(
    () => ({
      currentInstant: controller.currentInstant,
      focusedRowIndex: controller.focusedRowIndex,
      onFocusRow: controller.announceRow,
      onRowKeyDown: controller.handleRowKeyDown,
      onSelectRow: controller.selectEvent,
      renderEvent,
      selectedEventId: controller.selectedEventId,
      setRowRef: controller.setRowRef,
    }),
    [
      controller.announceRow,
      controller.currentInstant,
      controller.focusedRowIndex,
      controller.handleRowKeyDown,
      controller.selectEvent,
      controller.selectedEventId,
      controller.setRowRef,
      renderEvent,
    ]
  );

  const liveText = buildLiveAnnouncement(
    controller.announcement,
    controller.windowRange,
    controller.dayGroups,
    controller.eventRows,
    locale,
    timeZone,
    t
  );

  return (
    <section
      className={clsx(styles.agendaView, "agendaView", className)}
      aria-label={t("calendar.agenda.viewName")}
    >
      <AgendaInteractionContext.Provider value={agendaInteraction}>
        <ul className={clsx(styles.groups, "groups")}>
          {controller.dayGroups.map((group) => (
            <AgendaDayGroup
              group={group}
              key={group.date}
              renderDayHeader={renderDayHeader}
              todayDate={controller.todayDate}
            />
          ))}
        </ul>
      </AgendaInteractionContext.Provider>

      <div
        className={styles.liveRegion}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveText}
      </div>
    </section>
  );
};

export const AgendaView = (props: AgendaViewProps) => (
  <CalendarScope {...props}>
    <AgendaViewContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

type AgendaViewContentProps = Omit<AgendaViewProps, keyof CalendarContextProps>;

AgendaView.displayName = "AgendaView";
