/**
 * `DeterminismGate` — the two-tier determinism gate. A no-change rebuild
 * must produce byte-identical output — every shared file, every list and
 * the build report — whatever the cache state, the parallelism, the
 * checkout folder or the install layout. The gate builds the shell and
 * the selected MFE fixtures, hashes every file of each build output, and
 * compares the hashed trees of two builds per comparison. A build report
 * is compared without its stage timings and cache hits, which measure the
 * build rather than describe its output.
 *
 * Comparisons (each against the cold serial build in the checkout):
 * - `cold-vs-warm` — the same build again on the warm producer cache;
 * - `serial-vs-parallel` — a cold build with every target built at once;
 * - `two-checkouts` — a cold build of a copy of the templates in another
 *   folder;
 * - `install-vs-link` — a cold build of a copy whose workspace links in
 *   `node_modules` are replaced by installed copies of the linked packages
 *   (the package's `package.json` plus its `files`).
 *
 * Tiers:
 * - `fix` = cold vs warm and serial vs parallel, on the shell and one MFE.
 * - `full` = all four comparisons, on the shell and every MFE.
 *
 * A difference fails the comparison naming the file and the stage (the
 * build it differs in). Every build runs as its own bounded StepRunner
 * step (15-minute limit, never retried); a failed build fails its
 * comparison.
 *
 * The class takes its collaborators as constructor args so a unit test
 * passes fakes (no real builds in unit tests). The CLI entry point in
 * `scripts/determinism-gate.mjs` wires the real ones.
 */

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** @typedef {'fix' | 'full'} DeterminismTier */

/** @typedef {'cold-vs-warm' | 'serial-vs-parallel' | 'two-checkouts' | 'install-vs-link'} Comparison */

/**
 * @typedef {Object} StepResult
 * @property {string} step
 * @property {string} command
 * @property {number | null} exitCode
 * @property {number} durationMs
 * @property {string} log
 * @property {string} [reason]
 */

/**
 * @typedef {Object} BuildTarget
 * @property {string} name     `shell` or the fixture's directory name.
 * @property {string} dir      Directory the build runs in, relative to the checkout root.
 * @property {string} outDir   Build output directory, relative to the checkout root.
 */

/**
 * @typedef {Object} Difference
 * @property {string} file
 * @property {'missing-in-a' | 'missing-in-b' | 'hash-mismatch' | 'unreadable'} kind
 * @property {string} [aHash]
 * @property {string} [bHash]
 */

/** Templates the gate builds in, relative to a checkout root. */
export const SHELL_DIR = 'template-shell';
export const MFE_TEMPLATE_DIR = 'template-mfe';
export const MFE_PACKAGES_REL = path.join(MFE_TEMPLATE_DIR, 'src-app', 'mfe_packages');

/** Env every build runs with: the fixtures are template examples, which the scanners skip without it. */
const BUILD_ENV = Object.freeze({ FRONTX_INCLUDE_TEMPLATE_EXAMPLES: '1' });

/** Build outputs a checkout copy leaves behind (relative to the root, `/`-separated). */
const BUILD_OUTPUT = /^(template-shell\/dist|template-mfe\/src-app\/mfe_packages\/[^/]+\/dist)$/;

/** Prefix of the hash an entry that cannot be read gets; it never equals another hash. */
export const UNREADABLE_PREFIX = 'unreadable:';

/** @param {unknown} err */
function unreadable(err) {
  return `${UNREADABLE_PREFIX}${/** @type {{ code?: string }} */ (err)?.code ?? 'error'}`;
}

/**
 * SHA-256 of a file's bytes (hex). A file that cannot be read gets an
 * `unreadable:<code>` marker instead of a throw; {@link diffHashes}
 * reports such an entry as a difference even when both sides carry it.
 *
 * @param {string} file
 * @returns {string}
 */
export function hashFile(file) {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch (err) {
    return unreadable(err);
  }
}

/**
 * Every difference between two hash maps keyed by relative path, in path
 * order: a file missing on either side, a file whose hashes differ, or an
 * entry that could not be read on either side.
 *
 * @param {Map<string, string>} a
 * @param {Map<string, string>} b
 * @returns {Difference[]}
 */
export function diffHashes(a, b) {
  /** @type {Difference[]} */
  const out = [];
  for (const file of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const aHash = a.get(file);
    const bHash = b.get(file);
    if (aHash?.startsWith(UNREADABLE_PREFIX) || bHash?.startsWith(UNREADABLE_PREFIX)) {
      out.push({ file, kind: 'unreadable', aHash, bHash });
    } else if (bHash === undefined) out.push({ file, kind: 'missing-in-b', aHash });
    else if (aHash === undefined) out.push({ file, kind: 'missing-in-a' });
    else if (aHash !== bHash) out.push({ file, kind: 'hash-mismatch', aHash, bHash });
  }
  return out;
}

/**
 * Hashes every file under `dir` (recursively) keyed by its path
 * relative to `dir`. Hidden files are included; nothing is excluded. An
 * entry that cannot be read is keyed with an `unreadable:` marker.
 *
 * @param {string} dir
 * @returns {Map<string, string>}
 */
export function hashTree(dir) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (!existsSync(dir)) return out;
  const walk = (d, rel) => {
    let names;
    try {
      names = readdirSync(d).sort();
    } catch (err) {
      out.set(rel === '' ? '.' : rel, unreadable(err));
      return;
    }
    for (const name of names) {
      const p = path.join(d, name);
      const r = rel === '' ? name : `${rel}/${name}`;
      let stat;
      try {
        stat = statSync(p);
      } catch (err) {
        out.set(r, unreadable(err));
        continue;
      }
      if (stat.isDirectory()) walk(p, r);
      else out.set(r, hashFile(p));
    }
  };
  walk(dir, '');
  return out;
}

/**
 * The comparisons each tier runs.
 *
 * @param {DeterminismTier} tier
 * @returns {Comparison[]}
 */
export function comparisonsForTier(tier) {
  if (tier === 'fix') return ['cold-vs-warm', 'serial-vs-parallel'];
  return ['cold-vs-warm', 'serial-vs-parallel', 'two-checkouts', 'install-vs-link'];
}

/**
 * The build targets: the shell, then each named MFE fixture.
 *
 * @param {readonly string[]} mfes fixture directory names.
 * @returns {BuildTarget[]}
 */
export function buildTargets(mfes) {
  return [
    { name: 'shell', dir: SHELL_DIR, outDir: `${SHELL_DIR}/dist` },
    ...mfes.map((name) => ({
      name,
      dir: `${MFE_PACKAGES_REL.split(path.sep).join('/')}/${name}`,
      outDir: `${MFE_PACKAGES_REL.split(path.sep).join('/')}/${name}/dist`,
    })),
  ];
}

/** Build-report fields that measure the build rather than describe its output. */
const REPORT_MEASUREMENTS = Object.freeze(['stageTimings', 'cache']);

/**
 * The hash of a build report (`*-build-report.json`) with its measurement
 * fields left out: stage timings and cache hits differ on every build by
 * design, while everything else the report states about the output must
 * not. A report that is not valid JSON is hashed as bytes.
 *
 * @param {string} file
 * @returns {string}
 */
export function hashBuildReport(file) {
  let report;
  try {
    report = JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return hashFile(file);
  }
  if (report === null || typeof report !== 'object' || Array.isArray(report)) return hashFile(file);
  for (const field of REPORT_MEASUREMENTS) delete report[field];
  return createHash('sha256').update(JSON.stringify(report)).digest('hex');
}

/**
 * Hashes every target's output directory under `root`, keyed by the path
 * relative to the checkout root so two checkouts compare key for key. A
 * build report is hashed without its measurement fields
 * ({@link hashBuildReport}).
 *
 * @param {string} root
 * @param {readonly BuildTarget[]} targets
 * @returns {Map<string, string>}
 */
export function snapshotOutputs(root, targets) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const t of targets) {
    const dir = path.join(root, t.outDir);
    for (const [rel, hash] of hashTree(dir)) {
      const key = `${t.outDir}/${rel}`;
      out.set(key, rel.endsWith('-build-report.json') ? hashBuildReport(path.join(dir, rel)) : hash);
    }
  }
  return out;
}

/**
 * The targets that contribute no file to a snapshot.
 *
 * @param {Map<string, string>} snapshot
 * @param {readonly BuildTarget[]} targets
 * @returns {BuildTarget[]}
 */
export function targetsWithoutFiles(snapshot, targets) {
  const keys = [...snapshot.keys()];
  return targets.filter((t) => !keys.some((k) => k.startsWith(`${t.outDir}/`)));
}

/**
 * Reads each target's build report under `root` and returns the targets
 * whose producer cache did not serve the build: the report is missing or
 * unreadable, states no cache summary, or counts no hit or any miss.
 *
 * @param {string} root
 * @param {readonly BuildTarget[]} targets
 * @returns {string[]} one message per target that missed the cache.
 */
export function coldCacheProblems(root, targets) {
  /** @type {string[]} */
  const problems = [];
  for (const t of targets) {
    const dir = path.join(root, t.outDir);
    const reportName = existsSync(dir) ? readdirSync(dir).find((n) => n.endsWith('-build-report.json')) : undefined;
    if (reportName === undefined) {
      problems.push(`${t.name}: no build report under ${t.outDir}`);
      continue;
    }
    let cache;
    try {
      cache = JSON.parse(readFileSync(path.join(dir, reportName), 'utf-8'))?.cache;
    } catch {
      problems.push(`${t.name}: ${t.outDir}/${reportName} is unreadable`);
      continue;
    }
    if (!(cache?.hits > 0) || cache.misses !== 0) {
      problems.push(`${t.name}: ${t.outDir}/${reportName} counts ${cache?.hits ?? 'no'} cache hits and ${cache?.misses ?? 'no'} misses`);
    }
  }
  return problems;
}

/**
 * Copies the two templates and the root `package.json` of `root` into a
 * fresh folder, keeping `node_modules` (relative workspace links keep
 * pointing inside the copy) and leaving the build outputs behind. A copy
 * that fails removes its folder before it throws.
 *
 * @param {string} root
 * @returns {string} the copy's root.
 */
export function copyCheckout(root) {
  const copy = mkdtempSync(path.join(tmpdir(), 'frontx-determinism-'));
  try {
    for (const dir of [SHELL_DIR, MFE_TEMPLATE_DIR]) {
      cpSync(path.join(root, dir), path.join(copy, dir), {
        recursive: true,
        verbatimSymlinks: true,
        filter: (src) => !BUILD_OUTPUT.test(path.relative(root, src).split(path.sep).join('/')),
      });
    }
    const rootPackage = path.join(root, 'package.json');
    if (existsSync(rootPackage)) cpSync(rootPackage, path.join(copy, 'package.json'));
  } catch (err) {
    rmSync(copy, { recursive: true, force: true });
    throw err;
  }
  return copy;
}

/**
 * Replaces every workspace link under each template's `node_modules`
 * (`node_modules/<name>` and `node_modules/@scope/<name>`) with an
 * installed copy of the linked package: its `package.json` plus the
 * entries its `files` field names (the whole package except
 * `node_modules` when it has none). A link to a template root — the
 * consumer itself or its sibling template — stays: it is not a package
 * an install would place.
 *
 * @param {string} root
 * @returns {string[]} the replaced link paths, relative to `root`.
 */
export function installLinkedPackages(root) {
  /** @type {string[]} */
  const replaced = [];
  for (const dir of [SHELL_DIR, MFE_TEMPLATE_DIR]) {
    const nm = path.join(root, dir, 'node_modules');
    if (!existsSync(nm)) continue;
    /** @type {string[]} */
    const candidates = [];
    for (const name of readdirSync(nm)) {
      if (name.startsWith('.')) continue;
      const p = path.join(nm, name);
      if (name.startsWith('@') && lstatSync(p).isDirectory()) {
        for (const sub of readdirSync(p)) candidates.push(path.join(p, sub));
      } else {
        candidates.push(p);
      }
    }
    for (const link of candidates) {
      if (!lstatSync(link).isSymbolicLink()) continue;
      const target = path.resolve(path.dirname(link), readlinkSync(link));
      if (!existsSync(path.join(target, 'package.json'))) continue;
      if (existsSync(path.join(target, 'frontx-template.json'))) continue;
      if (link.startsWith(`${target}${path.sep}`)) continue;
      const pkg = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf-8'));
      const entries = Array.isArray(pkg.files)
        ? pkg.files
        : readdirSync(target).filter((n) => n !== 'node_modules' && n !== 'package.json');
      unlinkSync(link);
      mkdirSync(link, { recursive: true });
      cpSync(path.join(target, 'package.json'), path.join(link, 'package.json'));
      for (const entry of entries) {
        const src = path.join(target, entry);
        if (existsSync(src)) cpSync(src, path.join(link, entry), { recursive: true, verbatimSymlinks: true });
      }
      replaced.push(path.relative(root, link));
    }
  }
  return replaced;
}

/**
 * The package builds every target depends on, run once in the checkout
 * before any comparison: the shell template's packages, then each
 * `template-mfe/packages/*` package that has a `build` script.
 *
 * @param {string} root
 * @returns {Array<{ step: string; command: string[]; cwd: string }>}
 */
export function setupSteps(root) {
  const steps = [
    { step: 'determinism-setup-shell-packages', command: ['npm', 'run', 'build:packages'], cwd: path.join(root, SHELL_DIR) },
  ];
  const packagesDir = path.join(root, MFE_TEMPLATE_DIR, 'packages');
  if (existsSync(packagesDir)) {
    for (const name of readdirSync(packagesDir).sort()) {
      const pkgPath = path.join(packagesDir, name, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (typeof pkg.scripts?.build !== 'string') continue;
      steps.push({
        step: `determinism-setup-mfe-package-${name}`,
        command: ['npm', 'run', 'build'],
        cwd: path.join(packagesDir, name),
      });
    }
  }
  return steps;
}

export class DeterminismGate {
  /** @type {DeterminismTier} */
  #tier;
  /** @type {{ run: (desc: object) => Promise<StepResult> }} */
  #stepRunner;
  /** @type {string} */
  #resultsDir;
  /** @type {string} */
  #repoRoot;
  /** @type {readonly string[]} */
  #mfes;
  /** @type {() => Date} */
  #now;
  /** @type {typeof writeFileSync} */
  #writeFile;
  /** @type {(dir: string) => void} */
  #mkdirFn;
  /** @type {(root: string) => Promise<unknown>} */
  #clearCache;
  /** @type {(root: string, targets: readonly BuildTarget[]) => Map<string, string>} */
  #snapshot;
  /** @type {(root: string, targets: readonly BuildTarget[]) => string[]} */
  #cacheProblems;
  /** @type {(root: string) => string} */
  #copyCheckout;
  /** @type {(root: string) => string[]} */
  #installLinkedPackages;
  /** @type {(root: string) => void} */
  #removeCheckout;
  /** @type {(root: string) => Array<{ step: string; command: string[]; cwd: string }>} */
  #setupSteps;
  /** @type {(line: string) => void} */
  #log;

  /**
   * @param {Object} opts
   * @param {DeterminismTier} opts.tier
   * @param {{ run: (desc: object) => Promise<StepResult> }} opts.stepRunner bounded-step runner.
   * @param {string} opts.repoRoot checkout root holding the templates.
   * @param {readonly string[]} opts.mfes MFE fixture directory names; the `fix` tier builds the first.
   * @param {(root: string) => Promise<unknown>} opts.clearCache clears every producer cache below `root`.
   * @param {string} [opts.resultsDir]
   * @param {(root: string, targets: readonly BuildTarget[]) => Map<string, string>} [opts.snapshot]
   * @param {(root: string, targets: readonly BuildTarget[]) => string[]} [opts.cacheProblems] targets whose warm build did not hit the producer cache.
   * @param {(root: string) => string} [opts.copyCheckout]
   * @param {(root: string) => string[]} [opts.installLinkedPackages]
   * @param {(root: string) => void} [opts.removeCheckout]
   * @param {(root: string) => Array<{ step: string; command: string[]; cwd: string }>} [opts.setupSteps]
   * @param {() => Date} [opts.now]
   * @param {typeof writeFileSync} [opts.writeFile]
   * @param {(dir: string) => void} [opts.mkdirFn]
   * @param {(line: string) => void} [opts.log]
   */
  constructor({
    tier,
    stepRunner,
    repoRoot,
    mfes,
    clearCache,
    resultsDir = '',
    snapshot = snapshotOutputs,
    cacheProblems = coldCacheProblems,
    copyCheckout: copy = copyCheckout,
    installLinkedPackages: install = installLinkedPackages,
    removeCheckout = (root) => rmSync(root, { recursive: true, force: true }),
    setupSteps: setup = setupSteps,
    now = () => new Date(),
    writeFile = writeFileSync,
    mkdirFn = (dir) => mkdirSync(dir, { recursive: true }),
    log = (line) => console.log(line),
  }) {
    if (tier !== 'fix' && tier !== 'full') {
      throw new Error(`DeterminismGate: unknown tier ${tier}`);
    }
    if (!stepRunner) {
      throw new Error('DeterminismGate: stepRunner is required (bounded steps via StepRunner)');
    }
    if (!repoRoot) throw new Error('DeterminismGate: repoRoot is required');
    if (!clearCache) throw new Error('DeterminismGate: clearCache is required');
    if (!mfes || mfes.length === 0) throw new Error('DeterminismGate: at least one MFE fixture is required');
    this.#tier = tier;
    this.#stepRunner = stepRunner;
    this.#repoRoot = repoRoot;
    this.#mfes = tier === 'fix' ? mfes.slice(0, 1) : [...mfes];
    this.#clearCache = clearCache;
    this.#resultsDir = resultsDir;
    this.#snapshot = snapshot;
    this.#cacheProblems = cacheProblems;
    this.#copyCheckout = copy;
    this.#installLinkedPackages = install;
    this.#removeCheckout = removeCheckout;
    this.#setupSteps = setup;
    this.#now = now;
    this.#writeFile = writeFile;
    this.#mkdirFn = mkdirFn;
    this.#log = log;
  }

  /** @returns {BuildTarget[]} the targets this tier builds. */
  targets() {
    return buildTargets(this.#mfes);
  }

  /**
   * Builds every target in `root`, one at a time or all at once, each as
   * its own bounded step.
   *
   * @param {string} root
   * @param {string} stage step-name segment naming the build.
   * @param {boolean} parallel
   * @returns {Promise<StepResult[]>}
   */
  async #build(root, stage, parallel) {
    const descs = this.targets().map((t) => ({
      step: `determinism-${this.#tier}-${stage}-${t.name}`,
      command: ['npx', 'vite', 'build'],
      cwd: path.join(root, t.dir),
      env: BUILD_ENV,
    }));
    if (parallel) return Promise.all(descs.map((d) => this.#stepRunner.run(d)));
    /** @type {StepResult[]} */
    const out = [];
    for (const d of descs) out.push(await this.#stepRunner.run(d));
    return out;
  }

  /**
   * Runs the tier's comparisons, writes the JSON result and returns it.
   * The status is `pass` only when every build succeeded and every
   * comparison found identical trees.
   *
   * @returns {Promise<{ json: object; jsonPath: string; status: 'pass' | 'fail' }>}
   */
  async run() {
    if (this.#resultsDir !== '') this.#mkdirFn(this.#resultsDir);
    const targets = this.targets();
    /** @type {StepResult[]} */
    const steps = [];
    /** @type {Array<{ comparison: Comparison; stage: string; status: 'pass' | 'fail'; reason?: string; differences?: Difference[] }>} */
    const results = [];
    const record = (rs) => {
      steps.push(...rs);
      return rs.every((r) => r.exitCode === 0);
    };
    /** @param {StepResult[]} rs the first failed step and its log. */
    const failure = (rs) => {
      const failed = rs.find((r) => r.exitCode !== 0);
      return failed === undefined ? '' : `${failed.step} (log: ${failed.log})`;
    };
    /** @param {Map<string, string>} snap @param {string} what */
    const emptyTargets = (snap, what) =>
      targetsWithoutFiles(snap, targets)
        .map((t) => `${t.name} contributed no file under ${t.outDir}/ to the ${what}`)
        .join('; ');

    /** @type {string | undefined} */
    let blocked;
    for (const desc of this.#setupSteps(this.#repoRoot)) {
      const rs = [await this.#stepRunner.run(desc)];
      if (!record(rs)) {
        blocked = `the package build failed at step ${failure(rs)}`;
        break;
      }
    }
    /** @type {Map<string, string>} */
    let reference = new Map();
    if (blocked === undefined) {
      await this.#clearCache(this.#repoRoot);
      const rs = await this.#build(this.#repoRoot, 'cold-serial', false);
      if (record(rs)) {
        reference = this.#snapshot(this.#repoRoot, targets);
        const empty = emptyTargets(reference, 'cold serial reference snapshot');
        if (empty !== '') blocked = empty;
      } else {
        blocked = `the cold serial reference build failed at step ${failure(rs)}`;
      }
    }

    /**
     * @param {Comparison} comparison
     * @param {string} stage
     * @param {StepResult[]} rs the stage's build steps.
     * @param {string} root
     * @param {boolean} [warm] the build must have been served by the producer cache.
     */
    const judge = (comparison, stage, rs, root, warm = false) => {
      if (!record(rs)) {
        results.push({ comparison, stage, status: 'fail', reason: `the ${stage} build failed at step ${failure(rs)}` });
        return;
      }
      const snap = this.#snapshot(root, targets);
      const empty = emptyTargets(snap, `${stage} snapshot`);
      if (empty !== '') {
        results.push({ comparison, stage, status: 'fail', reason: empty });
        return;
      }
      if (warm) {
        const cold = this.#cacheProblems(root, targets);
        if (cold.length > 0) {
          results.push({
            comparison,
            stage,
            status: 'fail',
            reason: `the ${stage} build did not hit the producer cache: ${cold.join('; ')}`,
          });
          return;
        }
      }
      const differences = diffHashes(reference, snap);
      if (differences.length === 0) {
        results.push({ comparison, stage, status: 'pass' });
        return;
      }
      const first = differences[0];
      results.push({
        comparison,
        stage,
        status: 'fail',
        reason: `${first.file} differs (${first.kind}) between the cold serial build and the ${stage} build` +
          (differences.length > 1 ? `, and ${differences.length - 1} more file(s)` : ''),
        differences,
      });
    };

    for (const comparison of comparisonsForTier(this.#tier)) {
      if (blocked !== undefined) {
        results.push({ comparison, stage: comparison, status: 'fail', reason: blocked });
      } else if (comparison === 'cold-vs-warm') {
        judge(comparison, 'warm', await this.#build(this.#repoRoot, 'warm', false), this.#repoRoot, true);
      } else if (comparison === 'serial-vs-parallel') {
        await this.#clearCache(this.#repoRoot);
        judge(comparison, 'cold parallel', await this.#build(this.#repoRoot, 'cold-parallel', true), this.#repoRoot);
      } else {
        const stage = comparison === 'two-checkouts' ? 'second checkout' : 'installed packages';
        /** @type {string | undefined} */
        let copy;
        try {
          copy = this.#copyCheckout(this.#repoRoot);
          if (comparison === 'install-vs-link') this.#installLinkedPackages(copy);
          await this.#clearCache(copy);
          judge(comparison, stage, await this.#build(copy, comparison, false), copy);
        } catch (err) {
          results.push({
            comparison,
            stage,
            status: 'fail',
            reason: `the ${stage} comparison could not run: ${err instanceof Error ? err.message : String(err)}`,
          });
        } finally {
          if (copy !== undefined) this.#removeCheckout(copy);
        }
      }
    }

    for (const r of results) {
      this.#log(`determinism ${r.comparison}: ${r.status}${r.reason ? ` — ${r.reason}` : ''}`);
    }
    const status = results.length > 0 && results.every((r) => r.status === 'pass') ? 'pass' : 'fail';
    const json = {
      status,
      tier: this.#tier,
      targets: targets.map((t) => t.name),
      comparisons: results,
      steps,
      summary: {
        steps: steps.length,
        failedSteps: steps.filter((s) => s.exitCode !== 0).length,
        comparisons: results.length,
        failedComparisons: results.filter((r) => r.status === 'fail').length,
      },
    };
    const jsonPath = this.#resultsDir !== ''
      ? path.join(this.#resultsDir, `determinism-gate-${this.#iso()}.json`)
      : '';
    if (jsonPath !== '') this.#writeFile(jsonPath, JSON.stringify(json, null, 2));
    return { json, jsonPath, status };
  }

  /** @returns {string} ISO timestamp safe for a filename. */
  #iso() {
    return this.#now().toISOString().replace(/[:.]/g, '-');
  }
}
