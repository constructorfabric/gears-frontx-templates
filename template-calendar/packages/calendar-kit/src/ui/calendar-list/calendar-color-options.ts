import type { CalendarColorFamily } from "../../core/model";

import styles from "./calendar-list.module.css";

/** The seven calendar swatches, in the order the colour picker draws them. */
export const calendarColorOptions = [
  {
    className: styles.colorBlue,
    family: "blue",
    nameKey: "calendar.list.colorBlue",
  },
  {
    className: styles.colorLavender,
    family: "lavender",
    nameKey: "calendar.list.colorLavender",
  },
  {
    className: styles.colorViolet,
    family: "violet",
    nameKey: "calendar.list.colorViolet",
  },
  {
    className: styles.colorPurple,
    family: "purple",
    nameKey: "calendar.list.colorPurple",
  },
  {
    className: styles.colorOrange,
    family: "orange",
    nameKey: "calendar.list.colorOrange",
  },
  {
    className: styles.colorBrown,
    family: "brown",
    nameKey: "calendar.list.colorBrown",
  },
  {
    className: styles.colorTurquoise,
    family: "turquoise",
    nameKey: "calendar.list.colorTurquoise",
  },
] as const;

export type CalendarColorOption = (typeof calendarColorOptions)[number];

export const findCalendarColorOption = (
  family: CalendarColorFamily
): CalendarColorOption | undefined =>
  calendarColorOptions.find((option) => option.family === family);
