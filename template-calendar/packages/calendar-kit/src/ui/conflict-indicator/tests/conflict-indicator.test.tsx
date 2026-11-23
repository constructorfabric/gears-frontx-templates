import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import { identityTranslate as t } from "../../../__test-utils__/fixtures";
import type { CalendarConflict } from "../../../core/model";
import { ConflictIndicator } from "../conflict-indicator";
import type { ConflictIndicatorProps } from "../conflict-indicator";

import indicatorStyles from "../conflict-indicator.module.css";

const CONFLICTS: readonly CalendarConflict[] = [
  { dimension: "group", id: "c1", label: "Group 2" },
  { dimension: "person", id: "c2", label: "Sam Rivera" },
  { dimension: "resource", id: "c3", label: "Room 2", severity: "error" },
];

const renderIndicator = (overrides: Partial<ConflictIndicatorProps> = {}) =>
  render(
    <ConflictIndicator
      conflicts={CONFLICTS}
      t={t}
      direction="ltr"
      {...overrides}
    />
  );

const UNIT_CONFLICTS: readonly CalendarConflict[] = [
  { dimension: "person", id: "u1", label: "Sam Rivera" },
  { dimension: "resource", id: "u2", label: "Room 2" },
];

const rootElement = (container: HTMLElement): HTMLElement => {
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) {
    throw new Error("Expected ConflictIndicator to render a root element");
  }

  return root;
};

const markerNames = (): string[] =>
  screen
    .getAllByRole("img")
    .map((element) => element.getAttribute("aria-label") ?? "");

describe(ConflictIndicator, () => {
  it("visibly names every supplied dimension and its label", () => {
    const { container } = renderIndicator();
    const text = container.textContent || "";

    for (const conflict of CONFLICTS) {
      assert(text).toContain(conflict.dimension);
      assert(text).toContain(conflict.label);
    }
  });

  it("names an unknown dimension string using the supplied label", () => {
    const conflicts: readonly CalendarConflict[] = [
      { dimension: "slot", id: "c1", label: "Slot 4" },
    ];

    const { container } = renderIndicator({ conflicts });
    const text = container.textContent || "";

    assert(text).toContain("slot");
    assert(text).toContain("Slot 4");
  });

  it("replaces default rendering through the renderConflict slot", () => {
    const renderConflict = vi.fn<(conflict: CalendarConflict) => ReactNode>(
      (conflict: CalendarConflict) => <span>Clash: {conflict.label}</span>
    );
    void renderIndicator({ renderConflict });

    assert(screen.getByText("Clash: Group 2")).toBeVisible();
    assert(renderConflict).toHaveBeenCalledTimes(CONFLICTS.length);

    for (const conflict of CONFLICTS) {
      assert(renderConflict).toHaveBeenCalledWith(conflict);
    }
  });

  it("collapses visible label text in compact mode while each marker keeps dimension and label in its accessible name", () => {
    const { container } = renderIndicator({ compact: true });
    const text = container.textContent || "";
    const names = markerNames();

    for (const conflict of CONFLICTS) {
      assert(text).not.toContain(conflict.label);
      assert(text).not.toContain(conflict.dimension);

      const named = names.some(
        (name) =>
          name.includes(conflict.dimension) && name.includes(conflict.label)
      );

      assert(named).toBeTruthy();
    }
  });

  it("passes severity to the renderer and keeps naming dimension and label for every severity", () => {
    const conflicts: readonly CalendarConflict[] = [
      {
        dimension: "person",
        id: "c1",
        label: "Sam Rivera",
        severity: "warning",
      },
      {
        dimension: "resource",
        id: "c2",
        label: "Room 2",
        severity: "error",
      },
    ];

    const renderConflict = vi.fn<(conflict: CalendarConflict) => ReactNode>(
      (conflict: CalendarConflict) => <span>Clash: {conflict.label}</span>
    );
    const { container } = renderIndicator({ conflicts, renderConflict });
    const text = container.textContent || "";

    for (const conflict of conflicts) {
      assert(text).toContain(conflict.label);
    }

    assert(renderConflict).toHaveBeenCalledTimes(conflicts.length);

    for (const conflict of conflicts) {
      assert(renderConflict).toHaveBeenCalledWith(conflict);
    }
  });

  it("forwards className to the root element", () => {
    const { container } = renderIndicator({ className: "consumer-conflicts" });

    assert(rootElement(container)).toHaveClass("consumer-conflicts");
  });

  it("omits severity modifiers when a conflict carries no severity", () => {
    void renderIndicator({ conflicts: UNIT_CONFLICTS });
    const items = screen.getAllByRole("listitem");

    for (const item of items) {
      assert(item).not.toHaveClass(indicatorStyles.warning);
      assert(item).not.toHaveClass(indicatorStyles.error);
    }
  });

  it("combines compact mode with the renderConflict slot", () => {
    const renderConflict = vi.fn<(conflict: CalendarConflict) => ReactNode>(
      (conflict: CalendarConflict) => <span>Slot: {conflict.label}</span>
    );
    void renderIndicator({
      compact: true,
      conflicts: UNIT_CONFLICTS,
      renderConflict,
    });

    assert(screen.getByText("Slot: Sam Rivera")).toBeVisible();
    assert(screen.getByText("Slot: Room 2")).toBeVisible();
    assert(renderConflict).toHaveBeenCalledTimes(UNIT_CONFLICTS.length);
  });

  it("exposes the full label through a title attribute for truncated text", () => {
    const longLabel =
      "A very long resource name that will be truncated by the card layout";
    renderIndicator({
      conflicts: [{ dimension: "resource", id: "u1", label: longLabel }],
    });

    assert(screen.getByTitle(longLabel)).toHaveTextContent(longLabel);
  });

  it("renders nothing at all for an empty list, including no root element", () => {
    const { container } = renderIndicator({ conflicts: [] });

    assert(container.firstElementChild).toBeNull();
  });
});
