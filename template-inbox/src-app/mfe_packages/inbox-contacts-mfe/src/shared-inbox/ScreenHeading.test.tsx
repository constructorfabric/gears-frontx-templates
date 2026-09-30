import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { requestScreenHeadingFocus, ScreenHeading } from '@inbox-shared/ui/ScreenHeading';

/*
 * jsdom has no layout, so it cannot squeeze a heading to zero width the way a
 * too-narrow flex row does in a browser; the setup's `getClientRects`
 * stand-in gives every shown element a 1x1 box. A test stubs the rects of one
 * heading to the box a browser reports for a squeezed one - laid out, zero
 * wide - and checks the rule that decides which heading answers. That the
 * screens no longer squeeze their heading is a layout fact, measured in a
 * browser rather than here.
 */
const squeeze = (element: HTMLElement) =>
  vi.spyOn(element, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 0, 24)] as unknown as DOMRectList);

/** A `ResizeObserver` stand-in whose callbacks the test fires, since jsdom resizes nothing. */
const stubResizeObserver = () => {
  const callbacks: (() => void)[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  return { resize: () => callbacks.forEach((callback) => callback()) };
};

describe('ScreenHeading', () => {
  it('leaves a focus request to the heading with a visible box when the other is squeezed to zero width', () => {
    render(
      <>
        <ScreenHeading>List</ScreenHeading>
        <ScreenHeading>Thread</ScreenHeading>
      </>
    );
    squeeze(screen.getByRole('heading', { name: 'List' }));

    act(() => requestScreenHeadingFocus());

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Thread' }));
  });

  it('takes no focus while its only box is zero wide', () => {
    render(<ScreenHeading>Thread</ScreenHeading>);
    const heading = screen.getByRole('heading', { name: 'Thread' });
    squeeze(heading);

    act(() => requestScreenHeadingFocus());

    expect(document.activeElement).not.toBe(heading);
    expect(document.activeElement).toBe(document.body);
  });

  it('answers a pending request once its box grows from zero, as when a stylesheet arrives after the first layout', () => {
    const observer = stubResizeObserver();
    render(<ScreenHeading>Thread</ScreenHeading>);
    const heading = screen.getByRole('heading', { name: 'Thread' });
    const squeezed = squeeze(heading);

    act(() => requestScreenHeadingFocus());
    expect(document.activeElement).toBe(document.body);

    squeezed.mockRestore();
    act(() => observer.resize());
    expect(document.activeElement).toBe(heading);
  });

  it('never takes focus late for a request another heading already answered', () => {
    const observer = stubResizeObserver();
    const view = render(<ScreenHeading>List</ScreenHeading>);
    const list = screen.getByRole('heading', { name: 'List' });
    const squeezed = squeeze(list);
    act(() => requestScreenHeadingFocus());

    // The page moves on before the list got a box: the next page's heading
    // answers the next request.
    view.rerender(
      <>
        <ScreenHeading>List</ScreenHeading>
        <ScreenHeading>Thread</ScreenHeading>
      </>
    );
    act(() => requestScreenHeadingFocus());
    const thread = screen.getByRole('heading', { name: 'Thread' });
    expect(document.activeElement).toBe(thread);

    squeezed.mockRestore();
    act(() => observer.resize());
    expect(document.activeElement).toBe(thread);
  });
});
