import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RecurrenceScopeDialog } from "../recurrence-scope-dialog";
import type { RecurrenceScopeDialogProps } from "../recurrence-scope-dialog";

const baseProps = (
  overrides: Partial<RecurrenceScopeDialogProps> = {}
): RecurrenceScopeDialogProps => ({
  open: true,
  action: "edit",
  onConfirm: vi.fn<RecurrenceScopeDialogProps["onConfirm"]>(),
  onCancel: vi.fn<RecurrenceScopeDialogProps["onCancel"]>(),
  ...overrides,
});

describe(RecurrenceScopeDialog, () => {
  it("lists the three scopes with This event selected by default", () => {
    render(<RecurrenceScopeDialog {...baseProps()} />);

    expect(
      screen.getByRole("dialog", { name: "Edit recurring event" })
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: "This event" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "This and following events" })
    ).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "All events" })).not.toBeChecked();
  });

  it("confirms the selected scope", async () => {
    const props = baseProps();
    render(<RecurrenceScopeDialog {...props} />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("radio", { name: "This and following events" })
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(props.onConfirm).toHaveBeenCalledExactlyOnceWith("following");
  });

  it("confirms the series scope with the delete copy", async () => {
    const props = baseProps({ action: "delete" });
    render(<RecurrenceScopeDialog {...props} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: "All events" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(props.onConfirm).toHaveBeenCalledExactlyOnceWith("series");
  });

  it("uses the move copy for the title and confirm button", () => {
    render(<RecurrenceScopeDialog {...baseProps({ action: "move" })} />);

    expect(
      screen.getByRole("dialog", { name: "Move recurring event" })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Update" })).toBeVisible();
  });

  it("reports cancel from the footer button and from the close control", async () => {
    const props = baseProps();
    render(<RecurrenceScopeDialog {...props} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onCancel).toHaveBeenCalledTimes(2);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("resets the selected scope when the dialog reopens", async () => {
    const props = baseProps();
    const { rerender } = render(<RecurrenceScopeDialog {...props} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: "All events" }));
    rerender(<RecurrenceScopeDialog {...props} open={false} />);
    rerender(<RecurrenceScopeDialog {...props} open />);

    expect(screen.getByRole("radio", { name: "This event" })).toBeChecked();
  });

  it("renders nothing while closed", () => {
    render(<RecurrenceScopeDialog {...baseProps({ open: false })} />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
