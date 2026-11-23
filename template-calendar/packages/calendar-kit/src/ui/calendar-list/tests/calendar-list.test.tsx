import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CalendarRef } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { CalendarList } from "../calendar-list";
import type { CalendarListProps } from "../calendar-list";

import styles from "../calendar-list.module.css";

const CALENDARS: readonly CalendarRef[] = [
  { colorFamily: "turquoise", id: "cal-teams", name: "Teams" },
  { colorFamily: "purple", id: "cal-workshops", name: "Workshops" },
  { colorFamily: "orange", id: "cal-events", name: "Events" },
];

const baseProps = (
  overrides: Partial<CalendarListProps> = {}
): CalendarListProps => ({
  calendars: CALENDARS,
  direction: "ltr",
  hiddenCalendarIds: [],
  onHiddenCalendarIdsChange: vi.fn<() => void>(),
  t,
  ...overrides,
});

describe(CalendarList, () => {
  it("renders every calendar as a checked-by-default colour legend row", () => {
    render(<CalendarList {...baseProps()} />);

    expect(screen.getByRole("region", { name: "Calendars" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Teams" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Workshops" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Events" })).toBeChecked();
  });

  it("derives checked state from hidden ids and emits the complete hidden-id list", async () => {
    const onHiddenCalendarIdsChange =
      vi.fn<(hiddenCalendarIds: readonly string[]) => void>();

    render(
      <CalendarList
        {...baseProps({
          hiddenCalendarIds: ["cal-workshops"],
          onHiddenCalendarIdsChange,
        })}
      />
    );

    expect(screen.getByRole("checkbox", { name: "Teams" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Workshops" })).not.toBeChecked();

    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Teams" }));

    expect(onHiddenCalendarIdsChange).toHaveBeenCalledWith([
      "cal-workshops",
      "cal-teams",
    ]);

    await user.click(screen.getByRole("checkbox", { name: "Workshops" }));

    expect(onHiddenCalendarIdsChange).toHaveBeenLastCalledWith([]);
  });

  it("passes each calendar and hidden state to the renderCalendar slot", () => {
    const renderCalendar = vi.fn<
      (calendar: CalendarRef, hidden: boolean) => React.ReactNode
    >((calendar: CalendarRef, hidden: boolean) => (
      <span>{`${calendar.name}:${hidden ? "hidden" : "visible"}`}</span>
    ));

    render(
      <CalendarList
        {...baseProps({ hiddenCalendarIds: ["cal-workshops"], renderCalendar })}
      />
    );

    expect(screen.getByText("Teams:visible")).toBeVisible();
    expect(screen.getByText("Workshops:hidden")).toBeVisible();
    expect(renderCalendar).toHaveBeenCalledWith(CALENDARS[0], false);
    expect(renderCalendar).toHaveBeenCalledWith(CALENDARS[1], true);
  });

  it("uses the creation callback without inventing a creation form", async () => {
    const onCreateCalendar = vi.fn<() => void>();

    render(<CalendarList {...baseProps({ onCreateCalendar })} />);

    const create = screen.getByRole("button", { name: "Create calendar" });
    const user = userEvent.setup();
    await user.click(create);

    expect(onCreateCalendar).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("allows the creation affordance to be replaced by a slot", () => {
    render(
      <CalendarList
        {...baseProps({
          renderCreateCalendar: () => (
            <button type="button">Open calendar settings</button>
          ),
        })}
      />
    );

    expect(
      screen.getByRole("button", { name: "Open calendar settings" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Create calendar" })
    ).toBeNull();
  });

  it("renders the ordinary empty collection section when there are no calendars", () => {
    render(<CalendarList {...baseProps({ calendars: [] })} />);

    expect(screen.getByRole("region")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

          describe("options menu", () => {
    const OPTION_CALENDARS: readonly CalendarRef[] = [
      {
        canDelete: true,
        canWrite: true,
        colorFamily: "blue",
        id: "cal-personal",
        isDefault: false,
        name: "Personal",
      },
      {
        canDelete: false,
        canWrite: true,
        colorFamily: "orange",
        id: "cal-events",
        isDefault: true,
        name: "Events",
      },
    ];

    const optionActions = () => ({
      onCalendarColorChange: vi.fn<(calendarId: string, colorFamily: string) => void>(),
      onDeleteCalendar: vi.fn<(calendarId: string) => void>(),
      onMakeDefaultCalendar: vi.fn<(calendarId: string) => void>(),
      onShowOnlyCalendar: vi.fn<(calendarId: string) => void>(),
      onShowPreviouslyVisible: vi.fn<() => void>(),
    });

    it("renders no options button when no option callback is passed", () => {
      render(<CalendarList {...baseProps()} />);

      expect(screen.queryByRole("button", { name: /Options for/ })).toBeNull();
    });

    it("opens the menu with Show only, Make default and Delete", async () => {
      const user = userEvent.setup();

      render(
        <CalendarList
          {...baseProps({ calendars: OPTION_CALENDARS, ...optionActions() })}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Options for Personal" })
      );

      expect(
        screen.getByRole("button", { name: "Show only this calendar" })
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Make default" })
      ).toBeEnabled();
      expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    });

    it("disables Make default for the default calendar and Delete without access", async () => {
      const user = userEvent.setup();

      render(
        <CalendarList
          {...baseProps({ calendars: OPTION_CALENDARS, ...optionActions() })}
        />
      );

      await user.click(screen.getByRole("button", { name: "Options for Events" }));

      expect(
        screen.getByRole("button", { name: "Make default" })
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    });

    it("shows only the calendar and closes the menu", async () => {
      const user = userEvent.setup();
      const actions = optionActions();

      render(
        <CalendarList
          {...baseProps({ calendars: OPTION_CALENDARS, ...actions })}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Options for Personal" })
      );
      await user.click(
        screen.getByRole("button", { name: "Show only this calendar" })
      );

      expect(actions.onShowOnlyCalendar).toHaveBeenCalledWith("cal-personal");
      expect(
        screen.queryByRole("button", { name: "Make default" })
      ).toBeNull();
    });

    it("offers Show previously visible on the calendar shown alone", async () => {
      const user = userEvent.setup();
      const actions = optionActions();

      render(
        <CalendarList
          {...baseProps({
            calendars: OPTION_CALENDARS,
            soloCalendarId: "cal-personal",
            ...actions,
          })}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Options for Personal" })
      );

      expect(
        screen.queryByRole("button", { name: "Show only this calendar" })
      ).toBeNull();
      await user.click(
        screen.getByRole("button", { name: "Show previously visible" })
      );

      expect(actions.onShowPreviouslyVisible).toHaveBeenCalledOnce();
    });

    it("makes and deletes the calendar through its callbacks", async () => {
      const user = userEvent.setup();
      const actions = optionActions();

      render(
        <CalendarList
          {...baseProps({ calendars: OPTION_CALENDARS, ...actions })}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Options for Personal" })
      );
      await user.click(screen.getByRole("button", { name: "Make default" }));

      expect(actions.onMakeDefaultCalendar).toHaveBeenCalledWith("cal-personal");

      await user.click(
        screen.getByRole("button", { name: "Options for Personal" })
      );
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(actions.onDeleteCalendar).toHaveBeenCalledWith("cal-personal");
    });

    it("saves the picked color on Apply and keeps an unapplied pick through Cancel", async () => {
      const user = userEvent.setup();
      const actions = optionActions();

      render(
        <CalendarList
          {...baseProps({ calendars: OPTION_CALENDARS, ...actions })}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Options for Personal" })
      );
      await user.click(screen.getByRole("button", { name: /Color/ }));
      await user.click(screen.getByRole("radio", { name: "Violet" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(actions.onCalendarColorChange).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: /Color/ }));

      expect(screen.getByRole("radio", { name: "Violet" })).toBeChecked();

      await user.click(screen.getByRole("radio", { name: "Violet" }));
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(actions.onCalendarColorChange).toHaveBeenCalledWith(
        "cal-personal",
        "violet"
      );
    });

    it("moves the picked color with the arrow keys, keeping one tab stop", async () => {
      const user = userEvent.setup();

      render(
        <CalendarList
          {...baseProps({
            calendars: OPTION_CALENDARS,
            ...optionActions(),
          })}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Options for Personal" })
      );
      await user.click(screen.getByRole("button", { name: /Color/ }));

      const blue = screen.getByRole("radio", { name: "Blue" });
      const lavender = screen.getByRole("radio", { name: "Lavender" });

      expect(blue).toHaveAttribute("tabindex", "0");
      expect(lavender).toHaveAttribute("tabindex", "-1");

      blue.focus();
      await user.keyboard("{ArrowRight}");

      expect(lavender).toHaveFocus();
      expect(lavender).toBeChecked();
      expect(lavender).toHaveAttribute("tabindex", "0");
      expect(blue).toHaveAttribute("tabindex", "-1");

      await user.keyboard("{ArrowLeft}");

      expect(blue).toHaveFocus();
      expect(blue).toBeChecked();
    });
  });

  describe("nested calendars and groups", () => {
    const NESTED: readonly CalendarRef[] = [
      { colorFamily: "turquoise", group: "My calendars", id: "team-a", name: "Team A" },
      { colorFamily: "turquoise", id: "design", name: "Design", parentId: "team-a" },
      { colorFamily: "turquoise", id: "ops", name: "Ops", parentId: "team-a" },
      { colorFamily: "purple", group: "Shared calendars", id: "team", name: "Team" },
    ];

    it("lists children in a nested list under their parent and groups under headings", () => {
      render(<CalendarList {...baseProps({ calendars: NESTED })} />);

      expect(screen.getByRole("heading", { name: "My calendars" })).toBeVisible();
      expect(screen.getByRole("heading", { name: "Shared calendars" })).toBeVisible();
      expect(screen.getByRole("checkbox", { name: "Design" }).closest("ul")).toHaveClass(
        styles.nested
      );
    });

    it("marks the parent indeterminate when only some children are visible", () => {
      render(<CalendarList {...baseProps({ calendars: NESTED, hiddenCalendarIds: ["ops"] })} />);

      expect(screen.getByRole("checkbox", { name: "Team A" })).toBePartiallyChecked();
      expect(screen.getByRole("checkbox", { name: "Design" })).toBeChecked();
    });

    it("hides the parent and every child with one click, then shows them again", async () => {
      const onHiddenCalendarIdsChange = vi.fn<(ids: readonly string[]) => void>();
      const user = userEvent.setup();
      const { rerender } = render(
        <CalendarList {...baseProps({ calendars: NESTED, onHiddenCalendarIdsChange })} />
      );

      await user.click(screen.getByRole("checkbox", { name: "Team A" }));

      expect(onHiddenCalendarIdsChange).toHaveBeenLastCalledWith(["team-a", "design", "ops"]);

      rerender(
        <CalendarList
          {...baseProps({
            calendars: NESTED,
            hiddenCalendarIds: ["team-a", "design", "ops"],
            onHiddenCalendarIdsChange,
          })}
        />
      );
      await user.click(screen.getByRole("checkbox", { name: "Team A" }));

      expect(onHiddenCalendarIdsChange).toHaveBeenLastCalledWith([]);
    });

    it("shows all of a mixed parent on click", async () => {
      const onHiddenCalendarIdsChange = vi.fn<(ids: readonly string[]) => void>();

      render(
        <CalendarList
          {...baseProps({
            calendars: NESTED,
            hiddenCalendarIds: ["ops", "team"],
            onHiddenCalendarIdsChange,
          })}
        />
      );
      await userEvent.setup().click(screen.getByRole("checkbox", { name: "Team A" }));

      expect(onHiddenCalendarIdsChange).toHaveBeenLastCalledWith(["team"]);
    });
  });
});
