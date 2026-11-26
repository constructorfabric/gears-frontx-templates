// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import fs from 'node:fs';
import path from 'node:path';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import {
  SHELL_ITEM,
  ownChunksItem,
  evaluate,
  measurePage,
  fixtureEvaluationNew,
  fixtureEvaluationOld,
  measureOwnChunks,
  normalizeBaseline,
  runCli,
  captureOldRuleBaseline,
} from './size-metric-check.mjs';

/** @type {string | undefined} */
let rootDir;

afterEach(async () => {
  if (rootDir) await rm(rootDir, { recursive: true, force: true });
  rootDir = undefined;
});

async function makeRoot() {
  rootDir = await mkdtemp(path.join(tmpdir(), 'frontx-sizemetric-'));
  return rootDir;
}

async function write(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

/** @param {string} root @param {string[]} [argv] */
function run(root, argv = []) {
  /** @type {string[]} */
  const lines = [];
  const capture = (/** @type {string} */ line) => {
    lines.push(line);
  };
  const exitCode = runCli({ rootDir: root, argv, log: capture, logError: capture });
  return { exitCode, output: lines.join('\n') };
}

const REACT_UNIT = 'export const react = 1; // identical unit bytes everywhere\n';
const FW_UNIT = 'export const fw = 2;\n';
const FW_EXTRA_UNIT = 'export const fwExtra = 3;\n';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const REACT_LOC = `react@19.0.0/index.${sha(REACT_UNIT).slice(0, 12)}.js`;
const FW_LOC = `fw@1.0.0/index.${sha(FW_UNIT).slice(0, 12)}.js`;
const FW_EXTRA_LOC = `fw@1.0.0/extra.${sha(FW_EXTRA_UNIT).slice(0, 12)}.js`;

const item = (location, bytes) => ({
  location,
  contentHash: sha(bytes),
  answers: [],
  imports: [],
});

// The one entry list the fixture's lifecycle entry names: it lists react's
// unit and fw's index unit — fw's extra unit is emitted but NOT on the
// list, so the new rule never fetches it.
const ENTRY_UNITS = [item(REACT_LOC, REACT_UNIT), item(FW_LOC, FW_UNIT)];

/**
 * One fixture dist: a manifest holding the unit table and the entry list,
 * own chunks, and a shared dir holding the two listed units and the
 * unlisted fw extra unit (which only the old rule counts).
 * `shared` entries with `chunkPath` keep the old-rule attribution leg.
 */
async function writeFixtureDist(dir, { own = 'own-chunk-code', extraUnit = true } = {}) {
  const manifest = {
    id: path.basename(dir),
    metaData: { sharedBase: './shared/' },
    shared: [
      { name: 'react', version: '19.0.0', chunkPath: REACT_LOC },
      { name: 'fw', version: '1.0.0', chunkPath: FW_LOC },
    ],
    units: ENTRY_UNITS,
    lists: { './lifecycle': { units: ENTRY_UNITS.map((unit) => unit.contentHash), ownChunks: [] } },
  };
  await write(path.join(dir, 'mfe-manifest.json'), JSON.stringify({ manifest }));
  await write(path.join(dir, 'assets', 'remoteEntry.js'), own);
  await write(path.join(dir, 'shared', REACT_LOC), REACT_UNIT);
  await write(path.join(dir, 'shared', FW_LOC), FW_UNIT);
  if (extraUnit) await write(path.join(dir, 'shared', FW_EXTRA_LOC), FW_EXTRA_UNIT);
}

/**
 * One shell dist: a boot chunk embedding the inline boot data
 * (`.run({unitsBase, units, list})`) plus the shared chunk the boot
 * list names.
 */
async function writeShellDist(dir, { unit = REACT_UNIT, unitsBase = './shared/' } = {}) {
  const boot = `x.run(${JSON.stringify({
    unitsBase,
    units: [item(REACT_LOC, REACT_UNIT)],
    list: { units: [sha(REACT_UNIT)], ownChunks: [] },
  })});`;
  await write(path.join(dir, 'assets', 'frontx-shell-boot-AAA.js'), boot);
  await write(path.join(dir, 'assets', 'index-BBB.js'), 'shell app chunk');
  await write(path.join(dir, 'shared', REACT_LOC), unit);
  return boot;
}

/** Bytes of a fixture dist's manifest file. */
const manifestSize = (dist) =>
  Buffer.byteLength(JSON.stringify(JSON.parse(fs.readFileSync(path.join(dist, 'mfe-manifest.json'), 'utf-8')).manifest));

describe('measureOwnChunks', () => {
  it('counts js/css outside the shared dir only', async () => {
    const root = await makeRoot();
    const dist = path.join(root, 'dist');
    await writeFixtureDist(dist);
    expect(measureOwnChunks(dist, 'shared')).toBe(Buffer.byteLength('own-chunk-code'));
  });
});

describe('fixtureEvaluation', () => {
  it('new rule counts own chunks + the listed units only', async () => {
    const root = await makeRoot();
    const dist = path.join(root, 'dist');
    await writeFixtureDist(dist);
    const m = fixtureEvaluationNew(dist);
    // listed: fw index + react index. fw extra NOT listed.
    expect(m.sharedBytes).toBe(Buffer.byteLength(REACT_UNIT) + Buffer.byteLength(FW_UNIT));
    // The manifest, which holds the unit table and the lists, is download bytes.
    expect(m.manifestBytes).toBe(manifestSize(dist));
    expect(m.manifestBytes).toBeGreaterThan(0);
    expect(m.totalBytes).toBe(m.ownChunkBytes + m.manifestBytes + m.sharedBytes);
    expect(m.packages.get('react')).toBe(Buffer.byteLength(REACT_UNIT));
    expect(m.packages.get('fw')).toBe(Buffer.byteLength(FW_UNIT));
  });

  it('old rule counts own chunks + every shared file', async () => {
    const root = await makeRoot();
    const dist = path.join(root, 'dist');
    await writeFixtureDist(dist);
    const m = fixtureEvaluationOld(dist);
    const sharedAll =
      Buffer.byteLength(REACT_UNIT) +
      Buffer.byteLength(FW_UNIT) +
      Buffer.byteLength(FW_EXTRA_UNIT);
    expect(m.sharedBytes).toBe(sharedAll);
    expect(m.packages.get('react')).toBe(Buffer.byteLength(REACT_UNIT));
  });
});

describe('measurePage', () => {
  it('dedups identical unit bytes across shell and fixtures by content identity', async () => {
    const root = await makeRoot();
    const shell = path.join(root, 'shell-dist');
    const f1 = path.join(root, 'f1');
    const f2 = path.join(root, 'f2');
    const boot = await writeShellDist(shell);
    await writeFixtureDist(f1, { own: 'own-f1' });
    await writeFixtureDist(f2, { own: 'own-f2' });
    const page = measurePage({
      shellDist: shell,
      fixtures: [
        { name: 'f1', distDir: f1 },
        { name: 'f2', distDir: f2 },
      ],
      rule: 'new',
    });
    // The react unit is byte-identical across shell and both fixtures:
    // counted once. fw's unlisted extra unit is not in the new-rule set.
    const expected =
      Buffer.byteLength(boot) +
      Buffer.byteLength('shell app chunk') +
      Buffer.byteLength(REACT_UNIT) +
      Buffer.byteLength(FW_UNIT) +
      Buffer.byteLength('own-f1') +
      Buffer.byteLength('own-f2') +
      manifestSize(f1) +
      manifestSize(f2);
    expect(page.totalUniqueBytes).toBe(expected);
    expect(page.items.get('react')).toBe(Buffer.byteLength(REACT_UNIT));
    expect(page.items.get('fw')).toBe(Buffer.byteLength(FW_UNIT));
    expect(page.items.get(SHELL_ITEM)).toBe(Buffer.byteLength(boot) + Buffer.byteLength('shell app chunk'));
    expect(page.items.get(ownChunksItem('f1'))).toBe(Buffer.byteLength('own-f1') + manifestSize(f1));
    expect(page.items.get(ownChunksItem('f2'))).toBe(Buffer.byteLength('own-f2') + manifestSize(f2));
  });
});

const BASELINE = (over = {}) => ({
  page: { totalUniqueBytes: 1000, items: { react: 400, fw: 300, [SHELL_ITEM]: 200, 'f1 (own chunks)': 100 } },
  fixtures: {
    f1: { evalBytes: 900, ownChunkBytes: 100, sharedBytes: 800, packages: { react: 400, fw: 400 } },
  },
  ...over,
});

describe('measurePage unitsBase shapes', () => {
  for (const unitsBase of ['./shared/', '/shared/', '/app/shared/', 'https://cdn.example/x/shared/']) {
    it(`finds the units directory for unitsBase ${unitsBase}`, async () => {
      const root = await makeRoot();
      const shell = path.join(root, 'shell-dist');
      const boot = await writeShellDist(shell, { unitsBase });
      const page = measurePage({ shellDist: shell, fixtures: [], rule: 'new' });
      expect(page.items.get(SHELL_ITEM)).toBe(Buffer.byteLength(boot) + Buffer.byteLength('shell app chunk'));
      expect(page.items.get('react')).toBe(Buffer.byteLength(REACT_UNIT));
    });
  }
});

describe('normalizeBaseline', () => {
  it('requires page + fixtures and a consistent page total', () => {
    expect(() => normalizeBaseline({})).toThrow(/page/);
    expect(() => normalizeBaseline({ page: { totalUniqueBytes: 5, items: { a: 3 } }, fixtures: {} })).toThrow(/add up/);
    const ok = normalizeBaseline(BASELINE());
    expect(ok.page.totalUniqueBytes).toBe(1000);
    expect(ok.fixtures.get('f1').evalBytes).toBe(900);
  });
});

describe('evaluate', () => {
  const cur = (total, items) => ({ totalUniqueBytes: total, items: new Map(Object.entries(items)) });

  it('passes on shrink or equal download bytes', () => {
    const { failures } = evaluate({
      baseline: normalizeBaseline(BASELINE()),
      exceptions: {},
      page: cur(900, { react: 400, fw: 300, [SHELL_ITEM]: 100, 'f1 (own chunks)': 100 }),
      fixtures: new Map([['f1', { evalBytes: 800 }]]),
    });
    expect(failures).toEqual([]);
  });

  it('fails download growth when no exception names the grown item', () => {
    const { failures } = evaluate({
      baseline: normalizeBaseline(BASELINE()),
      exceptions: {},
      page: cur(1100, { react: 500, fw: 300, [SHELL_ITEM]: 200, 'f1 (own chunks)': 100 }),
      fixtures: new Map([['f1', { evalBytes: 800 }]]),
    });
    expect(failures.join('\n')).toMatch(/react.*400.*500|react \(400 -> 500\)/);
  });

  it('passes growth when every grown item carries a reason', () => {
    const { failures, rows } = evaluate({
      baseline: normalizeBaseline(BASELINE()),
      exceptions: { react: 'bigger jsx runtime' },
      page: cur(1100, { react: 500, fw: 300, [SHELL_ITEM]: 200, 'f1 (own chunks)': 100 }),
      fixtures: new Map([['f1', { evalBytes: 800 }]]),
    });
    expect(failures).toEqual([]);
    expect(rows.page.status).toMatch(/exempted/);
  });

  it('reports evaluation per extension with no pass/fail', () => {
    const { rows } = evaluate({
      baseline: normalizeBaseline(BASELINE()),
      exceptions: {},
      page: cur(900, { react: 400, fw: 300, [SHELL_ITEM]: 100, 'f1 (own chunks)': 100 }),
      fixtures: new Map([['f1', { evalBytes: 600 }]]),
    });
    expect(rows.fixtures[0]).toMatchObject({ name: 'f1', baseline: 900, current: 600 });
  });

  it('fails closed when a baselined fixture was not measured', () => {
    const { failures } = evaluate({
      baseline: normalizeBaseline(BASELINE()),
      exceptions: {},
      page: cur(900, { react: 400, fw: 300, [SHELL_ITEM]: 200 }),
      fixtures: new Map(),
      errors: new Map([['f1', 'no build output']]),
    });
    expect(failures.join('\n')).toMatch(/f1.*not measured/);
  });
});

describe('runCli', () => {
  it('captures the old-rule baseline shape (page incl. shell + per-fixture evaluation)', async () => {
    const root = await makeRoot();
    const mfeBase = path.join(root, 'template-mfe', 'src-app', 'mfe_packages');
    await write(path.join(mfeBase, 'f1', 'mfe.json'), '{}');
    await writeFixtureDist(path.join(mfeBase, 'f1', 'dist'));
    await writeShellDist(path.join(root, 'template-shell', 'dist'));
    const captured = captureOldRuleBaseline(root, { shellDistRel: path.join('template-shell', 'dist') });
    expect(captured.page.totalUniqueBytes).toBeGreaterThan(0);
    expect(captured.page.items[SHELL_ITEM]).toBeGreaterThan(0);
    expect(captured.page.items.react).toBeGreaterThan(0);
    expect(captured.fixtures.f1.evalBytes).toBeGreaterThan(0);
    // normalize round-trips the capture.
    expect(() => normalizeBaseline(captured)).not.toThrow();
  });

  it('runs the gate: PASS within baseline, FAIL on uncovered growth', async () => {
    const root = await makeRoot();
    const mfeBase = path.join(root, 'template-mfe', 'src-app', 'mfe_packages');
    await write(path.join(mfeBase, 'f1', 'mfe.json'), '{}');
    await writeFixtureDist(path.join(mfeBase, 'f1', 'dist'));
    const shellDist = path.join(root, 'template-shell', 'dist');
    await writeShellDist(shellDist);
    const captured = captureOldRuleBaseline(root, { shellDistRel: path.join('template-shell', 'dist') });
    // Write baseline slightly larger than the new-rule measure so it passes.
    const baseline = JSON.parse(JSON.stringify(captured));
    await write(path.join(root, 'template-mfe', 'size-baseline.json'), JSON.stringify(baseline));
    // The old-rule baseline holds no manifest bytes; the new rule counts them in the fixture's own item.
    await write(
      path.join(root, 'template-mfe', 'size-gate-exceptions.json'),
      JSON.stringify({ 'f1 (own chunks)': 'the manifest holds the unit table and the lists' }),
    );

    const pass = run(root, []);
    expect(pass.output).not.toMatch(/FAIL/);
    expect(pass.output).toMatch(/\[size-metric\]/);
    // The new-rule page can only be <= the old-rule baseline here (same files,
    // narrower reach); exceptions empty.
    expect(pass.exitCode).toBe(0);
    expect(pass.output).toMatch(/PASS/);
    expect(pass.output).toMatch(/eval f1/i);

    // Now shrink the baseline page total to force growth: set an item low.
    baseline.page.items.react = 1;
    baseline.page.totalUniqueBytes = Object.values(baseline.page.items).reduce((a, b) => a + b, 0);
    await write(path.join(root, 'template-mfe', 'size-baseline.json'), JSON.stringify(baseline));
    // The manifest growth stays exempted, so only the react growth is uncovered.
    const fail = run(root, []);
    expect(fail.exitCode).toBe(1);
    expect(fail.output).toMatch(/FAIL/);
    expect(fail.output).toMatch(/react/);

    // Exception covering the grown item passes again.
    await write(path.join(root, 'template-mfe', 'size-gate-exceptions.json'), JSON.stringify({ react: 'test growth', 'f1 (own chunks)': 'the manifest holds the unit table and the lists' }));
    const exempted = run(root, []);
    expect(exempted.exitCode).toBe(0);
    expect(exempted.output).toMatch(/exempted/i);
  });
});
