/**
 * `VerifyDev` — orchestrates the build + boot + browser-spec verification
 * sequence and writes a machine-readable JSON result. Every later phase and
 * the orchestrator rely on this so no result rests on a runner's prose.
 *
 * Steps, each its own entry in the JSON `steps` array:
 *
 * - optional cache clear (`--clean`);
 * - build the shell (`npm run build` in `template-shell`);
 * - build each MFE fixture one at a time (`npx vite build` in the fixture dir);
 * - `generate:mfe-manifests` and `layout:dist` (in `template-shell`);
 * - a boot check (start `e2e/server.mjs`, load the shell, assert `#root`,
 *   record console errors, close);
 * - the browser specs `--runs` times each (`npx playwright test` per spec).
 *
 * Each child-process step is run by a `StepRunner` (one process, stdin
 * closed, output to a log under `e2e/results/logs/`, own 15-minute timeout,
 * kill on timeout, mark failed, never retry). The boot check is an in-process
 * step wrapped to the same JSON shape; browser specs are run through the
 * injected `runBrowserSpec` (the CLI uses the StepRunner for them too).
 *
 * The result is `{status, steps: [{step, command, exitCode, durationMs, log}], summary}`
 * written to `e2e/results/verify-dev-<ISO>.json`, and the run exits non-zero
 * on fail.
 *
 * The class takes its collaborators as constructor args so a unit test
 * passes fakes (no real builds, no real browser in unit tests). The CLI entry
 * in `scripts/verify-dev.mjs` wires the real `StepRunner`, `BootCheck`, and
 * `runBrowserSpec`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MfeFixtureDiscovery } from './MfeFixtureDiscovery.mjs';

/** Default `--specs`: the smoke and round-count specs that gate every phase. */
export const DEFAULT_SPECS = ['smoke', 'round-count'];
/** Default `--runs`. */
export const DEFAULT_RUNS = 3;

export class VerifyDev {
  /**
   * @param {{
   *   root: string;
   *   logDir: string;
   *   stepRunner: { run: (desc: object) => Promise<{ step: string; command: string; exitCode: number | null; durationMs: number; log: string }> };
   *   fixtureDiscovery?: { discover: () => string[] };
   *   bootCheck?: { run: () => Promise<{ ok: boolean; rootChildCount: number; pageErrors: string[]; consoleErrors: string[] }> };
   *   runBrowserSpec?: (spec: string, runIdx: number) => Promise<{ step: string; command: string; exitCode: number | null; durationMs: number; log: string }>;
   *   specs?: string[];
   *   runs?: number;
   *   skipBuild?: boolean;
   *   clean?: boolean;
   *   now?: () => Date;
   *   writeFile?: typeof writeFileSync;
   *   mkdirFn?: (dir: string) => void;
   * }} opts
   */
  constructor({
    root,
    logDir,
    stepRunner,
    fixtureDiscovery,
    bootCheck,
    runBrowserSpec,
    specs = DEFAULT_SPECS,
    runs = DEFAULT_RUNS,
    skipBuild = false,
    clean = false,
    now = () => new Date(),
    writeFile = writeFileSync,
    mkdirFn = (dir) => mkdirSync(dir, { recursive: true }),
  } = {}) {
    if (!root) throw new Error('VerifyDev: root is required');
    if (!logDir) throw new Error('VerifyDev: logDir is required');
    if (!stepRunner) throw new Error('VerifyDev: stepRunner is required');
    this.root = root;
    this.logDir = logDir;
    this.stepRunner = stepRunner;
    this.fixtureDiscovery = fixtureDiscovery ?? new MfeFixtureDiscovery({ root });
    this.bootCheck = bootCheck;
    this.runBrowserSpec = runBrowserSpec;
    this.specs = specs;
    this.runs = runs;
    this.skipBuild = skipBuild;
    this.clean = clean;
    this.now = now;
    this.writeFile = writeFile;
    this.mkdirFn = mkdirFn;
  }

  /**
   * Run every planned step exactly once (never retry), collect the results,
   * and write the JSON result file.
   *
   * A result with zero executed steps is never "pass" — it is
   * "fail" with `reason` set to `"no steps executed"`. An empty plan
   * (e.g. `--skip-build` with no specs and no boot check) is a
   * misconfiguration that must surface, not a silent pass.
   *
   * @returns {Promise<{ json: object; jsonPath: string; status: 'pass' | 'fail' }>}
   */
  async run() {
    this.mkdirFn(this.logDir);
    const plan = this.#plan();
    /** @type {Array<{ step: string; command: string; exitCode: number | null; durationMs: number; log: string }>} */
    const results = [];
    for (const desc of plan) {
      const result = await this.#runStep(desc);
      results.push(result);
    }
    // Zero executed steps can never be "pass" — an empty plan
    // is a misconfiguration, not a silent pass.
    /** @type {'pass' | 'fail'} */
    let status;
    /** @type {string | undefined} */
    let reason;
    if (results.length === 0) {
      status = 'fail';
      reason = 'no steps executed';
    } else {
      status = results.every((r) => r.exitCode === 0) ? 'pass' : 'fail';
    }
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.exitCode === 0).length,
      failed: results.filter((r) => r.exitCode !== 0).length,
    };
    const json = { status, ...(reason !== undefined ? { reason } : {}), steps: results, summary };
    const jsonPath = path.join(this.logDir, `verify-dev-${this.#iso()}.json`);
    this.writeFile(jsonPath, JSON.stringify(json, null, 2));
    return { json, jsonPath, status };
  }

  /**
   * @returns {Array<object>} the ordered step descriptors.
   */
  #plan() {
    /** @type {Array<object>} */
    const steps = [];
    if (this.clean) {
      steps.push({ kind: 'child', step: 'cache-clear', command: ['node', 'scripts/clear-unit-cache.mjs'], cwd: this.root });
    }
    if (!this.skipBuild) {
      steps.push({
        kind: 'child',
        step: 'build-shell',
        command: ['npm', 'run', 'build'],
        cwd: path.join(this.root, 'template-shell'),
      });
      for (const fixture of this.fixtureDiscovery.discover()) {
        steps.push({
          kind: 'child',
          step: `build-mfe-${path.basename(fixture)}`,
          command: ['npx', 'vite', 'build'],
          cwd: fixture,
        });
      }
      steps.push({
        kind: 'child',
        step: 'generate-mfe-manifests',
        command: ['npm', 'run', 'generate:mfe-manifests'],
        cwd: path.join(this.root, 'template-shell'),
      });
      steps.push({
        kind: 'child',
        step: 'layout-dist',
        command: ['npm', 'run', 'layout:dist'],
        cwd: path.join(this.root, 'template-shell'),
      });
    }
    if (this.bootCheck) {
      steps.push({ kind: 'boot-check' });
    }
    if (this.runBrowserSpec) {
      for (let i = 0; i < this.runs; i++) {
        for (const spec of this.specs) {
          steps.push({ kind: 'browser-spec', spec, runIdx: i });
        }
      }
    }
    return steps;
  }

  /**
   * @param {object} desc
   * @returns {Promise<{ step: string; command: string; exitCode: number | null; durationMs: number; log: string }>}
   */
  async #runStep(desc) {
    if (desc.kind === 'child') {
      return this.stepRunner.run(desc);
    }
    if (desc.kind === 'boot-check') {
      return this.#runBootCheckStep();
    }
    if (desc.kind === 'browser-spec') {
      return this.runBrowserSpec(desc.spec, desc.runIdx);
    }
    throw new Error(`VerifyDev: unknown step kind: ${desc.kind}`);
  }

  /**
   * Wraps the in-process boot check into the same JSON shape as a child step,
   * writing its outcome to a log file so the runner reports a path. Uses
   * `writeFileSync` (not a stream) because the boot check's log is a single
   * summary line, not streamed child output — a stream's async open would
   * outlive a unit test's temp tree and surface as an unhandled error.
   */
  async #runBootCheckStep() {
    const logPath = path.join(this.logDir, 'boot-check.log');
    const startedAt = Date.now();
    /** @type {number | null} */
    let exitCode = 0;
    /** @type {string} */
    let line;
    try {
      const r = await this.bootCheck.run();
      line =
        `boot check ok=${r.ok} rootChildren=${r.rootChildCount} ` +
        `pageErrors=${JSON.stringify(r.pageErrors)} consoleErrors=${JSON.stringify(r.consoleErrors)}`;
      exitCode = r.ok ? 0 : 1;
    } catch (error) {
      line = `boot check error: ${error instanceof Error ? error.message : String(error)}`;
      exitCode = 1;
    }
    try {
      writeFileSync(logPath, `${line}\n`);
    } catch {
      // The log file is best-effort for an in-process step; the JSON result
      // carries the outcome regardless. A write failure (e.g. the log dir
      // was removed between planning and this step) must not fail the run.
    }
    return { step: 'boot-check', command: '(boot-check)', exitCode, durationMs: Date.now() - startedAt, log: logPath };
  }

  /** @returns {string} ISO timestamp safe for a filename. */
  #iso() {
    return this.now().toISOString().replace(/[:.]/g, '-');
  }
}
