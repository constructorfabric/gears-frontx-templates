import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";
import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type { CalendarCell, CalendarEvent, CalendarSelectionRange } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { WeekGrid } from "../week-grid";

const DATE = calendarDate("2026-08-24");

const planning: CalendarEvent = {
  allDay: false,
  available: true,
  colorFamily: "purple",
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  id: "event-1",
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Planning",
};

const timedCell = (time: string): HTMLElement =>
  screen.getByRole("gridcell", {
    name: new RegExp(`Monday, August 24, 2026 ${time}`, "u"),
  });

const cellAt = (time: string): CalendarCell => {
  const nextHour = `${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}:00`;

  return {
    date: DATE,
    end: utcInstant(`2026-08-24T${nextHour}:00.000Z`),
    endTime: parseLocalTime(nextHour),
    start: utcInstant(`2026-08-24T${time}:00.000Z`),
    startTime: parseLocalTime(time),
  };
};

describe("WeekGrid paint release", () => {
  it("labels the paint preview with the viewer-time range of the painted rows", () => {
    render(
      <WeekGrid
        date={DATE}
        direction="ltr"
        events={[]}
        interactionMode="paint-and-move"
        locale="en-US"
        t={t}
        timeZone={UTC}
      />
    );

    fireEvent.pointerDown(timedCell("09:00"));
    fireEvent.pointerMove(timedCell("10:00"));

    const preview = document.querySelector<HTMLElement>("[data-paint-preview]");
    assert(preview?.textContent).toContain("09:00 – 11:00");
    assert(preview?.querySelector("svg.lucide-clock")).not.toBeNull();
  });

  it("draws the preview as a bar and a time row whose clock icon leads the label", () => {
    const { container } = render(
      <WeekGrid
        date={DATE}
        direction="ltr"
        events={[]}
        interactionMode="paint-and-move"
        locale="en-US"
        t={t}
        timeZone={UTC}
      />
    );

    fireEvent.pointerDown(timedCell("09:00"));
    fireEvent.pointerMove(timedCell("10:00"));

    const [bar, time] = Array.from(
      container.querySelector("[data-paint-preview]")?.children ?? []
    );
    assert(bar).toBeEmptyDOMElement();
    assert(time?.firstElementChild).toHaveClass("lucide-clock");
    assert(time?.textContent).toContain("09:00 – 11:00");
  });

  it("finishes the paint and emits its range when released over an event card", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    render(
      <WeekGrid
        date={DATE}
        direction="ltr"
        events={[planning]}
        interactionMode="paint-and-move"
        locale="en-US"
        onPaintSelect={onPaintSelect}
        t={t}
        timeZone={UTC}
      />
    );

    fireEvent.pointerDown(timedCell("11:00"));
    fireEvent.pointerMove(timedCell("10:00"));
    fireEvent.pointerUp(screen.getByRole("button", { name: /Planning/u }));

    assert(onPaintSelect).toHaveBeenCalledExactlyOnceWith({
      cells: [cellAt("10:00"), cellAt("11:00")],
      end: cellAt("11:00"),
      start: cellAt("10:00"),
    });
  });
});
