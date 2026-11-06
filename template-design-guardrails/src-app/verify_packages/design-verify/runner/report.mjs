/**
 * Pure reporting layer for the design-verify runner: aggregate per-state
 * sweep results into the findings.json shape and decide the exit code.
 *
 * Exit-code contract:
 *   0 - the matrix ran; findings (if any) are advisory
 *   1 - findings present AND --fail-on-findings was passed (entries the
 *       checker could not decide - needsReview - are not findings and
 *       never gate)
 *   2 - environment failure: some state could not produce evidence (checker
 *       absent, page unreachable, sweep threw), or a screenshot the run was
 *       asked for (--screenshots) could not be captured or written. Never
 *       masked by 0/1 - an unverified state is not a pass, and the closing
 *       visual review the design skill requires cannot happen over
 *       a PNG that was never produced.
 *
 * Waived findings (runner/waivers.mjs) sit in each state's `waived` list:
 * counted and printed, never findings, so they neither gate nor enter the
 * baseline diff.
 */
import { CONTRAST_CHECK } from './contrast.mjs';
import { applyWaivers, waiverLines } from './waivers.mjs';

/**
 * @typedef {{route: string, theme: string, width?: number, probedWidth?: number, check?: string,
 *   findings?: Array<{id?: string, detail?: string, target?: string}>,
 *   needsReview?: Array<{id?: string, detail?: string, target?: string}>,
 *   waived?: Array<{id?: string, gate?: string, target?: string, waiver: {index: number, reason: string}}>,
 *   environmentError?: string, screenshot?: string, screenshotError?: string,
 *   consoleLines?: string[]}} StateResult
 */

/**
 * The gate a checker rule id reports under, from the skill's
 * rules/render-check.json; an id with no row gets its `unmappedGate`.
 *
 * @param {{unmappedGate: string, ruleGates: Array<{gate: string, rules: string[]}>}} renderCheck
 * @returns {(id: string | undefined) => string}
 */
export function gateLookup(renderCheck) {
  const gates = new Map();
  for (const row of renderCheck.ruleGates) for (const id of row.rules) gates.set(id, row.gate);
  return (id) => gates.get(id ?? '') ?? renderCheck.unmappedGate;
}

/**
 * Splits a sweep's resolved entries into findings and the checks the checker
 * could not decide (kind 'needs-review', such as contrast axe left
 * incomplete). Only findings feed --fail-on-findings and the baseline diff;
 * the others keep their state from counting as clean. With a gate lookup,
 * every entry carries its gate.
 *
 * @param {Array<{id?: string, detail?: string, target?: string, kind?: string}>} entries
 * @param {(id: string | undefined) => string} [gateFor]
 */
export function splitSweep(entries, gateFor) {
  const findings = [];
  const needsReview = [];
  for (const raw of entries) {
    const entry = gateFor ? { ...raw, gate: gateFor(raw.id) } : raw;
    (entry.kind === 'needs-review' ? needsReview : findings).push(entry);
  }
  return { findings, needsReview };
}

/**
 * Moves the findings a live waiver covers into each state's `waived` list.
 * States are changed in place.
 *
 * @param {StateResult[]} states
 * @param {import('./waivers.mjs').Waiver[]} waivers
 * @param {(waiver: import('./waivers.mjs').Waiver, state: StateResult) => boolean} coversState
 */
export function waiveStates(states, waivers, coversState) {
  if (waivers.length === 0) return;
  for (const state of states) {
    if (!state.findings?.length) continue;
    const { findings, waived } = applyWaivers(state.findings, waivers, (waiver) => coversState(waiver, state));
    state.findings = findings;
    if (waived.length > 0) state.waived = waived;
  }
}

/**
 * @param {{baseUrl: string, themeKey: string, waivers?: object}} meta
 *   `waivers`: the waiver file section (runner/waivers.mjs waiverReport)
 * @param {StateResult[]} states
 */
export function buildReport(meta, states) {
  const byRule = {};
  const byGate = {};
  let totalFindings = 0;
  let needsReview = 0;
  let waived = 0;
  let statesClean = 0;
  let environmentFailures = 0;
  let screenshotFailures = 0;
  for (const state of states) {
    if (state.environmentError) {
      environmentFailures += 1;
      continue;
    }
    // The sweep ran, so its findings count; but a state whose requested
    // screenshot is missing is not "clean" - part of its evidence is absent.
    const screenshotMissing = Boolean(state.screenshotError);
    if (screenshotMissing) screenshotFailures += 1;
    const findings = state.findings ?? [];
    totalFindings += findings.length;
    // A check the sweep could not decide is not a pass either.
    const undecided = state.needsReview ?? [];
    needsReview += undecided.length;
    if (findings.length === 0 && undecided.length === 0 && !screenshotMissing) statesClean += 1;
    waived += state.waived?.length ?? 0;
    for (const finding of findings) {
      const rule = finding.id ?? 'unknown-rule';
      byRule[rule] = (byRule[rule] ?? 0) + 1;
      if (finding.gate) byGate[finding.gate] = (byGate[finding.gate] ?? 0) + 1;
    }
  }
  return {
    tool: 'design-verify runner',
    generatedAt: new Date().toISOString(),
    baseUrl: meta.baseUrl,
    themeKey: meta.themeKey,
    summary: {
      statesRun: states.length,
      statesClean,
      environmentFailures,
      screenshotFailures,
      totalFindings,
      needsReview,
      waived,
      byRule,
      byGate,
    },
    ...(meta.waivers ? { waivers: meta.waivers } : {}),
    states,
  };
}

/**
 * The width that is part of a state's identity: a sweep's width, none for
 * the DESIGN.md contrast probe, whose token colours do not depend on the
 * page width (a baseline from a run with other --widths still matches it;
 * an older report that wrote a width there is read the same way).
 *
 * @param {{check?: string, width?: number}} state
 */
function keyWidth(state) {
  return state.check === CONTRAST_CHECK ? null : (state.width ?? null);
}

/** `route theme widthpx`, or `route theme` for a state with no key width. @param {StateResult} state */
function stateLabel(state) {
  const width = keyWidth(state);
  return `${state.route} ${state.theme}` + (width === null ? '' : ` ${width}px`);
}

/**
 * Identity of a finding across runs: the render state plus rule id plus
 * target locator. The detail string is deliberately excluded - it carries
 * measured pixels that jitter between runs and would make every finding
 * look new.
 *
 * @param {StateResult} state
 * @param {{id?: string, target?: string}} finding
 */
function findingKey(state, finding) {
  return JSON.stringify([
    state.check ?? 'sweep',
    state.route,
    state.theme,
    keyWidth(state),
    finding.id ?? 'unknown-rule',
    finding.target ?? '',
  ]);
}

/**
 * A state's identity: the check (a route sweep, or the DESIGN.md contrast
 * probe) plus its render state.
 *
 * @param {{check?: string, route: string, theme: string, width?: number}} state
 */
function stateKey(state) {
  return JSON.stringify([state.check ?? 'sweep', state.route, state.theme, keyWidth(state)]);
}

/**
 * Findings as a multiset: one entry per identity, carrying how many times it
 * occurred. Two instances of the same defect on the same generated target
 * (two identical cards, say) are two findings, and a diff that keyed a plain
 * Map would let the second one arrive unreported.
 *
 * @param {{states?: StateResult[]}} report
 * @returns {Map<string, {check?: string, route: string, theme: string, width?: number, id: string,
 *   target?: string, detail?: string, count: number}>}
 */
function collectFindings(report) {
  const map = new Map();
  for (const state of report.states ?? []) {
    for (const finding of state.findings ?? []) {
      const key = findingKey(state, finding);
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const width = keyWidth(state);
      map.set(key, {
        ...(state.check ? { check: state.check } : {}),
        route: state.route,
        theme: state.theme,
        ...(width === null ? {} : { width }),
        id: finding.id ?? 'unknown-rule',
        target: finding.target,
        detail: finding.detail,
        count: 1,
      });
    }
  }
  return map;
}

/**
 * The states a report actually swept to completion. A state with an
 * environmentError produced no evidence, so nothing can be said about the
 * findings it would have had.
 *
 * @param {{states?: StateResult[]}} report
 */
function completedStates(report) {
  const keys = new Set();
  for (const state of report.states ?? []) {
    if (!state.environmentError) keys.add(stateKey(state));
  }
  return keys;
}

/**
 * Regression diff against a prior findings.json, as a multiset comparison:
 *
 *   new         - absent from the baseline, or present with a lower count
 *                 (the entry's `count` is the number of additional instances);
 *   resolved    - the baseline had it and the SAME state ran to completion
 *                 now and no longer shows it (or shows fewer);
 *   unverified  - the baseline had it but the current run has no completed
 *                 sweep of that state (environment error, or a narrower
 *                 matrix left it out), so its absence is not evidence;
 *   carriedOver - instances present in both.
 *
 * States the baseline never swept produce "new" findings - evidence the
 * baseline lacked is not a pass to inherit - and a state the current run did
 * not complete can resolve nothing: a finding is only gone once the state it
 * lived in was re-observed without it.
 *
 * @param {{states?: StateResult[]}} baseline a prior buildReport() result
 * @param {{states?: StateResult[]}} current
 */
export function diffReports(baseline, current) {
  const before = collectFindings(baseline);
  const after = collectFindings(current);
  const completed = completedStates(current);
  const added = [];
  const resolved = [];
  const unverified = [];
  let carriedOver = 0;
  for (const [key, entry] of after) {
    const previous = before.get(key)?.count ?? 0;
    carriedOver += Math.min(previous, entry.count);
    if (entry.count > previous) added.push({ ...entry, count: entry.count - previous });
  }
  for (const [key, entry] of before) {
    const now = after.get(key)?.count ?? 0;
    if (now >= entry.count) continue;
    const gone = { ...entry, count: entry.count - now };
    if (completed.has(stateKey(entry))) resolved.push(gone);
    else unverified.push(gone);
  }
  return { new: added, resolved, unverified, carriedOver };
}

/**
 * @param {ReturnType<typeof buildReport>} report
 * @param {{failOnFindings: boolean}} config
 * @param {ReturnType<typeof diffReports>} [diff] baseline comparison; when
 *   given, --fail-on-findings gates on new findings only. Unverified findings
 *   do not gate here: the environment-error case already exits 2 above, and a
 *   deliberately narrower matrix is the caller's choice - the summary names
 *   what it left unconfirmed.
 */
export function exitCode(report, config, diff) {
  if (report.summary.environmentFailures > 0) return 2;
  if (report.summary.screenshotFailures > 0) return 2;
  if (!config.failOnFindings) return 0;
  if (diff) return diff.new.length > 0 ? 1 : 0;
  return report.summary.totalFindings > 0 ? 1 : 0;
}

/**
 * One-paragraph terminal summary; the JSON is the full result.
 * @param {ReturnType<typeof buildReport>} report
 * @param {ReturnType<typeof diffReports>} [diff]
 */
export function summaryLines(report, diff) {
  const s = report.summary;
  const lines = [
    `design-verify: ${s.statesRun} state(s) swept - ${s.statesClean} clean, ` +
      `${s.totalFindings} finding(s), ${s.needsReview} needing review, ${s.waived ?? 0} waived, ` +
      `${s.environmentFailures} environment failure(s), ` +
      `${s.screenshotFailures} screenshot failure(s)`,
  ];
  if (diff) {
    const total = (/** @type {Array<{count: number}>} */ entries) =>
      entries.reduce((sum, entry) => sum + entry.count, 0);
    lines.push(
      `  vs baseline: ${total(diff.new)} new, ${total(diff.resolved)} resolved, ` +
        `${total(diff.unverified)} unverified, ${diff.carriedOver} carried over`,
    );
    const describe = (/** @type {{check?: string, route: string, theme: string, width?: number, id: string, target?: string, count: number}} */ f) =>
      `${stateLabel(f)}: ${f.id}${f.target ? ` @ ${f.target}` : ''}` +
      (f.count > 1 ? ` (x${f.count})` : '');
    for (const f of diff.new) lines.push(`  NEW ${describe(f)}`);
    for (const f of diff.resolved) lines.push(`  RESOLVED ${describe(f)}`);
    // Not a fix: the state this finding lived in was not re-observed.
    for (const f of diff.unverified) lines.push(`  UNVERIFIED ${describe(f)}`);
  }
  for (const [rule, count] of Object.entries(s.byRule)) {
    lines.push(`  ${rule}: ${count}`);
  }
  for (const [gate, count] of Object.entries(s.byGate ?? {})) {
    lines.push(`  gate ${gate}: ${count}`);
  }
  lines.push(...waiverLines(report.waivers));
  for (const state of report.states) {
    if (state.environmentError) {
      lines.push(`  ENVIRONMENT ${stateLabel(state)}: ${state.environmentError}`);
    } else if (state.screenshotError) {
      lines.push(`  SCREENSHOT ${stateLabel(state)}: ${state.screenshotError}`);
    }
    if (state.check === CONTRAST_CHECK) {
      for (const entry of state.findings ?? []) {
        lines.push(`  CONTRAST ${state.theme}: ${entry.gate} ${entry.target} ${entry.detail}`);
      }
    }
    for (const entry of state.waived ?? []) {
      lines.push(
        `  WAIVED ${stateLabel(state)}: ${entry.gate} ${entry.id ?? 'unknown-rule'}` +
          (entry.target ? ` @ ${entry.target}` : '') +
          ` - waiver #${entry.waiver.index}: ${entry.waiver.reason}`,
      );
    }
    for (const entry of state.needsReview ?? []) {
      lines.push(
        `  NEEDS REVIEW ${stateLabel(state)}: ${entry.id ?? 'unknown-rule'}` +
          (entry.target ? ` @ ${entry.target}` : ''),
      );
    }
  }
  return lines;
}
