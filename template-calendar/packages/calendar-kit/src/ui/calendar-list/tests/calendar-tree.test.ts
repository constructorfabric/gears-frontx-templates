import { describe, expect, it } from "vitest";

import type { CalendarRef } from "../../../core/model";
import { buildCalendarTree, groupCalendarTree } from "../calendar-tree";

const calendar = (
  id: string,
  extra: Partial<CalendarRef> = {}
): CalendarRef => ({
  colorFamily: "turquoise",
  id,
  name: id,
  ...extra,
});

const shape = (calendars: readonly CalendarRef[]) =>
  buildCalendarTree(calendars).map((node) => [
    node.calendar.id,
    node.children.map((child) => child.calendar.id),
  ]);

describe(buildCalendarTree, () => {
  it("nests calendars under their parent and keeps list order", () => {
    expect(
      shape([
        calendar("a"),
        calendar("a1", { parentId: "a" }),
        calendar("b"),
        calendar("a2", { parentId: "a" }),
      ])
    ).toEqual([
      ["a", ["a1", "a2"]],
      ["b", []],
    ]);
  });

  it("collects a parent and all its descendants as the scope", () => {
    const [root] = buildCalendarTree([
      calendar("a"),
      calendar("a1", { parentId: "a" }),
      calendar("a11", { parentId: "a1" }),
    ]);

    expect(root?.scopeIds).toEqual(["a", "a1", "a11"]);
  });

  it("keeps a calendar at the top when its parent is not in the list or is itself", () => {
    expect(
      shape([calendar("a", { parentId: "gone" }), calendar("b", { parentId: "b" })])
    ).toEqual([
      ["a", []],
      ["b", []],
    ]);
  });

  it("does not lose calendars that name each other as parents", () => {
    expect(
      shape([calendar("a", { parentId: "b" }), calendar("b", { parentId: "a" })])
    ).toEqual([["a", ["b"]]]);
  });
});

describe(groupCalendarTree, () => {
  it("groups top-level calendars by heading in first-seen order", () => {
    const groups = groupCalendarTree(
      buildCalendarTree([
        calendar("a", { group: "Mine" }),
        calendar("b", { group: "Shared" }),
        calendar("c", { group: "Mine" }),
        calendar("d"),
      ])
    );

    expect(
      groups.map((group) => [group.label, group.nodes.map((node) => node.calendar.id)])
    ).toEqual([
      ["Mine", ["a", "c"]],
      ["Shared", ["b"]],
      [null, ["d"]],
    ]);
  });
});
