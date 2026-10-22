import type { UtcInstant } from "../../core/model";

// The hour label sits in the top part of its 43px hour row and the now label is 12px tall,
// centred on the line; from 45 minutes past the hour on, the two clear each other.
const nowLabelClearsAfterMs = 45 * 60_000;

/** Whether the now label lands on this hour's gutter label, which then gives way to it. */
export const nowCoversHourLabel = (
  hourStart: UtcInstant,
  now: UtcInstant
): boolean => {
  const sinceHourStart = Date.parse(now) - Date.parse(hourStart);

  return sinceHourStart >= 0 && sinceHourStart < nowLabelClearsAfterMs;
};
