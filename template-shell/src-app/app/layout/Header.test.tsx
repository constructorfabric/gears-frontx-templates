import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Header } from './Header';

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gears-frontx/react')>()),
  useAppSelector: () => undefined,
}));

/**
 * Mounts a screen the way the screen domain does: an element whose open
 * shadow root holds the screen's markup, outside the header's own subtree.
 */
const mountScreen = (markup: string): HTMLElement => {
  const host = document.createElement('div');
  host.attachShadow({ mode: 'open' }).innerHTML = markup;
  document.body.appendChild(host);
  return host;
};

// Testing Library queries stop at shadow boundaries, so this sees the
// header's own h1 and never a screen's.
const shellHeadings = () => screen.queryAllByRole('heading', { level: 1 });

describe('Header', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('names the page with its own h1 while no screen is mounted', () => {
    render(<Header />);

    expect(shellHeadings().map((h) => h.textContent)).toEqual(['FrontX']);
  });

  it('drops its h1 once a screen renders one inside its shadow root', async () => {
    render(<Header />);

    mountScreen('<main><h1>Profile</h1></main>');

    await waitFor(() => expect(shellHeadings()).toHaveLength(0));
  });

  it('keeps its h1 under a screen that has no h1 of its own', async () => {
    render(<Header />);

    mountScreen('<section><h2>Details</h2></section>');
    // Lets the mutation observer run, then waits out the frame its check is
    // batched into and the render that follows.
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(shellHeadings().map((h) => h.textContent)).toEqual(['FrontX']);
  });

  it('brings its h1 back when the screen heading goes away', async () => {
    render(<Header />);
    const host = mountScreen('<h1>Profile</h1>');
    await waitFor(() => expect(shellHeadings()).toHaveLength(0));

    host.shadowRoot!.querySelector('h1')!.remove();

    await waitFor(() => expect(shellHeadings().map((h) => h.textContent)).toEqual(['FrontX']));
  });

  it('counts a heading a screen adds after it mounted', async () => {
    render(<Header />);
    const host = mountScreen('<div></div>');

    host.shadowRoot!.firstElementChild!.innerHTML = '<div role="heading" aria-level="1">Tasks</div>';

    await waitFor(() => expect(shellHeadings()).toHaveLength(0));
  });
});
