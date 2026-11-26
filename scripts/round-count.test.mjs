import { describe, expect, it } from 'vitest';
import { roundsOf, urlBase } from '../e2e/roundsOf.ts';

/**
 * The round-count gate's `roundsOf` counting (the gate's e2e spec imports
 * the same module): a round is causal import depth read from the CDP
 * initiator, not connection timing.
 */

const A = 'http://localhost:4173';
const B = 'http://localhost:4174';

function req(url, start, end, initiatorType, initiatorUrl) {
  return { url, start, end, initiatorType, resourceType: 'Script', initiatorUrl };
}

describe('roundsOf — causal import depth', () => {
  it('urlBase drops the query string and the hash', () => {
    expect(urlBase(`${A}/shared/a.js?v=1#x`)).toBe(`${A}/shared/a.js`);
  });

  it('preloaded items arriving staggered under HTTP/1.1 are all round 1', () => {
    const reqs = [];
    let t = 0;
    for (let i = 0; i < 6; i++) {
      reqs.push(req(`${A}/shared/preload-${i}.js`, t, t + 100, 'preload'));
      t += 5;
    }
    for (let i = 6; i < 10; i++) {
      t += 50;
      reqs.push(req(`${A}/shared/preload-${i}.js`, t, t + 100, 'preload'));
    }
    const { rounds, perRound } = roundsOf(reqs);
    expect(rounds).toBe(1);
    expect(perRound.get(1)).toHaveLength(10);
    expect(perRound.get(2)).toBeUndefined();
  });

  it('a genuinely unlisted native import is round 2', () => {
    const { rounds, perRound } = roundsOf([
      req(`${A}/shared/a.js`, 0, 100, 'preload'),
      req(`${A}/shared/unlisted.js`, 110, 200, 'script', `${A}/shared/a.js`),
    ]);
    expect(rounds).toBe(2);
    expect(perRound.get(2)?.[0]?.url).toBe(`${A}/shared/unlisted.js`);
  });

  it('an import chain a -> b -> c reaches round 3', () => {
    const { rounds, perRound } = roundsOf([
      req(`${A}/shared/a.js`, 0, 50, 'preload'),
      req(`${A}/shared/b.js`, 60, 100, 'script', `${A}/shared/a.js`),
      req(`${A}/shared/c.js`, 110, 150, 'script', `${A}/shared/b.js`),
    ]);
    expect(rounds).toBe(3);
    expect(perRound.get(3)?.[0]?.url).toBe(`${A}/shared/c.js`);
  });

  it('sequential same-origin batches issued by already-loaded code are 2 rounds', () => {
    const entry = `${A}/assets/entry.js`;
    const { rounds, perRound } = roundsOf([
      req(`${A}/shared/x.js`, 0, 50, 'script', entry),
      req(`${A}/shared/y.js`, 60, 100, 'script', entry),
    ]);
    expect(rounds).toBe(2);
    expect(perRound.get(1)?.[0]?.url).toBe(`${A}/shared/x.js`);
    expect(perRound.get(2)?.[0]?.url).toBe(`${A}/shared/y.js`);
  });

  it('overlapping batches issued by already-loaded code are 1 round', () => {
    const entry = `${A}/assets/entry.js`;
    const { rounds } = roundsOf([
      req(`${A}/shared/x.js`, 0, 80, 'script', entry),
      req(`${A}/shared/y.js`, 10, 100, 'script', entry),
    ]);
    expect(rounds).toBe(1);
  });

  it('batches on different origins are independent', () => {
    const entry = `${A}/assets/entry.js`;
    const { rounds } = roundsOf([
      req(`${A}/shared/x.js`, 0, 50, 'script', entry),
      req(`${B}/shared/y.js`, 60, 100, 'script', entry),
    ]);
    expect(rounds).toBe(1);
  });

  it('a script-initiated request whose initiator is outside the slice is round 1', () => {
    const { rounds, perRound } = roundsOf([
      req(`${A}/shared/expose-entry.js`, 0, 100, 'script', `${A}/assets/entry.js`),
      req(`${A}/shared/expose-chunk.js`, 110, 200, 'script', `${A}/shared/expose-entry.js`),
    ]);
    expect(rounds).toBe(2);
    expect(perRound.get(1)?.[0]?.url).toBe(`${A}/shared/expose-entry.js`);
  });

  it('a self-referential initiator caps at round 1', () => {
    const { rounds } = roundsOf([req(`${A}/shared/loop.js`, 0, 100, 'script', `${A}/shared/loop.js`)]);
    expect(rounds).toBe(1);
  });

  it('a mutual initiator cycle terminates and each request has one round', () => {
    const { rounds, perRound } = roundsOf([
      req(`${A}/shared/p.js`, 0, 50, 'script', `${A}/shared/q.js`),
      req(`${A}/shared/q.js`, 60, 100, 'script', `${A}/shared/p.js`),
    ]);
    const counted = [...perRound.values()].reduce((n, rs) => n + rs.length, 0);
    expect(counted).toBe(2);
    expect(rounds).toBeGreaterThanOrEqual(1);
  });

  it('a request reached through two initiators counts once (memo)', () => {
    const { perRound } = roundsOf([
      req(`${A}/shared/a.js`, 0, 10, 'preload'),
      req(`${A}/shared/b.js`, 20, 30, 'script', `${A}/shared/a.js`),
      req(`${A}/shared/c.js`, 20, 30, 'script', `${A}/shared/a.js`),
      req(`${A}/shared/d.js`, 40, 50, 'script', `${A}/shared/b.js`),
      req(`${A}/shared/d.js?again`, 40, 50, 'script', `${A}/shared/c.js`),
    ]);
    expect([...perRound.values()].reduce((n, rs) => n + rs.length, 0)).toBe(5);
  });
});
