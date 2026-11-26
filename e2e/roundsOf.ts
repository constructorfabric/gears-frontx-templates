/**
 * `roundsOf` — the round-count gate's counting of sequential unit-fetch
 * rounds, shared by `round-count.spec.ts` and its unit test
 * (`scripts/round-count.test.mjs`).
 */

export interface Req {
  url: string;
  start: number;
  end?: number;
  /** CDP `initiator.type` — `parser` | `script` | `preload` | `other`. */
  initiatorType: string;
  /** CDP `type` — `Script` for native module loads, `Fetch` for `fetch()`. */
  resourceType: string;
  /**
   * For script-initiated requests, the URL of the script that
   * triggered the import (`initiator.stack.callFrames[0].url`); for
   * parser/preload, the document URL or `undefined`. Used to look
   * the initiator's request up in the slice by URL.
   */
  initiatorUrl?: string;
}

/** Strip the query string and hash from a URL for initiator matching. */
export function urlBase(url: string): string {
  return url.split('#')[0].split('?')[0];
}

/**
 * Causal import depth: a request's round is `1` if its CDP
 * `initiator.type` is `parser` or `preload` (the boot list's flat
 * modulepreload fan-out, or the document's own `<script type=module>`),
 * and `1 + initiator's round` if it is `script`-initiated by a
 * `/shared/` chunk requested in the same slice.
 *
 * A `script`-initiated request whose initiator lies outside the slice
 * was issued by code that was already loaded — the shell's entry, the
 * MFE runtime, a click handler. That code issues every batch of a load,
 * so its initiator says nothing about the waterfall: a runtime that
 * fetches some units, waits for them, then fetches more names itself
 * as the initiator of both batches. Such a request's round is
 * `1 + the deepest round among the slice's requests to the same origin
 * that had finished before it was sent`, so a batch the runtime issues for
 * an entry only after an earlier batch of that entry arrived opens a new
 * round. Each MFE serves its units from its own origin, so a nested MFE
 * the parent mounts once it has rendered starts its own load at round 1:
 * every entry is held to one round, not the chain of nested entries.
 * The recursion guards against cycles and unknown initiators.
 */
export function roundsOf(requests: Req[]) {
  const byUrl = new Map<string, Req>();
  for (const r of requests) {
    const key = urlBase(r.url);
    if (!byUrl.has(key)) byUrl.set(key, r);
  }
  const memo = new Map<Req, number>();
  const roundOf = (r: Req, seen: Set<Req>): number => {
    const known = memo.get(r);
    if (known !== undefined) return known;
    if (seen.has(r)) return 1; // cycle guard
    seen.add(r);
    let round: number;
    if (
      r.initiatorType === 'parser' ||
      r.initiatorType === 'preload' ||
      r.initiatorType === 'other' ||
      r.initiatorUrl === undefined
    ) {
      round = 1;
    } else {
      const initiator = byUrl.get(urlBase(r.initiatorUrl));
      if (initiator !== undefined && initiator !== r) {
        round = 1 + roundOf(initiator, seen);
      } else {
        round = 1;
        const origin = new URL(r.url).origin;
        for (const earlier of requests) {
          if (earlier === r || earlier.end === undefined || earlier.end > r.start) continue;
          if (new URL(earlier.url).origin !== origin) continue;
          round = Math.max(round, 1 + roundOf(earlier, seen));
        }
      }
    }
    seen.delete(r);
    memo.set(r, round);
    return round;
  };
  const perRound = new Map<number, Req[]>();
  let max = 0;
  for (const r of requests) {
    const d = roundOf(r, new Set());
    (perRound.get(d) ?? perRound.set(d, []).get(d)!).push(r);
    if (d > max) max = d;
  }
  return { rounds: max, perRound };
}
