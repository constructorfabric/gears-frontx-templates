import { act, createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { stubMatchMedia } from '../__test-utils__/matchMedia';
import { COMPACT_QUERY, SINGLE_PANE_QUERY, useMediaQuery } from '@inbox-shared/ui/useMediaQuery';

function Probe({ query }: { query: string }) {
  return createElement('output', null, String(useMediaQuery(query)));
}

describe('useMediaQuery', () => {
  it('answers from the media-query engine on the first render', () => {
    stubMatchMedia([COMPACT_QUERY]);
    render(createElement(Probe, { query: COMPACT_QUERY }));
    expect(screen.getByRole('status').textContent).toBe('true');
  });

  it('re-renders when the query starts or stops matching', () => {
    const media = stubMatchMedia([]);
    render(createElement(Probe, { query: SINGLE_PANE_QUERY }));
    expect(screen.getByRole('status').textContent).toBe('false');

    act(() => media.setMatching([SINGLE_PANE_QUERY]));
    expect(screen.getByRole('status').textContent).toBe('true');
    act(() => media.setMatching([]));
    expect(screen.getByRole('status').textContent).toBe('false');
  });

  it('reads as no match where there is no media-query engine', () => {
    const original = window.matchMedia;
    Reflect.deleteProperty(window, 'matchMedia');
    try {
      render(createElement(Probe, { query: COMPACT_QUERY }));
      expect(screen.getByRole('status').textContent).toBe('false');
    } finally {
      window.matchMedia = original;
    }
  });
});
