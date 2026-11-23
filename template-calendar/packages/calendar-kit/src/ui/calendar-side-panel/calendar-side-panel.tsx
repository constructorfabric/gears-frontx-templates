"use client";

import { clsx } from "clsx";
import { SearchIcon, XIcon } from "lucide-react";
import { Activity } from "react";
import type { ReactNode } from "react";

import type {
  CalendarDate,
  CalendarEvent,
  CalendarRef,
  IanaTimeZone,
} from "../../core/model";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { useCalendarSidePanelController } from "../../react/controllers/use-calendar-side-panel-controller";
import { CalendarList } from "../calendar-list/calendar-list";
import type { CalendarListOptionsProps } from "../calendar-list/calendar-list";
import { Button } from "../primitives/button/button";
import { Input } from "../primitives/input/input";
import { ScrollRegion } from "../primitives/scroll-region/scroll-region";
import { Separator } from "../primitives/separator/separator";

import styles from "./calendar-side-panel.module.css";

// A rounded panel with a filled right column: the Constructor layout glyph that the calendar uses.
const sidePanelToggleIcon = (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" fill="currentColor">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10 3.5H4c-.8284 0-1.5.6716-1.5 1.5v6c0 .8284.6716 1.5 1.5 1.5h6zm1.5 0h.5c.8284 0 1.5.6716 1.5 1.5v6c0 .8284-.6716 1.5-1.5 1.5h-.5zM15 5c0-1.6568-1.3431-3-3-3H4C2.3432 2 1 3.3432 1 5v6c0 1.6569 1.3432 3 3 3h8c1.6569 0 3-1.3431 3-3z"
    />
  </svg>
);
const sidePanelSearchIcon = <SearchIcon aria-hidden="true" />;

export interface CalendarSidePanelSlots {
  /** Replaces the header row. */
  readonly header?: () => ReactNode;
  /** Replaces the search field. */
  readonly search?: () => ReactNode;
  /** Replaces the whole body. */
  readonly body?: () => ReactNode;
  /** Replaces the month navigator. */
  readonly monthNavigator?: () => ReactNode;
  /** Replaces the time-zone list. */
  readonly timeZones?: () => ReactNode;
  /** Replaces the world clocks. */
  readonly worldClocks?: () => ReactNode;
  /** Replaces the calendar list. */
  readonly calendarList?: () => ReactNode;
  /** Replaces the search results shown while a query is active. */
  readonly searchResults?: () => ReactNode;
}

export interface CalendarSidePanelProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Id of the panel element, referenced by the toggle's `aria-controls`. */
  readonly id: string;
  /** Controlled open state. */
  readonly open?: boolean;
  /** Initial open state when uncontrolled. Default closed. */
  readonly defaultOpen?: boolean;
  /** Called when the toggle opens or closes the panel. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Events for the navigator dots and search. */
  readonly events: readonly CalendarEvent[];
  /** Calendars for the calendar list. */
  readonly calendars: readonly CalendarRef[];
  /** Day the navigator selects. */
  readonly selectedDate: CalendarDate;
  /** Comparison zone selected in the time-zone list. */
  readonly selectedTimeZoneId: IanaTimeZone | null;
  /** Called when the comparison zone changes. */
  readonly onSelectedTimeZoneIdChange: (
    timeZoneId: IanaTimeZone | null
  ) => void;
  /** Ids of hidden calendars. */
  readonly hiddenCalendarIds: readonly string[];
  /** Called after a calendar is toggled. */
  readonly onHiddenCalendarIdsChange: (
    hiddenCalendarIds: readonly string[]
  ) => void;
  /** Row menu callbacks and the calendar shown alone, forwarded to the calendar list. */
  readonly calendarOptions?: CalendarListOptionsProps;
  /** Controlled search query. */
  readonly query?: string;
  /** Initial search query when uncontrolled. */
  readonly defaultQuery?: string;
  /** Called when the search query changes. */
  readonly onQueryChange?: (query: string) => void;
  /** A search result was activated. */
  readonly onRevealEvent: (eventId: string, date: CalendarDate) => void;
  /** Called when the panel closes. */
  readonly onClose: () => void;
  /** Replacements for individual sections. */
  readonly slots?: CalendarSidePanelSlots;
  /** Renders the expand toggle in the panel's place while collapsed. Default `true`; pass `false`
   * when the host puts `CalendarSidePanelToggle` in its toolbar, as the design does. */
  readonly showCollapsedToggle?: boolean;
}

export interface CalendarSidePanelToggleProps {
  /** Class added to the button. */
  readonly className?: string;
  /** Id of the panel the toggle opens, for `aria-controls`. */
  readonly panelId: string;
  /** Called when the toggle is pressed. */
  readonly onOpen: () => void;
}

/** The collapsed panel's expand control, for hosts that place it in their toolbar. */
export const CalendarSidePanelToggle = ({
  className,
  panelId,
  onOpen,
}: CalendarSidePanelToggleProps) => {
  const { direction, t } = useCalendarLocalization();

  return (
    <Button
      aria-controls={panelId}
      aria-expanded={false}
      aria-label={t("calendar.panel.expand")}
      className={clsx(styles.toggle, className)}
      dir={direction}
      leftIcon={sidePanelToggleIcon}
      onlyIcon
      size="l"
      type="button"
      variant="ghost"
      onClick={onOpen}
    />
  );
};

const PanelSearch = ({ clearQuery, query, setQuery }: PanelSearchProps) => {
  const { t } = useCalendarLocalization();

  return (
    <Input
      action={
        query === "" ? undefined : (
          <Button
            aria-label={t("calendar.panel.clearSearch")}
            className={styles.clear}
            leftIcon={<XIcon aria-hidden="true" />}
            onlyIcon
            size="sm"
            type="button"
            variant="ghost"
            onClick={clearQuery}
          />
        )
      }
      aria-label={t("calendar.panel.searchLabel")}
      iconLeft={sidePanelSearchIcon}
      placeholder={t("calendar.panel.search")}
      type="search"
      value={query}
      onValueChange={setQuery}
    />
  );
};

const PanelDefaultBody = ({
  calendarOptions,
  calendars,
  hiddenCalendarIds,
  slots,
  onHiddenCalendarIdsChange,
}: PanelBodyProps) => {
  const hasTimeZones = Boolean(slots?.timeZones);
  const hasWorldClocks = Boolean(slots?.worldClocks);

  return (
    <>
      {slots?.monthNavigator?.()}
      {slots?.timeZones?.()}
      {hasTimeZones ? (
        <Separator className={styles.divider} decorative />
      ) : null}
      {slots?.worldClocks?.()}
      {hasWorldClocks ? (
        <Separator className={styles.divider} decorative />
      ) : null}
      {slots?.calendarList ? (
        slots.calendarList()
      ) : (
        <CalendarList
          {...calendarOptions}
          calendars={calendars}
          hiddenCalendarIds={hiddenCalendarIds}
          onHiddenCalendarIdsChange={onHiddenCalendarIdsChange}
        />
      )}
    </>
  );
};

const PanelBody = ({ query, slots, ...props }: PanelBodyProps) => {
  const searchResults = slots?.searchResults?.();
  const showSearchResults = query !== "" && (searchResults ?? null) !== null;

  return (
    <div className={styles.bodyContent}>
      {showSearchResults ? (
        searchResults
      ) : (
        <PanelDefaultBody {...props} query={query} slots={slots} />
      )}
    </div>
  );
};

const CalendarSidePanelContent = ({
  calendarOptions,
  calendars,
  className,
  defaultOpen,
  defaultQuery,
  hiddenCalendarIds,
  id,
  onClose,
  onHiddenCalendarIdsChange,
  onOpenChange,
  onQueryChange,
  open,
  query,
  showCollapsedToggle = true,
  slots,
}: CalendarSidePanelContentProps) => {
  const { direction, t } = useCalendarLocalization();

  const {
    isOpen,
    open: openPanel,
    close: closePanel,
    query: panelQuery,
    setQuery: setPanelQuery,
    clearQuery: clearPanelQuery,
    toggleRef,
  } = useCalendarSidePanelController({
    defaultOpen,
    defaultQuery,
    onClose,
    onOpenChange,
    onQueryChange,
    open,
    query,
  });

  return (
    <>
      {showCollapsedToggle ? (
        <Activity mode={isOpen ? "hidden" : "visible"}>
          <div className={styles.collapsed}>
            <CalendarSidePanelToggle
              className={className}
              panelId={id}
              onOpen={openPanel}
            />
          </div>
        </Activity>
      ) : null}
      <Activity mode={isOpen ? "visible" : "hidden"}>
        <aside
          aria-label={t("calendar.panel.label")}
          className={clsx(styles.panel, className)}
          dir={direction}
          id={id}
        >
          <header className={styles.header}>
            {slots?.header ? (
              <div className={styles.headerContent}>{slots.header()}</div>
            ) : null}
            <div className={styles.search}>
              {slots?.search ? (
                slots.search()
              ) : (
                <PanelSearch
                  clearQuery={clearPanelQuery}
                  query={panelQuery}
                  setQuery={setPanelQuery}
                />
              )}
            </div>
            <Button
              ref={toggleRef}
              aria-controls={id}
              aria-expanded={true}
              aria-label={t("calendar.panel.collapse")}
              className={styles.toggle}
              leftIcon={sidePanelToggleIcon}
              onlyIcon
              size="l"
              type="button"
              variant="ghost"
              onClick={closePanel}
            />
          </header>

          <ScrollRegion className={styles.body}>
            {slots?.body ? (
              slots.body()
            ) : (
              <PanelBody
                calendarOptions={calendarOptions}
                calendars={calendars}
                hiddenCalendarIds={hiddenCalendarIds}
                query={panelQuery}
                slots={slots}
                onHiddenCalendarIdsChange={onHiddenCalendarIdsChange}
              />
            )}
          </ScrollRegion>
        </aside>
      </Activity>
    </>
  );
};

export const CalendarSidePanel = (props: CalendarSidePanelProps) => (
  <CalendarScope {...props}>
    <CalendarSidePanelContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

type CalendarSidePanelContentProps = Omit<
  CalendarSidePanelProps,
  keyof CalendarContextProps
>;

CalendarSidePanel.displayName = "CalendarSidePanel";

interface PanelSearchProps {
  readonly clearQuery: () => void;
  readonly query: string;
  readonly setQuery: (query: string) => void;
}

interface PanelBodyProps {
  readonly calendarOptions?: CalendarListOptionsProps;
  readonly calendars: readonly CalendarRef[];
  readonly hiddenCalendarIds: readonly string[];
  readonly query: string;
  readonly slots?: CalendarSidePanelSlots;
  readonly onHiddenCalendarIdsChange: (
    hiddenCalendarIds: readonly string[]
  ) => void;
}
