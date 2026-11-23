# Recipes

Working patterns for the questions hosts ask most. Every example on this page is a real file under `demo/examples/recipes/`, type-checked against the published package on every build, and embedded here by `npm run docs`.

## Map your API data once

Parse at the boundary so bad data fails where it enters, not as an event drawn at the wrong hour. Keep the host fields you need in slots in `metadata`. All-day `endDate` is exclusive: a one-day event on the 24th ends on the 25th.

<!-- generated:example demo/examples/recipes/map-host-events.ts -->

```ts
// demo/examples/recipes/map-host-events.ts
import {
  calendarDate,
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
} from "@gears-frontx/calendar-kit";
import type { CalendarEvent } from "@gears-frontx/calendar-kit";

interface ApiEvent {
  readonly id: string;
  readonly name: string;
  readonly zone: string;
  readonly allDay: boolean;
  readonly startDate: string;
  readonly endDate: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly location?: string;
  readonly itemId?: string;
  readonly canEdit: boolean;
}

export interface ItemMetadata {
  readonly itemId: string | null;
  readonly canEdit: boolean;
}

export const toCalendarEvent = (
  api: ApiEvent
): CalendarEvent<ItemMetadata> => {
  const timeZone = parseIanaTimeZone(api.zone);
  const startDate = calendarDate(api.startDate);
  const endDate = calendarDate(api.endDate);

  const shared = {
    colorFamily: "turquoise",
    id: api.id,
    location: api.location ?? null,
    metadata: { canEdit: api.canEdit, itemId: api.itemId ?? null },
    timeZone,
    title: api.name,
  } as const;

  if (api.allDay) {
    return {
      ...shared,
      allDay: true,
      endDate,
      endTime: null,
      startDate,
      startTime: null,
    };
  }

  const startTime = parseLocalTime(api.startTime ?? "00:00");
  const endTime = parseLocalTime(api.endTime ?? "00:00");

  return {
    ...shared,
    allDay: false,
    end: fromViewerDateTime({ date: endDate, time: endTime, timeZone }),
    endDate,
    endTime,
    start: fromViewerDateTime({ date: startDate, time: startTime, timeZone }),
    startDate,
    startTime,
  };
};
```

<!-- /generated -->

## A complete calendar screen

Toolbar, the four views, an inline detail panel and quick-create. The host owns the date, the view, which event is open and the draft.

<!-- generated:example demo/examples/recipes/calendar-screen.tsx -->

```tsx
// demo/examples/recipes/calendar-screen.tsx
import {
  AgendaView,
  CalendarToolbar,
  CreateEventPanel,
  DayGrid,
  EventDetailPanel,
  MonthGrid,
  WeekGrid,
  addCalendarDays,
  addCalendarMonths,
  parseLocalTime,
} from "@gears-frontx/calendar-kit";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarQuickCreatePayload,
  CalendarRef,
  CalendarView,
  CreateEventDraft,
  CreateEventResult,
  IanaTimeZone,
} from "@gears-frontx/calendar-kit";
import { useState } from "react";

interface CalendarScreenProps {
  readonly today: CalendarDate;
  readonly timeZone: IanaTimeZone;
  readonly events: readonly CalendarEvent[];
  readonly calendars: readonly CalendarRef[];
  readonly createEvent: (draft: CreateEventDraft) => Promise<CreateEventResult>;
}

const stepDate = (
  date: CalendarDate,
  view: CalendarView,
  sign: 1 | -1
): CalendarDate => {
  if (view === "month") {
    return addCalendarMonths(date, sign);
  }

  const days = { agenda: 30, day: 1, week: 7 } as const;

  return addCalendarDays(date, sign * days[view]);
};

interface OpenDetail {
  readonly event: CalendarEvent;
}

interface OpenCreate {
  readonly draft: CreateEventDraft;
}

export const CalendarScreen = ({
  today,
  timeZone,
  events,
  calendars,
  createEvent,
}: CalendarScreenProps) => {
  const [view, setView] = useState<CalendarView>("week");

  const [date, setDate] = useState(today);

  const [detail, setDetail] = useState<OpenDetail | null>(null);

  const [create, setCreate] = useState<OpenCreate | null>(null);

  const openDetail = (event: CalendarEvent): void => {
    setDetail({ event });
  };

  const openCreate = ({ range }: CalendarQuickCreatePayload): void => {
    setCreate({
      draft: {
        allDay: false,
        calendarId: calendars[0]?.id ?? null,
        endDate: null,
        endTime: parseLocalTime(range.end.endTime),
        startDate: range.start.date,
        startTime: parseLocalTime(range.start.startTime),
        timeZone,
        title: "",
      },
    });
  };

  const shared = { date, events, onEventSelect: openDetail, timeZone } as const;

  return (
    <section>
      <CalendarToolbar
        currentDate={date}
        activeView={view}
        onViewChange={setView}
        onToday={() => {
          setDate(today);
        }}
        onPrevious={() => {
          setDate(stepDate(date, view, -1));
        }}
        onNext={() => {
          setDate(stepDate(date, view, 1));
        }}
      />

      {view === "day" && <DayGrid {...shared} onQuickCreate={openCreate} />}
      {view === "week" && (
        <WeekGrid {...shared} visibleDays={7} onQuickCreate={openCreate} />
      )}
      {view === "month" && <MonthGrid {...shared} />}
      {view === "agenda" && <AgendaView {...shared} />}

      <EventDetailPanel
        open={detail !== null}
        event={detail?.event ?? null}
        timeZone={timeZone}
        onClose={() => {
          setDetail(null);
        }}
      />

      {create !== null && (
        <CreateEventPanel
          open
          defaultDraft={create.draft}
          timeZone={timeZone}
          calendars={calendars}
          people={[]}
          locations={[]}
          conferencingProviders={[]}
          onSubmit={createEvent}
          onCancel={() => {
            setCreate(null);
          }}
          onOpenChange={(open) => {
            if (!open) {
              setCreate(null);
            }
          }}
        />
      )}
    </section>
  );
};
```

<!-- /generated -->

Things worth copying:

- `EventDetailPanel` renders inline. Put it in a side sheet or a fixed column of your layout; the kit does not position it beside the card.
- `onQuickCreate` gives a `DOMRectReadOnly`; `CreateEventPanel` wants a `DOMRect`, hence `DOMRect.fromRect`.
- Stepping by view (`addCalendarDays` for day, week and agenda, `addCalendarMonths` for month) stays in viewer days, so it is daylight-saving safe.

## Translations from your i18n library

Both providers at the root. The kit asks for canonical `calendar.*` ids with raw values; returning the id, `""` or `undefined` falls through to English.

<!-- generated:example demo/examples/recipes/host-translations.tsx -->

```tsx
// demo/examples/recipes/host-translations.tsx
import {
  CalendarLocalizationProvider,
  CalendarProvider,
  parseIanaTimeZone,
} from "@gears-frontx/calendar-kit";
import type {
  CalendarDirection,
  CalendarTranslate,
} from "@gears-frontx/calendar-kit";
import type { ReactNode } from "react";

interface HostI18n {
  readonly language: string;
  readonly dir: CalendarDirection;
  readonly t: (
    key: string,
    values?: Readonly<Record<string, string | number>>
  ) => string | undefined;
}

export const CalendarI18nRoot = ({
  i18n,
  children,
}: {
  readonly i18n: HostI18n;
  readonly children: ReactNode;
}) => {
  const translate: CalendarTranslate = (id, values) =>
    i18n.t(`calendar:${id}`, values) ?? id;

  return (
    <CalendarProvider timeZone={parseIanaTimeZone("Europe/Istanbul")}>
      <CalendarLocalizationProvider
        direction={i18n.dir}
        locale={i18n.language}
        onMissingTranslation={(id) => {
          console.warn("calendar translation has no text", id);
        }}
        messages={{
          // A catalogue is keyed by locale, so a language swap needs no other change.
          [i18n.language]: { "calendar.toolbar.today": "Now" },
        }}
        t={translate}
      >
        {children}
      </CalendarLocalizationProvider>
    </CalendarProvider>
  );
};
```

<!-- /generated -->

## Custom event rendering

Keep the kit card and replace one row, with typed metadata and no casts.

<!-- generated:example demo/examples/recipes/custom-event-rendering.tsx -->

```tsx
// demo/examples/recipes/custom-event-rendering.tsx
import { EventCard, WeekGrid } from "@gears-frontx/calendar-kit";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarEventRenderContext,
} from "@gears-frontx/calendar-kit";

import type { ItemMetadata } from "./map-host-events";

const ItemCard = (context: CalendarEventRenderContext<ItemMetadata>) => (
  <EventCard<ItemMetadata>
    event={context.event}
    segment={context.segment}
    geometry={context.geometry}
    positioned={false}
    selected={context.isSelected}
    past={context.isPast}
    readOnly={context.isReadOnly}
    renderMetadata={({ event }) => {
      const itemId = event.metadata?.itemId ?? null;

      return itemId === null ? null : <span>{itemId}</span>;
    }}
  />
);

export const ItemWeek = ({
  date,
  events,
}: {
  readonly date: CalendarDate;
  readonly events: readonly CalendarEvent<ItemMetadata>[];
}) => (
  <WeekGrid<ItemMetadata>
    date={date}
    events={events}
    renderEvent={ItemCard}
  />
);
```

<!-- /generated -->

## Mark conflicting cards

`getEventFrameProps` adds a class and a `data-tone` to the card frame, for both the default card and `renderEvent`. Style the state in host CSS, keyed on the tone. The kit sets no inline style on the frame, so its focus outline stays intact.

<!-- generated:example demo/examples/recipes/event-frame-state.tsx -->

```tsx
// demo/examples/recipes/event-frame-state.tsx
import { WeekGrid } from "@gears-frontx/calendar-kit";
import type { CalendarDate, CalendarEvent } from "@gears-frontx/calendar-kit";

export const ConflictWeek = ({
  date,
  events,
  conflictIds,
}: {
  readonly date: CalendarDate;
  readonly events: readonly CalendarEvent[];
  readonly conflictIds: ReadonlySet<string>;
}) => (
  <WeekGrid
    date={date}
    events={events}
    getEventFrameProps={({ event }) =>
      conflictIds.has(event.id)
        ? { className: "conflict-frame", "data-tone": "conflict" }
        : undefined
    }
  />
);
```

<!-- /generated -->

```css
.workshop-conflict[data-tone="conflict"] {
  background: repeating-linear-gradient(45deg, #fde2e2 0 6px, #fff 6px 12px);
}
```

## Confirm moves with your server

`paint-and-move` never moves an event itself: persist the request, then call `confirm`, or `cancel` to snap it back and restore focus.

<!-- generated:example demo/examples/recipes/confirm-moves.tsx -->

```tsx
// demo/examples/recipes/confirm-moves.tsx
import { WeekGrid } from "@gears-frontx/calendar-kit";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarMoveRequest,
  CalendarSelectionRange,
} from "@gears-frontx/calendar-kit";

interface ConfirmMovesProps {
  readonly date: CalendarDate;
  readonly events: readonly CalendarEvent[];
  readonly saveMove: (eventId: string, startIso: string) => Promise<boolean>;
  readonly proposeSlot: (range: CalendarSelectionRange) => void;
}

export const ConfirmMoves = ({
  date,
  events,
  saveMove,
  proposeSlot,
}: ConfirmMovesProps) => {
  const settleMove = async (request: CalendarMoveRequest): Promise<void> => {
    const saved = await saveMove(request.event.id, request.to.start);

    if (saved) {
      request.confirm();

      return;
    }

    request.cancel();
  };

  const handleMove = (request: CalendarMoveRequest): void => {
    void settleMove(request);
  };

  return (
    <WeekGrid
      date={date}
      events={events}
      interactionMode="paint-and-move"
      onMoveRequest={handleMove}
      onPaintSelect={proposeSlot}
    />
  );
};
```

<!-- /generated -->

## Pick free time

The host decides which cells are free; the grid paints only over those and reports an ordered range.

<!-- generated:example demo/examples/recipes/availability-picker.tsx -->

```tsx
// demo/examples/recipes/availability-picker.tsx
import { AvailabilityGrid } from "@gears-frontx/calendar-kit";
import type {
  CalendarAvailabilityCell,
  CalendarSelectionRange,
} from "@gears-frontx/calendar-kit";
import { useState } from "react";

export const AvailabilityPicker = ({
  cells,
}: {
  readonly cells: readonly CalendarAvailabilityCell[];
}) => {
  const [range, setRange] = useState<CalendarSelectionRange | null>(null);

  return (
    <>
      <AvailabilityGrid
        cells={cells}
        selectedRange={range ?? undefined}
        onSelectedRangeChange={setRange}
      />
      {range !== null && (
        <p>
          {range.start.date} {range.start.startTime}–{range.end.endTime} (
          {range.cells.length} slots)
        </p>
      )}
    </>
  );
};
```

<!-- /generated -->

## Inside a shadow root

Micro-frontends that mount into a shadow root need two things: the theme on the host element, and overlays portaled inside the root. Call `setShadowTheme` on mount and on every theme change; `container` picks a specific element for the overlays.

<!-- generated:example demo/examples/recipes/shadow-theme.ts -->

```ts
// demo/examples/recipes/shadow-theme.ts
export const setShadowTheme = (
  root: ShadowRoot,
  theme: "light" | "dark"
): void => {
  if (root.host instanceof HTMLElement) {
    root.host.dataset.theme = theme;
  }
};
```

<!-- /generated -->

<!-- generated:example demo/examples/recipes/shadow-detail.tsx -->

```tsx
// demo/examples/recipes/shadow-detail.tsx
import { EventDetailPanel } from "@gears-frontx/calendar-kit";
import type { CalendarEvent } from "@gears-frontx/calendar-kit";

export const ShadowDetail = ({
  overlayContainer,
  event,
  onClose,
}: {
  readonly overlayContainer: HTMLElement;
  readonly event: CalendarEvent | null;
  readonly onClose: () => void;
}) => (
  <EventDetailPanel
    open={event !== null}
    event={event}
    container={overlayContainer}
    onClose={onClose}
  />
);
```

<!-- /generated -->

## Event detail in your own sheet

Put `EventDetailContent` in a host sheet, and add host rows with the kit's section, row and divider parts so they match the kit's detail. The host owns open state, the sheet and focus return. Close runs through `onClose`.

```tsx
import {
  EventDetailContent,
  EventDetailDivider,
  EventDetailRow,
  EventDetailSection,
} from "@gears-frontx/calendar-kit";
import type { CalendarEvent } from "@gears-frontx/calendar-kit";

export const EventSheet = ({
  event,
  onClose,
}: {
  readonly event: CalendarEvent | null;
  readonly onClose: () => void;
}) => (
  <div role="complementary">
    <EventDetailContent
      event={event}
      onClose={onClose}
      open={event !== null}
      renderMetadata={(current) => (
        <>
          <EventDetailDivider />
          <EventDetailSection>
            <EventDetailRow label="Room">{current.location ?? "No room"}</EventDetailRow>
          </EventDetailSection>
        </>
      )}
    />
  </div>
);
```

## Your own markup on the kit's logic

See [Headless controllers](headless.md#example-your-own-toolbar).

## More patterns

- **Read-only screens:** `interactionMode="read-only"` on the grids, `readOnly` on `EventDetailPanel`, and leave out `onEdit`/`onDelete`.
- **Five-day weeks with short days:** `visibleDays={5}`, `visibleHours={{ start: "08:00", end: "18:00" }}`, `slotMinutes={30}`.
- **Date spans:** `MonthGrid` with `selectionMode="date-range"` and `onSelectedDateRangeChange`.
- **Timetables:** `trailingGutter` repeats the hour labels on the far edge.
- **Breaks, holds and slots as background bands:** pass `timeRanges` and `renderTimeRange` to `WeekGrid`, e.g. `timeRanges={[{ key: "lunch", start: "12:00", end: "13:00" }]}` and `renderTimeRange={() => <div className="lunch" />}`. A band with `date` draws on that day only; without it, on every visible day. Bands sit behind events, take no pointer input and are hidden from assistive technology, so state that matters also goes in an event or the host UI.
- **Blocked days and greyed weekends:** `getCellState` returns `{ unavailable: true }` for blocked days on `MonthGrid` or `WeekGrid`. On `WeekGrid`, `renderHeader` reads `column.date` to grey Saturday and Sunday headers.
- **Hide calendars:** keep `hiddenCalendarIds` in host state, pass it to `CalendarList`, and filter `events` before they reach the grid. The grid shows whatever it is given.
- **Screenshots and visual tests:** pass `now` everywhere so the today marker, the now line and past styling never move.
