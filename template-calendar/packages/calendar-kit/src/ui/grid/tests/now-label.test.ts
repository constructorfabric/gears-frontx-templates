import { describe, expect as assert, it } from "vitest";

import { utcInstant } from "../../../core/model";
import { nowCoversHourLabel } from "../now-label";

const HOUR = utcInstant("2026-08-24T14:00:00.000Z");

describe(nowCoversHourLabel, () => {
  it("hides the hour label while the now label sits on it", () => {
    assert(
      nowCoversHourLabel(HOUR, utcInstant("2026-08-24T14:00:00.000Z"))
    ).toBe(true);
    assert(
      nowCoversHourLabel(HOUR, utcInstant("2026-08-24T14:30:00.000Z"))
    ).toBe(true);
  });

  it("keeps the hour label once the now label has moved past it, or before the hour", () => {
    assert(
      nowCoversHourLabel(HOUR, utcInstant("2026-08-24T14:45:00.000Z"))
    ).toBe(false);
    assert(
      nowCoversHourLabel(HOUR, utcInstant("2026-08-24T13:58:00.000Z"))
    ).toBe(false);
  });
});
