import { render, screen, within } from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";

import { declarations } from "../../../__test-utils__/css-declarations";
import {
  timedEvent,
  UTC,
  identityTranslate as t,
} from "../../../__test-utils__/fixtures";
import { calendarDate, utcInstant } from "../../../core/model";
import type { CalendarEvent, UtcInstant } from "../../../core/model";
import { AgendaView } from "../agenda-view";
import type { AgendaViewProps } from "../agenda-view";

import agendaStyles from "../agenda-view.module.css";
import agendaViewCss from "../agenda-view.module.css?raw";

// Before every event below, so none of them is past unless a test moves the clock.
const MORNING = utcInstant("2026-08-24T08:00:00.000Z");
const DURING_CALL = utcInstant("2026-08-24T09:30:00.000Z");

const renderAgenda = (
  events: readonly CalendarEvent[],
  now: UtcInstant = MORNING
) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));

  const props: AgendaViewProps = {
    date: calendarDate("2026-08-24"),
    direction: "ltr",
    events,
    locale: "en-US",
    t,
    timeZone: UTC,
  };

  return render(<AgendaView {...props} />);
};

describe("agenda event slot", () => {
  it("prints a timed row start over its end in the slot gutter, not inside the card body", () => {
    renderAgenda([
      timedEvent(
        "class",
        "2026-08-24T09:00:00.000Z",
        "2026-08-24T10:30:00.000Z"
      ),
    ]);

    const eventButton = screen.getByRole("button");
    assert(within(eventButton).getAllByText("09:00")).toHaveLength(1);
    assert(within(eventButton).getAllByText("10:30")).toHaveLength(1);
    assert(eventButton).not.toHaveTextContent("09:00–10:30");
  });

  it("renders an icon/value metadata row only when the event carries a value", () => {
    renderAgenda([
      timedEvent(
        "bare",
        "2026-08-24T09:00:00.000Z",
        "2026-08-24T10:30:00.000Z"
      ),
    ]);

    assert(screen.getByText("1 hr 30 min")).toBeVisible();
    assert(screen.queryByText("Aylin Demir")).toBeNull();
    assert(screen.queryByText("4")).toBeNull();

    const { container: withFacts } = renderAgenda([
      timedEvent(
        "full",
        "2026-08-24T09:00:00.000Z",
        "2026-08-24T10:30:00.000Z",
        {
          attendees: 4,
          organizer: "Aylin Demir",
        }
      ),
    ]);

    assert(within(withFacts).getByText("Aylin Demir")).toBeVisible();
    assert(within(withFacts).getByText("4")).toBeVisible();
  });

  it("renders the slot grid, the attendee faces and the join action", () => {
    renderAgenda(
      [
        {
          ...timedEvent(
            "call",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:30:00.000Z",
            {
              attendees: 8,
            }
          ),
          joinUrl: "https://meet.example.com/call",
        },
      ],
      DURING_CALL
    );

    assert(screen.getByRole("button")).toHaveTextContent("call");
    assert(within(screen.getByRole("button")).getByText("09:00")).toBeVisible();
    assert(within(screen.getByRole("button")).getByText("10:30")).toBeVisible();

    assert(screen.getByText("+2")).toBeVisible();

    const join = screen.getByRole("link", { name: "Join" });

    assert(join).toHaveAttribute("href", "https://meet.example.com/call");
    assert(join.closest("button")).toBeNull();
  });

  it("leaves out the join action before the event starts", () => {
    renderAgenda([
      {
        ...timedEvent(
          "call",
          "2026-08-24T09:00:00.000Z",
          "2026-08-24T10:30:00.000Z"
        ),
        joinUrl: "https://meet.example.com/call",
      },
    ]);

    assert(screen.queryByRole("link")).toBeNull();
  });

  it("leaves out the join action once the event has ended", () => {
    renderAgenda(
      [
        {
          ...timedEvent(
            "call",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:30:00.000Z"
          ),
          joinUrl: "https://meet.example.com/call",
        },
      ],
      utcInstant("2026-08-24T11:00:00.000Z")
    );

    assert(screen.queryByRole("link")).toBeNull();
  });

  it("leaves out the join action when the event carries no safe link", () => {
    renderAgenda(
      [
        {
          ...timedEvent(
            "unsafe",
            "2026-08-24T09:00:00.000Z",
            "2026-08-24T10:30:00.000Z"
          ),
          joinUrl: ["java", "script:alert(1)"].join(""),
        },
      ],
      DURING_CALL
    );

    assert(screen.queryByRole("link")).toBeNull();
  });

  it("element-qualifies the slot layout so ui-kit Button rules cannot tie it", () => {
    const slot = declarations(agendaViewCss, "button.agendaEvent");

    assert(slot.get("display")).toBe("block");
    assert(slot.get("padding")).toBe("var(--cal-space-1) 0");
    assert(slot.get("text-align")).toBe("start");
    assert(slot.get("background")).toBe("var(--cal-color-raised)");
    assert(
      declarations(
        agendaViewCss,
        "button.agendaEvent:not(.unavailable):hover"
      ).get("background")
    ).toBe("var(--cal-state-hover)");
  });

  it("greys out a past slot's times and metadata along with the row", () => {
    const rowColor = declarations(agendaViewCss, ".agendaEvent.past").get(
      "color"
    );

    assert(rowColor).toBe("var(--cal-color-muted)");

    for (const part of [
      ".slotTimes",
      ".slotTimeStart",
      ".slotTimeAllDay",
      ".slotTimeEnd",
      ".eventMetadata",
    ]) {
      assert(
        declarations(agendaViewCss, `.agendaEvent.past ${part}`).get("color")
      ).toBe(rowColor);
    }
  });

  it("paints a blue row from the blue family tokens", () => {
    renderAgenda([
      {
        ...timedEvent(
          "blue",
          "2026-08-24T09:00:00.000Z",
          "2026-08-24T10:30:00.000Z"
        ),
        colorFamily: "blue",
      },
    ]);

    const blue = declarations(agendaViewCss, ".agendaEvent.colorBlue");

    assert(screen.getByRole("button")).toHaveClass(agendaStyles.colorBlue);
    assert(blue.get("--agenda-slot-accent")).toBe(
      "var(--cal-color-blue-accent)"
    );
    assert(blue.get("color")).toBe("var(--cal-color-blue-foreground)");
  });
});
