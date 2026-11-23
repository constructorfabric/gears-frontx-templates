import { render, screen } from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import { WeekGrid } from "../week-grid";

const DATE = calendarDate("2026-09-14");

const event = (id: string, title: string) =>
  timedEvent({
    endTime: "10:00",
    id,
    startDate: "2026-09-14",
    startTime: "09:00",
    title,
  });

describe("WeekGrid getEventFrameProps", () => {
  it("puts the class and data-tone on the default card frame", () => {
    render(
      <WeekGrid
        date={DATE}
        events={[event("workshop", "Workshop")]}
        timeZone={UTC}
        getEventFrameProps={() => ({
          className: "host-conflict",
          "data-tone": "conflict",
        })}
      />
    );

    const card = screen.getByRole("button", { name: /^Workshop/u });

    assert(card.classList.contains("host-conflict")).toBe(true);
    assert(card.getAttribute("data-tone")).toBe("conflict");
  });

  it("puts the class and data-tone on the custom renderEvent button", () => {
    render(
      <WeekGrid
        date={DATE}
        events={[event("workshop", "Workshop")]}
        timeZone={UTC}
        renderEvent={(context) => <span>{context.event.id}</span>}
        getEventFrameProps={() => ({
          className: "host-busy",
          "data-tone": "busy",
        })}
      />
    );

    const button = screen.getByRole("button", { name: "Workshop" });

    assert(button.classList.contains("host-busy")).toBe(true);
    assert(button.getAttribute("data-tone")).toBe("busy");
  });

  it("passes each event context to the hook so tone can differ per event", () => {
    const getEventFrameProps = vi.fn((context: { event: { id: string } }) =>
      context.event.id === "clash" ? { "data-tone": "conflict" } : undefined
    );

    render(
      <WeekGrid
        date={DATE}
        events={[event("clash", "Clash"), event("plain", "Plain")]}
        timeZone={UTC}
        getEventFrameProps={getEventFrameProps}
      />
    );

    assert(
      screen.getByRole("button", { name: /^Clash/u }).getAttribute("data-tone")
    ).toBe("conflict");
    assert(
      screen.getByRole("button", { name: /^Plain/u }).hasAttribute("data-tone")
    ).toBe(false);
    assert(
      getEventFrameProps.mock.calls.map(([context]) => context.event.id).sort()
    ).toEqual(["clash", "plain"]);
  });

  it("keeps a tone-tagged card focusable", () => {
    render(
      <WeekGrid
        date={DATE}
        events={[event("workshop", "Workshop")]}
        timeZone={UTC}
        getEventFrameProps={() => ({ "data-tone": "conflict" })}
      />
    );

    const card = screen.getByRole("button", { name: /^Workshop/u });

    card.focus();

    assert(document.activeElement).toBe(card);
  });
});
