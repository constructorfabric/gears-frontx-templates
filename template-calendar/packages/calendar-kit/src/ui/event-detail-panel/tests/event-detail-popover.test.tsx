import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as assert, it, vi } from "vitest";

import { declarations } from "../../../__test-utils__/css-declarations";
import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import type { CalendarAttendee } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { EventDetailPanel } from "../event-detail-panel";
import type { EventDetailPanelProps } from "../event-detail-panel";
import panelCss from "../event-detail-panel.module.css?raw";

const attendee = (
  id: string,
  response: CalendarAttendee["response"]
): CalendarAttendee => ({ displayName: `Person ${id}`, id, response });

const renderPreview = (overrides: Partial<EventDetailPanelProps> = {}) => {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  const onClose = vi.fn<() => void>();

  render(
    <EventDetailPanel
      anchorElement={anchor}
      direction="ltr"
      event={timedEvent({
        attendees: [attendee("a", "accepted"), attendee("b", "declined")],
        description: "Weekly sync",
        id: "sync",
        joinUrl: "https://meet.example.com/sync",
        location: "BG-Istanbul",
        organizer: "Vitaly Panteleev",
        organizerEmail: "vitaly@example.com",
        rsvp: { awaiting: 0, invited: 2, maybe: 0, no: 1, yes: 1 },
        startDate: "2026-09-23",
        title: "1:1 sync",
      })}
      locale="en-US"
      onClose={onClose}
      onDelete={() => {}}
      onEdit={() => {}}
      open
      t={t}
      timeZone={UTC}
      {...overrides}
    />
  );

  return { anchor, onClose };
};

const detail = (): HTMLElement =>
  screen.getByRole("dialog", { name: "1:1 sync" });

describe("EventDetailPanel anchored preview", () => {
  it("opens beside the anchor as a non-modal popover with every detail section", () => {
    renderPreview();

    const preview = detail();

    assert(preview).not.toHaveAttribute("aria-modal");

    for (const label of [
      "Date & time",
      "Location",
      "Organizer",
      "Conferencing",
      "Participants",
      "Time zone",
      "Description",
    ]) {
      assert(
        within(preview).getByRole("heading", { name: label })
      ).toBeInTheDocument();
    }

    assert(within(preview).getByText("vitaly@example.com")).toBeInTheDocument();
    assert(within(preview).getByRole("link", { name: "Join" })).toHaveAttribute(
      "href",
      "https://meet.example.com/sync"
    );
    assert(within(preview).getByText("2 guests")).toBeInTheDocument();
    assert(within(preview).getByText("1 yes, 1 no")).toBeInTheDocument();
    assert(
      within(preview).getByText("GMT+0 UTC, 09:00 - 10:00")
    ).toBeInTheDocument();
    assert(
      within(preview).getByRole("button", { name: "Edit" })
    ).toBeInTheDocument();
    assert(
      within(preview).getByRole("button", { name: "Delete" })
    ).toBeInTheDocument();
  });

  it("expands into a larger dialog and collapses back to the preview", async () => {
    const user = userEvent.setup();
    renderPreview();

    await user.click(screen.getByRole("button", { name: "Expand" }));
    assert(detail()).toHaveAttribute("aria-modal", "true");
    assert(detail()).toHaveTextContent("Not going · 1");
    assert(detail()).toHaveTextContent("Person b");
    // Up to three guests stay in the one column.
    assert(within(detail()).queryByRole("complementary")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Collapse" }));
    assert(detail()).not.toHaveAttribute("aria-modal");
  });

  it("stays open when another event card is pressed, so that card can take over", () => {
    const { onClose } = renderPreview();
    const otherCard = document.createElement("button");
    otherCard.dataset.eventId = "other";
    document.body.append(otherCard);

    fireEvent.pointerDown(otherCard);

    assert(onClose).not.toHaveBeenCalled();
    assert(detail()).toBeInTheDocument();
  });

  it("closes on an outside press elsewhere", () => {
    const { onClose } = renderPreview();

    fireEvent.pointerDown(document.body);

    assert(onClose).toHaveBeenCalledOnce();
  });

  it("puts the title first and the actions after it: edit, delete, expand, close", () => {
    renderPreview();

    const names = within(detail())
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
      .filter((name) => name !== null);
    const title = within(detail()).getByRole("heading", {
      level: 2,
      name: "1:1 sync",
    });

    assert(names.slice(0, 4)).toStrictEqual([
      "Edit",
      "Delete",
      "Expand",
      "Close",
    ]);
    assert(
      within(detail())
        .getByRole("button", { name: "Edit" })
        .compareDocumentPosition(title) & Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy();
  });

  it("shows a restricted event as a compact card with no expand control", () => {
    renderPreview({
      event: timedEvent({
        access: "busy",
        id: "busy",
        startDate: "2026-09-23",
        title: "Busy",
      }),
    });

    const card = screen.getByRole("dialog", { name: "Busy" });

    assert(within(card).queryByRole("button", { name: "Expand" })).toBeNull();
    assert(within(card).getByRole("note")).toHaveTextContent("Restricted");
    assert(
      within(card).getByRole("button", { name: "Close" })
    ).toBeInTheDocument();
  });

  it("gives four or more guests their own column, grouped by response", async () => {
    const user = userEvent.setup();
    renderPreview({
      event: timedEvent({
        attendees: [
          attendee("a", "accepted"),
          attendee("b", "accepted"),
          attendee("c", "declined"),
          attendee("d", null),
        ],
        id: "big",
        startDate: "2026-09-23",
        title: "1:1 sync",
      }),
    });

    await user.click(screen.getByRole("button", { name: "Expand" }));

    const column = within(detail()).getByRole("complementary", {
      name: "Participants",
    });

    assert(column).toHaveTextContent("4 guests");
    assert(column).toHaveTextContent("Going · 2");
    assert(column).toHaveTextContent("Not going · 1");
    assert(column).toHaveTextContent("Invited · 1");
  });

  it("opens the expanded detail from +N instead of more avatars", async () => {
    const user = userEvent.setup();
    renderPreview({
      event: timedEvent({
        attendees: Array.from({ length: 8 }, (_, index) =>
          attendee(String(index), "accepted")
        ),
        id: "many",
        startDate: "2026-09-23",
        title: "1:1 sync",
      }),
    });

    await user.click(screen.getByRole("button", { name: /\+3/u }));

    assert(detail()).toHaveAttribute("aria-modal", "true");
    assert(within(detail()).getByRole("complementary")).toHaveTextContent(
      "Person 7"
    );
  });

  it("opens as the larger dialog without an anchor", () => {
    renderPreview({ anchorElement: null });

    assert(detail()).toHaveAttribute("aria-modal", "true");
    assert(screen.queryByRole("button", { name: "Expand" })).toBeNull();
  });

  it("scrolls the body under a fixed header instead of growing the page", () => {
    const body = declarations(panelCss, ".body");
    const header = declarations(panelCss, ".header");

    assert(body.get("overflow-y")).toBe("auto");
    assert(body.get("min-block-size")).toBe("0");
    assert(header.get("flex-shrink")).toBe("0");
    assert(declarations(panelCss, ".content").get("min-block-size")).toBe("0");
  });

  // Only Delete is red; a header icon sized with the row icons keeps the muted button colour.
  it("sizes the header icons without the delete colour, and only outlines a focused join", () => {
    const headerIcon = declarations(panelCss, ".headerAction svg");
    const joinFocus = declarations(panelCss, ".joinButton:focus-visible");

    assert(headerIcon.get("block-size")).toBe("var(--cal-icon-size-sm)");
    assert(headerIcon.has("color")).toBe(false);
    assert(joinFocus.get("outline")).toBe(
      "2px solid var(--cal-color-focus-ring-strong)"
    );
    assert(joinFocus.has("display")).toBe(false);
  });

  it("keeps the delete action alone in the error colour", () => {
    assert([...declarations(panelCss, ".deleteAction").keys()]).toStrictEqual([
      "--button-fg",
      "--button-fg-hover",
    ]);
    assert(
      declarations(panelCss, ".headerAction").get("--button-fg")
    ).toBe("var(--cal-color-muted)");
  });
});
