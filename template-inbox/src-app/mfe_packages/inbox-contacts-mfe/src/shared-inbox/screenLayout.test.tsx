import { act, useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  layoutForWidth,
  SCREEN_BREAKPOINTS_REM,
  SCREEN_CONTAINER_NAME,
  useContainerMeasure,
  useContainerWidth,
} from '@inbox-shared/ui/screenLayout';

/**
 * Every stylesheet of the shared folder and the four packages, as text. A
 * glob read by the test runner: the widths a rule queries are checked
 * against the one table the screens' JavaScript reads.
 */
const stylesheets = import.meta.glob<string>(['../../../shared/inbox/**/*.module.css', '../../../inbox-*-mfe/src/**/*.module.css'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

/** An element whose box is `width` px wide, and the observers watching it. */
function sizedElement(width: number) {
  const observers: { callback: ResizeObserverCallback }[] = [];
  let current = width;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly entry: { callback: ResizeObserverCallback };
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback };
      }
      observe() {
        observers.push(this.entry);
      }
      unobserve() {}
      disconnect() {
        observers.splice(observers.indexOf(this.entry), 1);
      }
    }
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, current, 100));
  return {
    resize: (next: number) => {
      current = next;
      for (const observer of [...observers]) observer.callback([], {} as ResizeObserver);
    },
    observerCount: () => observers.length,
  };
}

function Probe() {
  const ref = useRef<HTMLOutputElement>(null);
  const layout = useContainerWidth(ref, layoutForWidth);
  return <output ref={ref}>{layout}</output>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('layoutForWidth', () => {
  it('turns a width in rem into the layout the panes take', () => {
    expect(layoutForWidth(null)).toBe('wide');
    expect(layoutForWidth(6)).toBe('single');
    expect(layoutForWidth(SCREEN_BREAKPOINTS_REM.singlePane - 0.1)).toBe('single');
    expect(layoutForWidth(SCREEN_BREAKPOINTS_REM.singlePane)).toBe('compact');
    expect(layoutForWidth(SCREEN_BREAKPOINTS_REM.inlineColumn - 0.1)).toBe('compact');
    expect(layoutForWidth(SCREEN_BREAKPOINTS_REM.inlineColumn)).toBe('wide');
  });
});

describe('useContainerWidth', () => {
  it("answers from the element's own width before the first paint, and again when it crosses a breakpoint", () => {
    const element = sizedElement(102);
    const view = render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('single');

    act(() => element.resize(640));
    expect(screen.getByRole('status').textContent).toBe('compact');
    act(() => element.resize(1008));
    expect(screen.getByRole('status').textContent).toBe('wide');

    view.unmount();
    expect(element.observerCount()).toBe(0);
  });

  it('reads an element that is not laid out as the wide layout', () => {
    sizedElement(0);
    render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('wide');
  });
});

describe('useContainerMeasure', () => {
  it('says the element is not measured on the render before the first read, and measured from then on', () => {
    const element = sizedElement(102);
    const seen: { value: string; measured: boolean }[] = [];
    function MeasureProbe() {
      const ref = useRef<HTMLOutputElement>(null);
      const measure = useContainerMeasure(ref, layoutForWidth);
      seen.push(measure);
      return <output ref={ref}>{measure.value}</output>;
    }
    render(<MeasureProbe />);

    expect(seen[0]).toEqual({ value: 'wide', measured: false });
    expect(seen[seen.length - 1]).toEqual({ value: 'single', measured: true });
    const settled = seen[seen.length - 1];
    // A resize inside the same layout keeps the answer it had, the same object.
    act(() => element.resize(120));
    expect(seen[seen.length - 1]).toBe(settled);
  });
});

describe('the container rules', () => {
  const rules = Object.entries(stylesheets).flatMap(([file, text]) =>
    [...text.matchAll(/@container\s+([\w-]*)\s*\(([^)]*)\)/g)].map((match) => ({ file, name: match[1], query: match[2] }))
  );

  it('query the frame by name, on a width the breakpoint table names', () => {
    const widths = new Set<number>(Object.values(SCREEN_BREAKPOINTS_REM));
    const named = rules.filter((rule) => rule.name === SCREEN_CONTAINER_NAME);
    expect(named.length).toBeGreaterThan(0);
    for (const rule of named) {
      const width = /^width\s*(<|>=)\s*([\d.]+)rem$/.exec(rule.query.trim());
      expect(width, `${rule.file}: ${rule.query}`).not.toBeNull();
      expect(widths.has(Number(width?.[2])), `${rule.file}: ${rule.query}`).toBe(true);
    }
    // Every width of the table is one some stylesheet repeats, except the
    // inline-column one: whether the side column is a column or a sheet is
    // decided in JavaScript alone (`SideColumn`).
    for (const [name, rem] of Object.entries(SCREEN_BREAKPOINTS_REM)) {
      if (name === 'inlineColumn') continue;
      expect(
        named.some((rule) => Number(/([\d.]+)rem/.exec(rule.query)?.[1]) === rem),
        name
      ).toBe(true);
    }
  });

  it('leave the viewport alone: no pane rule is a width media query', () => {
    for (const [file, text] of Object.entries(stylesheets)) {
      expect(/@media[^{]*width/.test(text), file).toBe(false);
    }
    expect(Object.keys(stylesheets).some((file) => file.endsWith('frame.module.css'))).toBe(true);
    const frame = Object.entries(stylesheets).find(([file]) => file.endsWith('frame.module.css'))?.[1] ?? '';
    expect(frame).toContain(`container: ${SCREEN_CONTAINER_NAME} / inline-size`);
  });
});
