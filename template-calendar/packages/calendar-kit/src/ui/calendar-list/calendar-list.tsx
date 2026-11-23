"use client";

import { clsx } from "clsx";
import { EllipsisIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { CalendarRef } from "../../core/model";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { Button } from "../primitives/button/button";
import { Checkbox } from "../primitives/checkbox/checkbox";
import { ListItem } from "../primitives/list/list";

import { findCalendarColorOption } from "./calendar-color-options";
import type { CalendarNode } from "./calendar-tree";
import { buildCalendarTree, groupCalendarTree } from "./calendar-tree";
import type { CalendarOptionsActions } from "./calendar-options-menu";
import { CalendarOptionsMenu } from "./calendar-options-menu";
import styles from "./calendar-list.module.css";

/** Row menu callbacks and the calendar shown alone. The host owns their state. */
export interface CalendarListOptionsProps extends CalendarOptionsActions {
  /** Id of the calendar shown alone. Its menu offers Show previously visible. */
  readonly soloCalendarId?: string | null;
}

export interface CalendarListProps
  extends CalendarContextProps, CalendarListOptionsProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Calendars to list. */
  readonly calendars: readonly CalendarRef[];
  /** Ids of calendars whose checkbox is off. */
  readonly hiddenCalendarIds: readonly string[];
  /** Called with the new hidden ids after a toggle. */
  readonly onHiddenCalendarIdsChange: (
    hiddenCalendarIds: readonly string[]
  ) => void;
  /** Shows a default create button that calls this. */
  readonly onCreateCalendar?: () => void;
  /** Replaces a row's content. */
  readonly renderCalendar?: (
    calendar: CalendarRef,
    hidden: boolean
  ) => ReactNode;
  /** Replaces the create button. */
  readonly renderCreateCalendar?: () => ReactNode;
}

type CalendarListContentProps = Omit<
  CalendarListProps,
  keyof CalendarContextProps
>;

interface CalendarListRowProps {
  readonly actions: CalendarOptionsActions;
  readonly calendar: CalendarRef;
  /** Nested calendars, rendered under the row. */
  readonly children?: ReactNode;
  /** Ids the checkbox toggles: this calendar and everything nested under it. */
  readonly scopeIds: readonly string[];
  readonly hidden: boolean;
  readonly renderCalendar?: (
    calendar: CalendarRef,
    hidden: boolean
  ) => ReactNode;
  readonly hiddenCalendarIds: readonly string[];
  readonly onHiddenCalendarIdsChange: (
    hiddenCalendarIds: readonly string[]
  ) => void;
  readonly solo: boolean;
}

const CalendarListRowImpl = ({
  actions,
  calendar,
  children,
  hidden,
  hiddenCalendarIds,
  onHiddenCalendarIdsChange,
  renderCalendar,
  scopeIds,
  solo,
}: CalendarListRowProps) => {
  const { t } = useCalendarLocalization();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const inputId = `calendar-list-${calendar.id}`;
  const colorClassName = findCalendarColorOption(
    calendar.colorFamily
  )?.className;
  const hasOptions = Object.values(actions).some(
    (action) => action !== undefined
  );

  const hiddenCount = scopeIds.filter((id) =>
    hiddenCalendarIds.includes(id)
  ).length;
  const allVisible = hiddenCount === 0;
  const someVisible = hiddenCount < scopeIds.length;

  const handleChange = (): void => {
    onHiddenCalendarIdsChange(
      allVisible
        ? [...hiddenCalendarIds, ...scopeIds]
        : hiddenCalendarIds.filter((id) => !scopeIds.includes(id))
    );
  };

  return (
    <li>
      <ListItem
        className={styles.row}
        control={
          <Checkbox
            aria-label={calendar.name}
            checked={allVisible}
            indeterminate={!allVisible && someVisible}
            className={clsx(colorClassName, hidden && styles.hiddenCheckbox)}
            id={inputId}
            onChange={handleChange}
          />
        }
        label={
          <label className={styles.label} htmlFor={inputId}>
            <span className={styles.name} data-hidden={hidden || undefined}>
              {renderCalendar
                ? renderCalendar(calendar, hidden)
                : calendar.name}
            </span>
          </label>
        }
        size="xs"
        trailing={
          hasOptions ? (
            <Button
              aria-expanded={menuAnchor !== null}
              aria-haspopup="dialog"
              aria-label={t("calendar.list.optionsFor", {
                name: calendar.name,
              })}
              className={clsx(
                styles.moreButton,
                menuAnchor !== null && styles.moreButtonOpen
              )}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              onlyIcon
              size="xs"
              variant="ghost"
            >
              <EllipsisIcon aria-hidden="true" />
            </Button>
          ) : undefined
        }
      />
      {children}
      {menuAnchor === null ? null : (
        <CalendarOptionsMenu
          actions={actions}
          anchorElement={menuAnchor}
          calendar={calendar}
          onClose={() => setMenuAnchor(null)}
          solo={solo}
        />
      )}
    </li>
  );
};

const CalendarListRow = memo(CalendarListRowImpl);

const CalendarListContent = ({
  calendars,
  className,
  hiddenCalendarIds,
  onCalendarColorChange,
  onCreateCalendar,
  onDeleteCalendar,
  onHiddenCalendarIdsChange,
  onMakeDefaultCalendar,
  onShowOnlyCalendar,
  onShowPreviouslyVisible,
  renderCalendar,
  renderCreateCalendar,
  soloCalendarId,
}: CalendarListContentProps) => {
  const { direction, t } = useCalendarLocalization();
  const actions = useMemo<CalendarOptionsActions>(
    () => ({
      onCalendarColorChange,
      onDeleteCalendar,
      onMakeDefaultCalendar,
      onShowOnlyCalendar,
      onShowPreviouslyVisible,
    }),
    [
      onCalendarColorChange,
      onDeleteCalendar,
      onMakeDefaultCalendar,
      onShowOnlyCalendar,
      onShowPreviouslyVisible,
    ]
  );

  const renderCreateAffordance = (): ReactNode => {
    if (renderCreateCalendar) {
      return renderCreateCalendar();
    }

    if (!onCreateCalendar) {
      return null;
    }

    return (
      <Button
        className={styles.createButton}
        size="sm"
        type="button"
        variant="outline"
        onClick={onCreateCalendar}
      >
        {t("calendar.panel.createCalendar")}
      </Button>
    );
  };

  const createAffordance = renderCreateAffordance();
  const hiddenCalendarIdSet = new Set(hiddenCalendarIds);

  const renderNode = (node: CalendarNode): ReactNode => (
    <CalendarListRow
      actions={actions}
      calendar={node.calendar}
      hidden={hiddenCalendarIdSet.has(node.calendar.id)}
      hiddenCalendarIds={hiddenCalendarIds}
      key={node.calendar.id}
      onHiddenCalendarIdsChange={onHiddenCalendarIdsChange}
      renderCalendar={renderCalendar}
      scopeIds={node.scopeIds}
      solo={soloCalendarId === node.calendar.id}
    >
      {node.children.length === 0 ? null : (
        <ul className={clsx(styles.list, styles.nested)}>
          {node.children.map(renderNode)}
        </ul>
      )}
    </CalendarListRow>
  );

  return (
    <section
      aria-label={t("calendar.panel.calendars")}
      className={clsx(styles.root, className)}
      dir={direction}
    >
      <h2 className={styles.heading}>{t("calendar.panel.calendars")}</h2>

      {groupCalendarTree(buildCalendarTree(calendars)).map((group) => (
        <div className={styles.group} key={group.label ?? ""}>
          {group.label === null ? null : (
            <h3 className={styles.groupHeading}>{group.label}</h3>
          )}
          <ul className={styles.list}>{group.nodes.map(renderNode)}</ul>
        </div>
      ))}

      {createAffordance === null || createAffordance === undefined ? null : (
        <div className={styles.create}>{createAffordance}</div>
      )}
    </section>
  );
};

export const CalendarList = (props: CalendarListProps) => (
  <CalendarScope {...props}>
    <CalendarListContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

CalendarList.displayName = "CalendarList";
