import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const expectShellHeadingKept = async (host: HTMLElement) => {
  const probe = host.shadowRoot!.appendChild(document.createElement('h1'));
  await waitFor(() => expect(shellHeadings()).toHaveLength(0));
  probe.remove();
  await waitFor(() => expect(shellHeadings().map((h) => h.textContent)).toEqual(['FrontX']));
};

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
    const host = mountScreen('<section><h2>Details</h2></section>');

    await expectShellHeadingKept(host);
  });

  it('keeps its h1 when a screen h1 has aria-level 2', async () => {
    render(<Header />);
    const host = mountScreen('<h1 aria-level="2">Details</h1>');

    await expectShellHeadingKept(host);
  });

  it('drops its h1 when a screen h2 has aria-level 1', async () => {
    render(<Header />);
    mountScreen('<h2 aria-level="1">Details</h2>');

    await waitFor(() => expect(shellHeadings()).toHaveLength(0));
  });

  it.each(['hidden', 'aria-hidden="true"'])('keeps its h1 when a screen heading has a %s ancestor', async (attribute) => {
    render(<Header />);
    const host = mountScreen(`<div ${attribute}><h1>Details</h1></div>`);

    await expectShellHeadingKept(host);
  });

  it('follows hidden ancestors outside a screen shadow root', async () => {
    const wrapper = document.body.appendChild(document.createElement('div'));
    const host = wrapper.appendChild(document.createElement('div'));
    host.attachShadow({ mode: 'open' }).innerHTML = '<h1>Details</h1>';
    render(<Header />);
    await waitFor(() => expect(shellHeadings()).toHaveLength(0));
    // Lets the check that the header's own h1 leaving asked for run first, so
    // only the attribute change below can bring the h1 back.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    wrapper.setAttribute('aria-hidden', 'true');

    await waitFor(() => expect(shellHeadings().map((h) => h.textContent)).toEqual(['FrontX']));
  });

  it('keeps its h1 when a screen heading is slotted under an aria-hidden wrapper', async () => {
    render(<Header />);
    const host = mountScreen('<x-panel><h1>Details</h1></x-panel>');
    const panel = host.shadowRoot!.querySelector('x-panel')!;
    panel.attachShadow({ mode: 'open' }).innerHTML = '<div aria-hidden="true"><slot></slot></div>';

    await expectShellHeadingKept(host);
  });

  it('follows a style change that hides a screen from outside its shadow root', async () => {
    // jsdom has no checkVisibility; this stands in for the browser's, which
    // reports an element under a display:none ancestor as not visible.
    const displayed = (start: Element): boolean => {
      for (let el: Element | null = start; el; ) {
        if (getComputedStyle(el).display === 'none') return false;
        const root = el.getRootNode();
        el = el.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      }
      return true;
    };
    const wrapper = document.body.appendChild(document.createElement('div'));
    const host = wrapper.appendChild(document.createElement('div'));
    host.attachShadow({ mode: 'open' }).innerHTML = '<h1>Details</h1>';
    const heading = host.shadowRoot!.querySelector('h1')!;
    Object.defineProperty(heading, 'checkVisibility', { value: () => displayed(heading) });
    render(<Header />);
    await waitFor(() => expect(shellHeadings()).toHaveLength(0));
    // Lets the check that the header's own h1 leaving asked for run first, so
    // only the style change below can bring the h1 back.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    wrapper.style.display = 'none';

    await waitFor(() => expect(shellHeadings().map((h) => h.textContent)).toEqual(['FrontX']));
  });

  it('follows a class change on the wrapper around a slot', async () => {
    const host = mountScreen('<x-panel><h1>Details</h1></x-panel>');
    const panel = host.shadowRoot!.querySelector('x-panel')!;
    panel.attachShadow({ mode: 'open' }).innerHTML = '<div><slot></slot></div>';
    const wrapper = panel.shadowRoot!.querySelector('div')!;
    const heading = host.shadowRoot!.querySelector('h1')!;
    // Stands in for a stylesheet rule `.collapsed { display: none }`.
    Object.defineProperty(heading, 'checkVisibility', { value: () => !wrapper.classList.contains('collapsed') });
    render(<Header />);
    await waitFor(() => expect(shellHeadings()).toHaveLength(0));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    wrapper.classList.add('collapsed');

    await waitFor(() => expect(shellHeadings().map((h) => h.textContent)).toEqual(['FrontX']));
  });

  it('follows a details element closing over a screen heading', async () => {
    const host = mountScreen('<details open><summary>More</summary><h1>Details</h1></details>');
    const details = host.shadowRoot!.querySelector('details')!;
    const heading = host.shadowRoot!.querySelector('h1')!;
    Object.defineProperty(heading, 'checkVisibility', { value: () => details.open });
    render(<Header />);
    await waitFor(() => expect(shellHeadings()).toHaveLength(0));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    details.open = false;

    await waitFor(() => expect(shellHeadings().map((h) => h.textContent)).toEqual(['FrontX']));
  });

  it('re-checks on resize, where a media query can hide a heading', async () => {
    const host = mountScreen('<h1>Details</h1>');
    const heading = host.shadowRoot!.querySelector('h1')!;
    let shown = true;
    Object.defineProperty(heading, 'checkVisibility', { value: () => shown });
    render(<Header />);
    await waitFor(() => expect(shellHeadings()).toHaveLength(0));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    shown = false;
    window.dispatchEvent(new Event('resize'));

    await waitFor(() => expect(shellHeadings().map((h) => h.textContent)).toEqual(['FrontX']));
  });

  it('drops its h1 when a screen heading becomes visible', async () => {
    const host = mountScreen('<div hidden><h1>Details</h1></div>');
    render(<Header />);
    expect(shellHeadings().map((h) => h.textContent)).toEqual(['FrontX']);

    host.shadowRoot!.firstElementChild!.removeAttribute('hidden');

    await waitFor(() => expect(shellHeadings()).toHaveLength(0));
  });

  it('keeps its h1 when a screen heading fails checkVisibility', async () => {
    render(<Header />);
    const host = mountScreen('<h1>Details</h1>');
    Object.defineProperty(host.shadowRoot!.firstElementChild!, 'checkVisibility', { value: () => false });

    await expectShellHeadingKept(host);
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
