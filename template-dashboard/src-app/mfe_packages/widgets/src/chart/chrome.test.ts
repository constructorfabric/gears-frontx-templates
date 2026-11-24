import { afterEach, describe, expect, it } from 'vitest';

import { cutLabel } from './chrome';

const SEGMENTER = Intl.Segmenter;

afterEach(() => {
  (Intl as { Segmenter?: unknown }).Segmenter = SEGMENTER;
});

describe('the category label cut', () => {
  it('keeps a text that fits whole and cuts a longer one to max characters, the last an ellipsis', () => {
    expect(cutLabel('North', 5)).toBe('North');
    expect(cutLabel('Northwest', 5)).toBe('Nort…');
  });

  it('gives the ellipsis alone for max 1 and an empty string for max 0 or less', () => {
    expect(cutLabel('Northwest', 1)).toBe('…');
    expect(cutLabel('Northwest', 0)).toBe('');
    expect(cutLabel('Northwest', -3)).toBe('');
  });

  it('never splits a letter from its combining mark or an emoji sequence', () => {
    // "Cafe" with U+0301 on the e, then more text: the e and its mark stay together.
    expect(cutLabel('Cafe\u0301 Central', 5)).toBe('Cafe\u0301…');
    // A family emoji (four people joined by U+200D) is one character.
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}';
    expect(cutLabel(`${family}${family}${family}`, 3)).toBe(`${family}${family}${family}`);
    expect(cutLabel(`${family}${family}${family}`, 2)).toBe(`${family}…`);
    // A flag is two regional indicators and one character.
    expect(cutLabel('\u{1F1E9}\u{1F1EA}\u{1F1EB}\u{1F1F7}\u{1F1EE}\u{1F1F9}', 2)).toBe('\u{1F1E9}\u{1F1EA}…');
  });

  it('cuts by code point where the runtime has no grapheme segmenter', () => {
    (Intl as { Segmenter?: unknown }).Segmenter = undefined;
    expect(cutLabel('Northwest', 5)).toBe('Nort…');
    // A character outside the basic plane is one code point, never half of a surrogate pair.
    expect(cutLabel('\u{1F600}\u{1F600}\u{1F600}', 2)).toBe('\u{1F600}…');
  });
});
