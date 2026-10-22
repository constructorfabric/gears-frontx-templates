import { expect, it, vi } from "vitest";

import { formatViewerTimeZoneOffset } from "../format";
import { parseIanaTimeZone, utcInstant } from "../model";

it("normalizes ICU 77 UTC offset output to the documented GMT+0 format", () => {
  const formatToParts = vi
    .spyOn(Intl.DateTimeFormat.prototype, "formatToParts")
    .mockReturnValue([{ type: "timeZoneName", value: "GMT" }]);

  try {
    expect(
      formatViewerTimeZoneOffset(
        utcInstant("2026-08-24T10:00:00.000Z"),
        parseIanaTimeZone("UTC"),
        "en-US"
      )
    ).toBe("GMT+0");
  } finally {
    formatToParts.mockRestore();
  }
});
