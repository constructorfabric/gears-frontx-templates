import { test, expect, type CDPSession } from '@playwright/test';
import { FillRequestWatcher } from '../scripts/load-matrix/FillRequestWatcher.mjs';
import {
  BLANK_HOME_EXTENSION_ID,
  UIKIT_ELEMENTS_EXTENSION_ID,
  WIDGETS_HOST_EXTENSION_ID,
  menuItemTestId,
} from './extensionIds.mjs';
import { SHELL_PORT } from './ports.mjs';
import { waitForMountedScreen } from './mountedScreen';
import { roundsOf, type Req } from './roundsOf';

const scheme = process.env.E2E_PROTOCOL === 'h2' ? 'https' : 'http';

/**
 * Round-count gate (load_gates (2)): the list model designs exactly ONE
 * sequential fetch round per entry — the entry's list is held in the
 * registered manifest, so the entry module, every missing unit and the
 * list's own chunks are requested together in ONE parallel batch — plus
 * ONE round per lazy target on its first use. This spec counts
 * sequential rounds of shared-chunk (`.js` unit) fetches inside
 * `/shared/` for shell boot, an expose load and a lazy target, and fails
 * naming the entry, the observed round count and the unit that opened
 * the extra round. No list document is requested: a `.json` request
 * under `/shared/` fails the spec.
 *
 * A round is **causal import depth**, not connection timing:
 * a request's round is read from the CDP `Network.requestWillBeSent`
 * initiator chain — parser/preload-initiated requests are round 1
 * (the boot list's flat modulepreload fan-out, or the document's own
 * `<script type="module">`); a script-initiated request is
 * `1 + initiator's round`, where the initiator is the request whose
 * URL matches the initiator stack's top frame. Counting by timing
 * (a request that ended before another started opens a new round)
 * fails on HTTP/1.1: preloads beyond the ~6-connection cap queue
 * behind earlier ones, so a round-2 start time after a round-1 end
 * is the connection staggering, not the import waterfall — every
 * preloaded boot item would intermittently count as round 2. Only a
 * request issued by already-loaded code (the shell entry, the MFE
 * runtime) is placed by timing — after the slice requests that had
 * finished before it was sent, on the same origin — because its initiator
 * cannot tell one of the runtime's batches from the next (see `roundsOf`).
 *
 * Shell boot is separated from the realm-cache fill by request kind,
 * not by when the spec polls: the boot's units are native
 * module/modulepreload loads (CDP resource type `Script`), while the
 * fill — which starts as soon as the shell entry has run and
 * re-requests the same immutable URLs through `fetch()` — issues
 * `Fetch` requests. Splitting the log by that type is exact however
 * the fill's events interleave with the boot's, so the fill's
 * re-fetches never count as boot fetches and are reported on their own.
 *
 * Two kinds of assertion, both over the same counting:
 * - **Every load is at most one round** (`<= 1`): shell boot, the
 *   blank-home expose load and the UI-kit lazy target. A load may need
 *   zero rounds when everything it uses is already in the realm cache
 *   from the shell boot and the default screen (hello-world mounts at
 *   boot), so zero is correct, and two or more is the failure this gate
 *   exists to catch.
 * - **One cold load is exactly one round** (`=== 1`): the widgets host
 *   screen, whose nested widgets-fixture-a expose (alpha and beta) and
 *   widgets-fixture-b expose hold units that neither the shell boot nor
 *   the default screen loads. That load must fetch its units in a single
 *   parallel batch, so a missing round cannot pass as zero.
 */

const SHELL = `${scheme}://localhost:${SHELL_PORT}`;

/** Every `/shared/` JSON request the page issued: a list document, which no load requests. */
const listDocumentRequests: string[] = [];

/** Tracks `/shared/**.js` unit fetches via CDP Network events. */
function watch(cdp: CDPSession) {
  const byId = new Map<string, Req>();
  const requests: Req[] = [];
  cdp.on('Network.requestWillBeSent', (e: any) => {
    const url: string = e.request.url;
    if (url.includes('/shared/') && url.endsWith('.json')) listDocumentRequests.push(url);
    if (!url.includes('/shared/') || !url.endsWith('.js')) return;
    const initiator = e.initiator ?? {};
    const type: string = initiator.type ?? 'other';
    const initiatorUrl =
      type === 'script'
        ? (initiator.stack?.callFrames?.[0]?.url as string | undefined)
        : type === 'parser'
          ? (initiator.url as string | undefined)
          : undefined;
    const r: Req = {
      url,
      start: e.timestamp,
      initiatorType: type,
      resourceType: String(e.type ?? ''),
      initiatorUrl,
    };
    byId.set(e.requestId, r);
    requests.push(r);
  });
  const finish = (e: any) => {
    const r = byId.get(e.requestId);
    if (r) r.end = e.timestamp;
  };
  cdp.on('Network.loadingFinished', finish);
  cdp.on('Network.loadingFailed', finish);
  return requests;
}

/**
 * Asserts a load used at most `max` sequential unit-fetch rounds. The
 * failure message names the entry, the observed count and the first
 * unit that opened the round past the limit.
 */
function assertAtMostRounds(entry: string, max: number, got: number, perRound: Map<number, Req[]>) {
  const breaker = perRound.get(max + 1)?.[0]?.url ?? '(none observed)';
  expect(
    got,
    `${entry}: expected at most ${max} sequential unit-fetch round(s), observed ${got}; item "${breaker}" opened round ${max + 1}`,
  ).toBeLessThanOrEqual(max);
}

/**
 * Asserts a cold load used exactly `expected` sequential unit-fetch
 * rounds. Zero is a failure here: a cold load must fetch its units.
 */
function assertExactRounds(entry: string, expected: number, got: number, perRound: Map<number, Req[]>) {
  const breaker =
    perRound.get(expected + 1)?.[0]?.url ?? perRound.get(got)?.[0]?.url ?? '(none observed)';
  expect(
    got,
    `${entry}: expected ${expected} sequential unit-fetch round(s), observed ${got}; item "${breaker}" opened round ${expected + 1}`,
  ).toBe(expected);
}

test('round-count gate: every load at most one round; one cold load exactly one', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const requests = watch(cdp);
  const fill = new FillRequestWatcher(page, `${SHELL}/shared/`);

  // Case 1, shell boot (<= 1 round): the boot data is inline, so every
  // shared chunk the boot needs is requested in one parallel batch.
  await page.goto(`${SHELL}/`);
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 60_000 });
  // The fill is the only `fetch()` of shared units during boot; wait
  // for its requests to finish so they are all logged, then split.
  await fill.settled(60_000);
  const bootRequests = requests.filter((r) => r.resourceType !== 'Fetch');
  const fillRefetches = requests.length - bootRequests.length;
  const boot = roundsOf(bootRequests);
  console.log(
    `boot: ${boot.rounds} unit-fetch round(s), ${bootRequests.length} unit(s) (+${fillRefetches} fill re-fetch(es))`,
  );
  assertAtMostRounds('shell boot', 1, boot.rounds, boot.perRound);

  // Case 2, expose load of the blank home screen (<= 1 round): the
  // expose's list is held in the manifest, so its entry module and any
  // missing units go out in one parallel batch. Hello-world, mounted at
  // boot, already holds this expose's units in the realm cache, so zero
  // rounds is the expected outcome and one is the ceiling.
  const beforeExpose = requests.length;
  await page.getByTestId(menuItemTestId(BLANK_HOME_EXTENSION_ID)).click();
  await waitForMountedScreen(page, BLANK_HOME_EXTENSION_ID);
  const expose = roundsOf(requests.slice(beforeExpose));
  console.log(`expose load: ${expose.rounds} unit-fetch round(s)`);
  assertAtMostRounds('expose ./lifecycle (blank home)', 1, expose.rounds, expose.perRound);

  // Case 3, lazy target (the UI-kit elements screen, <= 1 round): its lazy
  // element chunks are requested on first use, in at most one round.
  const beforeLazy = requests.length;
  await page.getByTestId(menuItemTestId(UIKIT_ELEMENTS_EXTENSION_ID)).click();
  await waitForMountedScreen(page, UIKIT_ELEMENTS_EXTENSION_ID);
  const lazy = roundsOf(requests.slice(beforeLazy));
  console.log(`lazy target: ${lazy.rounds} unit-fetch round(s), ${requests.length - beforeLazy} unit(s)`);
  // The lazy element chunks are fetched on first use, so the click must
  // request at least one unit; a click that requests nothing measured nothing.
  expect(lazy.rounds, 'lazy target (UI-kit elements): the click requested no unit').toBeGreaterThan(0);
  assertAtMostRounds('lazy target (UI-kit elements)', 1, lazy.rounds, lazy.perRound);

  // Case 4, cold load (exactly 1 round): the widgets host screen. Its
  // nested widgets-fixture-a expose (alpha and beta) and widgets-fixture-b
  // expose hold units that no earlier case loaded, so it starts cold and
  // must fetch them in exactly one parallel batch. A zero here would mean
  // the units were never requested, so it fails too.
  const beforeCold = requests.length;
  await page.getByTestId(menuItemTestId(WIDGETS_HOST_EXTENSION_ID)).click();
  await waitForMountedScreen(page, WIDGETS_HOST_EXTENSION_ID);
  const cold = roundsOf(requests.slice(beforeCold));
  console.log(`cold load (widgets host): ${cold.rounds} unit-fetch round(s), ${requests.length - beforeCold} unit(s)`);
  assertExactRounds('cold load (widgets host)', 1, cold.rounds, cold.perRound);
  // Lists live in the manifest: no list document was requested anywhere.
  expect(listDocumentRequests, 'list documents requested under /shared/').toEqual([]);
});
