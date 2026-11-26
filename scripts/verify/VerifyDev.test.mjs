import path from 'node:path';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { VerifyDev } from './VerifyDev.mjs';

/** @type {string | undefined} */
let rootDir;

afterEach(() => {
  if (rootDir) rmSync(rootDir, { recursive: true, force: true });
  rootDir = undefined;
});

function makeRoot() {
  rootDir = mkdtempSync(path.join(tmpdir(), 'verify-dev-'));
  return rootDir;
}

function fakeStepRunner(logDir, failSteps = []) {
  return {
    async run(desc) {
      const exitCode = failSteps.includes(desc.step) ? 1 : 0;
      return {
        step: desc.step,
        command: desc.command.join(' '),
        exitCode,
        durationMs: 10,
        log: path.join(logDir, `${desc.step}.log`),
      };
    },
  };
}

describe('VerifyDev', () => {
  it('produces {status, steps, summary} JSON and status=fail when any step failed', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'e2e', 'results', 'logs');
    const stepRunner = fakeStepRunner(logDir, ['build-shell']);
    const fixtureDiscovery = { discover: () => [path.join(root, 'template-mfe/src-app/mfe_packages/foo')] };
    const bootCheck = { run: async () => ({ ok: true, rootChildCount: 2, pageErrors: [], consoleErrors: [] }) };
    const runBrowserSpec = async (spec, runIdx) => ({
      step: `browser-${spec}-${runIdx}`,
      command: `npx playwright test e2e/${spec}.spec.ts`,
      exitCode: 0,
      durationMs: 50,
      log: path.join(logDir, `browser-${spec}-${runIdx}.log`),
    });
    const vd = new VerifyDev({ root, logDir, stepRunner, fixtureDiscovery, bootCheck, runBrowserSpec, runs: 2, specs: ['smoke'] });
    const { json, status } = await vd.run();
    expect(status).toBe('fail');
    expect(json.status).toBe('fail');
    expect(Array.isArray(json.steps)).toBe(true);
    expect(json.steps.length).toBeGreaterThan(0);
    for (const s of json.steps) {
      expect(Object.keys(s).sort()).toEqual(['command', 'durationMs', 'exitCode', 'log', 'step']);
    }
    expect(json.summary.total).toBe(json.steps.length);
    expect(json.summary.failed).toBe(1);
    expect(json.summary.passed).toBe(json.steps.length - 1);
  });

  it('status=pass when every step succeeded', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'e2e', 'results', 'logs');
    const stepRunner = fakeStepRunner(logDir);
    const fixtureDiscovery = { discover: () => [] };
    const bootCheck = { run: async () => ({ ok: true, rootChildCount: 1, pageErrors: [], consoleErrors: [] }) };
    const runBrowserSpec = async (spec, runIdx) => ({
      step: `browser-${spec}-${runIdx}`,
      command: `npx playwright test e2e/${spec}.spec.ts`,
      exitCode: 0,
      durationMs: 5,
      log: path.join(logDir, `browser-${spec}-${runIdx}.log`),
    });
    const vd = new VerifyDev({ root, logDir, stepRunner, fixtureDiscovery, bootCheck, runBrowserSpec, runs: 1, specs: ['smoke'] });
    const { json, status } = await vd.run();
    expect(status).toBe('pass');
    expect(json.summary.failed).toBe(0);
  });

  it('writes the JSON to <logDir>/verify-dev-<ISO>.json', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'e2e', 'results', 'logs');
    const stepRunner = fakeStepRunner(logDir);
    const vd = new VerifyDev({
      root,
      logDir,
      stepRunner,
      fixtureDiscovery: { discover: () => [] },
      bootCheck: null,
      runBrowserSpec: null,
      runs: 0,
      specs: [],
      skipBuild: true,
      clean: false,
      now: () => new Date('2026-11-11T10:00:00.000Z'),
    });
    const { jsonPath } = await vd.run();
    expect(jsonPath).toMatch(/verify-dev-.*\.json$/);
    expect(existsSync(jsonPath)).toBe(true);
    const written = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    // An empty plan (skip-build, no specs, no boot check) executes
    // zero steps — that is "fail" with reason "no steps executed",
    // never a silent "pass".
    expect(written.status).toBe('fail');
    expect(written.reason).toBe('no steps executed');
    expect(written.steps).toEqual([]);
  });

  it('plans cache-clear, build shell, per-fixture build, generate manifests, layout, boot check, browser specs', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'e2e', 'results', 'logs');
    const stepRunner = fakeStepRunner(logDir);
    const fixtureDiscovery = { discover: () => [path.join(root, 'template-mfe/src-app/mfe_packages/foo')] };
    const bootCheck = { run: async () => ({ ok: true, rootChildCount: 1, pageErrors: [], consoleErrors: [] }) };
    const runBrowserSpec = async (spec, runIdx) => ({
      step: `browser-${spec}-${runIdx}`,
      command: `npx playwright test e2e/${spec}.spec.ts`,
      exitCode: 0,
      durationMs: 5,
      log: path.join(logDir, `browser-${spec}-${runIdx}.log`),
    });
    const vd = new VerifyDev({
      root, logDir, stepRunner, fixtureDiscovery, bootCheck, runBrowserSpec,
      runs: 2, specs: ['smoke', 'round-count'], clean: true,
    });
    const { json } = await vd.run();
    const stepNames = json.steps.map((s) => s.step);
    expect(stepNames).toContain('cache-clear');
    expect(stepNames).toContain('build-shell');
    expect(stepNames).toContain('build-mfe-foo');
    expect(stepNames).toContain('generate-mfe-manifests');
    expect(stepNames).toContain('layout-dist');
    expect(stepNames).toContain('boot-check');
    expect(stepNames).toContain('browser-smoke-0');
    expect(stepNames).toContain('browser-round-count-1');
    expect(json.summary.total).toBe(json.steps.length);
  });

  it('a failed boot-check step makes the run fail', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'e2e', 'results', 'logs');
    const stepRunner = fakeStepRunner(logDir);
    const bootCheck = { run: async () => ({ ok: false, rootChildCount: 0, pageErrors: ['err'], consoleErrors: [] }) };
    const vd = new VerifyDev({
      root, logDir, stepRunner,
      fixtureDiscovery: { discover: () => [] },
      bootCheck, runBrowserSpec: null, runs: 0, specs: [],
      skipBuild: true,
    });
    const { status, json } = await vd.run();
    expect(status).toBe('fail');
    const bootStep = json.steps.find((s) => s.step === 'boot-check');
    expect(bootStep.exitCode).toBe(1);
  });

  it('a failed step is never retried (planned exactly once)', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'e2e', 'results', 'logs');
    let spawnCalls = 0;
    const stepRunner = {
      async run(desc) {
        spawnCalls++;
        return { step: desc.step, command: desc.command.join(' '), exitCode: 1, durationMs: 1, log: path.join(logDir, `${desc.step}.log`) };
      },
    };
    const vd = new VerifyDev({
      root, logDir, stepRunner,
      fixtureDiscovery: { discover: () => [] },
      bootCheck: null, runBrowserSpec: null, runs: 0, specs: [],
      skipBuild: false, clean: false,
    });
    const { json } = await vd.run();
    const perStep = new Map();
    for (const s of json.steps) perStep.set(s.step, (perStep.get(s.step) ?? 0) + 1);
    for (const [, count] of perStep) expect(count).toBe(1);
    expect(spawnCalls).toBe(json.steps.length);
    expect(json.status).toBe('fail');
  });

  it('a run that executes zero steps (empty plan) is "fail" with reason "no steps executed" — never "pass"', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'e2e', 'results', 'logs');
    const stepRunner = fakeStepRunner(logDir);
    // skip-build + no boot check + no browser specs + no clean → empty plan.
    const vd = new VerifyDev({
      root,
      logDir,
      stepRunner,
      fixtureDiscovery: { discover: () => [] },
      bootCheck: null,
      runBrowserSpec: null,
      runs: 0,
      specs: [],
      skipBuild: true,
      clean: false,
      now: () => new Date('2026-11-11T11:00:00.000Z'),
    });
    const { json, status } = await vd.run();
    expect(status).toBe('fail');
    expect(json.status).toBe('fail');
    expect(json.reason).toBe('no steps executed');
    expect(json.steps).toEqual([]);
    expect(json.summary.total).toBe(0);
    expect(json.summary.passed).toBe(0);
    expect(json.summary.failed).toBe(0);
  });
});
