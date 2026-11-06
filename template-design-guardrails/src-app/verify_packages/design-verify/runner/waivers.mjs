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
 * a `waived` list with the entry's reason; it is never dropped. Entries this
 * runner could have used and did not are reported as unused, entries past
 * `until` as expired (they waive nothing).
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
  return DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
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
 * exact `--menu` label in menu mode.
 *
 * @param {'route' | 'menu'} mode
 */
export function coversRendered(mode) {
  return (waiver, state) => waiver.screen[mode] !== undefined && waiver.screen[mode] === state.route;
}

/**
 * The report section on the waiver file.
 *
 * @param {{file?: string, waivers: Waiver[]}} loaded
 * @param {'route' | 'menu' | 'source'} selector the screen key this runner matches on
 */
export function waiverReport(loaded, selector) {
  if (!loaded.file) return undefined;
  const describe = (w) => ({ index: w.index, gate: w.gate, screen: w.screen, reason: w.reason, ...(w.until ? { until: w.until } : {}) });
  const usable = loaded.waivers.filter((w) => w.screen[selector] !== undefined);
  return {
    file: loaded.file,
    applied: loaded.waivers.reduce((sum, w) => sum + w.used, 0),
    unused: usable.filter((w) => !w.expired && w.used === 0).map(describe),
    expired: usable.filter((w) => w.expired).map(describe),
    // Entries for the other runner's selector only: not this runner's to use.
    otherCheck: loaded.waivers.length - usable.length,
  };
}

/** Summary lines for the waiver section. @param {ReturnType<typeof waiverReport>} section */
export function waiverLines(section) {
  if (!section) return [];
  const screen = (w) => Object.entries(w.screen).map(([k, v]) => `${k} ${v}`).join(', ');
  const lines = [`  waivers: ${section.file} - ${section.applied} finding(s) waived`];
  for (const w of section.unused) lines.push(`  UNUSED WAIVER #${w.index} ${w.gate} (${screen(w)})`);
  for (const w of section.expired) lines.push(`  EXPIRED WAIVER #${w.index} ${w.gate} (${screen(w)}) until ${w.until}`);
  return lines;
}
