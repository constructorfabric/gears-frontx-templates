import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { ReactElement } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { createShadowHost } from "../../../__test-utils__/setup";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type { TimedCreateEventDraft } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { CreateEventPanel } from "../create-event-panel";
import type { CreateEventPanelProps } from "../create-event-panel";

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

const props = (
  overrides: Partial<CreateEventPanelProps> = {}
): CreateEventPanelProps => ({
  calendars: [{ colorFamily: "purple", id: "calendar-1", name: "Teaching" }],
  conferencingProviders: [],
  defaultDraft: DRAFT,
  direction: "ltr",
  locale: "en-US",
  locations: [],
  onCancel: () => {},
  onSubmit: vi.fn<() => undefined>(),
  people: [],
  t,
  timeZone: UTC,
  ...overrides,
});

const ShadowPopoverHarness = (): ReactElement => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open create event
      </button>
      <CreateEventPanel
        {...props({
          defaultOpen: undefined,
          onCancel: () => {
            setOpen(false);
          },
          onOpenChange: setOpen,
          open,
        })}
      />
    </>
  );
};

const queryShadowDialog = (
  root: ShadowRoot,
  name: RegExp
): HTMLElement | null =>
  [...root.querySelectorAll<HTMLElement>('[role="dialog"], section[aria-label]')].find((dialog) =>
    name.test(dialog.getAttribute("aria-label") ?? "")
  ) ?? null;

const getShadowDialog = (root: ShadowRoot, name: RegExp): HTMLElement => {
  const dialog = queryShadowDialog(root, name);
  if (dialog === null) {
    throw new Error(`Missing shadow-root dialog: ${name}`);
  }

  return dialog;
};

describe("CreateEventPanel attached shadow-root contract", () => {
  it("keeps the inline form in the attached shadow root and returns focus to the opener", () => {
    const { host, root } = createShadowHost();
    const container = document.createElement("div");
    root.append(container);

    render(<ShadowPopoverHarness />, { container });

    const trigger = within(container).getByRole("button", {
      name: "Open create event",
    });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = getShadowDialog(root, /create/iu);

    assert(dialog.getRootNode()).toBe(root);

    fireEvent.keyDown(dialog, { key: "Escape" });

    assert(queryShadowDialog(root, /create/iu)).toBeNull();
    assert(root.activeElement).toBe(trigger);

    host.remove();
  });

  it("keeps nested repeat Escape scoped to the child", () => {
    const { host, root } = createShadowHost();
    const container = document.createElement("div");
    root.append(container);

    render(<ShadowPopoverHarness />, { container });
    fireEvent.click(
      within(container).getByRole("button", { name: "Open create event" })
    );

    const compactDialog = getShadowDialog(root, /create/iu);
    fireEvent.change(within(compactDialog).getByLabelText(/repeat/iu), {
      target: { value: "custom" },
    });

    const repeatEditor = root.querySelector<HTMLElement>(
      '[data-testid="create-event-repeat-view"]'
    );
    if (repeatEditor === null) {
      throw new Error("Missing shadow-root repeat editor");
    }

    assert(repeatEditor.getRootNode()).toBe(root);

    fireEvent.keyDown(repeatEditor, { key: "Escape" });

    assert(
      root.querySelector('[data-testid="create-event-repeat-view"]')
    ).toBeNull();
    assert(getShadowDialog(root, /create/iu)).toBeInTheDocument();

    host.remove();
  });

  it("does not leak an overlay into document.body when the host is attached elsewhere", () => {
    const { host, root } = createShadowHost();
    const container = document.createElement("div");
    root.append(container);

    render(
      <CreateEventPanel {...props({ defaultOpen: undefined, open: true })} />,
      { container }
    );

    const dialog = getShadowDialog(root, /create/iu);

    assert(dialog.getRootNode()).toBe(root);
    assert(screen.queryByRole("region", { name: /create/iu })).toBeNull();

    host.remove();
  });
});
