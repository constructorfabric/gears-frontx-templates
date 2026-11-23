"use client";

import { clsx } from "clsx";
import { TimerIcon, UserIcon, UsersIcon } from "lucide-react";
import { createContext, memo, useContext } from "react";
import type { ReactNode } from "react";

import { formatGridTime } from "../../core/format";
import type { CalendarDate, CalendarEvent, UtcInstant } from "../../core/model";
import { useCalendarContext } from "../../i18n/calendar-context";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import {
  SEARCH_STATE,
  useSearchResultsController,
} from "../../react/controllers/use-search-results-controller";
import { Avatar, AvatarOverflow } from "../primitives/avatar/avatar";
import { List, ListItem } from "../primitives/list/list";
import {
  formatSearchCount,
  formatSearchDayHeader,
  formatSearchResultDuration,
  isSearchResultNow,
} from "./search-results-format";
import type {
  SearchNarrowing,
  SearchResultGroup as SearchResultGroupData,
  SearchResultRow,
} from "./search-results-format";

import styles from "./search-results.module.css";

export interface SearchResultContext {
  /** The day (`YYYY-MM-DD`) the row is grouped under. */
  readonly group: string;
  /** Position within that day. */
  readonly index: number;
  /** The row is in progress at the `now` prop. */
  readonly isNow: boolean;
}

/** Attendee avatars shown on a result card before the "+N" overflow. */
const maxVisibleAvatars = 6;

export interface SearchResultsProps
  extends CalendarContextProps,
    SearchNarrowing {
  /** Class added to the component root. */
  readonly className?: string;
  /** Events to search. */
  readonly events: readonly CalendarEvent[];
  /** Controlled query. */
  readonly query?: string;
  /** Initial query when uncontrolled. */
  readonly defaultQuery?: string;
  /** Called when the query changes. */
  readonly onQueryChange?: (query: string) => void;
  /** Reference instant for the Today group and the Now label on in-progress rows. */
  readonly now: UtcInstant;
  /** A result was activated. Receives the event id and the viewer day of the row. */
  readonly onReveal: (eventId: string, date: CalendarDate) => void;
  /** Escape was pressed on a result. */
  readonly onDismiss: () => void;
  /** Replaces a row's content. */
  readonly renderResult?: (
    event: CalendarEvent,
    context: SearchResultContext
  ) => ReactNode;
  /** Replaces a day heading. */
  readonly renderGroupHeader?: (group: string, count: number) => ReactNode;
}

type SearchResultsControllerValue = ReturnType<
  typeof useSearchResultsController
>;

const SearchResultsControllerContext =
  createContext<SearchResultsControllerValue | null>(null);

const useSearchResultsControllerContext = (): SearchResultsControllerValue => {
  const value = useContext(SearchResultsControllerContext);
  if (value === null) {
    throw new Error("Search result rows must be rendered inside SearchResults");
  }

  return value;
};

// The row's colour bar takes the event's family, as in the agenda.
const COLOR_CLASSES: ReadonlyMap<string, string> = new Map([
  ["turquoise", styles.colorTurquoise],
  ["purple", styles.colorPurple],
  ["orange", styles.colorOrange],
  ["blue", styles.colorBlue],
  ["lavender", styles.colorLavender],
  ["violet", styles.colorViolet],
  ["brown", styles.colorBrown],
]);

const isUnnamed = (row: SearchResultRow): boolean =>
  row.event.title.trim() === "";

const DefaultResultContent = ({ isNow, row }: DefaultResultContentProps) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const title = isUnnamed(row)
    ? t("calendar.eventCard.unnamed")
    : row.event.title;
  const organizer = row.event.organizer ?? undefined;
  const attendees = row.event.attendees ?? [];
  const visibleAttendees = attendees.slice(0, maxVisibleAvatars);
  const hiddenCount = attendees.length - visibleAttendees.length;
  const duration = formatSearchResultDuration(row, locale);

  return (
    <>
      <span className={styles.times}>
        {row.start === null || row.end === null ? (
          <span className={styles.start}>{t("calendar.agenda.allDay")}</span>
        ) : (
          <>
            <span className={styles.start}>
              {formatGridTime(row.start, timeZone, locale)}
            </span>
            <span className={styles.end}>
              {formatGridTime(row.end, timeZone, locale)}
            </span>
          </>
        )}
      </span>
      <span className={styles.bar} aria-hidden="true" />
      <span className={styles.content}>
        <span className={styles.title}>{title}</span>
        {duration === null ? null : (
          <span className={styles.metaRow}>
            <TimerIcon aria-hidden="true" className={styles.icon} />
            <span>{duration}</span>
            {isNow ? (
              <span className={styles.now}>{t("calendar.agenda.now")}</span>
            ) : null}
          </span>
        )}
        {organizer === undefined ? null : (
          <span className={styles.metaRow}>
            <UserIcon aria-hidden="true" className={styles.icon} />
            <span className={styles.truncate}>{organizer}</span>
          </span>
        )}
        {attendees.length === 0 ? null : (
          <>
            <span className={styles.metaRow}>
              <UsersIcon aria-hidden="true" className={styles.icon} />
              <span>{attendees.length}</span>
            </span>
            <span className={styles.avatars}>
              {visibleAttendees.map((attendee) => (
                <Avatar key={attendee.id} name={attendee.displayName} />
              ))}
              {hiddenCount > 0 ? (
                <AvatarOverflow
                  count={hiddenCount}
                  label={t("calendar.detail.participants.more")}
                />
              ) : null}
            </span>
          </>
        )}
      </span>
    </>
  );
};

const SearchResultItemImpl = ({
  group,
  index,
  renderResult,
  row,
}: SearchResultItemProps) => {
  const controller = useSearchResultsControllerContext();
  const { t } = useCalendarLocalization();
  const isNow = isSearchResultNow(row, controller.currentInstant);

  return (
    <ListItem
      label={
        <button
          ref={(element) => {
            controller.setRowRef(row.focusIndex, element);
          }}
          type="button"
          aria-label={
            isUnnamed(row) ? t("calendar.eventCard.unnamed") : undefined
          }
          className={clsx(
            styles.result,
            COLOR_CLASSES.get(row.event.colorFamily)
          )}
          data-event-id={row.event.id}
          onClick={() => {
            controller.revealRow(row.focusIndex);
          }}
          onFocus={() => {
            controller.setFocusedRow(row.focusIndex);
          }}
          onKeyDown={(event) => {
            controller.handleRowKeyDown(event, row.focusIndex);
          }}
          tabIndex={controller.focusedIndex === row.focusIndex ? 0 : -1}
        >
          {renderResult ? (
            renderResult(row.event, { group: group.date, index, isNow })
          ) : (
            <DefaultResultContent isNow={isNow} row={row} />
          )}
        </button>
      }
      className={styles.resultItem}
      interactive={false}
      size="xs"
    />
  );
};

const SearchResultItem = memo(SearchResultItemImpl);

const SearchResultGroup = ({
  group,
  renderGroupHeader,
  renderResult,
}: SearchResultGroupProps) => {
  const controller = useSearchResultsControllerContext();
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const isToday = group.date === controller.todayDate;

  return (
    <section
      className={styles.group}
      role="listitem"
      aria-labelledby={`search-group-${group.date}`}
    >
      <h3
        className={clsx(styles.day, isToday && styles.dayToday)}
        id={`search-group-${group.date}`}
        aria-current={isToday ? "date" : undefined}
      >
        {renderGroupHeader
          ? renderGroupHeader(group.date, group.rows.length)
          : formatSearchDayHeader(
              group.date,
              group.dayStart,
              controller.todayDate,
              timeZone,
              locale,
              t
            )}
      </h3>

      <div className={styles.rows}>
        {group.rows.map((row, index) => (
          <SearchResultItem
            group={group}
            index={index}
            key={row.key}
            renderResult={renderResult}
            row={row}
          />
        ))}
      </div>
    </section>
  );
};

const SearchResultsContent = ({
  calendarIds,
  className,
  defaultQuery,
  events,
  onDismiss,
  onQueryChange,
  onReveal,
  now,
  query,
  range,
  renderGroupHeader,
  renderResult,
}: SearchResultsContentProps) => {
  const { direction, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const controller = useSearchResultsController({
    calendarIds,
    defaultQuery,
    events,
    now,
    onDismiss,
    onQueryChange,
    onReveal,
    query,
    range,
    timeZone,
  });

  return (
    <section
      aria-label={t("calendar.panel.searchResults")}
      className={clsx(styles.results, className)}
      dir={direction}
    >
      <div
        className={styles.liveRegion}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {controller.state === SEARCH_STATE.results
          ? formatSearchCount(controller.resultCount, t)
          : ""}
      </div>

      <SearchResultsControllerContext.Provider value={controller}>
        <List className={styles.groups}>
          {controller.groups.map((group) => (
            <SearchResultGroup
              group={group}
              key={group.date}
              renderGroupHeader={renderGroupHeader}
              renderResult={renderResult}
            />
          ))}
        </List>
        {controller.state === SEARCH_STATE.tooShort ? (
          <p>{t("calendar.panel.searchTooShort")}</p>
        ) : null}
        {controller.state === SEARCH_STATE.empty ? (
          <p>{t("calendar.panel.searchEmpty")}</p>
        ) : null}
      </SearchResultsControllerContext.Provider>
    </section>
  );
};

export const SearchResults = (props: SearchResultsProps) => (
  <CalendarScope {...props}>
    <SearchResultsContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

type SearchResultsContentProps = Omit<
  SearchResultsProps,
  keyof CalendarContextProps
>;

SearchResults.displayName = "SearchResults";

interface SearchResultGroupProps {
  readonly group: SearchResultGroupData;
  readonly renderGroupHeader?: (group: string, count: number) => ReactNode;
  readonly renderResult?: (
    event: CalendarEvent,
    context: SearchResultContext
  ) => ReactNode;
}

interface SearchResultItemProps {
  readonly group: SearchResultGroupData;
  readonly index: number;
  readonly renderResult?: (
    event: CalendarEvent,
    context: SearchResultContext
  ) => ReactNode;
  readonly row: SearchResultRow;
}

interface DefaultResultContentProps {
  readonly isNow: boolean;
  readonly row: SearchResultRow;
}
