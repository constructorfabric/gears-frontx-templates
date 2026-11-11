import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Switch } from './switch';
import { injectStudioStyles } from '../../styles/studioStyles';

// jsdom does no layout, so geometry comes from the computed styles the studio
// sheet gives the track and the thumb, with rem at the default 16px root.
const toPx = (value: string): number => {
  const match = /^(-?[\d.]+)(px|rem)?$/.exec(value.trim());
  if (!match || (!match[2] && Number(match[1]) !== 0)) throw new Error(`unexpected length: ${value}`);
  return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
};

const translateX = (transform: string): number => {
  const match = /^translateX\((.+)\)$/.exec(transform.trim());
  if (!match) throw new Error(`unexpected transform: ${transform}`);
  return toPx(match[1]);
};

describe('Switch thumb', () => {
  let removeStyles: (() => void) | undefined;

  afterEach(() => {
    removeStyles?.();
    removeStyles = undefined;
  });

  // @gears-frontx/i18n stamps dir only in setLanguage, so "no dir anywhere"
  // is a real page state, not only a test one.
  it.each([
    { direction: 'no dir on any ancestor', dir: undefined, expected: 16 },
    { direction: 'dir=rtl', dir: 'rtl' as const, expected: -16 },
  ])('moves inside the track when checked under $direction', ({ dir, expected }) => {
    removeStyles = injectStudioStyles();
    render(
      <div dir={dir}>
        <Switch checked aria-label="toggle" onCheckedChange={() => undefined} />
      </div>,
    );

    const track = screen.getByRole('switch', { name: 'toggle' });
    const thumb = track.querySelector('.studio-switch__thumb') as HTMLElement;
    expect(thumb.getAttribute('data-state')).toBe('checked');

    const offset = translateX(getComputedStyle(thumb).transform);
    expect(offset).toBe(expected);

    const trackStyle = getComputedStyle(track);
    const inner = toPx(trackStyle.width) - toPx(trackStyle.borderLeftWidth) - toPx(trackStyle.borderRightWidth);
    const thumbWidth = toPx(getComputedStyle(thumb).width);
    // The thumb starts at the inline-start edge of the track's content box, so
    // its travel plus its own width must fit the content box in both directions.
    expect(Math.abs(offset) + thumbWidth).toBeLessThanOrEqual(inner);
  });

  it('stays at the start when unchecked', () => {
    removeStyles = injectStudioStyles();
    render(<Switch checked={false} aria-label="toggle" onCheckedChange={() => undefined} />);
    const thumb = screen.getByRole('switch', { name: 'toggle' }).querySelector('.studio-switch__thumb') as HTMLElement;
    expect(translateX(getComputedStyle(thumb).transform)).toBe(0);
  });
});
