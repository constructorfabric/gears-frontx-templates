import type { CalendarRef } from "../../core/model";

export interface CalendarNode {
  readonly calendar: CalendarRef;
  readonly children: readonly CalendarNode[];
  /** The calendar's id and the ids of everything nested under it. */
  readonly scopeIds: readonly string[];
}

export interface CalendarGroup {
  /** Heading, or `null` for calendars with no group. */
  readonly label: string | null;
  readonly nodes: readonly CalendarNode[];
}

/** Parent id of each calendar that has a usable one: it is in the list and is not the calendar itself. */
const usableParents = (
  calendars: readonly CalendarRef[]
): Map<string, string> => {
  const ids = new Set(calendars.map((calendar) => calendar.id));
  const parents = new Map<string, string>();

  for (const { id, parentId } of calendars) {
    if (
      parentId !== null &&
      parentId !== undefined &&
      parentId !== id &&
      ids.has(parentId)
    ) {
      parents.set(id, parentId);
    }
  }

  // A loop of parents would leave its calendars nowhere; the first one in the list becomes the top.
  for (const { id } of calendars) {
    const chain: string[] = [];
    let current: string | undefined = id;

    while (current !== undefined && !chain.includes(current)) {
      chain.push(current);
      current = parents.get(current);
    }

    if (current !== undefined) {
      const loop = chain.slice(chain.indexOf(current));
      const top = calendars.find((calendar) => loop.includes(calendar.id));

      if (top !== undefined) {
        parents.delete(top.id);
      }
    }
  }

  return parents;
};

/** Calendars whose parent is missing stay at the top. */
export const buildCalendarTree = (
  calendars: readonly CalendarRef[]
): readonly CalendarNode[] => {
  const parents = usableParents(calendars);
  const childrenByParent = new Map<string, CalendarRef[]>();
  const roots: CalendarRef[] = [];

  for (const calendar of calendars) {
    const parentId = parents.get(calendar.id);

    if (parentId === undefined) {
      roots.push(calendar);
    } else {
      childrenByParent.set(parentId, [
        ...(childrenByParent.get(parentId) ?? []),
        calendar,
      ]);
    }
  }

  const build = (calendar: CalendarRef): CalendarNode => {
    const children = (childrenByParent.get(calendar.id) ?? []).map(build);

    return {
      calendar,
      children,
      scopeIds: [calendar.id, ...children.flatMap((child) => child.scopeIds)],
    };
  };

  return roots.map(build);
};

/** Top-level calendars grouped by their `group` heading, in the order each heading first appears. */
export const groupCalendarTree = (
  nodes: readonly CalendarNode[]
): readonly CalendarGroup[] => {
  const groups = new Map<string | null, CalendarNode[]>();

  for (const node of nodes) {
    const label = node.calendar.group ?? null;
    groups.set(label, [...(groups.get(label) ?? []), node]);
  }

  return Array.from(groups, ([label, grouped]) => ({ label, nodes: grouped }));
};
