import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, expect as assert, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type {
  CreateEventDraft,
  TimedCreateEventDraft,
} from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { CreateEventPanel } from "../public";
import type { CreateEventPanelProps } from "../public";

const DATE = calendarDate("2026-08-24");

const DRAFT: TimedCreateEventDraft = {
  allDay: false,
  calendarId: "calendar-1",
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Planning session",
};

const renderPanel = (overrides: Partial<CreateEventPanelProps> = {}) => {
  const onSubmit = vi.fn<(submitted: CreateEventDraft) => undefined>(
    () => undefined
  );

  render(
    <CreateEventPanel
      calendars={[{ colorFamily: "purple", id: "calendar-1", name: "Teaching" }]}
      conferencingProviders={[]}
      defaultDraft={DRAFT}
      defaultOpen
      direction="ltr"
      locale="en-US"
      locations={[]}
      onCancel={vi.fn<() => undefined>()}
      onSubmit={onSubmit}
      people={[]}
      t={t}
      timeZone={UTC}
      {...overrides}
    />
  );

  return onSubmit;
};

const getSubmitButton = (): HTMLElement => {
  const submit = screen
    .getAllByRole("button", { name: /create|save|submit/iu })
    .find((button) => button.getAttribute("type") === "submit");

  if (submit === undefined) throw new Error("Missing submit button");

  return submit;
};

const openLocation = (): void => {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Add a location" }));
  });
};

describe("CreateEventPanel pickers", () => {
  it("hides the conferencing field when no providers are offered", () => {
    renderPanel();

    assert(screen.queryByLabelText("Conferencing")).toBeNull();
  });

  it("shows the conferencing field when providers are offered", () => {
    renderPanel({
      conferencingProviders: [{ id: "team-sync", label: "Team Sync" }],
    });

    assert(screen.getByLabelText("Conferencing")).toBeInTheDocument();
  });

  it("keeps a draft conferencing provider when the field is hidden", () => {
    const onSubmit = renderPanel({
      defaultDraft: { ...DRAFT, conferencingProviderId: "team-sync" },
    });

    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ conferencingProviderId: "team-sync" })
    );
  });

  it("renders a plain free-text location when no locations are offered", () => {
    const onSubmit = renderPanel();

    openLocation();

    const location = screen.getByRole("textbox", { name: "Location" });

    assert(screen.queryByRole("combobox", { name: "Location" })).toBeNull();
    assert(screen.queryByText("No results")).toBeNull();

    act(() => {
      fireEvent.change(location, { target: { value: "Lobby" } });
    });
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ location: "Lobby" })
    );
  });

  it("keeps the location combobox when locations are offered and still accepts typed text", () => {
    const onSubmit = renderPanel({
      locations: [{ id: "room-1", label: "Room 204" }],
    });

    openLocation();

    const location = screen.getByRole("combobox", { name: "Location" });

    act(() => {
      fireEvent.change(location, { target: { value: "Lobby" } });
    });
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ location: "Lobby" })
    );
  });
});
