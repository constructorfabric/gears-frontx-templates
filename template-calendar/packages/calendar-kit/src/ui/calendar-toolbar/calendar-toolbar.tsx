"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";

import type { CalendarDate, CalendarView } from "../../core/model";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { useCalendarToolbarController } from "../../react/controllers/use-calendar-toolbar-controller";
import { Button } from "../primitives/button/button";
import { visibleViewOptions } from "./view-options";

import styles from "./calendar-toolbar.module.css";

// Lucide's chevrons are 4px wide and read light next to the calendar's type; these are the Constructor glyphs.
const chevronLeftIcon = (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" fill="currentColor">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10.5303 2.9697a.75.75 0 0 1 0 1.0606L6.5607 8l3.9696 3.9697a.75.75 0 1 1-1.0606 1.0606l-4.5-4.5a.75.75 0 0 1 0-1.0606l4.5-4.5a.75.75 0 0 1 1.0606 0"
    />
  </svg>
);

const chevronRightIcon = (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" fill="currentColor">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M5.4697 13.0303a.75.75 0 0 1 0-1.0606L9.4393 8 5.4697 4.0303a.75.75 0 0 1 1.0606-1.0606l4.5 4.5a.75.75 0 0 1 0 1.0606l-4.5 4.5a.75.75 0 0 1-1.0606 0"
    />
  </svg>
);

export interface CalendarToolbarProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** The date the host is showing. The toolbar never changes it. */
  readonly currentDate: CalendarDate;
  /** Controlled view. Selecting another view only calls `onViewChange`. */
  readonly activeView?: CalendarView;
  /** Initial view when uncontrolled. Default `day`. */
  readonly defaultActiveView?: CalendarView;
  /** Called for every view selection. */
  readonly onViewChange: (view: CalendarView) => void;
  /** The Today button was pressed. */
  readonly onToday: () => void;
  /** The previous button was pressed. The host decides what one step is. */
  readonly onPrevious: () => void;
  /** The next button was pressed. */
  readonly onNext: () => void;
  /** Views to offer, in the host's order. Default all four. */
  readonly availableViews?: readonly CalendarView[];
  /** Replaces the title text; the heading's accessible name is kept. */
  readonly renderTitle?: (date: CalendarDate) => ReactNode;
  /** Replaces one view option's visible content. */
  readonly renderViewOption?: (
    view: CalendarView,
    active: boolean
  ) => ReactNode;
  /** Content at the start of the bar. */
  readonly renderLeading?: () => ReactNode;
  /** Content at the end of the bar. */
  readonly renderTrailing?: () => ReactNode;
}

const CalendarToolbarContent = ({
  activeView,
  availableViews,
  className,
  currentDate,
  defaultActiveView,
  onNext,
  onPrevious,
  onToday,
  onViewChange,
  renderLeading,
  renderTitle,
  renderTrailing,
  renderViewOption,
}: CalendarToolbarContentProps) => {
  const { direction, locale, t } = useCalendarLocalization();

  const {
    activeView: resolvedView,
    availableViews: visibleViews,
    titleMonth,
    titleYear,
    selectView,
    handleViewKeyDown,
    registerRadio,
  } = useCalendarToolbarController({
    activeView,
    availableViews,
    currentDate,
    defaultActiveView,
    direction,
    locale,
    onViewChange,
  });

  const options = visibleViewOptions(visibleViews);
  const activeOption =
    options.find((option) => option.value === resolvedView) ?? options[0];

  const accessibleTitle = `${t(activeOption.viewNameKey)} — ${t("calendar.toolbar.selectedDate")} ${currentDate}`;

  return (
    <header
      className={clsx(styles.root, className)}
      dir={direction}
      aria-label={t("calendar.toolbar.label")}
    >
      {renderLeading && <div className={styles.leading}>{renderLeading()}</div>}

      <h1 className={styles.title} aria-label={accessibleTitle}>
        {renderTitle ? (
          renderTitle(currentDate)
        ) : (
          <>
            <span className={styles.titleText}>{titleMonth}</span>
            <span className={styles.titleYear}>{` ${titleYear}`}</span>
          </>
        )}
      </h1>

      <div className={styles.actions}>
        <Button
          className={styles.today}
          size="sm"
          variant="ghost"
          onClick={onToday}
        >
          {t("calendar.toolbar.today")}
        </Button>

        <span className={styles.divider} aria-hidden="true" />

        <div
          className={styles.views}
          role="radiogroup"
          aria-label={t("calendar.toolbar.viewLabel")}
        >
          {options.map((option, index) => {
            const isActive = option.value === resolvedView;

            return (
              <Button
                key={option.value}
                ref={(element) => {
                  registerRadio(option.value, element);
                }}
                role="radio"
                aria-checked={isActive}
                tabIndex={isActive ? 0 : -1}
                size="sm"
                variant="ghost"
                className={styles.viewOption}
                onClick={() => {
                  selectView(option.value);
                }}
                onKeyDown={(event) => {
                  handleViewKeyDown(event, index);
                }}
              >
                {renderViewOption
                  ? renderViewOption(option.value, isActive)
                  : t(option.labelKey)}
              </Button>
            );
          })}
        </div>

        {/* The stepper and a host's trailing control share one 4px-spaced group, as in the design. */}
        <div className={styles.end}>
          <div
            className={styles.stepper}
            role="group"
            aria-label={t(activeOption.changeKey)}
          >
            <Button
              size="l"
              variant="ghost"
              className={styles.step}
              aria-label={t(activeOption.previousKey)}
              onlyIcon
              leftIcon={chevronLeftIcon}
              onClick={onPrevious}
            />
            <Button
              size="l"
              variant="ghost"
              className={styles.step}
              aria-label={t(activeOption.nextKey)}
              onlyIcon
              leftIcon={chevronRightIcon}
              onClick={onNext}
            />
          </div>
          {renderTrailing && (
            <div className={styles.trailing}>{renderTrailing()}</div>
          )}
        </div>
      </div>
    </header>
  );
};

export const CalendarToolbar = (props: CalendarToolbarProps) => (
  <CalendarScope {...props}>
    <CalendarToolbarContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

type CalendarToolbarContentProps = Omit<
  CalendarToolbarProps,
  keyof CalendarContextProps
>;
