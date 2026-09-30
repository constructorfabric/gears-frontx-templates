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
const squeeze = (element: HTMLElement): void => {
  vi.spyOn(element, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 0, 24)] as unknown as DOMRectList);
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
});
