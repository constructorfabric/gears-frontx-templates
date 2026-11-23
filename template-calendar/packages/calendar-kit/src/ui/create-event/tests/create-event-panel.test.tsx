import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect as assert, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import {
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
} from "../../../core/model";
import type {
  CreateEventDraft,
  CreateEventResult,
  TimedCreateEventDraft,
} from "../../../core/model";
import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import { englishTranslate as t } from "../../../i18n/english";
import { CreateEventPanel } from "../create-event-panel";
import type {
  CalendarLocationNode,
  CreateEventKind,
  CreateEventPanelHandle,
  CreateEventPanelProps,
} from "../create-event-panel";

import styles from "../create-event.module.css";

const DATE = calendarDate("2026-08-24");
const NEXT_DATE = calendarDate("2026-08-25");

const headerT: CalendarTranslate = (key) => {
  if (key.endsWith(".close")) {
    return "Close create event";
  }
  return t(key);
};

const repeatPresetT: CalendarTranslate = (key) => {
  if (key.endsWith(".none")) {
    return "No repeat";
  }
  if (key.endsWith(".daily")) {
    return "Daily";
  }
  if (key.endsWith(".weekly")) {
    return "Weekly";
  }
  if (key.endsWith(".biweekly")) {
    return "Every other week";
  }
  if (key.endsWith(".monthly")) {
    return "Monthly";
  }
  if (key.endsWith(".custom")) {
    return "Custom";
  }
  return t(key);
};

const BASE_DRAFT: TimedCreateEventDraft = {
  allDay: false,
  calendarId: "calendar-1",
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Planning session",
};

const submitSpy = (result: CreateEventResult | null = null) =>
  vi.fn<
    (submittedDraft: CreateEventDraft) => Promise<CreateEventResult> | undefined
  >(
    (
      _submittedDraft: CreateEventDraft
    ): Promise<CreateEventResult> | undefined =>
      result === null ? undefined : Promise.resolve(result)
  );

const popoverProps = (
  overrides: Partial<CreateEventPanelProps> = {}
): CreateEventPanelProps => ({
  calendars: [{ colorFamily: "purple", id: "calendar-1", name: "Teaching" }],
  conferencingProviders: [{ id: "team-sync", label: "Team Sync" }],
  defaultDraft: BASE_DRAFT,
  defaultOpen: true,
  direction: "ltr",
  locale: "en-US",
  locations: [
    { id: "room-1", label: "North Hall 204" },
    { id: "room-2", label: "Virtual room" },
  ],
  onCancel: () => {},
  onSubmit: submitSpy(),
  people: [
    { id: "person-1", label: "Ada Lovelace" },
    { id: "person-2", label: "Grace Hopper" },
  ],
  t,
  timeZone: UTC,
  ...overrides,
});

const renderPopover = (overrides: Partial<CreateEventPanelProps> = {}) =>
  render(<CreateEventPanel {...popoverProps(overrides)} />);

const getCreateDialog = (): HTMLElement =>
  screen.getByRole("region", { name: /create/iu });

const fieldRow = (field: RegExp, scope?: HTMLElement): HTMLElement => {
  let row = (scope === undefined ? screen : within(scope)).getByLabelText(
    field
  ).parentElement;

  while (
    row !== null &&
    row.querySelector('[aria-label^="Open calendar"]') === null
  ) {
    row = row.parentElement;
  }

  if (row === null) {
    throw new Error("Missing date row");
  }

  return row;
};

const openCalendarFor = (field: RegExp, scope?: HTMLElement): void => {
  const row = fieldRow(field, scope);

  act(() => {
    fireEvent.click(
      within(row).getByRole("button", { name: /open calendar/iu })
    );
  });
};

const pickDate = (field: RegExp, day: RegExp, scope?: HTMLElement): void => {
  openCalendarFor(field, scope);

  const calendar = screen.getByRole("dialog", { name: /choose date/iu });

  act(() => {
    fireEvent.click(within(calendar).getByRole("button", { name: day }));
  });
};

const clearDate = (field: RegExp): void => {
  const row = fieldRow(field);

  act(() => {
    fireEvent.click(within(row).getByRole("button", { name: /clear date/iu }));
  });
};

const getSubmitButton = (): HTMLElement =>
  screen.getByRole("button", { name: /create|save|submit/iu });

const setInputValue = async (
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
  value: string
): Promise<void> => {
  await user.clear(input);

  if (value !== "") {
    await user.type(input, value);
  }
};

const chooseSelectOption = (
  triggerName: RegExp,
  optionName: string | RegExp,
  triggerIndex = 0
): void => {
  const triggers = screen.getAllByRole("combobox", { name: triggerName });
  const trigger = triggers.find((_, index) => index === triggerIndex);
  if (trigger === undefined) {
    throw new Error(`Missing combobox ${triggerIndex}`);
  }

  act(() => {
    fireEvent.click(trigger);
  });
  const option = screen.getByRole("option", { name: optionName });
  act(() => {
    fireEvent.pointerDown(option);
    fireEvent.click(option);
  });
};

describe("CreateEventPanel public shell", () => {
  it("keeps the translated close action icon-only while preserving its accessible name", () => {
    renderPopover({ t: headerT });

    const close = screen.getByRole("button", { name: "Close create event" });

    assert(close).toHaveAttribute("aria-label", "Close create event");
    assert(close.textContent).toBe("");
  });

  it("renders the translated calendar prefix only in the calendar option", () => {
    renderPopover();

    const trigger = screen.getByRole("combobox", { name: /calendar/iu });
    assert(trigger).toHaveTextContent("Teaching");
    assert(trigger).not.toHaveTextContent("Calendar:");

    fireEvent.click(trigger);

    assert(
      screen.getByRole("option", { name: "Calendar: Teaching" })
    ).toBeInTheDocument();
  });

  it("follows controlled open state and exposes an accessible create dialog", () => {
    const { rerender } = renderPopover({ defaultOpen: undefined, open: true });

    assert(getCreateDialog()).toBeInTheDocument();

    rerender(
      <CreateEventPanel
        {...popoverProps({ defaultOpen: undefined, open: false })}
      />
    );

    assert(screen.queryByRole("region", { name: /create/iu })).toBeNull();
  });

  it("hands the current draft to renderFields so hosts can vary fields by event type", () => {
    renderPopover({
      defaultDraft: { ...BASE_DRAFT, eventTypeId: "interview" },
      renderFields: (draft) => <span>Fields for {draft.eventTypeId}</span>,
    });

    assert(screen.getByText("Fields for interview")).toBeInTheDocument();
  });

  it("renders injected directory resources and a consumer field slot without app adapters", () => {
    renderPopover({
      renderFields: () => <span>Host-specific fields</span>,
      renderFooter: () => <span>Host footer</span>,
      renderHeader: () => <span>Host header</span>,
    });

    assert(screen.getByText("Host header")).toBeInTheDocument();
    assert(screen.getByText("Host-specific fields")).toBeInTheDocument();
    assert(screen.getByText("Host footer")).toBeInTheDocument();

    const people = screen.getByLabelText(/people|attendee/iu);
    fireEvent.focus(people);
    fireEvent.change(people, { target: { value: "Ada" } });

    assert(
      screen.getByRole("option", { name: "Ada Lovelace" })
    ).toBeInTheDocument();
    assert(screen.queryByRole("option", { name: "Grace Hopper" })).toBeNull();

    act(() => {
      fireEvent.change(people, { target: { value: "Grace" } });
    });

    assert(
      screen.getByRole("option", { name: "Grace Hopper" })
    ).toBeInTheDocument();
    assert(screen.queryByRole("option", { name: "Ada Lovelace" })).toBeNull();
  });

  it("renders the form inline in its host without a portal", () => {
    render(
      <div role="group" aria-label="portal host">
        <CreateEventPanel {...popoverProps()} />
      </div>
    );

    assert(screen.getByRole("group", { name: "portal host" })).toContainElement(
      getCreateDialog()
    );
    assert(screen.queryByRole("dialog", { name: /create/iu })).toBeNull();
  });

  it("focuses the title when the form opens", () => {
    renderPopover();

    assert(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  });
});

describe("CreateEventPanel date and time row fidelity", () => {
  it("shows no day count until the dates span a day, as in the design", () => {
    renderPopover();

    assert(screen.queryByText(/\d+ days?/u)).toBeNull();

    pickDate(/end date/iu, /august 26, 2026/iu);
    assert(screen.getByText("2 days")).toBeInTheDocument();
  });

  it("shows the end date placeholder until the field is focused", () => {
    renderPopover({ defaultDraft: { ...BASE_DRAFT, endDate: null } });

    assert(screen.getByLabelText(/end date/iu)).toHaveAttribute(
      "placeholder",
      "End date"
    );
  });

  it("moves a timed end date that a later start date would pass", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    pickDate(/start date/iu, /august 26, 2026/iu);

    assert(screen.getByLabelText(/end date/iu)).toHaveValue("");
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      endDate: calendarDate("2026-08-26"),
      startDate: calendarDate("2026-08-26"),
    });
  });

  it("does not keep a timed end date picked before the start date", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    pickDate(/end date/iu, /august 20, 2026/iu);

    assert(screen.getByLabelText(/end date/iu)).toHaveValue("");
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith(BASE_DRAFT);
  });

  it("keeps the exclusive all-day end after the start date when the start moves", () => {
    const onSubmit = submitSpy();
    renderPopover({
      defaultDraft: {
        ...BASE_DRAFT,
        allDay: true,
        endDate: NEXT_DATE,
        endTime: null,
        startTime: null,
      },
      onSubmit,
    });

    pickDate(/start date/iu, /august 26, 2026/iu);

    assert(screen.getByLabelText(/end date/iu)).toHaveValue("Thu, 27 Aug");
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      allDay: true,
      endDate: calendarDate("2026-08-27"),
      endTime: null,
      startDate: calendarDate("2026-08-26"),
      startTime: null,
    });
  });

  it("keeps a typed start that passes the end, and reports the end instead of moving it", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({
      defaultDraft: { ...BASE_DRAFT, endDate: calendarDate("2026-08-30") },
      onSubmit,
    });

    await user.click(screen.getByLabelText(/start date/iu));
    await user.keyboard("0109");

    assert(screen.getByLabelText(/start date/iu)).toHaveValue("01/09/2026");
    assert(screen.getByLabelText(/end date/iu)).toHaveValue("Sun, 30 Aug");

    await user.click(screen.getByLabelText(/end date/iu));

    assert(screen.getByLabelText(/end date/iu)).toHaveValue("30/08/2026");

    await user.click(screen.getByLabelText(/title/iu));

    assert(screen.getByLabelText(/end date/iu)).toHaveValue("Sun, 30 Aug");

    const form = getCreateDialog().querySelector<HTMLFormElement>("form");
    if (form === null) {
      throw new Error("Missing create event form");
    }

    fireEvent.submit(form);

    assert(onSubmit).not.toHaveBeenCalled();
    assert(screen.getByLabelText(/end date/iu)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    assert(screen.getByRole("status")).toHaveTextContent(
      "End must be after start"
    );
  });

  it("keeps a typed end that lands before the start, and reports it instead of clearing it", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({
      defaultDraft: {
        ...BASE_DRAFT,
        endDate: calendarDate("2026-10-10"),
        startDate: calendarDate("2026-10-06"),
      },
      onSubmit,
    });

    await user.click(screen.getByLabelText(/end date/iu));
    await user.keyboard("0109");

    assert(screen.getByLabelText(/end date/iu)).toHaveValue("01/09/2026");

    await user.click(screen.getByLabelText(/title/iu));

    assert(screen.getByLabelText(/end date/iu)).toHaveValue("Tue, 1 Sep");

    const form = getCreateDialog().querySelector<HTMLFormElement>("form");
    if (form === null) {
      throw new Error("Missing create event form");
    }

    fireEvent.submit(form);

    assert(onSubmit).not.toHaveBeenCalled();
    assert(screen.getByLabelText(/end date/iu)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    assert(screen.getByRole("status")).toHaveTextContent(
      "End must be after start"
    );
  });

  it("enters an empty end date from its first segment and keeps the typed date", async () => {
    const user = userEvent.setup({ delay: null });
    renderPopover({ defaultDraft: { ...BASE_DRAFT, endDate: null } });

    await user.click(screen.getByLabelText(/end date/iu));
    await user.keyboard("12122026");
    await user.click(screen.getByLabelText(/title/iu));

    assert(screen.getByLabelText(/end date/iu)).toHaveValue("Sat, 12 Dec");
  });
});

describe("CreateEventPanel draft and validation behaviour", () => {
  it("leaves every field valid until the draft actually fails validation", () => {
    renderPopover();

    for (const label of [/title/iu, /end time/iu, /end date/iu]) {
      assert(screen.getByLabelText(label)).not.toHaveAttribute(
        "aria-invalid",
        "true"
      );
    }

    assert(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("renders no event-type field when the host passes no event types", () => {
    renderPopover();

    assert(screen.queryByRole("combobox", { name: /event type/iu })).toBeNull();
  });

  it("writes the picked host event type to the draft on submit", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({
      eventTypes: [
        { colorFamily: "green", id: "meeting", label: "Meeting" },
        { id: "workshop", label: "Workshop" },
      ],
      onSubmit,
    });

    chooseSelectOption(/event type/iu, "Meeting");
    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledWith(
      assert.objectContaining({ eventTypeId: "meeting" })
    );
  });

  it("keeps Save disabled until a required event type is picked", () => {
    renderPopover({
      eventTypeRequired: true,
      eventTypes: [{ id: "meeting", label: "Meeting" }],
    });

    assert(getSubmitButton()).toBeDisabled();

    chooseSelectOption(/event type/iu, "Meeting");

    assert(getSubmitButton()).toBeEnabled();
  });

  it("shows the event-type reason when a required event type is missing on submit", () => {
    const onSubmit = submitSpy();
    renderPopover({
      eventTypeRequired: true,
      eventTypes: [{ id: "meeting", label: "Meeting" }],
      onSubmit,
    });

    const form = getCreateDialog().querySelector<HTMLFormElement>("form");
    if (form === null) {
      throw new Error("Missing create event form");
    }

    fireEvent.submit(form);

    assert(onSubmit).not.toHaveBeenCalled();
    assert(screen.getByRole("status")).toHaveTextContent(
      "Event type is required"
    );
  });

  it("keeps Save enabled when the host requires an event type but offers none", () => {
    renderPopover({ eventTypeRequired: true });

    assert(getSubmitButton()).toBeEnabled();
  });

  it("does not apply the host event types to a reminder", () => {
    renderPopover({
      eventTypeRequired: true,
      eventTypes: [{ id: "meeting", label: "Meeting" }],
      kind: "reminder",
    });

    assert(screen.queryByRole("combobox", { name: /event type/iu })).toBeNull();
    assert(getSubmitButton()).toBeEnabled();
  });

  it("disables Save for an invalid draft and exposes field-level reasons without submitting", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    await setInputValue(user, screen.getByLabelText(/title/iu), " ");
    await setInputValue(user, screen.getByLabelText(/end time/iu), "08:00");

    const save = getSubmitButton();
    assert(save).toBeDisabled();

    await user.click(save);
    assert(onSubmit).not.toHaveBeenCalled();

    const form = getCreateDialog().querySelector<HTMLFormElement>("form");
    if (form === null) {
      throw new Error("Missing create event form");
    }

    fireEvent.submit(form);

    assert(onSubmit).not.toHaveBeenCalled();
    assert(screen.getByLabelText(/title/iu)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    assert(screen.getByLabelText(/end time/iu)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    assert(screen.getByRole("alert")).toHaveTextContent(/title|required/iu);
    assert(
      screen.getAllByRole("status").map((status) => status.textContent)
    ).toStrictEqual(assert.arrayContaining(["End must be after start"]));
  });

  it("submits an all-day draft with null clocks and an exclusive end date", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    const allDay = screen.getByRole("switch", { name: /all day/iu });
    assert(allDay).toHaveAccessibleName("All day");
    assert(allDay).toHaveAttribute("aria-checked", "false");
    await user.click(allDay);
    assert(allDay).toHaveAttribute("aria-checked", "true");

    assert(screen.getByLabelText(/start time/iu)).toBeDisabled();
    assert(screen.getByLabelText(/end time/iu)).toBeDisabled();

    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      allDay: true,
      endDate: NEXT_DATE,
      endTime: null,
      startTime: null,
    });
  });

  it("opens custom repeat as a layered popover, preserves its choices, and serializes the rule", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    chooseSelectOption(/repeat/iu, /^custom/iu);

    assert(screen.queryAllByRole("dialog")).toHaveLength(0);
    const repeatView = screen.getByTestId("create-event-repeat-view");

    assert(
      within(repeatView).queryByRole("checkbox", { name: /monday/iu })
    ).toBeNull();
    const monday = within(repeatView).getByRole("button", { name: /monday/iu });
    const wednesday = within(repeatView).getByRole("button", {
      name: /wednesday/iu,
    });
    assert(monday).toHaveAttribute("aria-pressed", "true");
    assert(wednesday).toHaveAttribute("aria-pressed", "false");
    act(() => {
      fireEvent.click(wednesday);
    });
    assert(monday).toHaveAttribute("aria-pressed", "true");
    assert(wednesday).toHaveAttribute("aria-pressed", "true");

    const interval = within(repeatView).getByRole("spinbutton", {
      name: /^(?:every|interval)$/iu,
    });
    act(() => {
      fireEvent.change(interval, { target: { value: "2" } });
    });

    act(() => {
      fireEvent.click(
        within(repeatView).getByRole("button", { name: /save/iu })
      );
    });

    assert(screen.queryByRole("alertdialog")).toBeNull();
    const mainDialog = getCreateDialog();
    assert(
      within(mainDialog).getByRole("combobox", { name: /repeat/iu })
    ).toHaveTextContent("Custom");

    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      recurrenceRule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE",
    });
  });

  it("returns from the repeat popover on Escape without closing the create dialog", () => {
    renderPopover();

    chooseSelectOption(/repeat/iu, /^custom/iu);

    assert(screen.queryAllByRole("dialog")).toHaveLength(0);
    const repeatView = screen.getByTestId("create-event-repeat-view");
    assert(
      within(repeatView).getByRole("button", { name: /save/iu })
    ).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(repeatView, { key: "Escape" });
    });

    assert(screen.queryByRole("alertdialog")).toBeNull();
    const mainDialog = getCreateDialog();
    assert(mainDialog).toBeInTheDocument();
    assert(
      within(mainDialog).getByRole("combobox", { name: /repeat/iu })
    ).toBeInTheDocument();
    assert(
      within(mainDialog).queryByLabelText(/^(?:every|interval)$/iu)
    ).toBeNull();
  });

  it("keeps the repeat card inside the create form", () => {
    renderPopover();

    chooseSelectOption(/repeat/iu, /^custom/iu);
    const createDialog = getCreateDialog();
    const repeatDialog = screen.getByTestId("create-event-repeat-view");

    assert(createDialog).toContainElement(repeatDialog);

    act(() => {
      fireEvent.click(
        within(repeatDialog).getByRole("button", { name: /save/iu })
      );
    });

    assert(screen.queryByTestId("create-event-repeat-view")).toBeNull();
    assert(getCreateDialog()).toBe(createDialog);
  });

  it("opens a draft with a non-preset rule on Custom", () => {
    renderPopover({
      defaultDraft: {
        ...BASE_DRAFT,
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE",
      },
    });

    assert(
      screen.getByRole("combobox", { name: /repeat/iu })
    ).toHaveTextContent("Custom");
  });

  it("applies repeat edits as they are made, so the xmark keeps them", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    chooseSelectOption(/repeat/iu, /^custom/iu);

    const repeatDialog = screen.getByTestId("create-event-repeat-view");
    act(() => {
      fireEvent.click(
        within(repeatDialog).getByRole("button", { name: /wednesday/iu })
      );
    });

    const repeat = screen.getByRole("combobox", { name: /repeat/iu });
    assert(repeat).toHaveTextContent("Custom");
    assert(repeat).not.toHaveAccessibleDescription(
      "Repeats every week on Monday and Wednesday"
    );

    act(() => {
      fireEvent.click(
        within(repeatDialog).getByRole("button", { name: /save/iu })
      );
    });

    assert(screen.queryByTestId("create-event-repeat-view")).toBeNull();
    assert(getCreateDialog()).toBeInTheDocument();
    assert(repeat).toHaveAccessibleDescription(
      "Repeats every week on Monday and Wednesday"
    );

    act(() => {
      fireEvent.click(getSubmitButton());
    });
    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE",
    });
  });

  it("describes the chosen repeat below the select", () => {
    renderPopover();

    chooseSelectOption(/repeat/iu, /^weekly$/iu);

    const repeat = screen.getByRole("combobox", { name: /repeat/iu });
    assert(repeat).toHaveAccessibleDescription("Repeats every week on Monday");
  });
});

describe("CreateEventPanel coverage paths", () => {
  it("commits selected directory resources and removes a cleared location", () => {
    const onSubmit = submitSpy();

    const draft: TimedCreateEventDraft = {
      ...BASE_DRAFT,
      attendeeIds: ["person-1", "missing-person"],
    };

    renderPopover({
      calendars: [
        ...popoverProps().calendars,
        { colorFamily: "orange", id: "calendar-2", name: "Research" },
      ],
      defaultDraft: draft,
      onSubmit,
    });

    assert(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    assert(screen.queryByText("missing-person")).toBeNull();

    chooseSelectOption(/calendar/iu, /Research/u);

    const people = screen.getByRole("combobox", { name: /people/iu });
    act(() => {
      fireEvent.change(people, { target: { value: "Grace" } });
    });
    const personOption = screen.getByRole("option", { name: "Grace Hopper" });
    act(() => {
      fireEvent.pointerDown(personOption);
      fireEvent.click(personOption);
    });
    assert(screen.getByText("Grace Hopper")).toBeInTheDocument();

    const addLocation = screen.getByRole("button", { name: "Add a location" });
    act(() => {
      fireEvent.click(addLocation);
    });
    const location = screen.getByRole("combobox", { name: /location/iu });
    act(() => {
      fireEvent.change(location, { target: { value: "Science" } });
    });
    assert(location).toHaveValue("Science");
    act(() => {
      fireEvent.change(location, { target: { value: "" } });
    });
    assert(location).toHaveValue("");

    chooseSelectOption(/conferencing/iu, "Team Sync");
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      attendeeIds: ["person-1", "person-2"],
      calendarId: "calendar-2",
      conferencingProviderId: "team-sync",
      location: null,
    });
  });

  it("restores timed defaults when an all-day draft is made timed again", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();

    const allDayDraft: CreateEventDraft = {
      ...BASE_DRAFT,
      allDay: true,
      endDate: NEXT_DATE,
      endTime: null,
      startTime: null,
    };

    renderPopover({ defaultDraft: allDayDraft, onSubmit });

    const allDay = screen.getByRole("switch", { name: /all day/iu });
    assert(allDay).toHaveAccessibleName("All day");
    assert(allDay).toHaveAttribute("aria-checked", "true");
    await user.click(allDay);
    assert(allDay).toHaveAttribute("aria-checked", "false");

    assert(screen.getByLabelText(/start time/iu)).toBeEnabled();
    assert(screen.getByLabelText(/end time/iu)).toBeEnabled();
    assert(screen.getByLabelText(/start time/iu)).toHaveValue("09:00");
    assert(screen.getByLabelText(/end time/iu)).toHaveValue("10:00");

    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      endDate: NEXT_DATE,
    });
  });

  it("updates date and time fields through valid and cleared values", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    pickDate(/start date/iu, /august 25, 2026/iu);
    pickDate(/end date/iu, /august 26, 2026/iu);
    clearDate(/end date/iu);
    pickDate(/end date/iu, /august 26, 2026/iu);
    act(() => {
      fireEvent.change(screen.getByLabelText(/start time/iu), {
        target: { value: "08:30" },
      });
    });
    act(() => {
      fireEvent.change(screen.getByLabelText(/end time/iu), {
        target: { value: "" },
      });
    });
    act(() => {
      fireEvent.change(screen.getByLabelText(/end time/iu), {
        target: { value: "11:30" },
      });
    });

    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      endDate: calendarDate("2026-08-26"),
      endTime: parseLocalTime("11:30"),
      startDate: calendarDate("2026-08-25"),
      startTime: parseLocalTime("08:30"),
    });
  });

  it("resolves existing recurrence rules to their matching accessible labels", () => {
    const presets = [
      { label: "No repeat", rule: null },
      { label: "No repeat", rule: "" },
      { label: "Daily", rule: "FREQ=DAILY" },
      { label: "Weekly", rule: "FREQ=WEEKLY" },
      { label: "Every other week", rule: "FREQ=WEEKLY;INTERVAL=2" },
      { label: "Monthly", rule: "FREQ=MONTHLY" },
      { label: "Custom", rule: "FREQ=YEARLY" },
    ];

    for (const preset of presets) {
      const view = renderPopover({
        defaultDraft: { ...BASE_DRAFT, recurrenceRule: preset.rule },
        t: repeatPresetT,
      });

      assert(
        screen.getByRole("combobox", { name: "Repeat" })
      ).toHaveTextContent(preset.label);
      view.unmount();
    }
  });

  it("serializes every repeat preset through the accessible Select options", () => {
    const presets = [
      { label: "No repeat", rule: null },
      { label: "Daily", rule: "FREQ=DAILY" },
      { label: "Weekly", rule: "FREQ=WEEKLY" },
      { label: "Every other week", rule: "FREQ=WEEKLY;INTERVAL=2" },
      { label: "Monthly", rule: "FREQ=MONTHLY" },
    ];

    for (const preset of presets) {
      const onSubmit = submitSpy();
      const view = renderPopover({ onSubmit, t: repeatPresetT });

      chooseSelectOption(/repeat/iu, preset.label);
      act(() => {
        fireEvent.click(getSubmitButton());
      });

      assert(onSubmit).toHaveBeenCalledWith({
        ...BASE_DRAFT,
        recurrenceRule: preset.rule,
      });
      view.unmount();
    }
  });

  it("supports custom repeat interval fallback and weekday toggling", () => {
    const onSubmit = submitSpy();

    renderPopover({ onSubmit, t: repeatPresetT });
    chooseSelectOption(/repeat/iu, /^custom/iu);

    assert(screen.queryAllByRole("dialog")).toHaveLength(0);
    const repeatView = screen.getByTestId("create-event-repeat-view");
    const interval = within(repeatView).getByRole("spinbutton", {
      name: /^(?:every|interval)$/iu,
    });

    // An empty field keeps the applied interval; below 1 falls back to 1, above 30 stops at 30.
    const enter = (value: string): void => {
      act(() => {
        fireEvent.change(interval, { target: { value } });
      });
      act(() => {
        fireEvent.blur(interval);
      });
    };
    enter("");
    assert(interval).toHaveValue(1);
    enter("45");
    assert(interval).toHaveValue(30);
    enter("0");
    assert(interval).toHaveValue(1);

    const monday = within(repeatView).getByRole("button", { name: /monday/iu });
    assert(monday).toHaveAttribute("aria-pressed", "true");
    act(() => {
      fireEvent.click(monday);
    });
    assert(monday).toHaveAttribute("aria-pressed", "false");
    act(() => {
      fireEvent.click(monday);
    });
    assert(monday).toHaveAttribute("aria-pressed", "true");

    act(() => {
      fireEvent.click(
        within(repeatView).getByRole("button", { name: /save/iu })
      );
    });
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    });
  });

  it("renders the standalone On label in the custom repeat editor", () => {
    renderPopover();
    chooseSelectOption(/repeat/iu, /^custom/iu);

    const repeatView = screen.getByTestId("create-event-repeat-view");
    assert(
      repeatView.querySelector('[id$="-repeat-on-label"]')
    ).toHaveTextContent("On");
  });

  it("marks an end-date range error on the date field", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({
      defaultDraft: { ...BASE_DRAFT, endDate: calendarDate("2026-08-23") },
      onSubmit,
    });

    const save = getSubmitButton();
    assert(save).toBeDisabled();
    await user.click(save);

    const form = getCreateDialog().querySelector<HTMLFormElement>("form");
    if (form === null) {
      throw new Error("Missing create event form");
    }

    fireEvent.submit(form);

    assert(onSubmit).not.toHaveBeenCalled();
    assert(screen.getByLabelText(/end date/iu)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    assert(screen.getByRole("status")).toHaveTextContent(
      "End must be after start"
    );
  });

  it("shows the default submit error when the host does not provide an error slot", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy({
      error: { kind: "transport", message: "Calendar service unavailable" },
    });

    renderPopover({ onSubmit });
    await user.click(getSubmitButton());

    await waitFor(() => {
      assert(
        screen.getByText("Calendar service unavailable")
      ).toBeInTheDocument();
    });
    assert(getCreateDialog()).toBeInTheDocument();
  });
});

describe("CreateEventPanel custom repeat dimming", () => {
  it("dims the form fields around the open custom repeat block", () => {
    renderPopover({ onSubmit: submitSpy() });

    chooseSelectOption(/repeat/iu, /^custom/iu);

    const fields = screen.getByLabelText(/title/iu).closest(`.${styles.fields}`);
    assert(fields).toHaveClass(styles.dimmed);
    assert(screen.getByTestId("create-event-repeat-view")).not.toHaveClass(
      styles.dimmed
    );
  });
});

describe("CreateEventPanel conflict result", () => {
  it("keeps the form open without an inline error for a conflict", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy({
      error: { kind: "conflict", message: "Room 1 is booked" },
    });

    renderPopover({ onSubmit });
    await user.click(getSubmitButton());

    await waitFor(() => {
      assert(onSubmit).toHaveBeenCalledOnce();
    });
    assert(getCreateDialog()).toBeInTheDocument();
    assert(screen.queryByText("Room 1 is booked")).toBeNull();
    assert(screen.queryByRole("status")).toBeNull();
  });
});

describe("CreateEventPanel host cancel handle", () => {
  it("resolves requestCancel with true once a clean form has closed", async () => {
    const ref = createRef<CreateEventPanelHandle>();
    const onCancel = vi.fn<() => void>();
    render(<CreateEventPanel ref={ref} {...popoverProps({ onCancel })} />);

    let closed: Promise<boolean> | undefined;
    act(() => {
      closed = ref.current?.requestCancel();
    });

    await expect(closed).resolves.toBe(true);
    assert(onCancel).toHaveBeenCalledOnce();
    assert(screen.queryByRole("region", { name: /create/iu })).toBeNull();
  });

  it("resolves requestCancel with false when the user keeps editing", async () => {
    const user = userEvent.setup({ delay: null });
    const ref = createRef<CreateEventPanelHandle>();
    render(<CreateEventPanel ref={ref} {...popoverProps()} />);

    await setInputValue(user, screen.getByLabelText(/title/iu), "Changed");

    let kept: Promise<boolean> | undefined;
    act(() => {
      kept = ref.current?.requestCancel();
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /keep/iu }));
    });

    await expect(kept).resolves.toBe(false);
    assert(getCreateDialog()).toBeInTheDocument();
  });
});

describe("CreateEventPanel discard and submit behaviour", () => {
  it("cancels a clean draft immediately and asks before discarding a dirty draft", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    await user.click(screen.getByRole("button", { name: /cancel/iu }));

    assert(onCancel).toHaveBeenCalledOnce();
    assert(screen.queryByRole("alertdialog")).toBeNull();

    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });
    await setInputValue(
      user,
      screen.getByLabelText(/title/iu),
      "Changed before closing"
    );
    await user.click(screen.getByRole("button", { name: /cancel/iu }));

    const discardDialog = screen.getByRole("alertdialog");
    assert(discardDialog).toHaveTextContent(/discard|unsaved|changed/iu);
    assert(onCancel).toHaveBeenCalledOnce();

    await user.click(
      within(discardDialog).getByRole("button", { name: /keep/iu })
    );
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(getCreateDialog()).toBeInTheDocument();
    assert(onCancel).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: /cancel/iu }));
    const discardButtons = within(screen.getByRole("alertdialog")).getAllByRole(
      "button"
    );

    const discardButton = discardButtons.at(-1);
    if (discardButton === undefined) {
      throw new Error("Missing discard confirmation button");
    }

    await user.click(discardButton);

    assert(onCancel).toHaveBeenCalledTimes(2);
  });

  it("closes the create popover after confirming discard", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    await setInputValue(
      user,
      screen.getByLabelText(/title/iu),
      "Discard this draft"
    );
    await user.click(screen.getByRole("button", { name: /cancel/iu }));

    const createDialog = getCreateDialog();
    const discardDialog = screen.getByRole("alertdialog");
    assert(createDialog).toContainElement(discardDialog);
    assert(createDialog).toContainElement(discardDialog);

    const discardButtons = within(discardDialog).getAllByRole("button");
    const discardButton = discardButtons.at(-1);
    if (discardButton === undefined) {
      throw new Error("Missing discard confirmation button");
    }

    fireEvent.pointerDown(discardButton);
    fireEvent.click(discardButton);

    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(screen.queryByRole("region", { name: /create/iu })).toBeNull();
    assert(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps the custom repeat editor inline inside the create form", () => {
    renderPopover();

    chooseSelectOption(/repeat/iu, /^custom/iu);

    const createDialog = getCreateDialog();
    const repeatEditor = screen.getByTestId("create-event-repeat-view");

    assert(createDialog).toContainElement(screen.getByLabelText(/title/iu));
    assert(createDialog).toContainElement(repeatEditor);
    assert(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders each calendar colour in the selected value and option list", () => {
    renderPopover({
      calendars: [
        { colorFamily: "purple", id: "calendar-1", name: "Teaching" },
        { colorFamily: "turquoise", id: "calendar-2", name: "Research" },
        { colorFamily: "orange", id: "calendar-3", name: "Operations" },
        { colorFamily: "green", id: "calendar-4", name: "Reviewers" },
        { colorFamily: "blue", id: "calendar-5", name: "Clients" },
        { colorFamily: "pink", id: "calendar-6", name: "Personal" },
      ],
    });

    const [calendar] = screen.getAllByRole("combobox");
    if (calendar === null) {
      throw new Error("Missing calendar select");
    }

    assert(calendar).toHaveTextContent("Teaching");

    fireEvent.click(calendar);
    assert(screen.getAllByRole("option")).toHaveLength(6);
  });

    it("picks a start date from the date row calendar", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    const [openCalendar] = screen.getAllByRole("button", {
      name: /open calendar/iu,
    });

    await user.click(openCalendar);

    const calendar = screen.getByRole("dialog", { name: /choose date/iu });

    await user.click(
      within(calendar).getByRole("button", { name: /august 12, 2026/iu })
    );

    assert(screen.getByLabelText(/start date/iu)).toHaveValue("Wed, 12 Aug");

    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      startDate: calendarDate("2026-08-12"),
    });
  });

  it("keeps the timed end date empty until a date is entered", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    const endDate = screen.getByLabelText(/end date/iu);
    assert(endDate).toHaveValue("");

    pickDate(/end date/iu, /august 25, 2026/iu);
    assert(screen.getByLabelText(/end date/iu)).toHaveValue("Tue, 25 Aug");

    act(() => {
      fireEvent.click(getSubmitButton());
    });
    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      endDate: calendarDate("2026-08-25"),
    });
  });

  it("shows the timezone offset together with its city group", () => {
    renderPopover({
      defaultDraft: {
        ...BASE_DRAFT,
        timeZone: parseIanaTimeZone("Europe/Berlin"),
      },
    });

    assert(screen.getByLabelText(/time zone/iu).getAttribute("value")).toMatch(
      /GMT.*Berlin, Bratislava, Belgrade/u
    );
  });

  it("offers never and dated custom repeat endings and serializes both policies", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });
    chooseSelectOption(/repeat/iu, /^custom/iu);

    const repeatDialog = screen.getByTestId("create-event-repeat-view");
    const repeatView = repeatDialog;

    assert(within(repeatView).getAllByRole("combobox")).toHaveLength(1);
    assert(
      within(repeatView).getByRole("spinbutton", {
        name: /^(?:every|interval)$/iu,
      })
    ).toHaveValue(1);
    assert(within(repeatView).getByText("Ends")).toBeInTheDocument();

    const never = within(repeatView).getByRole("radio", { name: /never/iu });
    const on = within(repeatView).getByRole("radio", { name: /^on$/iu });
    assert(never).toBeChecked();
    assert(on).not.toBeChecked();
    assert(within(repeatView).queryByLabelText(/end date/iu)).toBeNull();

    fireEvent.click(on);
    assert(on).toBeChecked();
    assert(within(repeatView).getByLabelText(/end date/iu)).toBeInTheDocument();
    fireEvent.click(never);
    assert(within(repeatView).queryByLabelText(/end date/iu)).toBeNull();

    act(() => {
      fireEvent.click(
        within(repeatView).getByRole("button", { name: /save/iu })
      );
    });
    act(() => {
      fireEvent.click(getSubmitButton());
    });
    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    });
  });

  it("serializes a dated custom repeat ending as an RRULE UNTIL date", () => {
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });
    chooseSelectOption(/repeat/iu, /^custom/iu);

    const repeatView = screen.getByTestId("create-event-repeat-view");
    fireEvent.click(within(repeatView).getByRole("radio", { name: /^on$/iu }));
    pickDate(/end date/iu, /august 30, 2026/iu, repeatView);
    act(() => {
      fireEvent.click(
        within(repeatView).getByRole("button", { name: /save/iu })
      );
    });
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260830",
    });
  });

  it("shows a host-rendered error, stays open, and does not duplicate an async submit", async () => {
    const onSubmit = submitSpy({
      error: { kind: "transport", message: "Calendar service unavailable" },
    });

    renderPopover({
      onSubmit,
      renderError: (error) => <span>Host error: {error.message}</span>,
    });

    act(() => {
      fireEvent.click(getSubmitButton());
      fireEvent.click(getSubmitButton());
    });

    await waitFor(() => {
      assert(
        screen.getByText("Host error: Calendar service unavailable")
      ).toBeInTheDocument();
    });
    assert(onSubmit).toHaveBeenCalledOnce();
    assert(getCreateDialog()).toBeInTheDocument();
  });

  it("submits a changed draft exactly once and keeps the callback host-owned", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({ onSubmit });

    await setInputValue(user, screen.getByLabelText(/title/iu), "Design review");
    await user.click(screen.getByRole("button", { name: "Add a location" }));
    const location = screen.getByRole("combobox", { name: /location/iu });
    act(() => {
      fireEvent.change(location, { target: { value: "North Hall 204" } });
    });
    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      location: "North Hall 204",
      title: "Design review",
    });
  });
});

describe("CreateEventPanel footer separator placement", () => {
  it("renders the footer separator above the Cancel/Save actions row", () => {
    renderPopover();

    const cancel = screen.getByRole("button", { name: /cancel/iu });
    const save = screen.getByRole("button", { name: /create|save|submit/iu });

    const dividers = within(getCreateDialog()).getAllByRole("separator", {
      hidden: true,
    });
    const divider = dividers.at(-1);
    if (divider === undefined) {
      throw new Error("Missing footer separator");
    }

    assert(divider).toHaveAttribute("aria-hidden", "true");
    assert(divider.compareDocumentPosition(cancel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    assert(divider.compareDocumentPosition(save)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });
});

describe("CreateEventPanel combobox fidelity", () => {
  it("renders both pickers with the form-layer chrome contract", async () => {
    const user = userEvent.setup({ delay: null });
    renderPopover({
      people: [
        { id: "p1", label: "Ada" },
        { id: "p2", label: "Grace" },
      ],
    });

    const peopleInput = screen.getByRole("combobox", { name: /people/iu });
    const peopleControl = peopleInput.closest<HTMLElement>(
      "[data-calendar-combobox-control]"
    );

    if (peopleControl === null) {
      throw new Error("Missing people combobox control");
    }

    assert(peopleControl).toHaveClass(styles.comboboxFieldControl);
    assert(peopleControl).not.toHaveClass(styles.comboboxFieldTags);
    assert(peopleControl).toHaveAttribute(
      "data-calendar-combobox-mode",
      "embedded"
    );
    assert(peopleControl).toHaveAttribute(
      "data-calendar-combobox-state",
      "resting"
    );

    await user.click(screen.getByRole("button", { name: "Add a location" }));
    const locationInput = screen.getByRole("combobox", { name: /location/iu });
    const locationControl = locationInput.closest<HTMLElement>(
      "[data-calendar-combobox-control]"
    );

    if (locationControl === null) {
      throw new Error("Missing location combobox control");
    }

    assert(locationControl).toHaveClass(styles.comboboxFieldControl);
    assert(locationControl).toHaveAttribute(
      "data-calendar-combobox-mode",
      "embedded"
    );
    assert(locationControl).toHaveAttribute(
      "data-calendar-combobox-state",
      "resting"
    );
    assert(
      within(locationControl).getByRole("button", { name: "Toggle options" })
    ).toBeInTheDocument();
  });

  it("pins the people tag chip structure in the create form", () => {
    renderPopover({
      defaultDraft: { ...BASE_DRAFT, attendeeIds: ["person-1"] },
    });

    const peopleInput = screen.getByRole("combobox", { name: /people/iu });
    const peopleControl = peopleInput.closest<HTMLElement>(
      "[data-calendar-combobox-control]"
    );

    if (peopleControl === null) {
      throw new Error("Missing people combobox control");
    }

    const chip = within(peopleControl)
      .getByText("Ada Lovelace")
      .closest<HTMLElement>("[data-calendar-combobox-chip]");

    if (chip === null) {
      throw new Error("Missing people chip");
    }

    assert(peopleControl).toHaveClass(styles.comboboxFieldTags);
    assert(chip).toHaveAttribute("data-calendar-combobox-value", "person-1");
    assert(chip).toHaveTextContent("Ada Lovelace");
    assert(
      within(chip).getByRole("button", {
        name: /remove ada lovelace/iu,
      })
    ).toBeInTheDocument();
  });

  it("removes one person chip and clears every chip from the people field", () => {
    const onSubmit = submitSpy();

    renderPopover({
      defaultDraft: {
        ...BASE_DRAFT,
        attendeeIds: ["person-1", "person-2"],
      },
      onSubmit,
    });

    const peopleControl = screen
      .getByRole("combobox", { name: /people/iu })
      .closest<HTMLElement>("[data-calendar-combobox-control]");

    if (peopleControl === null) {
      throw new Error("Missing people combobox control");
    }

    act(() => {
      fireEvent.click(
        within(peopleControl).getByRole("button", {
          name: /remove ada lovelace/iu,
        })
      );
    });
    assert(within(peopleControl).queryByText("Ada Lovelace")).toBeNull();

    act(() => {
      fireEvent.keyDown(screen.getByRole("combobox", { name: /people/iu }), {
        key: "Escape",
      });
    });
    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Clear selected people" })
      );
    });
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      attendeeIds: [],
      optionalAttendeeIds: [],
    });
  });

  it("opens the location combobox from the Add a location action", () => {
    renderPopover();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Add a location" }));
    });

    assert(
      screen.getByRole("combobox", { name: /location/iu })
    ).toBeInTheDocument();
    assert(
      screen.queryByRole("button", { name: "Add a location" })
    ).toBeNull();
  });

  it.each([
    ["lavender", styles.calendarColorLavender],
    ["violet", styles.calendarColorViolet],
    ["brown", styles.calendarColorBrown],
  ] as const)(
    "paints the %s calendar dot from its accent",
    (colorFamily, className) => {
      renderPopover({
        calendars: [{ colorFamily, id: "calendar-1", name: "Teaching" }],
      });

      assert(
        document.querySelector(`[data-calendar-color="${colorFamily}"]`)
      ).toHaveClass(className);
    }
  );
});

describe("CreateEventPanel inline custom repeat editor", () => {
  it("restores the preset and rule from when the editor opened on Cancel", () => {
    const onSubmit = submitSpy();
    renderPopover({
      defaultDraft: { ...BASE_DRAFT, recurrenceRule: "FREQ=DAILY" },
      onSubmit,
    });

    chooseSelectOption(/repeat/iu, /^custom/iu);
    const editor = screen.getByTestId("create-event-repeat-view");
    act(() => {
      fireEvent.click(
        within(editor).getByRole("button", { name: /wednesday/iu })
      );
    });
    act(() => {
      fireEvent.click(
        within(editor).getByRole("button", { name: /cancel/iu })
      );
    });

    assert(screen.queryByTestId("create-event-repeat-view")).toBeNull();
    assert(screen.getByRole("combobox", { name: /repeat/iu })).toHaveTextContent(
      "Daily"
    );

    act(() => {
      fireEvent.click(getSubmitButton());
    });
    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      recurrenceRule: "FREQ=DAILY",
    });
  });

  it("collapses on Escape and keeps the rule, as Save does", () => {
    renderPopover();

    chooseSelectOption(/repeat/iu, /^custom/iu);
    const editor = screen.getByTestId("create-event-repeat-view");
    act(() => {
      fireEvent.click(
        within(editor).getByRole("button", { name: /wednesday/iu })
      );
    });
    act(() => {
      fireEvent.keyDown(editor, { key: "Escape" });
    });

    assert(screen.queryByTestId("create-event-repeat-view")).toBeNull();
    assert(getCreateDialog()).toBeInTheDocument();
    assert(
      screen.getByRole("combobox", { name: /repeat/iu })
    ).toHaveAccessibleDescription("Repeats every week on Monday and Wednesday");
  });

  it("closes the editor when another preset is chosen", () => {
    renderPopover();

    chooseSelectOption(/repeat/iu, /^custom/iu);
    chooseSelectOption(/repeat/iu, /^weekly/iu);

    assert(screen.queryByTestId("create-event-repeat-view")).toBeNull();
    assert(
      screen.getByRole("combobox", { name: /repeat/iu })
    ).toHaveTextContent("Weekly");
  });

  it("reopens the saved custom rule when Custom is picked again", () => {
    renderPopover();

    chooseSelectOption(/repeat/iu, /^custom/iu);
    act(() => {
      fireEvent.click(
        within(screen.getByTestId("create-event-repeat-view")).getByRole(
          "button",
          { name: /wednesday/iu }
        )
      );
    });
    act(() => {
      fireEvent.click(
        within(screen.getByTestId("create-event-repeat-view")).getByRole(
          "button",
          { name: /save/iu }
        )
      );
    });
    chooseSelectOption(/repeat/iu, /^weekly/iu);
    chooseSelectOption(/repeat/iu, /^custom/iu);

    const reopened = screen.getByTestId("create-event-repeat-view");
    assert(
      within(reopened).getByRole("button", { name: /wednesday/iu })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("disables the other fields and Save while the editor is open, and keeps Repeat live", () => {
    renderPopover();

    chooseSelectOption(/repeat/iu, /^custom/iu);

    assert(screen.getByLabelText(/title/iu).closest("[inert]")).not.toBeNull();
    assert(
      screen.getByRole("combobox", { name: /repeat/iu })
    ).toBeEnabled();
    assert(document.querySelector('button[type="submit"]')).toBeDisabled();
  });
});

describe("CreateEventPanel Event and Reminder kinds", () => {
  it("switches kind from the header and marks the current kind as pressed", async () => {
    const user = userEvent.setup({ delay: null });
    const onKindChange = vi.fn<(kind: CreateEventKind) => void>();
    renderPopover({ kind: "event", onKindChange });

    assert(screen.getByRole("button", { name: "Event" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(screen.getByRole("button", { name: "Reminder" }));

    assert(onKindChange).toHaveBeenCalledExactlyOnceWith("reminder");
  });

  it("shows the title, URL and time zone for a reminder, without calendar, people or conferencing", () => {
    renderPopover({ kind: "reminder", onKindChange: vi.fn() });

    assert(screen.getByLabelText("Title")).toBeInTheDocument();
    assert(screen.getByLabelText("URL")).toBeInTheDocument();
    assert(screen.queryByRole("combobox", { name: "Calendar" })).toBeNull();
    assert(screen.queryByRole("combobox", { name: "People" })).toBeNull();
    assert(
      screen.queryByRole("combobox", { name: "Conferencing" })
    ).toBeNull();
    assert(screen.getByLabelText("Time zone")).toBeInTheDocument();
    assert(screen.queryByRole("button", { name: "Add a location" })).toBeNull();
  });

  it("orders a reminder from title to time zone, with notify before repeat", () => {
    renderPopover({ kind: "reminder", onKindChange: vi.fn() });

    const fields = [
      screen.getByLabelText("Title"),
      screen.getByLabelText("URL"),
      screen.getByLabelText("Start time"),
      screen.getByLabelText("End time"),
      screen.getByLabelText("Start date"),
      screen.getByLabelText("End date"),
      screen.getByRole("switch", { name: "Notify me" }),
      screen.getByRole("combobox", { name: "Repeat" }),
      screen.getByLabelText("Time zone"),
    ];
    const inDomOrder = [...fields].sort((first, second) =>
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1
    );

    expect(inDomOrder).toEqual(fields);
    expect(screen.getByLabelText("Start time")).toHaveAttribute("placeholder", "Start");
    expect(screen.getByLabelText("End time")).toHaveAttribute("placeholder", "End");
  });

  it("saves the reminder URL with the draft", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    renderPopover({ kind: "reminder", onKindChange: vi.fn(), onSubmit });

    await setInputValue(user, screen.getByLabelText("URL"), "https://example.com/prep");
    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      url: "https://example.com/prep",
    });
  });

  it("refuses a reminder URL that is not a web link and says so", async () => {
    const user = userEvent.setup({ delay: null });
    renderPopover({ kind: "reminder", onKindChange: vi.fn(), onSubmit: submitSpy() });

    const url = screen.getByLabelText("URL");
    await setInputValue(user, url, "ftp://example.com/file");

    assert(url).toHaveAttribute("aria-invalid", "true");
    assert(url).toHaveAccessibleDescription("Enter a valid value");
    assert(getSubmitButton()).toBeDisabled();

    await setInputValue(user, url, "https://example.com/prep");

    assert(url).not.toHaveAttribute("aria-invalid", "true");
    assert(getSubmitButton()).toBeEnabled();
  });

  it("clears the event-only draft fields when the kind switches to Reminder", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    const defaultDraft: CreateEventDraft = {
      ...BASE_DRAFT,
      attendeeIds: ["person-1"],
      conferencingProviderId: "team-sync",
      description: "Agenda",
      location: "North Hall 204",
    };
    const { rerender } = renderPopover({
      defaultDraft,
      kind: "event",
      onKindChange: vi.fn(),
      onSubmit,
    });

    await user.click(screen.getByRole("button", { name: "Reminder" }));
    rerender(
      <CreateEventPanel
        {...popoverProps({
          defaultDraft,
          kind: "reminder",
          onKindChange: vi.fn(),
          onSubmit,
        })}
      />
    );
    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      attendeeIds: [],
      calendarId: null,
      conferencingProviderId: null,
      description: null,
      eventTypeId: null,
      location: null,
    });
  });

  it("drops the reminder URL when the kind switches back to Event", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();
    const { rerender } = renderPopover({
      kind: "reminder",
      onKindChange: vi.fn(),
      onSubmit,
    });

    await setInputValue(user, screen.getByLabelText("URL"), "https://example.com/prep");
    await user.click(screen.getByRole("button", { name: "Event" }));
    rerender(
      <CreateEventPanel
        {...popoverProps({ kind: "event", onKindChange: vi.fn(), onSubmit })}
      />
    );
    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      notify: null,
      url: null,
    });
  });
});

describe("CreateEventPanel reminder notify", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubNotification = (
    permission: NotificationPermission,
    requestResult: NotificationPermission = "granted"
  ) => {
    const requestPermission = vi.fn(() => Promise.resolve(requestResult));

    vi.stubGlobal("Notification", { permission, requestPermission });

    return requestPermission;
  };

  it("asks the browser when Notify turns on and saves the default lead time", async () => {
    const user = userEvent.setup({ delay: null });
    const requestPermission = stubNotification("default");
    const onSubmit = submitSpy();
    renderPopover({ kind: "reminder", onKindChange: vi.fn(), onSubmit });

    await user.click(screen.getByRole("switch", { name: "Notify me" }));

    await waitFor(() => {
      assert(screen.getByRole("switch", { name: "Notify me" })).toBeChecked();
    });
    assert(requestPermission).toHaveBeenCalledOnce();
    assert(
      screen.getByRole("combobox", { name: "Notify before" })
    ).toHaveTextContent("10 minutes before");

    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      notify: { leadMinutes: 10 },
    });
  });

  it("keeps Notify on without a prompt when notifications are already granted", async () => {
    const user = userEvent.setup({ delay: null });
    const requestPermission = stubNotification("granted");
    renderPopover({ kind: "reminder", onKindChange: vi.fn() });

    await user.click(screen.getByRole("switch", { name: "Notify me" }));

    assert(screen.getByRole("switch", { name: "Notify me" })).toBeChecked();
    assert(requestPermission).not.toHaveBeenCalled();
  });

  it("keeps Notify off and explains it when notifications are denied", async () => {
    const user = userEvent.setup({ delay: null });
    const requestPermission = stubNotification("denied");
    renderPopover({ kind: "reminder", onKindChange: vi.fn() });

    await user.click(screen.getByRole("switch", { name: "Notify me" }));

    assert(screen.getByRole("switch", { name: "Notify me" })).not.toBeChecked();
    assert(requestPermission).not.toHaveBeenCalled();
    assert(screen.getByText("Enable notifications in your browser")).toBeInTheDocument();
  });

  it("keeps Notify off when the browser prompt is dismissed", async () => {
    const user = userEvent.setup({ delay: null });
    stubNotification("default", "default");
    renderPopover({ kind: "reminder", onKindChange: vi.fn() });

    await user.click(screen.getByRole("switch", { name: "Notify me" }));

    await waitFor(() => {
      assert(screen.getByText("Enable notifications in your browser")).toBeInTheDocument();
    });
    assert(screen.getByRole("switch", { name: "Notify me" })).not.toBeChecked();
  });

  it("keeps Notify off with the message when the browser has no Notification API", async () => {
    const user = userEvent.setup({ delay: null });
    vi.stubGlobal("Notification", undefined);
    renderPopover({ kind: "reminder", onKindChange: vi.fn() });

    await user.click(screen.getByRole("switch", { name: "Notify me" }));

    assert(screen.getByRole("switch", { name: "Notify me" })).not.toBeChecked();
    assert(screen.getByText("Enable notifications in your browser")).toBeInTheDocument();
  });

  it("saves the lead time chosen in Notify before", async () => {
    const user = userEvent.setup({ delay: null });
    stubNotification("granted");
    const onSubmit = submitSpy();
    renderPopover({ kind: "reminder", onKindChange: vi.fn(), onSubmit });

    await user.click(screen.getByRole("switch", { name: "Notify me" }));
    chooseSelectOption(/notify before/iu, "At time of event");
    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      notify: { leadMinutes: 0 },
    });
  });

  it("keeps a title typed while the browser prompt is pending", async () => {
    const user = userEvent.setup({ delay: null });
    let answerPrompt: (permission: NotificationPermission) => void = () =>
      undefined;
    const requestPermission = vi.fn(
      () =>
        new Promise<NotificationPermission>((resolve) => {
          answerPrompt = resolve;
        })
    );
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    renderPopover({ kind: "reminder", onKindChange: vi.fn() });

    await user.click(screen.getByRole("switch", { name: "Notify me" }));
    await user.type(screen.getByLabelText("Title"), " review");
    act(() => {
      answerPrompt("granted");
    });

    await waitFor(() => {
      assert(screen.getByRole("switch", { name: "Notify me" })).toBeChecked();
    });
    assert(screen.getByLabelText("Title")).toHaveValue("Planning session review");
  });

  it("drops the reminder-only notify when the kind switches back to Event", async () => {
    const user = userEvent.setup({ delay: null });
    stubNotification("granted");
    const onSubmit = submitSpy();
    const { rerender } = renderPopover({
      kind: "reminder",
      onKindChange: vi.fn(),
      onSubmit,
    });

    await user.click(screen.getByRole("switch", { name: "Notify me" }));
    await user.click(screen.getByRole("button", { name: "Event" }));
    rerender(
      <CreateEventPanel
        {...popoverProps({ kind: "event", onKindChange: vi.fn(), onSubmit })}
      />
    );
    await user.click(getSubmitButton());

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      notify: null,
      url: null,
    });
  });
});

describe("CreateEventPanel optional attendees", () => {
  it("marks a selected attendee optional from its chip and submits the optional ids", () => {
    const onSubmit = submitSpy();

    renderPopover({
      defaultDraft: { ...BASE_DRAFT, attendeeIds: ["person-1", "person-2"] },
      onSubmit,
    });

    const ada = screen.getByRole("button", { name: "Optional Ada Lovelace" });
    assert(ada).toHaveAttribute("aria-pressed", "false");

    act(() => {
      fireEvent.click(ada);
    });
    assert(ada).toHaveAttribute("aria-pressed", "true");

    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      attendeeIds: ["person-1", "person-2"],
      optionalAttendeeIds: ["person-1"],
    });
  });

  it("drops an attendee from the optional ids when the attendee chip is removed", () => {
    const onSubmit = submitSpy();

    renderPopover({
      defaultDraft: {
        ...BASE_DRAFT,
        attendeeIds: ["person-1", "person-2"],
        optionalAttendeeIds: ["person-1"],
      },
      onSubmit,
    });

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: /remove ada lovelace/iu })
      );
    });

    assert(
      screen.queryByRole("button", { name: "Optional Ada Lovelace" })
    ).toBeNull();

    act(() => {
      fireEvent.keyDown(screen.getByRole("combobox", { name: /people/iu }), {
        key: "Escape",
      });
    });
    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      attendeeIds: ["person-2"],
      optionalAttendeeIds: [],
    });
  });

  it("selects a group option like a person and reports its id", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = submitSpy();

    renderPopover({
      onSubmit,
      people: [{ id: "team-design", kind: "group", label: "Design team" }],
    });

    await user.click(screen.getByRole("combobox", { name: /people/iu }));
    await user.click(screen.getByRole("option", { name: "Design team" }));

    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledWith({
      ...BASE_DRAFT,
      attendeeIds: ["team-design"],
    });
  });
});

describe("CreateEventPanel location hierarchy", () => {
  const locationHierarchy: readonly CalendarLocationNode[] = [
    {
      children: [
        {
          children: [{ id: "room-204", label: "Room 204" }],
          id: "building-a",
          label: "Building A",
        },
      ],
      id: "campus-north",
      label: "North campus",
    },
    { id: "virtual", label: "Virtual" },
  ];

  const locationLevels = (): HTMLElement[] =>
    screen.getAllByRole("combobox", { name: /location/iu });

  it("reveals each level after a choice and writes only the leaf id to the draft", () => {
    const onSubmit = submitSpy();
    renderPopover({ locationHierarchy, onSubmit });

    assert(locationLevels()).toHaveLength(1);
    chooseSelectOption(/location/iu, "North campus", 0);
    chooseSelectOption(/location/iu, "Building A", 1);
    chooseSelectOption(/location/iu, "Room 204", 2);

    act(() => {
      fireEvent.click(getSubmitButton());
    });

    assert(onSubmit).toHaveBeenCalledExactlyOnceWith({
      ...BASE_DRAFT,
      location: "room-204",
    });
  });

  it("names each revealed location level by its depth", () => {
    renderPopover({ locationHierarchy });

    chooseSelectOption(/location/iu, "North campus", 0);

    assert(
      screen.getByRole("combobox", { name: "Location level 1" })
    ).toBeInTheDocument();
    assert(
      screen.getByRole("combobox", { name: "Location level 2" })
    ).toBeInTheDocument();
  });

  it("shows the levels of a location the host sets after the form is open", () => {
    const { rerender } = render(
      <CreateEventPanel
        {...popoverProps({
          draft: { ...BASE_DRAFT, location: null },
          locationHierarchy,
        })}
      />
    );

    rerender(
      <CreateEventPanel
        {...popoverProps({
          draft: { ...BASE_DRAFT, location: "room-204" },
          locationHierarchy,
        })}
      />
    );

    const levels = locationLevels();
    assert(levels).toHaveLength(3);
    assert(levels[0]?.textContent).toContain("North campus");
    assert(levels[1]?.textContent).toContain("Building A");
    assert(levels[2]?.textContent).toContain("Room 204");
  });
});
