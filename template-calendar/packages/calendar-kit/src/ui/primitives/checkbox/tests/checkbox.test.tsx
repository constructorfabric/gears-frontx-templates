import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import type { ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "../checkbox";

import styles from "../checkbox.module.css";

describe(Checkbox, () => {
  it("delegates to the ui-kit checkbox root and forwards checked state", () => {
    const inputRef = createRef<HTMLInputElement>();
    render(
      <Checkbox aria-label="Show teams" defaultChecked ref={inputRef} />
    );
    const checkbox = screen.getByRole("checkbox", { name: "Show teams" });
    const input = inputRef.current;

    expect(checkbox.tagName).toBe("SPAN");
    expect(checkbox).toHaveAttribute("data-checked");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input).toBeChecked();
    expect(checkbox).toHaveClass(styles.checkbox);
  });

  it("bridges the native onChange callback from the ui-kit checked callback", async () => {
    const onChange = vi.fn<(event: ChangeEvent<HTMLInputElement>) => void>();
    render(<Checkbox aria-label="Show workshops" onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox", { name: "Show workshops" });
    const user = userEvent.setup();
    await user.click(checkbox);

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0].target).toBeInstanceOf(HTMLInputElement);
    expect(onChange.mock.calls[0]?.[0].target).toBeChecked();
    expect(checkbox).toHaveAttribute("data-checked");
  });

  it("forwards the hidden-input ref, id, disabled state and consumer class", () => {
    const inputRef = createRef<HTMLInputElement>();
    const { rerender } = render(
      <Checkbox
        aria-label="Show workshops"
        className="consumer-checkbox"
        id="show-workshops"
        ref={inputRef}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: "Show workshops" });
    expect(inputRef.current).toBeInstanceOf(HTMLInputElement);
    expect(inputRef.current).toHaveAttribute("id", "show-workshops");
    expect(checkbox).toHaveClass(styles.checkbox, "consumer-checkbox");

    rerender(
      <Checkbox
        aria-label="Show workshops"
        className="consumer-checkbox"
        disabled
        id="show-workshops"
        ref={inputRef}
      />
    );

    expect(checkbox).toHaveAttribute("data-disabled");
    expect(inputRef.current).toBeDisabled();
  });

  it("keeps an explicit sibling label associated with the hidden input", async () => {
    render(
      <div>
        <Checkbox id="show-teams" />
        <label htmlFor="show-teams">Show teams</label>
      </div>
    );

    const checkbox = screen.getByRole("checkbox", { name: "Show teams" });
    const user = userEvent.setup();
    await user.click(screen.getByText("Show teams"));

    expect(checkbox).toHaveAttribute("data-checked");
  });

  it("shows a dash and mixed state when indeterminate", () => {
    render(<Checkbox aria-label="Show all" indeterminate />);

    const checkbox = screen.getByRole("checkbox", { name: "Show all" });
    expect(checkbox).toHaveAttribute("data-indeterminate");
    expect(checkbox).toHaveAttribute("aria-checked", "mixed");
  });
});
