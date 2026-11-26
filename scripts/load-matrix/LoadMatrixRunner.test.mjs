import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LoadMatrixRunner } from './LoadMatrixRunner.mjs';

/**
 * The JSON result carries one record per step. `scripts/load-gate-cells.mjs` and
 * `scripts/load-full-matrix.mjs` must each emit `e2e/results/<name>-<ts>.json`
 * with `{status, steps: [{step, command, exitCode, durationMs, log}],
 * summary, ...}` and run each cell/session kind as its own bounded command
 * (the StepRunner enforces the 15-minute limit per step).
 */

/** A fake StepRunner that records every step descriptor and returns a
 * result shaped exactly like the real StepRunner ({step, command, exitCode,
 * durationMs, log}). `exitCodes` lets a test simulate failures/timeouts.
 * `calls()` returns the recorded step descriptors (a function so the
 * test reads as an action, not a property probe). A `null` entry in
 * `exitCodes` is preserved verbatim (the real StepRunner resolves
 * `exitCode: null` on timeout/hang); `??` would collapse it to 0, so
 * the lookup uses an explicit `undefined` check. */
function fakeStepRunner({ exitCodes = [] } = {}) {
  /** @type {any[]} */
  const recorded = [];
  let i = 0;
  const run = async (desc) => {
    recorded.push(desc);
    const exitCode = i < exitCodes.length ? exitCodes[i++] : 0;
    return {
      step: desc.step,
      command: desc.command.join(' '),
      exitCode,
      durationMs: 100,
      log: path.join('/tmp/fake-logs', `${desc.step}.log`),
    };
  };
  const calls = () => recorded;
  return { run, calls };
}

function makeTmpResultsDir() {
  return mkdtempSync(path.join(tmpdir(), 'load-matrix-runner-'));
}

describe('LoadMatrixRunner — JSON step records', () => {
  it('throws when stepRunner is missing (bounded steps via StepRunner are required)', () => {
    expect(() => new LoadMatrixRunner({ mode: 'gate-cells' })).toThrow(/stepRunner is required/);
  });

  it('throws on an unknown mode', () => {
    const sr = fakeStepRunner();
    expect(() => new LoadMatrixRunner({ mode: 'bogus', stepRunner: sr })).toThrow(/unknown mode/);
  });

  it('gate-cells cells(): HTTP/2+gzip Fast 4G cold for shell+1, shell+5-sequential AND shell+5-parallel-startup; HTTP/1.1 office-LAN + Fast 4G guards; no grouping variants (the chunk-grouping option is removed)', () => {
    const sr = fakeStepRunner();
    const r = new LoadMatrixRunner({ mode: 'gate-cells', stepRunner: sr });
    const cells = r.cells();
    // HTTP/2 + gzip + Fast 4G + cold cells (shell+1, shell+5-sequential,
    // shell+5-parallel-startup — the parallel-startup case is part of the group)
    const h2gzip = cells.filter((c) => c.protocol === 'h2' && c.compression === 'gzip' && c.profile === 'fast-4g' && c.cacheState === 'cold');
    expect(h2gzip.map((c) => c.session).sort()).toEqual(['shell+1', 'shell+5-parallel-startup', 'shell+5-sequential']);
    // HTTP/1.1 office-LAN guard
    const http1OfficeLan = cells.find((c) => c.protocol === 'http1' && c.profile === 'office-lan' && c.cacheState === 'cold');
    expect(http1OfficeLan).toBeDefined();
    // HTTP/1.1 Fast 4G reported cell (not a gate)
    const http1Fast4g = cells.find((c) => c.protocol === 'http1' && c.profile === 'fast-4g' && c.cacheState === 'cold');
    expect(http1Fast4g).toBeDefined();
    expect(cells).toHaveLength(5);
    expect(cells.every((c) => !('groupingBytes' in c))).toBe(true);
  });

  it('full-matrix cells(): the full cross product (compression × protocol × profile × cacheState × session)', () => {
    const sr = fakeStepRunner();
    const r = new LoadMatrixRunner({ mode: 'full-matrix', stepRunner: sr });
    const cells = r.cells();
    // 3 compressions × 2 protocols × 2 profiles × 3 cache states × 3 sessions = 108 cells
    expect(cells).toHaveLength(3 * 2 * 2 * 3 * 3);
  });

  it('run({dryRun: true}) does NOT invoke the StepRunner and writes NO result JSON (a dry-run prints the plan only); the in-memory json carries status="dry-run", steps=[], cells, plus a markdown summary', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      const mkdirFn = vi.fn();
      const fixedDate = new Date('2026-11-12T05:00:00.000Z');
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => fixedDate,
        writeFile,
        mkdirFn,
      });
      const out = await r.run({ dryRun: true });
      // StepRunner was never called.
      expect(sr.calls()).toHaveLength(0);
      // mkdir + 1 write: the markdown summary ONLY (a dry-run
      // writes NO result JSON — a pass-shaped file with zero steps is
      // the false-positive that bit `--dry-run`).
      expect(mkdirFn).toHaveBeenCalledWith(resultsDir);
      expect(writeFile).toHaveBeenCalledTimes(1);
      // No JSON file was written under the result prefix.
      const jsonPath = path.join(resultsDir, 'load-gate-cells-2026-11-12T05-00-00-000Z.json');
      const jsonArg = writeFile.mock.calls.find((c) => c[0] === jsonPath);
      expect(jsonArg).toBeUndefined();
      // The in-memory json carries the plan with a dry-run status
      // (callers and tests read it without a file).
      expect(out.json.status).toBe('dry-run');
      expect(out.json.steps).toEqual([]);
      expect(out.json.summary.cells).toBeGreaterThan(0);
      expect(out.json.summary.total).toBe(0);
      expect(out.json.summary.passed).toBe(0);
      expect(out.json.summary.failed).toBe(0);
      expect(out.json.mode).toBe('gate-cells');
      expect(out.json.sharedConstants).toBeDefined();
      expect(out.json.sharedConstants.NOISE_MARGIN).toBe(0.15);
      // The cells array is recorded for downstream readers.
      expect(Array.isArray(out.json.cells)).toBe(true);
      expect(out.json.cells.length).toBe(out.results.length);
      // No jsonPath is returned for a dry-run (no file written).
      expect(out.jsonPath).toBeNull();
      // A markdown summary is still written.
      const mdArg = writeFile.mock.calls.find((c) => c[0] === path.join(resultsDir, 'gate-cells-summary.md'));
      expect(mdArg).toBeDefined();
      expect(mdArg[1]).toMatch(/Load matrix — gate-cells/);
      expect(mdArg[1]).toMatch(/Status: dry-run/);
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });

  it('run() invokes the StepRunner once per cell as a bounded step, and the JSON status reflects the exit codes', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      // All cells exit 0.
      const sr = fakeStepRunner({ exitCodes: [] });
      const writeFile = vi.fn();
      const fixedDate = new Date('2026-11-12T05:01:00.000Z');
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => fixedDate,
        writeFile,
        readFile: () => JSON.stringify({ medianBoot: 100 }),
      });
      const out = await r.run({});
      const cells = r.cells();
      expect(sr.calls()).toHaveLength(cells.length);
      // Every step descriptor carries a step name, a command array, a cwd, and env vars for the cell.
      for (let i = 0; i < cells.length; i++) {
        const desc = sr.calls()[i];
        expect(desc.step).toBeTruthy();
        expect(Array.isArray(desc.command)).toBe(true);
        expect(desc.cwd).toBe('/repo');
        expect(desc.env.E2E_SESSION).toBe(cells[i].session);
        expect(desc.env.E2E_PROTOCOL).toBe(cells[i].protocol === 'h2' ? 'h2' : '');
        expect(desc.env.LOAD_GATE_RUNS).toBe(String(30));
      }
      // Every exit code is 0, but no old-rule variant was measured, so the
      // guards against the old rule were not judged: 'incomplete', not 'pass'.
      const jsonPath = path.join(resultsDir, 'load-gate-cells-2026-11-12T05-01-00-000Z.json');
      const jsonArg = writeFile.mock.calls.find((c) => c[0] === jsonPath);
      const json = JSON.parse(jsonArg[1]);
      expect(json.status).toBe('incomplete');
      expect(json.reason).toMatch(/old-rule variant not measured/);
      expect(json.steps).toHaveLength(cells.length);
      // Each step's JSON shape is exactly {step, command, exitCode, durationMs, log}.
      const keys = Object.keys(json.steps[0]).sort();
      expect(keys).toEqual(['command', 'durationMs', 'exitCode', 'log', 'step']);
      expect(json.summary.total).toBe(cells.length);
      expect(json.summary.passed).toBe(cells.length);
      expect(json.summary.failed).toBe(0);
      expect(out.status).toBe('incomplete');
      expect(out.jsonPath).toBe(jsonPath);
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });

  it('run() reports status="fail" when any step exits non-zero or is killed (exitCode null) — never relaunches in a loop', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const cellsCount = new LoadMatrixRunner({ mode: 'gate-cells', stepRunner: fakeStepRunner() }).cells().length;
      // First cell exits 1; second cell is killed (exitCode null); rest exit 0.
      const exitCodes = [1, null, ...Array(cellsCount - 2).fill(0)];
      const sr = fakeStepRunner({ exitCodes });
      const writeFile = vi.fn();
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => new Date('2026-11-12T05:02:00.000Z'),
        writeFile,
      });
      const out = await r.run({});
      expect(sr.calls()).toHaveLength(cellsCount); // no retries
      expect(out.status).toBe('fail');
      expect(out.json.summary.passed).toBe(cellsCount - 2);
      expect(out.json.summary.failed).toBe(2);
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });

  it('run({oldServeRoot}) runs each cell as TWO steps (new + old) on identical server settings; the old step sets E2E_VARIANT=old and E2E_SERVE_ROOT', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => new Date('2026-11-12T05:03:00.000Z'),
        writeFile,
      });
      await r.run({ oldServeRoot: '/old/worktree' });
      const cells = r.cells();
      expect(sr.calls()).toHaveLength(cells.length * 2);
      // Steps are interleaved per cell: [new0, old0, new1, old1, ...] — each
      // cell's new + old measurements run back-to-back so the comparison sees
      // similar machine load (no batching of all-new-then-all-old).
      for (let i = 0; i < cells.length; i++) {
        const newDesc = sr.calls()[i * 2];
        const oldDesc = sr.calls()[i * 2 + 1];
        expect(newDesc.env.E2E_VARIANT).toBe('new');
        expect(newDesc.env.E2E_SERVE_ROOT).toBeUndefined();
        expect(oldDesc.env.E2E_VARIANT).toBe('old');
        expect(oldDesc.env.E2E_SERVE_ROOT).toBe('/old/worktree');
        // The old step keeps the same cell env (protocol, profile, session, etc.)
        // so the old rule is measured with identical server settings.
        expect(oldDesc.env.E2E_PROTOCOL).toBe(newDesc.env.E2E_PROTOCOL);
        expect(oldDesc.env.E2E_PROFILE).toBe(newDesc.env.E2E_PROFILE);
        expect(oldDesc.env.E2E_SESSION).toBe(newDesc.env.E2E_SESSION);
        expect(oldDesc.env.LOAD_GATE_RUNS).toBe(newDesc.env.LOAD_GATE_RUNS);
      }
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });

  it('each step command is the playwright invocation of e2e/load-matrix.spec.ts (one cell/session kind per bounded command)', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => new Date('2026-11-12T05:04:00.000Z'),
        writeFile,
      });
      await r.run({});
      for (const desc of sr.calls()) {
        expect(desc.command[0]).toBe('node');
        expect(desc.command.slice(1)).toEqual(['node_modules/.bin/playwright', 'test', 'e2e/load-matrix.spec.ts', '--reporter=list']);
      }
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });

  it('full-matrix writes its JSON to load-full-matrix-<ISO>.json with the same step record format', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      const fixedDate = new Date('2026-11-12T05:05:00.000Z');
      const r = new LoadMatrixRunner({
        mode: 'full-matrix',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => fixedDate,
        writeFile,
      });
      await r.run({ runs: 10 });
      const jsonPath = path.join(resultsDir, 'load-full-matrix-2026-11-12T05-05-00-000Z.json');
      const jsonArg = writeFile.mock.calls.find((c) => c[0] === jsonPath);
      expect(jsonArg).toBeDefined();
      const json = JSON.parse(jsonArg[1]);
      expect(json.mode).toBe('full-matrix');
      expect(json.summary.runsPerCell).toBe(10);
      // The full matrix uses 10 runs per cell by default.
      for (const desc of sr.calls()) {
        expect(desc.env.LOAD_GATE_RUNS).toBe('10');
      }
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });

  it('runs the matrix one step at a time (sequential, no parallel cell spawns) — cells run in their declared order', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => new Date('2026-11-12T05:06:00.000Z'),
        writeFile,
      });
      await r.run({});
      const cells = r.cells();
      // The step names appear in the same order as the cells.
      const stepNames = sr.calls().map((c) => c.step);
      const expectedNames = cells.map((c) =>
        [c.variant, c.protocol, c.profile, c.compression, c.cacheState, c.session].join('-'),
      );
      expect(stepNames).toEqual(expectedNames);
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });
});

describe('LoadMatrixRunner — --runs precedence (--runs > LOAD_GATE_RUNS env > default)', () => {
  it('resolveRuns: --runs wins over LOAD_GATE_RUNS env and default', () => {
    expect(LoadMatrixRunner.resolveRuns({ cliRuns: 5, envRuns: 10, defaultRuns: 30 })).toBe(5);
  });
  it('resolveRuns: LOAD_GATE_RUNS env wins over default when --runs is absent', () => {
    expect(LoadMatrixRunner.resolveRuns({ cliRuns: undefined, envRuns: 10, defaultRuns: 30 })).toBe(10);
  });
  it('resolveRuns: default wins when both --runs and env are absent', () => {
    expect(LoadMatrixRunner.resolveRuns({ cliRuns: undefined, envRuns: undefined, defaultRuns: 30 })).toBe(30);
  });
  it('resolveRuns: a non-finite or non-positive cliRuns falls through (the parsing produced NaN for a missing arg)', () => {
    expect(LoadMatrixRunner.resolveRuns({ cliRuns: Number.NaN, envRuns: 10, defaultRuns: 30 })).toBe(10);
    expect(LoadMatrixRunner.resolveRuns({ cliRuns: 0, envRuns: 10, defaultRuns: 30 })).toBe(10);
    expect(LoadMatrixRunner.resolveRuns({ cliRuns: -3, envRuns: 10, defaultRuns: 30 })).toBe(10);
  });
  it('resolveRuns: a non-finite envRuns falls through to default', () => {
    expect(LoadMatrixRunner.resolveRuns({ cliRuns: undefined, envRuns: Number.NaN, defaultRuns: 30 })).toBe(30);
  });
  it('run() honours envRuns (LOAD_GATE_RUNS env) when --runs is not passed', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => new Date('2026-11-12T05:07:00.000Z'),
        writeFile,
      });
      await r.run({ envRuns: 7 });
      for (const desc of sr.calls()) {
        expect(desc.env.LOAD_GATE_RUNS).toBe('7');
      }
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });
  it('run() honours runs (CLI --runs) over envRuns', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => new Date('2026-11-12T05:08:00.000Z'),
        writeFile,
      });
      await r.run({ runs: 4, envRuns: 7 });
      for (const desc of sr.calls()) {
        expect(desc.env.LOAD_GATE_RUNS).toBe('4');
      }
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });
});

describe('LoadMatrixRunner — the chunk-grouping option is removed (no grouping env, label or cell variant)', () => {
  it('no step env carries a grouping variable and no step name carries a grouping suffix', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => new Date('2026-11-12T05:09:00.000Z'),
        writeFile,
      });
      await r.run({});
      for (const desc of sr.calls()) {
        expect(Object.keys(desc.env).some((k) => /GROUPING/.test(k))).toBe(false);
        expect(desc.step).not.toMatch(/group\d+/);
      }
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });
});

describe('LoadMatrixRunner — dry-run planned list shows BOTH variants per cell (every gate cell measures new + old)', () => {
  it('run({dryRun: true}) plannedSteps expands every cell with both new and old variants (the planned cell list shows the pair)', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      const fixedDate = new Date('2026-11-12T05:12:00.000Z');
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => fixedDate,
        writeFile,
      });
      const out = await r.run({ dryRun: true });
      // StepRunner never called in a dry-run.
      expect(sr.calls()).toHaveLength(0);
      const cells = r.cells();
      // Every cell is planned as BOTH variants (new + old) — the
      // dry-run planned list shows the pair even before the
      // old-rule worktree is wired.
      expect(out.json.plannedSteps).toHaveLength(cells.length * 2);
      // The planned steps interleave new + old per cell.
      for (let i = 0; i < cells.length; i++) {
        const newP = out.json.plannedSteps[i * 2];
        const oldP = out.json.plannedSteps[i * 2 + 1];
        expect(newP.variant).toBe('new');
        expect(oldP.variant).toBe('old');
        expect(newP.cell.protocol).toBe(cells[i].protocol);
        expect(oldP.cell.protocol).toBe(cells[i].protocol);
        expect(oldP.cell.session).toBe(cells[i].session);
      }
      // The markdown lists the planned steps with a variant column,
      // including the parallel-startup case.
      const mdArg = writeFile.mock.calls.find((c) => c[0] === path.join(resultsDir, 'gate-cells-summary.md'));
      expect(mdArg[1]).toMatch(/Planned steps/);
      expect(mdArg[1]).toMatch(/\| new \|/);
      expect(mdArg[1]).toMatch(/\| old \|/);
      expect(mdArg[1]).toMatch(/shell\+5-parallel-startup/);
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });

  it('run({dryRun: true, runs: 10}) honours --runs — the markdown reports "Runs per cell: 10", not the default 30', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => new Date('2026-11-12T05:14:00.000Z'),
        writeFile,
      });
      const out = await r.run({ dryRun: true, runs: 10 });
      expect(out.json.summary.runsPerCell).toBe(10);
      const mdArg = writeFile.mock.calls.find((c) => c[0] === path.join(resultsDir, 'gate-cells-summary.md'));
      expect(mdArg[1]).toMatch(/Runs per cell: 10/);
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });
});

describe('LoadMatrixRunner — a result with zero executed steps is never "pass" (dry-run writes no result JSON; empty-steps result is fail)', () => {
  it('run({dryRun: true}) writes NO result JSON file at all — only the markdown summary (no pass-shaped file with zero steps)', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => new Date('2026-11-12T05:20:00.000Z'),
        writeFile,
      });
      const out = await r.run({ dryRun: true });
      // No result JSON file is written for a dry-run.
      const jsonPath = path.join(resultsDir, 'load-gate-cells-2026-11-12T05-20-00-000Z.json');
      expect(writeFile.mock.calls.find((c) => c[0] === jsonPath)).toBeUndefined();
      expect(out.jsonPath).toBeNull();
      // The markdown summary is the only write.
      expect(writeFile).toHaveBeenCalledTimes(1);
      const mdArg = writeFile.mock.calls.find((c) => c[0] === path.join(resultsDir, 'gate-cells-summary.md'));
      expect(mdArg).toBeDefined();
      // The in-memory status is "dry-run" (never "pass").
      expect(out.status).toBe('dry-run');
      expect(out.json.status).toBe('dry-run');
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });

  it('run() with no cells to execute (zero executed steps) writes a result JSON with status="fail" and reason="no steps executed" — never "pass"', async () => {
    const resultsDir = makeTmpResultsDir();
    try {
      const sr = fakeStepRunner();
      const writeFile = vi.fn();
      // A runner with no cells: zero steps execute.
      const r = new LoadMatrixRunner({
        mode: 'gate-cells',
        stepRunner: sr,
        resultsDir,
        repoRoot: '/repo',
        now: () => new Date('2026-11-12T05:21:00.000Z'),
        writeFile,
      });
      r.cells = () => [];
      const out = await r.run({});
      // No step was executed — the StepRunner was never called.
      expect(sr.calls()).toHaveLength(0);
      // A result JSON IS written (this is a real run, not a dry-run),
      // but it can never be "pass" with zero executed steps.
      const jsonPath = path.join(resultsDir, 'load-gate-cells-2026-11-12T05-21-00-000Z.json');
      const jsonArg = writeFile.mock.calls.find((c) => c[0] === jsonPath);
      expect(jsonArg).toBeDefined();
      const json = JSON.parse(jsonArg[1]);
      expect(json.status).toBe('fail');
      expect(json.reason).toBe('no steps executed');
      expect(json.steps).toEqual([]);
      expect(json.summary.total).toBe(0);
      expect(json.summary.passed).toBe(0);
      expect(json.summary.failed).toBe(0);
      expect(out.status).toBe('fail');
      expect(out.jsonPath).toBe(jsonPath);
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });
});

describe('LoadMatrixRunner — HTTP/1.1 boot verdicts', () => {
  const run = async (medianBoots) => {
    const dir = makeTmpResultsDir();
    const sr = fakeStepRunner();
    const readFile = (file) => {
      const name = path.basename(file).replace('-measurements.json', '');
      const ms = medianBoots[name];
      if (ms === undefined) throw new Error('missing');
      return JSON.stringify({ medianBoot: ms });
    };
    const r = new LoadMatrixRunner({ mode: 'gate-cells', stepRunner: sr, resultsDir: dir, readFile });
    const out = await r.run({ runs: 1 });
    rmSync(dir, { recursive: true, force: true });
    return out;
  };

  it('judges the HTTP/1.1 office-LAN and Fast 4G boot cells against the stored baseline and passes within the noise margin', async () => {
    const { json, status } = await run({
      'new-http1-office-lan-none-cold-shell+1': 160,
      'new-http1-fast-4g-none-cold-shell+1': 9200,
    });
    expect(json.http1BootVerdicts.map((v) => [v.step, v.pass])).toEqual([
      ['new-http1-office-lan-none-cold-shell+1', true],
      ['new-http1-fast-4g-none-cold-shell+1', true],
    ]);
    // No old-rule variant was measured, so the run is not a pass.
    expect(status).toBe('incomplete');
  });

  it('fails the run when an HTTP/1.1 boot cell regressed beyond the noise margin, or has no measurement', async () => {
    const regressed = await run({
      'new-http1-office-lan-none-cold-shell+1': 400,
      'new-http1-fast-4g-none-cold-shell+1': 9200,
    });
    expect(regressed.status).toBe('fail');
    expect(regressed.json.http1BootVerdicts[0].finding).toMatch(/regressed from the baseline/);
    const missing = await run({ 'new-http1-office-lan-none-cold-shell+1': 160 });
    expect(missing.status).toBe('fail');
    expect(missing.json.http1BootVerdicts[1].finding).toMatch(/no readable measurement/);
  });
});


describe('LoadMatrixRunner - guards against the old rule', () => {
  const H2 = (variant, session) => `${variant}-h2-fast-4g-gzip-cold-${session}`;
  const run = async (measurements) => {
    const dir = makeTmpResultsDir();
    const readFile = (file) => {
      const name = path.basename(file).replace('-measurements.json', '');
      const m = measurements[name];
      if (m === undefined) throw new Error('missing');
      return JSON.stringify(m);
    };
    const r = new LoadMatrixRunner({ mode: 'gate-cells', stepRunner: fakeStepRunner(), resultsDir: dir, readFile });
    const out = await r.run({ runs: 1, oldServeRoot: '/old/worktree' });
    rmSync(dir, { recursive: true, force: true });
    return out;
  };
  const http1 = {
    'new-http1-office-lan-none-cold-shell+1': { medianBoot: 160 },
    'new-http1-fast-4g-none-cold-shell+1': { medianBoot: 9200 },
  };
  const h2Cells = (newBoot, newLoads) => {
    const cells = {};
    for (const session of ['shell+1', 'shell+5-sequential', 'shell+5-parallel-startup']) {
      cells[H2('old', session)] = { medianBoot: 1000, sessionMedians: [500, 500] };
      cells[H2('new', session)] = { medianBoot: newBoot, sessionMedians: newLoads };
    }
    return cells;
  };

  it('passes when the boot is within 1.25x and the session within 1.15x of the old rule', async () => {
    // Old session = 1000 + 1000 = 2000; new session = 1200 + 1000 = 2200 (1.10x), boot 1.20x.
    const { json, status } = await run({ ...http1, ...h2Cells(1200, [500, 500]) });
    expect(json.referenceGuardVerdicts).toHaveLength(6);
    expect(json.referenceGuardVerdicts.every((v) => v.pass)).toBe(true);
    expect(status).toBe('pass');
  });

  it('fails the run on a session breach beyond 1.15x even when the boot is within 1.25x', async () => {
    // New session = 1200 + 1300 = 2500 (1.25x), boot 1.20x.
    const { json, status } = await run({ ...http1, ...h2Cells(1200, [650, 650]) });
    const failed = json.referenceGuardVerdicts.filter((v) => !v.pass);
    expect(failed.map((v) => v.guard)).toEqual(['session shell+1', 'session shell+5-sequential', 'session shell+5-parallel-startup']);
    expect(status).toBe('fail');
  });

  it('fails the run on a boot breach beyond 1.25x', async () => {
    const { json, status } = await run({ ...http1, ...h2Cells(1300, [300, 300]) });
    expect(json.referenceGuardVerdicts.filter((v) => !v.pass).map((v) => v.guard)).toEqual([
      'shell boot',
      'shell boot',
      'shell boot',
    ]);
    expect(status).toBe('fail');
  });

  it('fails the run when a cell has no readable old-rule measurement', async () => {
    const measurements = { ...http1, ...h2Cells(1000, [500, 500]) };
    delete measurements[H2('old', 'shell+1')];
    const { json, status } = await run(measurements);
    expect(json.referenceGuardVerdicts.find((v) => !v.pass).finding).toMatch(/no readable measurement for old-h2/);
    expect(status).toBe('fail');
  });
});
