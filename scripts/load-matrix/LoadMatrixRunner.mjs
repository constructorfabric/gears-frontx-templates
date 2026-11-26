/**
 * `LoadMatrixRunner` — orchestrates the load-measurement matrix.
 *
 * The two scripts (`scripts/load-gate-cells.mjs` and
 * `scripts/load-full-matrix.mjs`) call this runner with a cell
 * specification; the runner computes the cells to run, invokes the
 * playwright spec once per cell as its own bounded command (one
 * cell/session kind per StepRunner step, 15-minute hard timeout per
 * step, never retried), and writes a JSON result of one record per step
 * `{status, steps: [{step, command, exitCode, durationMs, log}],
 * summary, cells, plannedSteps, sharedConstants, mode}`
 * under `e2e/results/` plus a markdown summary.
 *
 * Gate cells (run on every phase and fix) = HTTP/2 + gzip, Fast 4G +
 * 4x CPU, cold, shell+1, shell+5-sequential AND shell+5-parallel-
 * startup, plus the HTTP/1.1 office-LAN and Fast 4G boot cells,
 * reported every run against the stored baseline. Full matrix (once
 * per phase close) = compression × protocol × network × cache state ×
 * session.
 *
 * Each cell is run as its own bounded command via the shared
 * `StepRunner` (one process, stdin closed, output to a log under
 * `e2e/results/logs/`, own 15-minute timeout enforced by the
 * StepRunner, kill on timeout, mark failed, never retry). When an
 * old-rule worktree path is supplied, each cell is run twice — once as `new` and once as
 * `old` — so the old rule is measured with identical server
 * settings in every cell. The dry-run expands every cell with both
 * variants (every gate cell measures BOTH variants) so the
 * planned cell list shows the new + old pair even before the
 * old-rule worktree is wired.
 *
 * `--runs` precedence: `--runs N` > `LOAD_GATE_RUNS` env >
 * default (30 gate / 10 full). The CLI scripts resolve this via
 * `LoadMatrixRunner.resolveRuns` and pass the resolved value to
 * `run({ runs })`.
 *
 * One class per file (OOP). The runner is a coordinator over the
 * harness modules and a playwright CLI invocation; it does not embed
 * the measurement logic itself. The class takes its collaborators as
 * constructor args so a unit test passes fakes (no real playwright in
 * unit tests). The CLI entry points in `scripts/load-gate-cells.mjs`
 * and `scripts/load-full-matrix.mjs` wire the real `StepRunner`.
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  PROFILES,
  PROTOCOLS,
  COMPRESSIONS,
  CACHE_STATES,
  SESSION_KINDS,
  LOAD_GATE_RUNS,
  LOAD_GATE_RUNS_FULL_MATRIX,
  SHARED_CONSTANTS,
  HTTP1_BOOT_BASELINE,
  NOISE_MARGIN,
  BOOT_GUARD_RATIO,
  SESSION_GUARD_RATIO,
} from './MatrixProfiles.mjs';
import { LoadGuards } from './LoadGuards.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RESULTS_DIR = path.join(REPO_ROOT, 'e2e', 'results');

/** @typedef {'gate-cells' | 'full-matrix'} MatrixMode */

/**
 * @typedef {Object} Cell
 * @property {string} protocol
 * @property {string} profile
 * @property {string} compression
 * @property {string} cacheState
 * @property {string} session
 * @property {string} variant
 */

/**
 * @typedef {Object} PlannedStep
 * @property {Cell} cell
 * @property {'new' | 'old'} variant
 * @property {string} step
 * @property {string} [skipReason]
 */

/**
 * @typedef {Object} StepResult
 * @property {string} step
 * @property {string} command
 * @property {number | null} exitCode
 * @property {number} durationMs
 * @property {string} log
 * @property {string} [reason]
 */

/** Filename prefix per mode — `<prefix>-<ISO>.json` under `e2e/results/`. */
const FILENAME_PREFIX = /** @type {const} */ ({
  'gate-cells': 'load-gate-cells',
  'full-matrix': 'load-full-matrix',
});

export class LoadMatrixRunner {
  /** @type {MatrixMode} */
  #mode;
  /** @type {{ run: (desc: object) => Promise<StepResult> }} */
  #stepRunner;
  /** @type {string} */
  #resultsDir;
  /** @type {string} */
  #repoRoot;
  /** @type {() => Date} */
  #now;
  /** @type {typeof writeFileSync} */
  #writeFile;
  /** @type {(file: string) => string} */
  #readFile;
  /** @type {(dir: string) => void} */
  #mkdirFn;

  /**
   * @param {Object} opts
   * @param {MatrixMode} opts.mode
   * @param {{ run: (desc: object) => Promise<StepResult> }} opts.stepRunner bounded-step runner.
   * @param {string} [opts.resultsDir]
   * @param {string} [opts.repoRoot]
   * @param {() => Date} [opts.now]
   * @param {typeof writeFileSync} [opts.writeFile]
   * @param {(file: string) => string} [opts.readFile] reads a cell's measurements file
   * @param {(dir: string) => void} [opts.mkdirFn]
   */
  constructor({
    mode,
    stepRunner,
    resultsDir = RESULTS_DIR,
    repoRoot = REPO_ROOT,
    now = () => new Date(),
    writeFile = writeFileSync,
    readFile = (file) => readFileSync(file, 'utf-8'),
    mkdirFn = (dir) => mkdirSync(dir, { recursive: true }),
  } = {}) {
    if (mode !== 'gate-cells' && mode !== 'full-matrix') {
      throw new Error(`LoadMatrixRunner: unknown mode ${mode}`);
    }
    if (!stepRunner) {
      throw new Error('LoadMatrixRunner: stepRunner is required (bounded steps via StepRunner)');
    }
    this.#mode = mode;
    this.#stepRunner = stepRunner;
    this.#resultsDir = resultsDir;
    this.#repoRoot = repoRoot;
    this.#now = now;
    this.#writeFile = writeFile;
    this.#readFile = readFile;
    this.#mkdirFn = mkdirFn;
  }

  /**
   * Resolves the run count with precedence `--runs` > `LOAD_GATE_RUNS`
   * env > default. A non-finite or negative `cliRuns`/`envRuns`
   * is ignored (the caller's parsing already produced `NaN` for a
   * missing `--runs` argument; fall through to the next precedence
   * tier rather than propagating `NaN`).
   *
   * @param {Object} p
   * @param {number | undefined} p.cliRuns
   * @param {number | undefined} p.envRuns
   * @param {number} p.defaultRuns
   * @returns {number}
   */
  static resolveRuns({ cliRuns, envRuns, defaultRuns }) {
    const valid = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
    if (valid(cliRuns)) return Math.floor(cliRuns);
    if (valid(envRuns)) return Math.floor(envRuns);
    return defaultRuns;
  }

  /**
   * Returns the cells for the chosen mode.
   *
   * Gate cells = HTTP/2 + gzip, Fast 4G + 4x CPU, cold, shell+1,
   * shell+5-sequential AND shell+5-parallel-startup, plus the
   * HTTP/1.1 office-LAN and Fast 4G boot cells (reported, no regression
   * from the stored baseline).
   * Full matrix = compression × protocol × network × cache state ×
   * session.
   *
   * @returns {Cell[]}
   */
  cells() {
    if (this.#mode === 'gate-cells') {
      /** @type {Cell[]} */
      const cells = [];
      // HTTP/2 + gzip, Fast 4G + 4x CPU, cold — shell+1, shell+5-sequential
      // AND shell+5-parallel-startup (the gate cells previously
      // omitted the parallel-startup case; now both variants per cell
      // are measured in this session kind too).
      for (const session of ['shell+1', 'shell+5-sequential', 'shell+5-parallel-startup']) {
        cells.push({
          protocol: 'h2',
          profile: 'fast-4g',
          compression: 'gzip',
          cacheState: 'cold',
          session,
          variant: 'new',
        });
      }
      // HTTP/1.1 office-LAN boot: reported every run, no regression from the
      // stored baseline (not gated against the old rule)
      cells.push({
        protocol: 'http1',
        profile: 'office-lan',
        compression: 'none',
        cacheState: 'cold',
        session: 'shell+1',
        variant: 'new',
      });
      // HTTP/1.1 Fast 4G boot: reported every run, no regression from the
      // stored baseline (not gated against the old rule)
      cells.push({
        protocol: 'http1',
        profile: 'fast-4g',
        compression: 'none',
        cacheState: 'cold',
        session: 'shell+1',
        variant: 'new',
      });
      return cells;
    }
    // Full matrix: compression × protocol × network × cache state × session
    /** @type {Cell[]} */
    const cells = [];
    for (const compression of COMPRESSIONS) {
      for (const protocol of PROTOCOLS) {
        for (const profile of Object.keys(PROFILES)) {
          for (const cacheState of CACHE_STATES) {
            for (const session of SESSION_KINDS) {
              cells.push({
                protocol,
                profile,
                compression,
                cacheState,
                session,
                variant: 'new',
                    });
            }
          }
        }
      }
    }
    return cells;
  }

  /**
   * Computes the planned steps for a run. Each cell is expanded with
   * its variants: `[new, old]` when `oldServeRoot` is supplied OR the
   * run is a dry-run (every gate cell measures BOTH variants, so
   * the dry-run planned list shows the new + old pair even before the
   * old-rule worktree is wired); otherwise `[new]` only.
   *
   * @param {Cell[]} cells
   * @param {Object} opts
   * @param {string | undefined} opts.oldServeRoot
   * @param {boolean} opts.dryRun
   * @returns {{ planned: PlannedStep[] }}
   */
  #plannedSteps(cells, { oldServeRoot, dryRun }) {
    const bothVariants = dryRun || oldServeRoot !== undefined;
    /** @type {PlannedStep[]} */
    const planned = [];
    for (const cell of cells) {
      const variants = bothVariants ? ['new', 'old'] : ['new'];
      for (const variant of variants) {
        /** @type {Cell} */
        const v = { ...cell, variant };
        planned.push({
          cell: v,
          variant,
          step: this.#stepName(v),
        });
      }
    }
    return { planned };
  }

  /**
   * Runs the matrix. Invokes the playwright spec once per planned
   * step as its own bounded StepRunner step (one cell/session kind
   * per step, 15-minute hard timeout per step, never retried). When
   * `oldServeRoot` is supplied (or the run is a dry-run), each cell
   * is planned as TWO steps — once as `new` and once as `old` — so
   * the old rule is measured with identical server settings in
   * every cell. Writes the JSON result of one record per step under
   * `e2e/results/<prefix>-<ISO>.json` and a markdown summary.
   *
   * `--runs` precedence: `runs` (CLI) > `envRuns` (LOAD_GATE_RUNS
   * env) > default (30 gate / 10 full).
   *
   * A dry-run prints the plan and writes NO result JSON (a
   * pass-shaped file with zero steps is the false-positive that bit
   * `node scripts/load-gate-cells.mjs --dry-run`); the in-memory
   * `json.status` is `"dry-run"` so callers and tests can distinguish
   * a planned-only run from a real one, and `jsonPath` is `null`.
   * Everywhere a result JSON IS written, a result with zero executed
   * steps can never be `"pass"` — it is `"fail"` with `reason` set to
   * `"no steps executed"`. A gate-cells run without `oldServeRoot` that
   * otherwise passes is `"incomplete"`: it measured no old-rule variant,
   * so the guards against the old rule were not judged. The matrix is a
   * local report, not a CI gate.
   *
   * @param {Object} [opts]
   * @param {number} [opts.runs] override LOAD_GATE_RUNS (CLI `--runs`)
   * @param {number} [opts.envRuns] LOAD_GATE_RUNS env var (resolved by the CLI script)
   * @param {string} [opts.oldServeRoot] old-rule worktree path
   * @param {boolean} [opts.dryRun] list cells without invoking playwright
   * @returns {Promise<{ results: Cell[]; markdown: string; json: object; jsonPath: string | null; status: 'pass' | 'fail' | 'incomplete' | 'dry-run' }>}
   */
  async run({ runs, envRuns, oldServeRoot, dryRun = false } = {}) {
    const cells = this.cells();
    const defaultRuns = this.#mode === 'gate-cells' ? LOAD_GATE_RUNS : LOAD_GATE_RUNS_FULL_MATRIX;
    const n = LoadMatrixRunner.resolveRuns({ cliRuns: runs, envRuns, defaultRuns });
    this.#mkdirFn(this.#resultsDir);
    const { planned } = this.#plannedSteps(cells, { oldServeRoot, dryRun });
    /** @type {StepResult[]} */
    const steps = [];
    if (!dryRun) {
      for (const p of planned) {
        // Each planned step is its own bounded command — one
        // StepRunner step per cell/session kind/variant. The
        // StepRunner enforces the 15-minute cap, kills on timeout,
        // marks the step failed, and never retries.
        const isOld = p.variant === 'old';
        const step = this.#stepFor(p.cell, n, isOld, isOld ? oldServeRoot : undefined);
        const result = await this.#stepRunner.run(step);
        steps.push(result);
      }
    }
    // A result with zero executed steps is never "pass" — it is
    // "fail" with reason "no steps executed". A dry-run writes NO
    // result JSON (only the markdown plan); the in-memory status is
    // "dry-run" so callers can distinguish a planned-only run from a
    // real one, and the CLI scripts exit 0 for a dry-run.
    const verdicts = dryRun ? [] : this.#http1BootVerdicts(planned);
    const referenceVerdicts =
      dryRun || oldServeRoot === undefined || this.#mode !== 'gate-cells'
        ? []
        : this.#referenceGuardVerdicts(planned);
    /** @type {'pass' | 'fail' | 'incomplete' | 'dry-run'} */
    let status;
    /** @type {string | undefined} */
    let reason;
    if (dryRun) {
      status = 'dry-run';
    } else if (steps.length === 0) {
      status = 'fail';
      reason = 'no steps executed';
    } else if (
      !(
        steps.every((r) => r.exitCode === 0) &&
        verdicts.every((v) => v.pass) &&
        referenceVerdicts.every((v) => v.pass)
      )
    ) {
      status = 'fail';
    } else if (this.#mode === 'gate-cells' && oldServeRoot === undefined) {
      // The guards against the old rule are part of the report; a run that
      // did not measure the old variant cannot judge them, so it is not a pass.
      status = 'incomplete';
      reason = 'old-rule variant not measured (--old-serve-root)';
    } else {
      status = 'pass';
    }
    const summary = {
      total: steps.length,
      passed: steps.filter((r) => r.exitCode === 0).length,
      failed: steps.length - steps.filter((r) => r.exitCode === 0).length,
      cells: cells.length,
      plannedSteps: planned.length,
      runsPerCell: n,
    };
    const json = {
      status,
      ...(reason !== undefined ? { reason } : {}),
      steps,
      summary,
      cells,
      plannedSteps: planned,
      http1BootVerdicts: verdicts,
      referenceGuardVerdicts: referenceVerdicts,
      sharedConstants: SHARED_CONSTANTS,
      mode: this.#mode,
    };
    // A dry-run prints the plan but writes NO result JSON — a
    // pass-shaped file with zero steps is exactly the false-positive
    // that bit `node scripts/load-gate-cells.mjs --dry-run`. The
    // in-memory `json` is still returned so callers/tests can read
    // the plan without a file.
    /** @type {string | null} */
    let jsonPath = null;
    if (!dryRun) {
      jsonPath = path.join(this.#resultsDir, `${FILENAME_PREFIX[this.#mode]}-${this.#iso()}.json`);
      this.#writeFile(jsonPath, JSON.stringify(json, null, 2));
    }
    const markdown = this.#markdownSummary(cells, planned, n, steps, status, dryRun, verdicts, referenceVerdicts, oldServeRoot !== undefined);
    this.#writeFile(path.join(this.#resultsDir, `${this.#mode}-summary.md`), markdown);
    return { results: cells, markdown, json, jsonPath, status };
  }

  /**
   * The verdict of every HTTP/1.1 boot cell (office-LAN and Fast 4G, cold,
   * new variant) against the stored baseline: reported every run, a
   * regression beyond the noise margin fails the run. Not a gate against
   * the old rule. A cell whose measurement cannot be read is a failed
   * verdict.
   *
   * @param {PlannedStep[]} planned
   * @returns {Array<{ step: string, pass: boolean, finding: string, newMs?: number, baselineMs: number }>}
   * @private
   */
  #http1BootVerdicts(planned) {
    const guards = LoadMatrixRunner.#guards();
    const verdicts = [];
    for (const p of planned) {
      const { cell } = p;
      const baselineMs = HTTP1_BOOT_BASELINE[cell.profile];
      if (p.variant !== 'new' || cell.protocol !== 'http1' || cell.cacheState !== 'cold' || baselineMs === undefined) continue;
      let newMs;
      try {
        const measured = JSON.parse(this.#readFile(path.join(this.#resultsDir, `${p.step}-measurements.json`)));
        newMs = Number(measured.medianBoot);
      } catch {
        newMs = Number.NaN;
      }
      if (!Number.isFinite(newMs)) {
        verdicts.push({ step: p.step, pass: false, baselineMs, finding: `HTTP/1.1 ${cell.profile} shell boot: no readable measurement for ${p.step}` });
        continue;
      }
      const verdict = guards.judgeHttp1Boot({ profile: cell.profile, newMs, baselineMs });
      verdicts.push({ step: p.step, pass: verdict.pass, newMs, baselineMs, finding: verdict.finding });
    }
    return verdicts;
  }

  /** @returns {LoadGuards} the guards with the ruled ratios. */
  static #guards() {
    return new LoadGuards({
      noiseMargin: NOISE_MARGIN,
      bootGuardRatio: BOOT_GUARD_RATIO,
      sessionGuardRatio: SESSION_GUARD_RATIO,
    });
  }

  /**
   * The verdicts of the guards measured against the old rule, on the
   * HTTP/2 + gzip, Fast 4G + 4x CPU, cold cells: the shell boot at most
   * 25% slower than the old rule's, and the session (boot plus the
   * session's extension loads) within the noise margin of it. Each
   * compares the new variant's medians with the old variant's of the
   * same cell. A cell whose new or old measurement cannot be read is a
   * failed verdict.
   *
   * @param {PlannedStep[]} planned
   * @returns {Array<{ step: string, guard: string, pass: boolean, finding: string, newMs?: number, oldMs?: number }>}
   * @private
   */
  #referenceGuardVerdicts(planned) {
    const guards = LoadMatrixRunner.#guards();
    const verdicts = [];
    for (const p of planned) {
      const { cell } = p;
      if (
        p.variant !== 'new' ||
        cell.protocol !== 'h2' ||
        cell.profile !== 'fast-4g' ||
        cell.compression !== 'gzip' ||
        cell.cacheState !== 'cold'
      ) {
        continue;
      }
      const oldStep = this.#stepName({ ...cell, variant: 'old' });
      const measured = (step) => {
        try {
          const m = JSON.parse(this.#readFile(path.join(this.#resultsDir, `${step}-measurements.json`)));
          const boot = Number(m.medianBoot);
          const loads = Array.isArray(m.sessionMedians) ? m.sessionMedians.map(Number) : [];
          if (!Number.isFinite(boot) || loads.length === 0 || !loads.every(Number.isFinite)) return undefined;
          return { boot, session: boot + loads.reduce((a, b) => a + b, 0) };
        } catch {
          return undefined;
        }
      };
      const next = measured(p.step);
      const old = measured(oldStep);
      if (next === undefined || old === undefined) {
        for (const guard of ['shell boot', `session ${cell.session}`]) {
          verdicts.push({
            step: p.step,
            guard,
            pass: false,
            finding: `${guard}: no readable measurement for ${next === undefined ? p.step : oldStep}`,
          });
        }
        continue;
      }
      const common = { profile: cell.profile, protocol: cell.protocol, compression: cell.compression };
      for (const verdict of [
        guards.judgeBoot({ ...common, newMs: next.boot, oldMs: old.boot }),
        guards.judgeSession({ ...common, sessionKind: cell.session, newMs: next.session, oldMs: old.session }),
      ]) {
        verdicts.push({
          step: p.step,
          guard: verdict.guard,
          pass: verdict.pass,
          newMs: verdict.newMs,
          oldMs: verdict.oldMs,
          finding:
            verdict.finding ??
            `${verdict.guard}: ${verdict.newMs}ms vs old-rule ${verdict.oldMs}ms (allowed ${verdict.allowed}ms)`,
        });
      }
    }
    return verdicts;
  }

  /**
   * Builds the StepRunner descriptor for a cell. The command is the
   * playwright invocation of `e2e/load-matrix.spec.ts`; the cell is
   * selected by env vars (E2E_PROTOCOL, E2E_PROFILE, E2E_COMPRESSION,
   * E2E_CACHE_STATE, E2E_SESSION, E2E_VARIANT, LOAD_GATE_RUNS). When `isOld` is true the variant is `old`
   * and `E2E_SERVE_ROOT` points at the old-rule worktree so the
   * playwright spec serves the old-rule build with identical server
   * settings.
   *
   * @param {Cell} cell
   * @param {number} n
   * @param {boolean} isOld
   * @param {string} [oldServeRoot]
   * @returns {{ step: string; command: string[]; cwd: string; env: Record<string, string> }}
   * @private
   */
  #stepFor(cell, n, isOld, oldServeRoot) {
    const variant = isOld ? 'old' : cell.variant;
    /** @type {Record<string, string>} */
    const env = {
      E2E_PROTOCOL: cell.protocol === 'h2' ? 'h2' : '',
      E2E_PROFILE: cell.profile,
      E2E_COMPRESSION: cell.compression,
      E2E_CACHE_STATE: cell.cacheState,
      E2E_SESSION: cell.session,
      E2E_VARIANT: variant,
      LOAD_GATE_RUNS: String(n),
    };
    if (isOld && oldServeRoot) env.E2E_SERVE_ROOT = oldServeRoot;
    return {
      step: this.#stepName(cell),
      command: ['node', 'node_modules/.bin/playwright', 'test', 'e2e/load-matrix.spec.ts', '--reporter=list'],
      cwd: this.#repoRoot,
      env,
    };
  }

  /**
   * @param {Cell} cell
   * @returns {string}
   * @private
   */
  #stepName(cell) {
    return [
      cell.variant,
      cell.protocol,
      cell.profile,
      cell.compression,
      cell.cacheState,
      cell.session,
    ].join('-');
  }

  /**
   * @param {Cell[]} cells
   * @param {PlannedStep[]} planned
   * @param {number} n
   * @param {StepResult[]} steps
   * @param {'pass' | 'fail' | 'incomplete' | 'dry-run'} status
   * @param {boolean} dryRun
   * @param {Array<{ step: string, pass: boolean, finding: string }>} verdicts
   * @param {Array<{ step: string, pass: boolean, finding: string }>} referenceVerdicts
   * @param {boolean} hasOldRule whether the old rule was measured
   * @returns {string}
   * @private
   */
  #markdownSummary(cells, planned, n, steps, status, dryRun, verdicts, referenceVerdicts, hasOldRule) {
    const lines = [
      `# Load matrix — ${this.#mode}`,
      '',
      `Status: ${status}`,
      `Runs per cell: ${n}`,
      `Cells: ${cells.length}`,
      `Planned steps: ${planned.length}${dryRun ? ' (dry-run: both variants per cell)' : ''}`,
      `Steps: ${steps.length} (passed ${steps.filter((s) => s.exitCode === 0).length}, failed ${steps.length - steps.filter((s) => s.exitCode === 0).length})`,
      '',
      '## Planned steps (gate cells measure BOTH variants per cell)',
      '',
      '| variant | protocol | profile | compression | cache | session |',
      '|---|---|---|---|---|---|',
    ];
    for (const p of planned) {
      const c = p.cell;
      lines.push(
        `| ${p.variant} | ${c.protocol} | ${c.profile} | ${c.compression} | ${c.cacheState} | ${c.session} |`,
      );
    }
    if (steps.length > 0) {
      lines.push('');
      lines.push('## Steps');
      lines.push('');
      lines.push('| step | exitCode | durationMs | log |');
      lines.push('|---|---|---|---|');
      for (const s of steps) {
        lines.push(`| ${s.step} | ${s.exitCode} | ${s.durationMs} | ${s.log} |`);
      }
    }
    if (verdicts.length > 0) {
      lines.push('');
      lines.push('## HTTP/1.1 boot (reported, no regression from the stored baseline)');
      lines.push('');
      for (const v of verdicts) lines.push(`- ${v.pass ? 'PASS' : 'FAIL'} ${v.step}: ${v.finding}`);
    }
    if (referenceVerdicts.length > 0) {
      lines.push('');
      lines.push('## Guards against the old rule (boot, session)');
      lines.push('');
      for (const v of referenceVerdicts) lines.push(`- ${v.pass ? 'PASS' : 'FAIL'} ${v.step}: ${v.finding}`);
    } else if (!dryRun && !hasOldRule && this.#mode === 'gate-cells') {
      lines.push('');
      lines.push('## Guards against the old rule (boot, session)');
      lines.push('');
      lines.push('Not judged: this run measured no old-rule variant (`--old-serve-root`).');
    }
    lines.push('');
    lines.push('## Shared constants');
    lines.push('```json');
    lines.push(JSON.stringify(SHARED_CONSTANTS, null, 2));
    lines.push('```');
    return lines.join('\n');
  }

  /** @returns {string} ISO timestamp safe for a filename. */
  #iso() {
    return this.#now().toISOString().replace(/[:.]/g, '-');
  }
}
