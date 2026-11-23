import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type {
  CreateEventDraft,
  CreateEventResult,
  TimedCreateEventDraft,
} from "../../../core/model";
import { useCreateEventController } from "../use-create-event-controller";

const DATE = calendarDate("2026-08-24");

type ControllerOptions = Parameters<typeof useCreateEventController>[0];

const draft = (): TimedCreateEventDraft => ({
  allDay: false,
  calendarId: "calendar-1",
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Planning session",
});

const noSubmit = (): Promise<CreateEventResult> | undefined => [][0];

const options = (
  overrides: Partial<ControllerOptions> = {}
): ControllerOptions => ({
  calendars: [{ colorFamily: "purple", id: "calendar-1", name: "Teaching" }],
  conferencingProviders: [{ id: "team-sync", label: "Team Sync" }],
  defaultDraft: draft(),
  locations: [{ id: "room-1", label: "North Hall 204" }],
  onCancel: () => {},
  onSubmit: noSubmit,
  people: [
    { id: "person-1", label: "Ada Lovelace" },
    { id: "person-2", label: "Grace Hopper" },
  ],
  ...overrides,
});

describe(useCreateEventController, () => {
  it("seeds an uncontrolled draft and reports dirty state after a draft update", () => {
    const { result } = renderHook(() => useCreateEventController(options()));

    const nextDraft: TimedCreateEventDraft = {
      ...draft(),
      title: "Updated planning session",
    };

    expect(result.current.draft).toStrictEqual(draft());
    expect(result.current.isDirty).toBeFalsy();

    act(() => {
      result.current.setDraft(nextDraft);
    });

    expect(result.current.draft).toStrictEqual(nextDraft);
    expect(result.current.isDirty).toBeTruthy();
  });

  it("reports dirty state when only the optional attendee ids change", () => {
    const { result } = renderHook(() =>
      useCreateEventController(
        options({ defaultDraft: { ...draft(), attendeeIds: ["person-1"] } })
      )
    );

    act(() => {
      result.current.setDraft({
        ...draft(),
        attendeeIds: ["person-1"],
        optionalAttendeeIds: ["person-1"],
      });
    });

    expect(result.current.isDirty).toBeTruthy();
  });

  it("stays clean when the host resolves its own defaults after the card is open", () => {
    const initialDraft = draft();
    const { rerender, result } = renderHook(
      (currentDraft: CreateEventDraft) =>
        useCreateEventController(options({ draft: currentDraft, open: true })),
      { initialProps: initialDraft as CreateEventDraft }
    );

    rerender({ ...initialDraft, calendarId: "calendar-2" });

    expect(result.current.isDirty).toBeFalsy();

    act(() => {
      result.current.requestCancel();
    });

    expect(result.current.isDiscardDialogOpen).toBeFalsy();
  });

  it("stays clean when a URL or description is typed and cleared again", () => {
    const { result } = renderHook(() => useCreateEventController(options()));

    act(() => {
      result.current.setDraft({ ...draft(), url: "https://example.com/prep" });
    });
    act(() => {
      result.current.setDraft({ ...draft(), url: null });
    });

    act(() => {
      result.current.setDraft({ ...draft(), description: "Agenda" });
    });
    act(() => {
      result.current.setDraft({ ...draft(), description: "" });
    });

    expect(result.current.isDirty).toBeFalsy();

    act(() => {
      result.current.requestCancel();
    });

    expect(result.current.isDiscardDialogOpen).toBeFalsy();
  });

  it.each<CreateEventDraft>([
    { ...draft(), notify: { leadMinutes: 10 } },
    { ...draft(), url: "https://example.com/prep" },
  ])("counts a changed notify or URL as an edit", (changed) => {
    const { result } = renderHook(() => useCreateEventController(options()));

    act(() => {
      result.current.setDraft(changed);
    });

    expect(result.current.isDirty).toBeTruthy();
  });

  it("uses the controlled draft as the source of truth and emits the exact replacement", () => {
    const initialDraft = draft();

    const nextDraft: TimedCreateEventDraft = {
      ...initialDraft,
      title: "Controlled replacement",
    };

    const onDraftChange = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      (controllerOptions: ControllerOptions) =>
        useCreateEventController(controllerOptions),
      {
        initialProps: options({ draft: initialDraft, onDraftChange }),
      }
    );

    act(() => {
      result.current.setDraft(nextDraft);
    });

    expect(onDraftChange).toHaveBeenCalledExactlyOnceWith(nextDraft);
    expect(result.current.draft).toStrictEqual(initialDraft);

    rerender(options({ draft: nextDraft, onDraftChange }));

    expect(result.current.draft).toStrictEqual(nextDraft);
  });

  it("keeps open state controlled until the host accepts the close request", () => {
    const onOpenChange = vi.fn<() => void>();

    const { result, rerender } = renderHook(
      (controllerOptions: ControllerOptions) =>
        useCreateEventController(controllerOptions),
      {
        initialProps: options({ onOpenChange, open: true }),
      }
    );

    expect(result.current.isOpen).toBeTruthy();

    act(() => {
      result.current.setOpen(false);
    });

    expect(result.current.isOpen).toBeTruthy();
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);

    rerender(options({ onOpenChange, open: false }));

    expect(result.current.isOpen).toBeFalsy();
  });

  it("rejects invalid draft data before invoking the host submit callback", async () => {
    const onSubmit =
      vi.fn<
        (
          submittedDraft: CreateEventDraft
        ) => Promise<CreateEventResult> | undefined
      >();

    const { result } = renderHook(() =>
      useCreateEventController(
        options({
          defaultDraft: {
            ...draft(),
            endTime: parseLocalTime("14:00"),
            startTime: parseLocalTime("15:00"),
            title: " ",
          },
          onSubmit,
        })
      )
    );

    await act(async () => await result.current.submit());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors.title).toBe("required");
    expect(result.current.errors.endTime).toBe("before-start");
  });

  it("calls the host submit callback once while an async attempt is pending", async () => {
    const { promise: pending, resolve: resolveSubmit } =
      Promise.withResolvers<CreateEventResult>();

    const onSubmit = vi.fn<
      (submittedDraft: CreateEventDraft) => Promise<CreateEventResult>
    >(async () => await pending);

    const { result } = renderHook(() =>
      useCreateEventController(options({ onSubmit }))
    );

    let firstAttempt: Promise<CreateEventResult | undefined> | undefined;
    let secondAttempt: Promise<CreateEventResult | undefined> | undefined;

    act(() => {
      firstAttempt = result.current.submit();
      secondAttempt = result.current.submit();
    });

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(draft());
    expect(result.current.isSubmitting).toBeTruthy();

    await act(async () => {
      resolveSubmit({ eventId: "event-1" });
      await firstAttempt;
      await secondAttempt;
    });

    expect(result.current.isSubmitting).toBeFalsy();
    expect(result.current.submitError).toBeNull();
  });

  it("keeps the form open and exposes a typed host error after a rejected result", async () => {
    const hostError = {
      kind: "transport" as const,
      message: "Calendar service unavailable",
    };

    const onSubmit = vi.fn<
      (submittedDraft: CreateEventDraft) => Promise<CreateEventResult>
    >(async () => await Promise.resolve({ error: hostError }));

    const { result } = renderHook(() =>
      useCreateEventController(options({ onSubmit }))
    );

    await act(async () => await result.current.submit());

    expect(result.current.submitError).toStrictEqual(hostError);
    expect(result.current.isOpen).toBeTruthy();
    expect(result.current.isSubmitting).toBeFalsy();
  });

  it("maps a rejected host promise to a transport error without calling a service itself", async () => {
    const onSubmit = vi.fn<
      (submittedDraft: CreateEventDraft) => Promise<CreateEventResult>
    >(async () => await Promise.reject(new Error("network down")));

    const { result } = renderHook(() =>
      useCreateEventController(options({ onSubmit }))
    );

    await act(async () => await result.current.submit());

    await waitFor(() => {
      expect(result.current.submitError).toStrictEqual({
        kind: "transport",
        message: "network down",
      });
    });

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("resolves requestCancel with the discard outcome", async () => {
    const onCancel = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useCreateEventController(options({ onCancel }))
    );

    act(() => {
      result.current.setDraft({ ...draft(), title: "Changed" });
    });

    let kept: Promise<boolean> | undefined;
    act(() => {
      kept = result.current.requestCancel();
    });
    act(() => {
      result.current.dismissDiscard();
    });
    await expect(kept).resolves.toBe(false);

    let discarded: Promise<boolean> | undefined;
    act(() => {
      discarded = result.current.requestCancel();
    });
    act(() => {
      result.current.confirmDiscard();
    });
    await expect(discarded).resolves.toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("cancels a clean draft immediately", () => {
    const onCancel = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useCreateEventController(options({ onCancel }))
    );

    act(() => {
      result.current.requestCancel();
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(result.current.isDiscardDialogOpen).toBeFalsy();
  });

  it("asks before discarding a dirty draft", () => {
    const onCancel = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useCreateEventController(options({ onCancel }))
    );

    act(() => {
      result.current.requestCancel();
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(result.current.isDiscardDialogOpen).toBeFalsy();

    act(() => {
      result.current.setDraft({ ...draft(), title: "Changed before closing" });
    });
    act(() => {
      result.current.requestCancel();
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(result.current.isDiscardDialogOpen).toBeTruthy();
  });

  it("dismisses the dirty-draft confirmation", () => {
    const onCancel = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useCreateEventController(options({ onCancel }))
    );

    act(() => {
      result.current.setDraft({ ...draft(), title: "Changed before closing" });
      result.current.requestCancel();
      result.current.dismissDiscard();
    });

    expect(result.current.isDiscardDialogOpen).toBeFalsy();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("confirms discarding the dirty draft", () => {
    const onCancel = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useCreateEventController(options({ onCancel }))
    );

    act(() => {
      result.current.setDraft({ ...draft(), title: "Changed before closing" });
      result.current.requestCancel();
      result.current.confirmDiscard();
    });

    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(result.current.isDiscardDialogOpen).toBeFalsy();
  });

  it("tells the host whether its close request closed the form", async () => {
    const { result } = renderHook(() => useCreateEventController(options()));
    let cleanClose = Promise.resolve(false);

    act(() => {
      cleanClose = result.current.requestCancel();
    });

    await expect(cleanClose).resolves.toBeTruthy();

    act(() => {
      result.current.setOpen(true);
    });
    act(() => {
      result.current.setDraft({ ...draft(), title: "Unsaved" });
    });

    let kept = Promise.resolve(true);

    act(() => {
      kept = result.current.requestCancel();
    });
    act(() => {
      result.current.dismissDiscard();
    });

    await expect(kept).resolves.toBeFalsy();

    let discarded = Promise.resolve(false);

    act(() => {
      discarded = result.current.requestCancel();
    });
    act(() => {
      result.current.confirmDiscard();
    });

    await expect(discarded).resolves.toBeTruthy();
    expect(result.current.isOpen).toBeFalsy();
  });

  describe("focus return", () => {
    let opener: HTMLButtonElement;

    // A focused field inside the form is removed with the form on close. React keeps focus on a
    // connected element after a commit, so the field must leave the document first.
    let field: HTMLInputElement;

    beforeEach(() => {
      opener = document.createElement("button");
      field = document.createElement("input");
      document.body.append(opener, field);
      opener.focus();
    });

    afterEach(() => {
      document.body.innerHTML = "";
    });

    it("returns focus to the opener when the form closes", () => {
      const { result } = renderHook(() => useCreateEventController(options()));
      field.focus();
      field.remove();

      act(() => {
        result.current.requestCancel();
      });

      expect(document.activeElement).toBe(opener);
    });

    it("returns focus to the opener when a host-controlled open turns false", () => {
      const { rerender } = renderHook(
        (controllerOptions: ControllerOptions) =>
          useCreateEventController(controllerOptions),
        { initialProps: options({ open: true }) }
      );
      field.focus();
      field.remove();

      rerender(options({ open: false }));

      expect(document.activeElement).toBe(opener);
    });

    it("returns focus to the opener when the form unmounts", () => {
      const { unmount } = renderHook(() => useCreateEventController(options()));
      field.focus();
      field.remove();

      unmount();

      expect(document.activeElement).toBe(opener);
    });
  });
});
