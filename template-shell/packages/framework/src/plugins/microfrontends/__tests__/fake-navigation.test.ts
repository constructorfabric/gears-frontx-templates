import { describe, expect, it, vi } from 'vitest';
import { fakeNavigation } from './fake-navigation';

// Pins N6: `fakeNavigation`'s subscriber fan-out mirrors the real
// `FanOutDispatcher` (`packages/routing/src/history/fanout-dispatch.ts`) on
// the two properties `DomainRouting`'s own tests rely on being realistic —
// independent releases of an identical callback, and isolation of a
// throwing subscriber. See the file doc comment on `fakeNavigation` for the
// full mirrored-behavior list.
describe('fakeNavigation subscriber fan-out (N6)', () => {
  it('keeps two subscriptions of the identical callback independently releasable', () => {
    const history = fakeNavigation('/');
    const listener = vi.fn();
    const releaseA = history.subscribe(listener);
    const releaseB = history.subscribe(listener);
    history.push('/a');
    expect(listener).toHaveBeenCalledTimes(2); // two registrations, both fire
    releaseA();
    listener.mockClear();
    history.push('/b');
    expect(listener).toHaveBeenCalledTimes(1); // only releaseB's registration remains
    releaseB();
    listener.mockClear();
    history.push('/c');
    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates a throwing subscriber, reports it, and still delivers to the rest of the round', () => {
    const history = fakeNavigation('/');
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    history.subscribe(bad);
    history.subscribe(good);
    expect(() => history.push('/a')).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});
