"use client";

import { clsx } from "clsx";
import { Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { arrayAt } from "../../core/array";
import type {
  CalendarColorFamily,
  CalendarDirection,
  CalendarRef,
} from "../../core/model";
import { useCalendarLocalization } from "../../i18n/calendar-localization";
import { Button } from "../primitives/button/button";
import { resolvePortalContainer } from "../primitives/portal-layer";
import { Popover } from "../primitives/popover/popover";

import {
  calendarColorOptions,
  findCalendarColorOption,
} from "./calendar-color-options";
import styles from "./calendar-list.module.css";

export interface CalendarOptionsActions {
  /** Saves a new colour for the calendar. */
  readonly onCalendarColorChange?: (
    calendarId: string,
    colorFamily: CalendarColorFamily
  ) => void;
  /** Hides every other calendar. */
  readonly onShowOnlyCalendar?: (calendarId: string) => void;
  /** Restores the visibility from before the calendar was shown alone. */
  readonly onShowPreviouslyVisible?: () => void;
  /** Marks the calendar as the default for new events. */
  readonly onMakeDefaultCalendar?: (calendarId: string) => void;
  /** Deletes the calendar. The host confirms before it deletes. */
  readonly onDeleteCalendar?: (calendarId: string) => void;
}

interface CalendarOptionsMenuProps {
  readonly actions: CalendarOptionsActions;
  readonly anchorElement: HTMLElement;
  readonly calendar: CalendarRef;
  readonly onClose: () => void;
  /** True while this calendar is the only one shown. */
  readonly solo: boolean;
}

// Arrow keys step through the swatches; Left and Right swap in right-to-left layouts.
const swatchStep = (
  key: string,
  direction: CalendarDirection
): number | undefined => {
  const inlineStep = direction === "rtl" ? -1 : 1;

  switch (key) {
    case "ArrowRight": {
      return inlineStep;
    }
    case "ArrowLeft": {
      return -inlineStep;
    }
    case "ArrowDown": {
      return 1;
    }
    case "ArrowUp": {
      return -1;
    }
    default: {
      return undefined;
    }
  }
};

export const CalendarOptionsMenu = ({
  actions,
  anchorElement,
  calendar,
  onClose,
  solo,
}: CalendarOptionsMenuProps) => {
  const { direction, t } = useCalendarLocalization();
  const {
    onCalendarColorChange,
    onDeleteCalendar,
    onMakeDefaultCalendar,
    onShowOnlyCalendar,
    onShowPreviouslyVisible,
  } = actions;
  const [picking, setPicking] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<CalendarColorFamily>(
    calendar.colorFamily
  );
  const swatchElements = useRef(
    new Map<CalendarColorFamily, HTMLButtonElement>()
  );

  // The menu is mounted only while open, so each open starts from the menu.
  const choose = (action: () => void): void => {
    action();
    onClose();
  };

  const applyColor = (): void => {
    if (selectedFamily === calendar.colorFamily) {
      onClose();

      return;
    }

    choose(() => onCalendarColorChange?.(calendar.id, selectedFamily));
  };

  const moveSwatch = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = swatchStep(event.key, direction);

    if (step === undefined) {
      return;
    }

    event.preventDefault();

    const selectedIndex = calendarColorOptions.findIndex(
      (option) => option.family === selectedFamily
    );
    const next = arrayAt(
      calendarColorOptions,
      (selectedIndex + step + calendarColorOptions.length) %
        calendarColorOptions.length
    );

    if (next === undefined) {
      return;
    }

    setSelectedFamily(next.family);
    swatchElements.current.get(next.family)?.focus();
  };

  const currentOption = findCalendarColorOption(calendar.colorFamily);

  return (
    <Popover
      open
      onOpenChange={() => onClose()}
      anchorRect={anchorElement.getBoundingClientRect()}
      anchorRectProvider={() => anchorElement.getBoundingClientRect()}
      anchorElement={anchorElement}
      align="start"
      container={resolvePortalContainer(anchorElement)}
      label={t("calendar.list.options")}
      className={clsx(styles.menu, picking && styles.menuPicker)}
    >
      {picking ? (
        <div className={styles.picker}>
          <div
            aria-label={t("calendar.list.colorPicker")}
            className={styles.swatches}
            role="radiogroup"
            onKeyDown={moveSwatch}
          >
            {calendarColorOptions.map((option) => (
              <button
                aria-checked={selectedFamily === option.family}
                aria-label={t(option.nameKey)}
                className={clsx(styles.swatch, option.className)}
                key={option.family}
                ref={(element) => {
                  if (element) {
                    swatchElements.current.set(option.family, element);
                  }
                }}
                role="radio"
                tabIndex={selectedFamily === option.family ? 0 : -1}
                type="button"
                onClick={() => setSelectedFamily(option.family)}
              />
            ))}
          </div>
          <div className={styles.pickerFooter}>
            <Button
              size="l"
              type="button"
              variant="secondary"
              onClick={() => {
                setPicking(false);
              }}
            >
              {t("calendar.list.cancel")}
            </Button>
            <Button
              size="l"
              type="button"
              variant="primary"
              onClick={applyColor}
            >
              {t("calendar.list.apply")}
            </Button>
          </div>
        </div>
      ) : (
        <ul className={styles.menuList}>
          {onCalendarColorChange === undefined ? null : (
            <li>
              <button
                className={styles.menuItem}
                type="button"
                onClick={() => setPicking(true)}
              >
                <span>{t("calendar.list.color")}</span>
                {currentOption === undefined ? null : (
                  <span
                    className={clsx(styles.colorTag, currentOption.className)}
                  >
                    {t(currentOption.nameKey)}
                  </span>
                )}
              </button>
            </li>
          )}
          {solo ? (
            onShowPreviouslyVisible === undefined ? null : (
              <li>
                <button
                  className={styles.menuItem}
                  type="button"
                  onClick={() => choose(onShowPreviouslyVisible)}
                >
                  {t("calendar.list.showPreviouslyVisible")}
                </button>
              </li>
            )
          ) : onShowOnlyCalendar === undefined ? null : (
            <li>
              <button
                className={styles.menuItem}
                type="button"
                onClick={() => choose(() => onShowOnlyCalendar(calendar.id))}
              >
                {t("calendar.list.showOnly")}
              </button>
            </li>
          )}
          {onMakeDefaultCalendar === undefined ? null : (
            <li>
              <button
                className={styles.menuItem}
                disabled={
                  calendar.isDefault === true || calendar.canWrite !== true
                }
                type="button"
                onClick={() => choose(() => onMakeDefaultCalendar(calendar.id))}
              >
                {t("calendar.list.makeDefault")}
              </button>
            </li>
          )}
          {onDeleteCalendar === undefined ? null : (
            <li>
              <button
                className={clsx(styles.menuItem, styles.menuItemStart)}
                disabled={calendar.canDelete !== true}
                type="button"
                onClick={() => choose(() => onDeleteCalendar(calendar.id))}
              >
                <Trash2Icon aria-hidden="true" className={styles.menuIcon} />
                {t("calendar.list.delete")}
              </button>
            </li>
          )}
        </ul>
      )}
    </Popover>
  );
};
