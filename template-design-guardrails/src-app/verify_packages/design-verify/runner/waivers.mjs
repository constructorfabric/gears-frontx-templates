/**
 * The per-screen waiver file both design-verify runners honour
 * (`design-waivers.json` at the project root; format in the frontx-design
 * skill's references/verify.md, "Waivers"):
 *
 *   { "waivers": [ { "gate": "SYS-001",
 *                    "screen": { "route": "/?screen=orders", "menu": "Orders",
 *                                "source": "src-app/mfe_packages/orders/**" },
 *                    "reason": "...", "until": "2026-12-31" } ] }
 *
 * Only a gate whose `waiver` in rules/quality-gates.json is `with-reason` can
 * be waived, and only with a reason; anything else in the file is an input
 * error (exit 2), so a typo never waives silently. A waived finding moves to
 * a `waived` list with the entry's reason; it is never dropped. The file is
 * the one record of every waiver, so an entry for a gate this runner never
 * reports is listed as recorded, never as unused; see waiverReport for the
 * rest (not applicable to this run, expired, unused).
 */
import fs from 'node:fs';
import path from 'node:path';

export const WAIVERS_FILE = 'design-waivers.json';

/** A waiver file that cannot be honoured as written: exit 2. */
export class WaiverError extends Error {}

const ENTRY_KEYS = new Set(['gate', 'screen', 'reason', 'until']);
const SCREEN_KEYS = new Set(['route', 'menu', 'source']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {string} value */
function isDate(value) {
  if (!DATE.test(value)) return false;
  // `2026-13-01` is no date at all; `2026-02-30` rolls over to March.
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * @typedef {{index: number, gate: string,
 *   screen: {route?: string, menu?: string, source?: string},
 *   reason: string, until?: string, expired: boolean, used: number}} Waiver
 */

/**
 * Validates a parsed waiver file against the gate registry.
 *
 * @param {unknown} json
 * @param {{gates: Array<{id: string, waiver: string}>}} registry rules/quality-gates.json
 * @param {{file: string, today: string}} context today as YYYY-MM-DD
 * @returns {Waiver[]}
 */
export function parseWaivers(json, registry, { file, today }) {
  const fail = (why) => new WaiverError(`${file}: ${why}`);
  if (!json || typeof json !== 'object' || Array.isArray(json) || !Array.isArray(json.waivers)) {
    throw fail('must be an object with a "waivers" array');
  }
  const extra = Object.keys(json).filter((key) => key !== 'waivers');
  if (extra.length > 0) throw fail(`unknown key ${JSON.stringify(extra[0])}`);
  const gates = new Map(registry.gates.map((g) => [g.id, g]));
  return json.waivers.map((entry, index) => {
    const at = (why) => fail(`waivers[${index}]: ${why}`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw at('must be an object');
    const unknown = Object.keys(entry).find((key) => !ENTRY_KEYS.has(key));
    if (unknown) throw at(`unknown key ${JSON.stringify(unknown)}`);
    const gate = gates.get(entry.gate);
    if (!gate) throw at(`gate ${JSON.stringify(entry.gate)} is not in rules/quality-gates.json`);
    if (gate.waiver !== 'with-reason') {
      throw at(`gate ${gate.id} has waiver "${gate.waiver}" and cannot be waived; only with-reason gates can`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') throw at('needs a non-empty "reason"');
    const screen = entry.screen;
    if (!screen || typeof screen !== 'object' || Array.isArray(screen)) {
      throw at('needs a "screen" object with "route", "menu" or "source"');
    }
    const keys = Object.keys(screen);
    const badKey = keys.find((key) => !SCREEN_KEYS.has(key));
    if (badKey) throw at(`screen: unknown key ${JSON.stringify(badKey)}`);
    if (keys.length === 0) throw at('screen needs "route", "menu" or "source"');
    for (const key of keys) {
      if (typeof screen[key] !== 'string' || screen[key].trim() === '') throw at(`screen.${key} must be a non-empty string`);
    }
    if (entry.until !== undefined && (typeof entry.until !== 'string' || !isDate(entry.until))) {
      throw at(`"until" must be a date as YYYY-MM-DD, got ${JSON.stringify(entry.until)}`);
    }
    return {
      index,
      gate: gate.id,
      screen: { ...screen },
      reason: entry.reason,
      ...(entry.until === undefined ? {} : { until: entry.until }),
      // `until` is the last day the waiver holds.
      expired: entry.until !== undefined && entry.until < today,
      used: 0,
    };
  });
}

/**
 * Reads the waiver file: the one `--waivers` names (which must exist), else
 * `design-waivers.json` at the project root when present.
 *
 * @param {string | undefined} given absolute path from --waivers
 * @param {string} root project root
 * @param {object} registry rules/quality-gates.json
 * @param {string} [today] YYYY-MM-DD
 * @returns {{file?: string, waivers: Waiver[]}}
 */
export function loadWaivers(given, root, registry, today = new Date().toISOString().slice(0, 10)) {
  const file = given ?? path.join(root, WAIVERS_FILE);
  if (!given && !fs.existsSync(file)) return { waivers: [] };
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new WaiverError(`${file} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { file, waivers: parseWaivers(json, registry, { file, today }) };
}

/**
 * Splits findings into those that stay and those a live waiver covers.
 *
 * @template {{gate?: string}} F
 * @param {F[]} findings
 * @param {Waiver[]} waivers
 * @param {(waiver: Waiver, finding: F) => boolean} coversScreen
 * @returns {{findings: F[], waived: Array<F & {waiver: {index: number, reason: string, until?: string}}>}}
 */
export function applyWaivers(findings, waivers, coversScreen) {
  const kept = [];
  const waived = [];
  for (const finding of findings) {
    const waiver = waivers.find((w) => !w.expired && w.gate === finding.gate && coversScreen(w, finding));
    if (!waiver) {
      kept.push(finding);
      continue;
    }
    waiver.used += 1;
    waived.push({
      ...finding,
      waiver: { index: waiver.index, reason: waiver.reason, ...(waiver.until ? { until: waiver.until } : {}) },
    });
  }
  return { findings: kept, waived };
}

/** The static check's screen selector: a glob on the root-relative source path. */
export function coversSource(waiver, finding) {
  return waiver.screen.source !== undefined && path.posix.matchesGlob(finding.file, waiver.screen.source);
}

/**
 * The render runner's screen selector: the exact `--routes` entry, or the
 * exact `--menu` label in menu mode. An entry with both keys matches in
 * either mode.
 *
 * @param {'route' | 'menu'} mode
 */
export function coversRendered(mode) {
  return (waiver, state) => waiver.screen[mode] !== undefined && waiver.screen[mode] === state.route;
}

/**
 * What a run would need to exercise the entry's screen; undefined when this
 * run exercised it. A run that matches screens by `mode` exercised a screen
 * when it read a file the `source` glob matches (static check) or measured a
 * state of the exact route or menu label (render runner).
 *
 * @param {Waiver} waiver
 * @param {{mode: 'source' | 'route' | 'menu', exercised: Set<string>, requested?: Set<string>}} run
 *   `exercised`: the files read, or the routes or menu labels with a measured
 *   state; `requested`: the routes or menu labels the run was asked to sweep
 */
export function unexercised(waiver, { mode, exercised, requested }) {
  const value = waiver.screen[mode];
  if (value === undefined) {
    if (mode === 'source') return 'needs screen.source';
    if (mode === 'route' && waiver.screen.menu !== undefined) return 'needs --menu';
    if (mode === 'menu' && waiver.screen.route !== undefined) return 'needs route mode (--routes, no --menu)';
    return 'needs screen.route or screen.menu';
  }
  if (mode === 'source') {
    return [...exercised].some((file) => path.posix.matchesGlob(file, value))
      ? undefined
      : `needs a file matching ${value} under --src; none of the files read matches`;
  }
  if (exercised.has(value)) return undefined;
  if (requested?.has(value)) return `needs a measured state of ${value}; each one had an environment failure`;
  return `needs ${mode === 'menu' ? '--menu' : '--routes'} ${value}`;
}

/**
 * The report section on the waiver file. The file is the one record of every
 * waiver, review-only gates included, so each entry lands in exactly one
 * place:
 *
 *   recorded       its gate is one this runner never reports (another check
 *                  or the review reads it): never unused, never to remove;
 *   notApplicable  this runner reports the gate, but the run never exercised
 *                  the entry's screen (no key this run matches, or no file,
 *                  route or menu label of the run matches it); `needs` says
 *                  what would exercise it;
 *   expired        past `until`, so it waived nothing;
 *   unused         live, its screen exercised, and it matched no finding.
 *
 * @param {{file?: string, waivers: Waiver[]}} loaded
 * @param {{mode: 'source' | 'route' | 'menu', gates: Iterable<string>,
 *   exercised: Iterable<string>, requested?: Iterable<string>}} runner
 *   the screen key this run matches, every gate the runner can report (from
 *   its rules data), and the screens the run exercised and was asked for
 *   (see unexercised)
 */
export function waiverReport(loaded, { mode, gates, exercised, requested }) {
  if (!loaded.file) return undefined;
  const reported = new Set(gates);
  const run = { mode, exercised: new Set(exercised), ...(requested ? { requested: new Set(requested) } : {}) };
  const describe = (w) => ({
    index: w.index,
    gate: w.gate,
    screen: w.screen,
    reason: w.reason,
    ...(w.until ? { until: w.until, expired: w.expired } : {}),
  });
  /**
   * @typedef {{index: number, gate: string, screen: Waiver['screen'], reason: string,
   *   until?: string, expired?: boolean}} Entry
   * @type {{file: string, applied: number, unused: Entry[], expired: Entry[],
   *   notApplicable: Array<Entry & {needs: string}>, recorded: Entry[]}}
   */
  const section = { file: loaded.file, applied: 0, unused: [], expired: [], notApplicable: [], recorded: [] };
  for (const w of loaded.waivers) {
    section.applied += w.used;
    const needs = unexercised(w, run);
    if (!reported.has(w.gate)) section.recorded.push(describe(w));
    else if (needs) section.notApplicable.push({ ...describe(w), needs });
    else if (w.expired) section.expired.push(describe(w));
    else if (w.used === 0) section.unused.push(describe(w));
  }
  return section;
}

/** Summary lines for the waiver section. @param {ReturnType<typeof waiverReport>} section */
export function waiverLines(section) {
  if (!section) return [];
  const screen = (w) => Object.entries(w.screen).map(([k, v]) => `${k} ${v}`).join(', ');
  const lines = [`  waivers: ${section.file} - ${section.applied} finding(s) waived`];
  for (const w of section.unused) {
    lines.push(`  UNUSED WAIVER #${w.index} ${w.gate} (${screen(w)}): matched no finding in this run`);
  }
  for (const w of section.expired) lines.push(`  EXPIRED WAIVER #${w.index} ${w.gate} (${screen(w)}) until ${w.until}`);
  // A lapsed entry says so wherever it lands, so it is never lost from view.
  const lapsed = (w) => (w.expired ? `, expired after ${w.until}` : '');
  for (const w of section.notApplicable) {
    lines.push(`  WAIVER #${w.index} ${w.gate} (${screen(w)}): not applicable to this run (${w.needs})${lapsed(w)}`);
  }
  for (const w of section.recorded) {
    lines.push(`  RECORDED WAIVER #${w.index} ${w.gate} (${screen(w)}): recorded, not checked by this runner${lapsed(w)}`);
  }
  return lines;
}
