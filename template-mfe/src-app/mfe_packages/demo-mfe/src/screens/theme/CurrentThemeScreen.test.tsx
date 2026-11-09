import { act, render, screen, waitFor } from '@testing-library/react';
import { FRONTX_SHARED_PROPERTY_LANGUAGE, FRONTX_SHARED_PROPERTY_THEME } from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { mockShadowHost } from '@frontx-test-utils/mockShadowHost';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import styles from './CurrentThemeScreen.module.css';
import screenCss from './CurrentThemeScreen.module.css?raw';

const { useScreenTranslationsMock } = vi.hoisted(() => ({
  useScreenTranslationsMock: vi.fn(),
}));

vi.mock('../../shared/useScreenTranslations', () => ({
  useScreenTranslations: useScreenTranslationsMock,
}));

async function setupCurrentThemeScreen() {
  const { CurrentThemeScreen } = await import('./CurrentThemeScreen');
  const bridgeFixture = createMfeBridgeFixture({
    extDomainId: 'theme-domain',
    extensionId: 'theme-screen',
    initialProperties: {
      [FRONTX_SHARED_PROPERTY_THEME]: 'solarized',
      [FRONTX_SHARED_PROPERTY_LANGUAGE]: 'fr',
    },
  });
  // Raised before the render, so the screen's mount effect has a host to write
  // its direction on. Attached afterwards, that first pass reaches no host at
  // all and the initial LTR direction is asserted by nothing.
  const { host } = mockShadowHost(HTMLDivElement);
  const { rerender, unmount } = render(<CurrentThemeScreen bridge={bridgeFixture.bridge} />);

  await screen.findByRole('heading', { level: 1 });

  return {
    CurrentThemeScreen,
    bridgeFixture,
    host,
    rerender,
    unmount,
  };
}

describe('CurrentThemeScreen', () => {
  beforeEach(() => {
    useScreenTranslationsMock.mockReturnValue({ t: (key: string) => key, loading: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('renders bridge values and theme swatches', async () => {
    const { host } = await setupCurrentThemeScreen();

    // `fr` resolves to the left-to-right default, written on the shadow host.
    expect(host.dir).toBe('ltr');
    expect(screen.getAllByText('solarized').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('fr')).toBeTruthy();
    expect(screen.getByText('theme-domain')).toBeTruthy();
    expect(screen.getByText('theme-screen')).toBeTruthy();
    const swatchLabels = screen.getAllByText(/^--[a-z-]+ \/ --[a-z-]+$/);
    expect(swatchLabels.length).toBe(7);
    // Each label names the pair its own swatch's rule paints with, so a label
    // cannot drift from the colours its swatch shows.
    const classKeys = Object.keys(styles) as (keyof typeof styles)[];
    for (const label of swatchLabels) {
      const [surface, ink] = label.textContent!.split(' / ');
      const swatch = label.parentElement!;
      const key = classKeys.find((name) => name !== 'swatch' && swatch.classList.contains(styles[name]));
      expect(key).toBeDefined();
      const rule = screenCss.match(new RegExp(`\\.${key}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      expect(rule).toMatch(new RegExp(`background-color:\\s*var\\(${surface}\\)`));
      expect(rule).toMatch(new RegExp(`(^|[;\\s])color:\\s*var\\(${ink}\\)`));
    }
    expect(screen.getAllByText(/^--/).length).toBeGreaterThanOrEqual(12);
  });

  it('pads every card body more from 40rem up, as p-4 sm:p-6 did', async () => {
    await setupCurrentThemeScreen();
    const cards = [...document.querySelectorAll(`.${styles.card}`)];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card.querySelector(`.${styles.cardBody}`)).not.toBeNull();
    // jsdom applies no media query, so the rules are read from the parsed sheet.
    const style = document.createElement('style');
    style.textContent = screenCss;
    document.head.appendChild(style);
    const rules = [...style.sheet!.cssRules];
    style.remove();
    const paddingOf = (list: CSSRule[]) => list.find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText === '.cardBody')?.style.padding;
    expect(paddingOf(rules)).toBe('var(--space-4)');
    const wide = rules.find((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText === '(min-width: 40rem)' && paddingOf([...rule.cssRules]) !== undefined);
    expect(wide && paddingOf([...wide.cssRules])).toBe('var(--space-6)');
  });

  it('subscribes to theme and language bridge properties', async () => {
    const { bridgeFixture } = await setupCurrentThemeScreen();

    await waitFor(() => {
      expect(bridgeFixture.subscribeToProperty).toHaveBeenCalledWith(FRONTX_SHARED_PROPERTY_THEME, expect.any(Function));
      expect(bridgeFixture.subscribeToProperty).toHaveBeenCalledWith(FRONTX_SHARED_PROPERTY_LANGUAGE, expect.any(Function));
    });
  });

  it('updates the language value and host direction', async () => {
    const { host, bridgeFixture } = await setupCurrentThemeScreen();

    expect(host.dir).toBe('ltr');

    await act(async () => {
      bridgeFixture.setProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, 'ar');
    });

    await waitFor(() => {
      expect(host.getAttribute('dir')).toBe('rtl');
      expect(screen.getByText('ar')).toBeTruthy();
    });
  });

  it('unsubscribes from bridge properties on unmount', async () => {
    const { unmount, bridgeFixture } = await setupCurrentThemeScreen();

    unmount();

    for (const { unsubscribe } of bridgeFixture.unsubscriptions) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
  });
});
