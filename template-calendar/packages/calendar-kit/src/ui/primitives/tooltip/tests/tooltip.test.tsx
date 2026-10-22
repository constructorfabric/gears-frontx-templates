import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Tooltip } from "../tooltip";

describe(Tooltip, () => {
  it("names its control on hover, inside the control's own layer", async () => {
    const user = userEvent.setup();
    render(
      <div role="dialog" aria-label="Detail">
        <Tooltip label="Edit">
          <button type="button" aria-label="Edit" />
        </Tooltip>
      </div>
    );

    await user.hover(screen.getByRole("button", { name: "Edit" }));

    const chip = await screen.findByText("Edit", {}, { timeout: 2000 });

    expect(screen.getByRole("dialog", { name: "Detail" })).toContainElement(
      chip
    );
  });
});
