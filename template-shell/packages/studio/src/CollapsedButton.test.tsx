import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollapsedButton } from './CollapsedButton';
import { STUDIO_CSS } from './styles/studioStyles';

const toggleCollapsed = vi.fn();
const { handleDragMouseDown } = vi.hoisted(() => ({ handleDragMouseDown: vi.fn() }));

vi.mock('@gears-frontx/react', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./hooks/useDraggable', () => ({
  useDraggable: () => ({
    position: { x: 120, y: 80 },
    isDragging: false,
    handleMouseDown: handleDragMouseDown,
  }),
}));

describe('CollapsedButton', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('expands the panel through the test id an unattended run enters the overlay by', () => {
    render(<CollapsedButton toggleCollapsed={toggleCollapsed} />);

    const expandButton = screen.getByRole('button', {
      name: 'studio:aria.openButton',
    });
    // Spelled out rather than imported from `./testIds`, so the assertion holds
    // the published value instead of agreeing with whatever the constant says.
    // This control is the only way into the overlay now that the panel starts
    // collapsed, so a run that cannot find this id cannot reach Studio at all.
    expect(expandButton.getAttribute('data-testid')).toBe('studio-expand');

    // Both events, in this order, because the component tells a click from a
    // drag by the distance travelled since mousedown and ignores a click with
    // no mousedown recorded before it.
    fireEvent.mouseDown(expandButton, { clientX: 10, clientY: 10 });
    fireEvent.click(expandButton, { clientX: 10, clientY: 10 });

    expect(toggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('darkens its glass and its hover under a host .dark class', () => {
    render(
      <div className="dark">
        <CollapsedButton toggleCollapsed={toggleCollapsed} />
      </div>,
    );
    const button = screen.getByRole('button', { name: 'studio:aria.openButton' });
    // The .dark rules of the injected stylesheet, each with the element it must reach.
    const darkRules = [...STUDIO_CSS.matchAll(/^(\.dark [^{]+)\{([^}]*)\}/gm)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
    const surface = darkRules.find(({ selector }) => button.matches(selector));
    expect(surface?.body).toMatch(/background-color:\s*rgb\(0 0 0 \/ 0\.5\)/);
    expect(surface?.body).toMatch(/border-color:\s*rgb\(255 255 255 \/ 0\.2\)/);
    const hover = darkRules.find(({ selector }) => selector.endsWith(':hover') && button.matches(selector.replace(/:hover$/, '')));
    expect(hover?.body).toMatch(/background-color:\s*rgb\(0 0 0 \/ 0\.6\)/);
  });

  it('places the button where the draggable position puts it', () => {
    const { container } = render(<CollapsedButton toggleCollapsed={toggleCollapsed} />);

    const wrapper = container.firstElementChild as HTMLElement | null;
    expect(wrapper?.style.left).toBe('120px');
    expect(wrapper?.style.top).toBe('80px');
  });
});
