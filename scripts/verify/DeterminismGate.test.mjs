import path from 'node:path';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  symlinkSync,
  lstatSync,
  chmodSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DeterminismGate,
  hashFile,
  UNREADABLE_PREFIX,
  coldCacheProblems,
  targetsWithoutFiles,
  diffHashes,
  hashTree,
  comparisonsForTier,
  buildTargets,
  copyCheckout,
  installLinkedPackages,
  setupSteps,
  snapshotOutputs,
} from './DeterminismGate.mjs';

/**
 * The two-tier determinism gate: builds, hashes the build outputs and
 * compares them per comparison, selects the tier, and writes the JSON
 * result.
 */

/** @type {string | undefined} */
let rootDir;

afterEach(() => {
  if (rootDir) rmSync(rootDir, { recursive: true, force: true });
  rootDir = undefined;
});

function makeRoot() {
  rootDir = mkdtempSync(path.join(tmpdir(), 'determinism-gate-'));
  return rootDir;
}

/**
 * A fake StepRunner that records every step descriptor and returns a
 * result shaped exactly like the real StepRunner ({step, command,
 * exitCode, durationMs, log}). `exitCodes` lets a test simulate
 * failures/timeouts.
 */
function fakeStepRunner({ exitCodes = {} } = {}) {
  /** @type {any[]} */
  const recorded = [];
  const run = async (desc) => {
    recorded.push(desc);
    const exitCode = exitCodes[desc.step] ?? 0;
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

describe('DeterminismGate — hash comparison', () => {
  it('hashFile returns a SHA-256 hex digest of a file', () => {
    const root = makeRoot();
    const file = path.join(root, 'a.js');
    writeFileSync(file, 'export const x = 1;\n');
    const h = hashFile(file);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashFile marks a file that cannot be read instead of returning an empty hash', () => {
    expect(hashFile(path.join(tmpdir(), 'definitely-not-a-file-xyz.js'))).toBe(`${UNREADABLE_PREFIX}ENOENT`);
  });

  it('hashTree marks an unreadable entry and diffHashes reports it even when both sides carry it', () => {
    const root = makeRoot();
    mkdirSync(path.join(root, 'd'));
    symlinkSync('missing-target', path.join(root, 'd', 'dangling.js'));
    const a = hashTree(path.join(root, 'd'));
    const b = hashTree(path.join(root, 'd'));
    expect(a.get('dangling.js')).toMatch(/^unreadable:/);
    expect(diffHashes(a, b)).toEqual([
      { file: 'dangling.js', kind: 'unreadable', aHash: a.get('dangling.js'), bHash: b.get('dangling.js') },
    ]);
  });

  it('hashTree marks a directory it cannot list', () => {
    const root = makeRoot();
    const dir = path.join(root, 'd');
    mkdirSync(path.join(dir, 'sub'), { recursive: true });
    chmodSync(path.join(dir, 'sub'), 0o000);
    try {
      const tree = hashTree(dir);
      if (process.getuid?.() !== 0) expect(tree.get('sub')).toMatch(/^unreadable:/);
    } finally {
      chmodSync(path.join(dir, 'sub'), 0o755);
    }
  });

  it('hashTree hashes every file under dir keyed by relative path', () => {
    const root = makeRoot();
    mkdirSync(path.join(root, 'a'));
    writeFileSync(path.join(root, 'a', 'x.js'), 'a');
    writeFileSync(path.join(root, 'a', 'y.js'), 'b');
    const tree = hashTree(path.join(root, 'a'));
    expect([...tree.keys()].sort()).toEqual(['x.js', 'y.js']);
    expect(tree.get('x.js')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashTree returns an empty map for a missing dir', () => {
    expect(hashTree(path.join(makeRoot(), 'missing'))).toBeInstanceOf(Map);
    expect(hashTree(path.join(makeRoot(), 'missing')).size).toBe(0);
  });

  it('diffHashes returns nothing when the two maps agree', () => {
    const a = new Map([['a.js', 'h1'], ['b.js', 'h2']]);
    const b = new Map([['a.js', 'h1'], ['b.js', 'h2']]);
    expect(diffHashes(a, b)).toEqual([]);
  });

  it('diffHashes reports a hash-mismatch naming the file and both hashes', () => {
    const diff = diffHashes(new Map([['a.js', 'h1']]), new Map([['a.js', 'hX']]));
    expect(diff).toEqual([{ file: 'a.js', kind: 'hash-mismatch', aHash: 'h1', bHash: 'hX' }]);
  });

  it('diffHashes reports a file missing in b', () => {
    const a = new Map([['a.js', 'h1'], ['b.js', 'h2']]);
    const b = new Map([['a.js', 'h1']]);
    expect(diffHashes(a, b)).toEqual([{ file: 'b.js', kind: 'missing-in-b', aHash: 'h2' }]);
  });

  it('diffHashes reports a file missing in a', () => {
    const a = new Map([['a.js', 'h1']]);
    const b = new Map([['a.js', 'h1'], ['b.js', 'h2']]);
    expect(diffHashes(a, b)).toEqual([{ file: 'b.js', kind: 'missing-in-a' }]);
  });

  it('diffHashes lists every difference in path order', () => {
    const a = new Map([['a.js', 'h1'], ['b.js', 'h2'], ['c.js', 'h3']]);
    const b = new Map([['a.js', 'hX'], ['c.js', 'h3'], ['d.js', 'h4']]);
    expect(diffHashes(a, b).map((d) => [d.file, d.kind])).toEqual([
      ['a.js', 'hash-mismatch'],
      ['b.js', 'missing-in-b'],
      ['d.js', 'missing-in-a'],
    ]);
  });
});

describe('DeterminismGate — tier selection', () => {
  it('comparisonsForTier fix = cold-vs-warm and serial-vs-parallel only', () => {
    expect(comparisonsForTier('fix')).toEqual(['cold-vs-warm', 'serial-vs-parallel']);
  });

  it('comparisonsForTier full = all four comparisons', () => {
    expect(comparisonsForTier('full')).toEqual([
      'cold-vs-warm',
      'serial-vs-parallel',
      'two-checkouts',
      'install-vs-link',
    ]);
  });

  it('the constructor rejects an unknown tier', () => {
    expect(() => gate({ tier: 'bogus' })).toThrow(/unknown tier/);
  });

  it('the constructor rejects a missing stepRunner (the gate requires bounded steps)', () => {
    expect(() => gate({ stepRunner: undefined })).toThrow(/stepRunner is required/);
  });

  it('the fix tier builds the shell and the first MFE; the full tier every MFE', () => {
    expect(gate({ tier: 'fix' }).targets().map((t) => t.name)).toEqual(['shell', '_blank-mfe']);
    expect(gate({ tier: 'full' }).targets().map((t) => t.name)).toEqual(['shell', '_blank-mfe', 'demo-mfe']);
  });
});

/**
 * A gate wired with fakes: a step runner that records steps, a snapshot
 * that returns `snapshots[call]` (or a fixed tree), and spies for the
 * cache clear and the checkout copy.
 */
const FULL_TREE = () =>
  new Map([
    ['template-shell/dist/index.html', 'h1'],
    ['template-mfe/src-app/mfe_packages/_blank-mfe/dist/index.html', 'h2'],
    ['template-mfe/src-app/mfe_packages/demo-mfe/dist/index.html', 'h3'],
  ]);

function gate(overrides = {}) {
  return new DeterminismGate({
    tier: 'fix',
    stepRunner: fakeStepRunner(),
    repoRoot: '/repo',
    mfes: ['_blank-mfe', 'demo-mfe'],
    clearCache: async () => {},
    setupSteps: () => [{ step: 'determinism-setup', command: ['npm', 'run', 'build:packages'], cwd: '/repo/template-shell' }],
    snapshot: () => FULL_TREE(),
    cacheProblems: () => [],
    copyCheckout: () => '/copy',
    installLinkedPackages: () => [],
    removeCheckout: () => {},
    log: () => {},
    ...overrides,
  });
}

describe('DeterminismGate — run() builds and compares hashes', () => {
  it('fix tier: one cold serial reference build, a warm build and a cold parallel build, each target its own step', async () => {
    const sr = fakeStepRunner();
    const cleared = [];
    const out = await gate({ stepRunner: sr, clearCache: async (root) => cleared.push(root) }).run();
    expect(sr.calls().map((c) => c.step)).toEqual([
      'determinism-setup',
      'determinism-fix-cold-serial-shell',
      'determinism-fix-cold-serial-_blank-mfe',
      'determinism-fix-warm-shell',
      'determinism-fix-warm-_blank-mfe',
      'determinism-fix-cold-parallel-shell',
      'determinism-fix-cold-parallel-_blank-mfe',
    ]);
    expect(sr.calls()[1]).toMatchObject({
      command: ['npx', 'vite', 'build'],
      cwd: path.join('/repo', 'template-shell'),
    });
    expect(sr.calls()[2].cwd).toBe(path.join('/repo', 'template-mfe/src-app/mfe_packages/_blank-mfe'));
    // Cold builds start from cleared caches; the warm build does not.
    expect(cleared).toEqual(['/repo', '/repo']);
    expect(out.status).toBe('pass');
    expect(out.json.comparisons.map((c) => [c.comparison, c.status])).toEqual([
      ['cold-vs-warm', 'pass'],
      ['serial-vs-parallel', 'pass'],
    ]);
  });

  it('fails naming the differing file and the stage when a build emits different bytes', async () => {
    const withShared = (hash) => FULL_TREE().set('template-shell/dist/shared/a.js', hash);
    const trees = [withShared('h1'), withShared('hX'), withShared('h1')];
    let call = 0;
    const logged = [];
    const out = await gate({ snapshot: () => trees[call++], log: (l) => logged.push(l) }).run();
    expect(out.status).toBe('fail');
    const [warm, parallel] = out.json.comparisons;
    expect(warm).toMatchObject({ comparison: 'cold-vs-warm', stage: 'warm', status: 'fail' });
    expect(warm.reason).toContain('template-shell/dist/shared/a.js differs (hash-mismatch)');
    expect(warm.reason).toContain('the warm build');
    expect(warm.differences).toEqual([
      { file: 'template-shell/dist/shared/a.js', kind: 'hash-mismatch', aHash: 'h1', bHash: 'hX' },
    ]);
    expect(parallel.status).toBe('pass');
    expect(logged.join('\n')).toContain('template-shell/dist/shared/a.js');
  });

  it('fails a comparison whose build fails, without comparing hashes', async () => {
    const sr = fakeStepRunner({ exitCodes: { 'determinism-fix-cold-parallel-_blank-mfe': 1 } });
    const out = await gate({ stepRunner: sr }).run();
    expect(out.status).toBe('fail');
    expect(out.json.comparisons[1]).toMatchObject({
      comparison: 'serial-vs-parallel',
      status: 'fail',
      reason: 'the cold parallel build failed at step determinism-fix-cold-parallel-_blank-mfe (log: /tmp/fake-logs/determinism-fix-cold-parallel-_blank-mfe.log)',
    });
  });

  it('fails every comparison when the reference build fails', async () => {
    const sr = fakeStepRunner({ exitCodes: { 'determinism-fix-cold-serial-shell': 2 } });
    const out = await gate({ stepRunner: sr }).run();
    expect(out.json.comparisons.map((c) => [c.status, c.reason])).toEqual([
      ['fail', 'the cold serial reference build failed at step determinism-fix-cold-serial-shell (log: /tmp/fake-logs/determinism-fix-cold-serial-shell.log)'],
      ['fail', 'the cold serial reference build failed at step determinism-fix-cold-serial-shell (log: /tmp/fake-logs/determinism-fix-cold-serial-shell.log)'],
    ]);
  });

  it('names the failing setup step and its log', async () => {
    const sr = fakeStepRunner({ exitCodes: { 'determinism-setup': 1 } });
    const out = await gate({ stepRunner: sr }).run();
    expect(out.json.comparisons[0].reason).toBe(
      'the package build failed at step determinism-setup (log: /tmp/fake-logs/determinism-setup.log)',
    );
  });

  it('fails every comparison when a target contributes no file to the reference snapshot', async () => {
    const out = await gate({
      snapshot: () => new Map([['template-shell/dist/index.html', 'h1']]),
    }).run();
    expect(out.status).toBe('fail');
    for (const c of out.json.comparisons) {
      expect(c.reason).toContain('_blank-mfe contributed no file under template-mfe/src-app/mfe_packages/_blank-mfe/dist/');
      expect(c.reason).toContain('reference snapshot');
    }
  });

  it('fails a comparison whose compared snapshot lacks a target', async () => {
    const trees = [FULL_TREE(), FULL_TREE(), FULL_TREE()];
    trees[1].delete('template-shell/dist/index.html');
    let call = 0;
    const out = await gate({ snapshot: () => trees[call++] }).run();
    expect(out.json.comparisons[0]).toMatchObject({ comparison: 'cold-vs-warm', status: 'fail' });
    expect(out.json.comparisons[0].reason).toContain('shell contributed no file under template-shell/dist/ to the warm snapshot');
    expect(out.json.comparisons[1].status).toBe('pass');
  });

  it('fails cold-vs-warm when the warm build did not hit the producer cache, and only that one', async () => {
    const checked = [];
    const out = await gate({
      cacheProblems: (root) => {
        checked.push(root);
        return ['shell: template-shell/dist/shell-build-report.json counts 0 cache hits and 3 misses'];
      },
    }).run();
    expect(checked).toEqual(['/repo']);
    expect(out.json.comparisons[0]).toMatchObject({ comparison: 'cold-vs-warm', status: 'fail' });
    expect(out.json.comparisons[0].reason).toContain('did not hit the producer cache: shell:');
    expect(out.json.comparisons[1].status).toBe('pass');
  });

  it('records a failed comparison, removes the temp dir and keeps the other results when the checkout copy throws', async () => {
    const removed = [];
    const out = await gate({
      tier: 'full',
      copyCheckout: () => {
        throw new Error('ENOSPC: no space left');
      },
      removeCheckout: (r) => removed.push(r),
    }).run();
    const byName = Object.fromEntries(out.json.comparisons.map((c) => [c.comparison, c]));
    expect(byName['two-checkouts']).toMatchObject({ status: 'fail' });
    expect(byName['two-checkouts'].reason).toContain('ENOSPC');
    expect(byName['install-vs-link'].status).toBe('fail');
    expect(byName['cold-vs-warm'].status).toBe('pass');
    expect(out.status).toBe('fail');
    expect(removed).toEqual([]);
  });

  it('removes the copy when a build in it throws', async () => {
    const removed = [];
    const sr = fakeStepRunner();
    const run = sr.run;
    sr.run = async (d) => {
      if (d.cwd.startsWith('/copy')) throw new Error('boom');
      return run(d);
    };
    const out = await gate({ tier: 'full', stepRunner: sr, removeCheckout: (r) => removed.push(r) }).run();
    expect(out.json.comparisons[2].reason).toContain('boom');
    expect(removed).toEqual(['/copy', '/copy']);
  });

  it('builds the parallel stage concurrently', async () => {
    let running = 0;
    let peak = 0;
    const sr = {
      run: async (desc) => {
        running += 1;
        peak = Math.max(peak, desc.step.includes('cold-parallel') ? running : 0);
        await new Promise((r) => setTimeout(r, 5));
        running -= 1;
        return { step: desc.step, command: desc.command.join(' '), exitCode: 0, durationMs: 5, log: '' };
      },
    };
    await gate({ stepRunner: sr }).run();
    expect(peak).toBe(2);
  });

  it('full tier: builds a copied checkout and an installed-packages copy, and removes both', async () => {
    const sr = fakeStepRunner();
    const copies = [];
    const installed = [];
    const removed = [];
    const out = await gate({
      tier: 'full',
      stepRunner: sr,
      copyCheckout: () => {
        copies.push(`/copy-${copies.length}`);
        return copies[copies.length - 1];
      },
      installLinkedPackages: (root) => installed.push(root),
      removeCheckout: (root) => removed.push(root),
    }).run();
    expect(out.json.comparisons.map((c) => c.comparison)).toEqual([
      'cold-vs-warm',
      'serial-vs-parallel',
      'two-checkouts',
      'install-vs-link',
    ]);
    expect(installed).toEqual(['/copy-1']);
    expect(removed).toEqual(['/copy-0', '/copy-1']);
    expect(sr.calls().filter((c) => c.cwd.startsWith('/copy-0')).map((c) => c.step)).toEqual([
      'determinism-full-two-checkouts-shell',
      'determinism-full-two-checkouts-_blank-mfe',
      'determinism-full-two-checkouts-demo-mfe',
    ]);
    expect(out.status).toBe('pass');
  });

  it('writes the JSON to <resultsDir>/determinism-gate-<ISO>.json', async () => {
    const root = makeRoot();
    const resultsDir = path.join(root, 'e2e', 'results');
    const out = await gate({ resultsDir, now: () => new Date('2026-11-12T06:02:00.000Z') }).run();
    const expected = path.join(resultsDir, 'determinism-gate-2026-11-12T06-02-00-000Z.json');
    expect(out.jsonPath).toBe(expected);
    const written = JSON.parse(readFileSync(expected, 'utf-8'));
    expect(written.status).toBe('pass');
    expect(written.tier).toBe('fix');
    expect(written.targets).toEqual(['shell', '_blank-mfe']);
    expect(Object.keys(written.steps[0]).sort()).toEqual(['command', 'durationMs', 'exitCode', 'log', 'step']);
  });
});

describe('DeterminismGate — snapshot and cache helpers', () => {
  const targets = buildTargets(['m']);

  it('targetsWithoutFiles names the targets that contribute no key', () => {
    const snap = new Map([['template-shell/dist/index.html', 'h']]);
    expect(targetsWithoutFiles(snap, targets).map((t) => t.name)).toEqual(['m']);
  });

  it('coldCacheProblems accepts reports with hits and no misses and names every other target', () => {
    const root = makeRoot();
    const write = (outDir, cache) => {
      mkdirSync(path.join(root, outDir), { recursive: true });
      writeFileSync(path.join(root, outDir, 'x-build-report.json'), JSON.stringify({ cache }));
    };
    write('template-shell/dist', { hits: 4, misses: 0 });
    expect(coldCacheProblems(root, [targets[0]])).toEqual([]);
    write('template-shell/dist', { hits: 0, misses: 0 });
    expect(coldCacheProblems(root, [targets[0]])[0]).toContain('shell:');
    write('template-shell/dist', { hits: 4, misses: 1 });
    expect(coldCacheProblems(root, [targets[0]])[0]).toContain('1 misses');
    expect(coldCacheProblems(root, targets).map((p) => p.split(':')[0])).toEqual(['shell', 'm']);
  });
});

describe('DeterminismGate — checkout helpers', () => {
  it('copyCheckout removes its temp dir when the copy fails', () => {
    const root = makeRoot();
    const before = new Set(readdirSync(tmpdir()).filter((n) => n.startsWith('frontx-determinism-')));
    expect(() => copyCheckout(root)).toThrow();
    const after = readdirSync(tmpdir()).filter((n) => n.startsWith('frontx-determinism-') && !before.has(n));
    expect(after).toEqual([]);
  });

  it('snapshotOutputs compares build reports without their stage timings and cache hits', () => {
    const root = makeRoot();
    const dist = path.join(root, 'template-shell', 'dist');
    mkdirSync(dist, { recursive: true });
    const report = (timings, hits, bytes) =>
      JSON.stringify({ host: 'shell', totalBytes: bytes, stageTimings: { produce: timings }, cache: { hits } });
    const targets = buildTargets([]);

    writeFileSync(path.join(dist, 'shell-build-report.json'), report(100, 0, 10));
    const cold = snapshotOutputs(root, targets);
    writeFileSync(path.join(dist, 'shell-build-report.json'), report(40, 7, 10));
    const warm = snapshotOutputs(root, targets);
    writeFileSync(path.join(dist, 'shell-build-report.json'), report(40, 7, 11));
    const changed = snapshotOutputs(root, targets);

    expect(diffHashes(cold, warm)).toEqual([]);
    expect(diffHashes(cold, changed).map((d) => d.file)).toEqual(['template-shell/dist/shell-build-report.json']);
  });

  it('buildTargets keys every output relative to the checkout root', () => {
    expect(buildTargets(['a'])).toEqual([
      { name: 'shell', dir: 'template-shell', outDir: 'template-shell/dist' },
      { name: 'a', dir: 'template-mfe/src-app/mfe_packages/a', outDir: 'template-mfe/src-app/mfe_packages/a/dist' },
    ]);
  });

  it('copyCheckout leaves build outputs behind and keeps package builds and relative links', () => {
    const root = makeRoot();
    mkdirSync(path.join(root, 'template-shell', 'dist'), { recursive: true });
    writeFileSync(path.join(root, 'template-shell', 'dist', 'index.html'), 'x');
    mkdirSync(path.join(root, 'template-shell', 'packages', 'p', 'dist'), { recursive: true });
    writeFileSync(path.join(root, 'template-shell', 'packages', 'p', 'dist', 'index.js'), 'p');
    mkdirSync(path.join(root, 'template-shell', 'node_modules', '@s'), { recursive: true });
    symlinkSync('../../packages/p', path.join(root, 'template-shell', 'node_modules', '@s', 'p'));
    mkdirSync(path.join(root, 'template-mfe', 'src-app', 'mfe_packages', 'm', 'dist'), { recursive: true });
    writeFileSync(path.join(root, 'template-mfe', 'src-app', 'mfe_packages', 'm', 'mfe.json'), '{}');
    writeFileSync(path.join(root, 'package.json'), '{}');

    const copy = copyCheckout(root);
    try {
      expect(existsSync(path.join(copy, 'template-shell', 'dist'))).toBe(false);
      expect(existsSync(path.join(copy, 'template-mfe', 'src-app', 'mfe_packages', 'm', 'dist'))).toBe(false);
      expect(existsSync(path.join(copy, 'template-mfe', 'src-app', 'mfe_packages', 'm', 'mfe.json'))).toBe(true);
      expect(readFileSync(path.join(copy, 'template-shell', 'node_modules', '@s', 'p', 'dist', 'index.js'), 'utf-8')).toBe('p');
      expect(lstatSync(path.join(copy, 'template-shell', 'node_modules', '@s', 'p')).isSymbolicLink()).toBe(true);
      expect(existsSync(path.join(copy, 'package.json'))).toBe(true);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it('installLinkedPackages replaces package links by installed copies and keeps template-root links', () => {
    const root = makeRoot();
    const pkg = path.join(root, 'template-shell', 'packages', 'p');
    mkdirSync(path.join(pkg, 'dist'), { recursive: true });
    mkdirSync(path.join(pkg, 'src'), { recursive: true });
    writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@s/p', files: ['dist'] }));
    writeFileSync(path.join(pkg, 'dist', 'index.js'), 'p');
    writeFileSync(path.join(pkg, 'src', 'index.ts'), 'src');
    writeFileSync(path.join(root, 'template-shell', 'package.json'), '{}');
    writeFileSync(path.join(root, 'template-shell', 'frontx-template.json'), '{}');
    const nm = path.join(root, 'template-shell', 'node_modules', '@s');
    mkdirSync(nm, { recursive: true });
    symlinkSync('../../packages/p', path.join(nm, 'p'));
    symlinkSync('../..', path.join(nm, 'self'));

    expect(installLinkedPackages(root)).toEqual([path.join('template-shell', 'node_modules', '@s', 'p')]);
    expect(lstatSync(path.join(nm, 'p')).isSymbolicLink()).toBe(false);
    expect(readFileSync(path.join(nm, 'p', 'dist', 'index.js'), 'utf-8')).toBe('p');
    expect(existsSync(path.join(nm, 'p', 'src'))).toBe(false);
    expect(lstatSync(path.join(nm, 'self')).isSymbolicLink()).toBe(true);
  });

  it('setupSteps builds the shell packages and each template-mfe package with a build script', () => {
    const root = makeRoot();
    mkdirSync(path.join(root, 'template-mfe', 'packages', 'plugin'), { recursive: true });
    writeFileSync(path.join(root, 'template-mfe', 'packages', 'plugin', 'package.json'), JSON.stringify({ scripts: { build: 'tsup' } }));
    mkdirSync(path.join(root, 'template-mfe', 'packages', 'nobuild'), { recursive: true });
    writeFileSync(path.join(root, 'template-mfe', 'packages', 'nobuild', 'package.json'), '{}');
    expect(setupSteps(root).map((s) => [s.command.join(' '), path.relative(root, s.cwd)])).toEqual([
      ['npm run build:packages', 'template-shell'],
      ['npm run build', path.join('template-mfe', 'packages', 'plugin')],
    ]);
  });
});
