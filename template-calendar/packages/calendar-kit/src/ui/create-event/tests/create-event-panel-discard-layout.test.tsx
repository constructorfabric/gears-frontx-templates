import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as assert, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type {
  CreateEventDraft,
  TimedCreateEventDraft,
} from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { CreateEventPanel, registerNestedLayer } from "../public";
import type { CreateEventPanelProps } from "../public";


const DATE = calendarDate("2026-08-24");
const NEXT_DATE = calendarDate("2026-08-25");

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

const popoverProps = (
  overrides: Partial<CreateEventPanelProps> = {}
): CreateEventPanelProps => ({
  calendars: [{ colorFamily: "purple", id: "calendar-1", name: "Teaching" }],
  conferencingProviders: [],
  defaultDraft: DRAFT,
  defaultOpen: true,
  direction: "ltr",
  locale: "en-US",
  locations: [],
  onCancel: vi.fn<() => undefined>(),
  onSubmit: vi.fn<() => undefined>(),
  people: [],
  t,
  timeZone: UTC,
  ...overrides,
});

const renderPopover = (overrides: Partial<CreateEventPanelProps> = {}) =>
  render(<CreateEventPanel {...popoverProps(overrides)} />);

const getCreateDialog = (): HTMLElement =>
  screen.getByRole("region", { name: /create/iu });

const changeTitle = async (
  user: ReturnType<typeof userEvent.setup>,
  value: string
): Promise<void> => {
  const title = screen.getByLabelText("Title");
  await user.clear(title);
  await user.type(title, value);
};

describe("CreateEventPanel discard layout", () => {
  it("leaves the form open on an outside press while it is pristine", () => {
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    assert(getCreateDialog()).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    assert(getCreateDialog()).toBeInTheDocument();
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).not.toHaveBeenCalled();
  });

  it("opens the discard confirmation on a dirty outside press without reaching its target", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    const onOutsidePress = vi.fn<() => void>();
    render(
      <>
        <button onClick={onOutsidePress} type="button">
          Outside control
        </button>
        <CreateEventPanel {...popoverProps({ onCancel })} />
      </>
    );
    await changeTitle(user, "Changed before closing");

    await user.click(screen.getByRole("button", { name: "Outside control" }));

    const discardDialog = screen.getByRole("alertdialog");

    assert(discardDialog).toBeInTheDocument();
    assert(
      within(discardDialog).getByRole("button", { name: /keep/iu })
    ).toBeInTheDocument();
    assert(onOutsidePress).not.toHaveBeenCalled();
    assert(onCancel).not.toHaveBeenCalled();
  });

  it("opens the discard confirmation on Escape for a dirty draft and keeps the form", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({ onCancel });
    await changeTitle(user, "Changed before Escape");

    await user.keyboard("{Escape}");

    assert(screen.getByRole("alertdialog")).toBeInTheDocument();
    assert(getCreateDialog()).toBeInTheDocument();
    assert(onCancel).not.toHaveBeenCalled();
  });

  it("ignores a dirty-form press in a host layer registered to the form", async () => {
    const user = userEvent.setup({ delay: null });
    const hostLayer = document.createElement("div");
    hostLayer.textContent = "Host dialog";
    document.body.append(hostLayer);
    renderPopover();
    await changeTitle(user, "Changed before host dialog");
    const unregister = registerNestedLayer(
      hostLayer,
      screen.getByLabelText("Title")
    );

    fireEvent.pointerDown(hostLayer);
    assert(screen.queryByRole("alertdialog")).toBeNull();

    unregister();
    fireEvent.pointerDown(hostLayer);
    assert(screen.getByRole("alertdialog")).toBeInTheDocument();

    hostLayer.remove();
  });

  it("closes a pristine draft immediately on Escape without mounting confirmation", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    await user.keyboard("{Escape}");

    assert(screen.queryByRole("region", { name: /create/iu })).toBeNull();
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).toHaveBeenCalledOnce();
  });

  it("does not treat a pristine repeat-select interaction as a cancel request", () => {
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    const repeat = screen.getByRole("combobox", { name: /repeat/iu });
    act(() => {
      fireEvent.click(repeat);
    });
    const custom = screen.getByRole("option", { name: /custom/iu });
    act(() => {
      fireEvent.pointerDown(custom);
      fireEvent.click(custom);
    });

    assert(
      screen.getByTestId("create-event-repeat-view")
    ).toBeInTheDocument();
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).not.toHaveBeenCalled();
  });

  it("keeps a dirty shell when the portaled repeat select opens its custom card", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });

    await changeTitle(user, "Changed before opening repeat");

    const repeat = screen.getByRole("combobox", { name: /repeat/iu });
    act(() => {
      fireEvent.click(repeat);
    });
    const custom = screen.getByRole("option", { name: /custom/iu });
    act(() => {
      fireEvent.pointerDown(custom);
      fireEvent.click(custom);
    });

    assert(
      screen.getByTestId("create-event-repeat-view")
    ).toBeInTheDocument();
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).not.toHaveBeenCalled();
  });

  it("keeps the discard confirmation for a dirty draft on Escape", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    renderPopover({
      onCancel: () => {
        onCancel();
      },
    });
    await changeTitle(user, "Changed before closing");

    await user.keyboard("{Escape}");

    assert(screen.getByRole("alertdialog")).toBeInTheDocument();
    assert(onCancel).not.toHaveBeenCalled();
  });

  it("rebases a controlled draft when reopened after the host changes it while closed", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();

    const draftB: TimedCreateEventDraft = {
      ...DRAFT,
      endDate: NEXT_DATE,
      endTime: parseLocalTime("12:00"),
      startDate: NEXT_DATE,
      startTime: parseLocalTime("11:00"),
    };

    const view = renderPopover({
      defaultDraft: undefined,
      defaultOpen: undefined,
      draft: DRAFT,
      onCancel: () => {
        onCancel();
      },
      open: true,
    });

    fireEvent.keyDown(document.body, { key: "Escape" });

    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).toHaveBeenCalledOnce();

    view.rerender(
      <CreateEventPanel
        {...popoverProps({
          defaultDraft: undefined,
          defaultOpen: undefined,
          draft: draftB,
          onCancel: () => {
            onCancel();
          },
          open: false,
        })}
      />
    );
    view.rerender(
      <CreateEventPanel
        {...popoverProps({
          defaultDraft: undefined,
          defaultOpen: undefined,
          draft: draftB,
          onCancel: () => {
            onCancel();
          },
          open: true,
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Close" }));

    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).toHaveBeenCalledTimes(2);
  });

  it("uses the controlled at-open baseline when discarding edits after a reopen", async () => {
    const user = userEvent.setup({ delay: null });
    const onCancel = vi.fn<() => void>();
    const onDraftChange = vi.fn<(draft: CreateEventDraft) => void>();

    const draftB: TimedCreateEventDraft = {
      ...DRAFT,
      endDate: NEXT_DATE,
      endTime: parseLocalTime("12:00"),
      startDate: NEXT_DATE,
      startTime: parseLocalTime("11:00"),
    };

    const view = renderPopover({
      defaultDraft: undefined,
      defaultOpen: undefined,
      draft: DRAFT,
      onCancel: () => {
        onCancel();
      },
      onDraftChange: (draft) => {
        onDraftChange(draft);
      },
      open: true,
    });

    view.rerender(
      <CreateEventPanel
        {...popoverProps({
          defaultDraft: undefined,
          defaultOpen: undefined,
          draft: draftB,
          onCancel: () => {
            onCancel();
          },
          onDraftChange: (draft) => {
            onDraftChange(draft);
          },
          open: false,
        })}
      />
    );
    view.rerender(
      <CreateEventPanel
        {...popoverProps({
          defaultDraft: undefined,
          defaultOpen: undefined,
          draft: draftB,
          onCancel: () => {
            onCancel();
          },
          onDraftChange: (draft) => {
            onDraftChange(draft);
          },
          open: true,
        })}
      />
    );

    await changeTitle(user, "Changed after reopen");

    const editedDraft: TimedCreateEventDraft = {
      ...draftB,
      title: "Changed after reopen",
    };
    view.rerender(
      <CreateEventPanel
        {...popoverProps({
          defaultDraft: undefined,
          defaultOpen: undefined,
          draft: editedDraft,
          onCancel: () => {
            onCancel();
          },
          onDraftChange: (draft) => {
            onDraftChange(draft);
          },
          open: true,
        })}
      />
    );
    await user.keyboard("{Escape}");

    const discardDialog = screen.getByRole("alertdialog");

    assert(discardDialog).toBeInTheDocument();
    assert(onCancel).not.toHaveBeenCalled();

    await user.click(
      within(discardDialog).getByRole("button", { name: /keep/iu })
    );

    assert(getCreateDialog()).toBeInTheDocument();
    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(onCancel).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");

    const reopenedDiscardDialog = screen.getByRole("alertdialog");
    await user.click(
      within(reopenedDiscardDialog).getByRole("button", { name: /discard/iu })
    );

    assert(onDraftChange).toHaveBeenCalledWith(draftB);
    assert(onCancel).toHaveBeenCalledOnce();
    assert(screen.queryByRole("alertdialog")).toBeNull();
  });
});
