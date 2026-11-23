import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import type { CalendarAttendee } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { EventDetailPanel } from "../event-detail-panel";
import type { EventDetailPanelProps } from "../event-detail-panel";

const attendee = (
  id: string,
  response: CalendarAttendee["response"]
): CalendarAttendee => ({ displayName: `Person ${id}`, id, response });

const renderPreview = (overrides: Partial<EventDetailPanelProps> = {}) => {
  const onClose = vi.fn<() => void>();

  render(
    <EventDetailPanel
      direction="ltr"
      event={timedEvent({
        attendees: [attendee("a", "accepted"), attendee("b", "declined")],
        description: "Weekly sync",
        id: "sync",
        joinUrl: "https://join.example.com/sync",
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

  return { onClose };
};

const detail = (): HTMLElement =>
  screen.getByRole("region", { name: "1:1 sync" });

describe("EventDetailPanel inline layout", () => {
  it("renders every detail section inline in the region named by its title", () => {
    renderPreview();

    const preview = detail();

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
      "https://join.example.com/sync"
    );
    assert(
      within(preview).getByText("2 invited · 1 yes · 1 no")
    ).toBeInTheDocument();
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

  it("focuses the title when the panel opens", () => {
    renderPreview();

    assert(
      screen.getByRole("heading", { level: 2, name: "1:1 sync" })
    ).toHaveFocus();
  });

  it("closes on Escape from a header button but not on an outside press", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPreview();

    fireEvent.pointerDown(document.body);
    assert(onClose).not.toHaveBeenCalled();

    screen.getByRole("button", { name: "Close" }).focus();
    await user.keyboard("{Escape}");

    assert(onClose).toHaveBeenCalledOnce();
  });

  it("puts the title first and the actions after it: edit, delete, close", () => {
    renderPreview();

    const names = within(detail())
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
      .filter((name) => name !== null);
    const title = within(detail()).getByRole("heading", {
      level: 2,
      name: "1:1 sync",
    });

    assert(names.slice(0, 3)).toStrictEqual(["Edit", "Delete", "Close"]);
    assert(
      within(detail())
        .getByRole("button", { name: "Edit" })
        .compareDocumentPosition(title) & Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy();
  });

  it("shows a restricted event as a compact card", () => {
    renderPreview({
      event: timedEvent({
        access: "busy",
        id: "busy",
        startDate: "2026-09-23",
        title: "Busy",
      }),
    });

    const card = screen.getByRole("region", { name: "Busy" });

    assert(within(card).getByRole("note")).toHaveTextContent("Restricted");
    assert(
      within(card).getByRole("button", { name: "Close" })
    ).toBeInTheDocument();
  });

  it("opens the full guest list from +N instead of more avatars", async () => {
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

    assert(within(detail()).getByText("Person 7")).toBeInTheDocument();
  });

          });
