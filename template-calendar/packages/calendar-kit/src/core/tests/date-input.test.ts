import { describe, expect as assert, it } from "vitest";
import type { DateMask, DateSegment, DateSegmentKind } from "../date-input";
import {
  clearSegment,
  dateMask,
  fillDigits,
  maskedText,
  parseMaskedText,
  segmentIndexAt,
  stepSegment,
  typeDigit,
} from "../date-input";
import { calendarDate } from "../validation";

const segmentOf = (mask: DateMask, kind: DateSegmentKind): DateSegment => {
  const found = mask.segments.find((segment) => segment.kind === kind);

  if (found === undefined) {
    throw new Error(`Missing ${kind} segment`);
  }

  return found;
};

// en-US edits day first because it displays `Wed, 11 Nov`.
const american = dateMask("en-US");
const british = dateMask("en-GB");
const german = dateMask("de-DE");

describe(dateMask, () => {
  it("orders the segments and separators the way the locale writes dates", () => {
    assert(american.empty).toBe("dd/mm/yyyy");
    assert(british.empty).toBe("dd/mm/yyyy");
    assert(german.empty).toBe("dd.mm.yyyy");
  });

  it("keeps the gregorian calendar and latin digits whatever the locale", () => {
    assert(dateMask("fa-IR").empty).toContain("yyyy");
    assert(dateMask("ar-EG").empty).toContain("mm");
  });
});

describe(maskedText, () => {
  it("fills the segments from a canonical date", () => {
    assert(maskedText(calendarDate("2026-09-23"), american)).toBe("23/09/2026");
    assert(maskedText(calendarDate("2026-09-23"), german)).toBe("23.09.2026");
  });

  it("shows the placeholder while the field is empty", () => {
    assert(maskedText("", american)).toBe("dd/mm/yyyy");
  });
});

describe(parseMaskedText, () => {
  it("reads a filled mask back as a canonical date", () => {
    assert(parseMaskedText("23.09.2026", german)).toBe("2026-09-23");
  });

  it("stays empty while any segment is unfilled", () => {
    assert(parseMaskedText("09/dd/2026", american)).toBe("");
  });

  it("clamps a day the month cannot hold", () => {
    assert(parseMaskedText("31/02/2026", american)).toBe("2026-02-28");
    assert(parseMaskedText("31/02/2028", american)).toBe("2028-02-29");
  });

  it("rejects a zero month or day", () => {
    assert(parseMaskedText("00/12/2026", american)).toBe("");
    assert(parseMaskedText("12/00/2026", american)).toBe("");
  });
});

describe(typeDigit, () => {
  const month = segmentOf(american, "month");
  const day = segmentOf(american, "day");

  it("waits for a second digit while one can still follow", () => {
    const typed = typeDigit("dd/mm/yyyy", month, null, "1");

    assert(typed.text).toBe("dd/01/yyyy");
    assert(typed.complete).toBeFalsy();
  });

  it("completes the segment as soon as no digit can follow", () => {
    const typed = typeDigit("dd/mm/yyyy", month, null, "5");

    assert(typed.text).toBe("dd/05/yyyy");
    assert(typed.complete).toBeTruthy();
  });

  it("shifts a second digit into the segment", () => {
    const typed = typeDigit(
      "dd/01/yyyy",
      month,
      { digits: "1", kind: "month" },
      "2"
    );

    assert(typed.text).toBe("dd/12/yyyy");
    assert(typed.complete).toBeTruthy();
  });

  it("restarts the segment when the pair would overflow", () => {
    const typed = typeDigit(
      "dd/01/yyyy",
      month,
      { digits: "1", kind: "month" },
      "3"
    );

    assert(typed.text).toBe("dd/03/yyyy");
    assert(typed.complete).toBeTruthy();
  });

  it("collects four digits before completing a year", () => {
    const year = segmentOf(american, "year");
    const first = typeDigit("dd/mm/yyyy", year, null, "2");
    const second = typeDigit(first.text, year, first.entry, "0");

    assert(second.text).toBe("dd/mm/0020");
    assert(second.complete).toBeFalsy();
  });

  it("ignores an entry left in another segment", () => {
    const typed = typeDigit(
      "dd/mm/yyyy",
      day,
      { digits: "1", kind: "month" },
      "2"
    );

    assert(typed.text).toBe("02/mm/yyyy");
  });
});

describe(stepSegment, () => {
  const month = segmentOf(american, "month");

  it("wraps a month past its own range", () => {
    assert(stepSegment("23/12/2026", month, 1)).toBe("23/01/2026");
    assert(stepSegment("23/01/2026", month, -1)).toBe("23/12/2026");
  });

  it("starts an unfilled segment from either end", () => {
    assert(stepSegment("dd/mm/yyyy", month, 1)).toBe("dd/01/yyyy");
    assert(stepSegment("dd/mm/yyyy", month, -1)).toBe("dd/12/yyyy");
  });

  it("clamps the year instead of wrapping it", () => {
    const year = segmentOf(american, "year");

    assert(stepSegment("23/01/0001", year, -1)).toBe("23/01/0001");
  });
});

describe(segmentIndexAt, () => {
  it("maps a caret offset onto the segment holding it", () => {
    assert(segmentIndexAt(american, 0)).toBe(0);
    assert(segmentIndexAt(american, 4)).toBe(1);
    assert(segmentIndexAt(american, 9)).toBe(2);
  });
});

describe(clearSegment, () => {
  it("returns one segment to its placeholder", () => {
    const day = segmentOf(american, "day");

    assert(clearSegment("23/09/2026", american, day)).toBe("dd/09/2026");
  });
});

describe(fillDigits, () => {
  it("spreads pasted digits over the segments in the locale's order", () => {
    assert(fillDigits(german, "23.09.2026")).toBe("23.09.2026");
    assert(fillDigits(american, "23092026")).toBe("23/09/2026");
  });

  it("fills only the segments the digits reach", () => {
    assert(fillDigits(american, "0923")).toBe("09/23/yyyy");
  });

  it("reads pasted non-Latin digits", () => {
    assert(fillDigits(german, "٢٣.٠٩.٢٠٢٦")).toBe("23.09.2026");
  });
});
