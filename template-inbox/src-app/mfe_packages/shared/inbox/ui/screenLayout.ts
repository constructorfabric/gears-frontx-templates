import { createContext, useContext, useLayoutEffect, useState, type RefObject } from 'react';

/*
 * The pane breakpoints, in one place, measured on the screen's own width
 * (the frame root, `InboxScreenFrame`) rather than the viewport's: the shell
 * draws its sidebar beside the screen, open or folded, so the viewport says
 * little about the room the panes get.
 *
 * The widths they are made of, in rem: the folder or filter column 12, the
 * narrowest list that still shows a name and a time 12, the narrowest thread,
 * reading pane or directory that stays usable 24 (a few words per line and
 * the header's actions on a line under the title), and the chat's customer
 * details panel 19.
 *
 * CSS cannot read these constants. The stylesheets repeat them in
 * `@container inbox-screen (...)` rules, and `screenLayout.test.ts` fails
 * when a rule uses a width this table does not name.
 */
export const SCREEN_BREAKPOINTS_REM = {
  /** Below it the list and the thread take turns: 12 of list and 24 of thread do not fit side by side. */
  singlePane: 36,
  /** Below it the side column folds and opens as a sheet over the screen: 12 + 12 + 24. */
  inlineColumn: 48,
  /** From it the chat shows the customer details panel beside the thread: 12 + 12 + 24 + 19, and one for the borders. */
  chatDetails: 68,
  /** Below it the contact page stacks its two columns. */
  contactColumns: 60,
  /** Below it the dashboard's densest rows step down to two cards or one column. */
  dashboardWide: 76,
  /** Below it every dashboard row is a single column. */
  dashboardNarrow: 44,
} as const;

/** The container name the frame root declares and every pane rule queries. */
export const SCREEN_CONTAINER_NAME = 'inbox-screen';

/**
 * The layout the panes take at a width:
 * - `single`: one of the list and the thread at a time, the side column as a sheet;
 * - `compact`: the list and the thread side by side, the side column as a sheet;
 * - `wide`: the side column beside them.
 */
export type ScreenLayout = 'single' | 'compact' | 'wide';

/** A width not measured yet, or a frame that is not laid out, reads as `wide`: the layout a first render and a test without a width assert against. */
export function layoutForWidth(widthRem: number | null): ScreenLayout {
  if (widthRem === null) return 'wide';
  if (widthRem < SCREEN_BREAKPOINTS_REM.singlePane) return 'single';
  if (widthRem < SCREEN_BREAKPOINTS_REM.inlineColumn) return 'compact';
  return 'wide';
}

/** The px a rem stands for: the document root's font size, which `rem` in a container query also reads. */
const remInPx = (): number => {
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
};

/**
 * The width of `ref`'s element in rem, passed through `select`, re-read by a
 * `ResizeObserver` whenever the element changes size.
 *
 * `select` is what keeps this cheap: a screen needs to know which layout a
 * width falls in, not every pixel of a resize, so the caller hands a function
 * returning a primitive (`layoutForWidth`) and the hook only re-renders when
 * that answer changes. Pass a stable function. A zero width is an element
 * not laid out (hidden, or a test's DOM without layout) and reads as `null`.
 * The first read runs in a layout effect, so a narrow screen never paints a
 * frame of the wide layout.
 */
export function useContainerWidth<T>(ref: RefObject<Element | null>, select: (widthRem: number | null) => T): T {
  const [value, setValue] = useState(() => select(null));

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const read = () => {
      const width = element.getBoundingClientRect().width;
      setValue(select(width > 0 ? width / remInPx() : null));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, select]);

  return value;
}

/** The frame's layout, for everything rendered inside it. */
export const ScreenLayoutContext = createContext<ScreenLayout>('wide');

/**
 * The layout of the screen the caller renders in: which single pane shows
 * depends on whether a conversation is open, and whether the side column's
 * toggle opens a column or a sheet depends on the width, neither of which a
 * container query can decide on its own. The breakpoints that only hide or
 * size a box stay in the stylesheets. Outside a frame (a component test
 * rendering one screen) it reads `wide`.
 */
export const useScreenLayout = (): ScreenLayout => useContext(ScreenLayoutContext);
