import { render, screen } from "@testing-library/react";
import { describe, expect as assert, it } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { WeekGrid } from "../week-grid";

const DATE = calendarDate("2026-09-14");

describe("WeekGrid renderEventMetadata", () => {
  it("replaces the metadata row inside the one kit card, with no nested button", () => {
    render(
      <WeekGrid
        date={DATE}
        events={[
          timedEvent({
            endTime: "10:00",
            id: "item",
            startDate: "2026-09-14",
            startTime: "09:00",
            title: "Algebra",
          }),
        ]}
        timeZone={UTC}
        renderEventMetadata={(context) => <span>Room {context.event.id}</span>}
      />
    );

    const card = screen.getByRole("button", { name: /^Algebra/u });

    assert(card.textContent).toContain("Room item");
    assert(card.querySelectorAll("button")).toHaveLength(0);
    assert(screen.getAllByRole("button", { name: /^Algebra/u })).toHaveLength(
      1
    );
  });
});
