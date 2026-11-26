/**
 * MFE size metric. Two numbers:
 *
 * 1. **Download per page (GATING)** — the unique bytes a page fetch costs (each fixture's manifest, which holds the unit table and the lists, included):
 *    the shell build's loaded files plus every fixture MFE's fetched bytes,
 *    deduplicated by content identity (SHA-256): a unit the shell and three
 *    MFEs all ship identical bytes for counts once. Measured under the new
 *    rule (each fixture fetches its own chunks plus every item on its
 *    manifest's entry lists) and compared
 *    against the committed old-rule
 *    baseline in `template-mfe/size-baseline.json` — the same method and
 *    inputs captured from an old-rule build (a worktree of `main`,
 *    including the old shell bundle). Growth fails unless
 *    `template-mfe/size-gate-exceptions.json` names EVERY grown item —
 *    `{ "<item>": "<reason>" }`, where an item is a package name,
 *    `template-shell`, or `<fixture> (own chunks)` — with a non-empty
 *    reason.
 *
 * 2. **Evaluation per extension (REPORT ONLY)** — the bytes each MFE load
 *    evaluates: its own chunks plus its reached shared units, per fixture,
 *    reported against the old-rule evaluation recorded in the baseline.
 *    No pass/fail.
 *
 * Byte attribution: files under a `shared/` (or legacy `frontx-shared/`)
 * directory belong to the package the first path segments name
 * (`<pkg>@<ver>/<file>`, and the old rule's `<pkg>@<ver>.graph.<hash>.json`
 * and `<pkg>@<ver>.pack.<hash>.js`; `@scope/name@<ver>` for scoped packages);
 * everything else under the shell dist belongs to `template-shell`, and a
 * fixture's own chunks belong to `<fixture> (own chunks)`. Identical
 * content claimed by several owners is attributed to the first package
 * owner (packages before shell/own-chunks, then by name) — deterministic
 * across baseline and current.
 *
 * CLI:
 *   node scripts/size-metric-check.mjs [--shell-dist <dir>]
 *   node scripts/size-metric-check.mjs --capture-old-rule <root> [--shell-dist <dir>]
 *
 * `--shell-dist` is relative to the measured root (default
 * `template-shell/dist`); pass `--shell-dist dist` in the composed CI copy
 * where the shell IS the root.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { packageOfLocation, readEntryLists, sharedDir, unitsDirOf } from './shared-unit-reach.mjs';

const BASELINE_REL = path.join('template-mfe', 'size-baseline.json');
const EXCEPTIONS_REL = path.join('template-mfe', 'size-gate-exceptions.json');
const MFE_PACKAGES_REL = path.join('template-mfe', 'src-app', 'mfe_packages');
const MANIFEST_REL = path.join('dist', 'mfe-manifest.json');
const DEFAULT_SHELL_DIST = path.join('template-shell', 'dist');

/** Item owner name for the shell build's own emitted files. */
export const SHELL_ITEM = 'template-shell';
/** Item owner name for one fixture's own emitted chunks. */
export const ownChunksItem = (fixture) => `${fixture} (own chunks)`;
const UNATTRIBUTED = '(unattributed shared)';
const LOADED_CODE = /\.(m?js|css)$/;
const FETCHED_PAGE_FILES = /\.(m?js|css|json)$/;
const SOURCE_MAP = /\.map$/;
const SHARED_DIRS = /^(?:frontx-)?shared$/;

function readJson(filePath, what) {
  let source;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch {
    throw new Error(`cannot read ${what} at ${filePath}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`cannot parse ${what} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

function readManifest(distDir) {
  const manifestPath = path.join(distDir, 'mfe-manifest.json');
  const manifest = readJson(manifestPath, 'emitted manifest').manifest;
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error(`emitted manifest at ${manifestPath} has no "manifest" object`);
  }
  return manifest;
}

/**
 * Bytes of the JS and CSS the MFE serves itself: every `.js` / `.mjs` /
 * `.css` file under `distDir` outside `sharedDirRel`.
 *
 * @param {string} distDir
 * @param {string} sharedDirRel shared directory, relative to `distDir`
 */
export function measureOwnChunks(distDir, sharedDirRel) {
  const shared = path.resolve(distDir, sharedDirRel);
  let total = 0;
  for (const file of walkFiles(distDir)) {
    if (file === shared || file.startsWith(shared + path.sep)) continue;
    if (LOADED_CODE.test(file)) total += fs.statSync(file).size;
  }
  return total;
}

/**
 * The package a shared-territory file belongs to, from the first path
 * segments under the shared dir: `use-sidecar@1.1.3/dist-x.js`, and the
 * old rule's `react@19.2.4.pack.<hash>.js` and
 * `@scope/name@1.0.0.graph.<hash>.json`.
 * `null` when the path names no package.
 *
 * @param {string} rel path relative to the shared directory
 */
export function ownerOfSharedPath(rel) {
  const segments = rel.split(path.sep);
  let name = segments[0];
  if (name === undefined) return null;
  if (name.startsWith('@')) {
    if (segments.length < 2) return null;
    name = `${name}/${segments[1]}`;
  }
  const match = /^(.*?)@[^@]*$/.exec(name);
  const owner = match?.[1];
  return owner !== undefined && owner !== '' ? owner : null;
}

/**
 * New-rule evaluation of one built fixture: own chunks plus every unit
 * on the manifest's per-entry lists (the nested `lazy`/`patterns` lists
 * included) — the bytes a load of that fixture can evaluate.
 *
 * @param {string} distDir
 * @returns {{ mfe: string, ownChunkBytes: number, manifestBytes: number, sharedBytes: number, totalBytes: number, packages: Map<string, number>, unitFiles: Array<{ path: string, owner: string }> }}
 */
export function fixtureEvaluationNew(distDir) {
  const { manifest, base, entries } = readEntryLists(distDir);
  const packages = new Map();
  const unitFiles = [];
  let sharedBytes = 0;
  const counted = new Set();
  const size = (file, what) => {
    try {
      return fs.statSync(file).size;
    } catch {
      throw new Error(`${what} at ${file} is missing`);
    }
  };
  for (const { doc } of entries.flatMap((e) => e.docs)) {
    for (const item of doc.items) {
      const file = path.join(base, item.location);
      if (counted.has(file)) continue;
      counted.add(file);
      const name = packageOfLocation(item.location) ?? UNATTRIBUTED;
      const bytes = size(file, `listed chunk ${item.location} of ${name}`);
      packages.set(name, (packages.get(name) ?? 0) + bytes);
      unitFiles.push({ path: file, owner: name });
      sharedBytes += bytes;
    }
  }
  const ownChunkBytes = measureOwnChunks(distDir, path.relative(distDir, base));
  // The manifest holds the unit table and every list, so its bytes — the
  // compact JSON a load registers — are download bytes of the new rule.
  const manifestBytes = Buffer.byteLength(JSON.stringify(manifest));
  return {
    mfe: String(manifest.id ?? ''),
    ownChunkBytes,
    manifestBytes,
    sharedBytes,
    totalBytes: ownChunkBytes + manifestBytes + sharedBytes,
    packages,
    unitFiles,
    manifest,
    base,
  };
}

/**
 * Old-rule evaluation of one built fixture: own chunks + every file of the
 * shared directory, attributed to the package its path names.
 *
 * @param {string} distDir
 */
export function fixtureEvaluationOld(distDir) {
  const manifest = readManifest(distDir);
  const base = sharedDir(distDir, manifest);
  // Old-rule manifests attribute shared files through `chunkPath`
  // (resolved against the dist or the shared dir); the unit-era naming
  // (`<pkg>@<ver>...`) is the fallback, then `(unattributed shared)`.
  const owner = new Map();
  for (const entry of manifest.shared ?? []) {
    if (typeof entry.chunkPath !== 'string') continue;
    for (const candidate of [path.resolve(distDir, entry.chunkPath), path.resolve(base, entry.chunkPath)]) {
      owner.set(candidate, entry.name);
    }
  }
  const packages = new Map();
  const sharedFiles = [];
  let sharedBytes = 0;
  if (fs.existsSync(base)) {
    for (const file of walkFiles(base)) {
      if (SOURCE_MAP.test(file)) continue;
      const size = fs.statSync(file).size;
      const name =
        owner.get(path.resolve(file)) ?? ownerOfSharedPath(path.relative(base, file)) ?? UNATTRIBUTED;
      packages.set(name, (packages.get(name) ?? 0) + size);
      sharedFiles.push({ path: file, owner: name });
      sharedBytes += size;
    }
  }
  const ownChunkBytes = measureOwnChunks(distDir, path.relative(distDir, base));
  return {
    mfe: String(manifest.id ?? ''),
    ownChunkBytes,
    sharedBytes,
    totalBytes: ownChunkBytes + sharedBytes,
    packages,
    sharedFiles,
    manifest,
    base,
  };
}

/**
 * Download-per-page measurement: collects the files a page fetch costs
 * and dedups them by content identity (SHA-256).
 *
 * The shell contributes every fetched file in its dist (`js`/`css`/`json`,
 * source maps excluded): files under its shared directory are attributed
 * to the owning package, the rest to `template-shell`. Each fixture
 * contributes its own chunks (`<fixture> (own chunks)`) plus, under the
 * new rule, the units its fetch lists reach — under the old rule, every
 * file of its shared directory.
 *
 * @param {{
 *   shellDist: string;
 *   fixtures: Array<{ name: string, distDir: string }>;
 *   rule: 'new' | 'old';
 *   reach?: (roots: unknown, graphs: Map<string, unknown>, options?: object) => { reachedUnits: Map<string, Set<{ location: string }>> };
 * }} input
 * @returns {{ totalUniqueBytes: number, items: Map<string, number>, files: Array<{ path?: string, content?: Buffer, owner: string }> }}
 */
export function measurePage({ shellDist, fixtures, rule }) {
  const files = [];
  // The shell's downloaded bytes: its own emitted files (entry and fill
  // chunks, non-shared assets) plus what the native boot fetches — every
  // item on the inline fill list. Without fill data (an old-rule shell)
  // the whole dist counts, as the old bundle shipped it whole.
  const pushShell = (distDir) => {
    if (!fs.existsSync(distDir)) throw new Error(`expected build output at ${distDir}`);
    let unitsDirRel = null;
    let boot = null;
    for (const file of walkFiles(distDir)) {
      if (!/frontx-shell-(?:boot|fill)-[^/]*\.js$/.test(file)) continue;
      const text = fs.readFileSync(file, 'utf-8');
      const runAt = text.indexOf('.run({');
      if (runAt === -1) continue;
      let depth = 0;
      let end = -1;
      for (let i = text.indexOf('{', runAt); i < text.length; i += 1) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end !== -1) {
        try {
          boot = JSON.parse(text.slice(text.indexOf('{', runAt), end + 1));
        } catch {
          boot = null;
        }
      }
      break;
    }
    if (boot !== null && typeof boot.unitsBase === 'string') {
      unitsDirRel = unitsDirOf(boot.unitsBase);
    }
    const sharedAbs = unitsDirRel === null ? null : path.resolve(distDir, unitsDirRel);
    for (const file of walkFiles(distDir)) {
      if (SOURCE_MAP.test(file) || !FETCHED_PAGE_FILES.test(file)) continue;
      if (sharedAbs !== null && (file === sharedAbs || file.startsWith(sharedAbs + path.sep))) continue;
      if (sharedAbs === null && SHARED_DIRS.test(path.relative(distDir, file).split(path.sep)[0])) continue;
      files.push({ path: file, owner: SHELL_ITEM });
    }
    if (boot === null || sharedAbs === null) {
      // Old-rule shell: no boot data — every fetched file counts.
      const legacyShared = fs
        .readdirSync(distDir, { withFileTypes: true })
        .find((entry) => entry.isDirectory() && SHARED_DIRS.test(entry.name));
      if (legacyShared !== undefined) {
        const dir = path.join(distDir, legacyShared.name);
        for (const file of walkFiles(dir)) {
          if (SOURCE_MAP.test(file)) continue;
          const owner = ownerOfSharedPath(path.relative(dir, file)) ?? UNATTRIBUTED;
          files.push({ path: file, owner });
        }
      }
      return;
    }
    // New-rule shell: the inline fill data — every unit the realm-cache
    // fill fetches: the units the boot list names, through the data's unit
    // table.
    const byHash = new Map((boot.units ?? []).map((unit) => [unit.contentHash, unit]));
    const pushUnits = (list) => {
      for (const hash of list?.units ?? []) {
        const item = byHash.get(hash);
        if (item === undefined) continue;
        files.push({
          path: path.join(sharedAbs, item.location),
          owner: packageOfLocation(item.location) ?? UNATTRIBUTED,
        });
      }
    };
    pushUnits(boot.list);
  };
  pushShell(shellDist);
  for (const fixture of fixtures) {
    if (rule === 'new') {
      const evaluation = fixtureEvaluationNew(fixture.distDir);
      const base = evaluation.base;
      const sharedAbs = path.resolve(fixture.distDir, path.relative(fixture.distDir, base));
      for (const file of walkFiles(fixture.distDir)) {
        if (file === sharedAbs || file.startsWith(sharedAbs + path.sep)) continue;
        if (LOADED_CODE.test(file) && !SOURCE_MAP.test(file)) {
          files.push({ path: file, owner: ownChunksItem(fixture.name) });
        }
      }
      for (const unit of evaluation.unitFiles) files.push(unit);
      files.push({ content: Buffer.from(JSON.stringify(evaluation.manifest)), owner: ownChunksItem(fixture.name) });
    } else {
      const evaluation = fixtureEvaluationOld(fixture.distDir);
      const manifest = readManifest(fixture.distDir);
      const base = sharedDir(fixture.distDir, manifest);
      const sharedAbs = path.resolve(fixture.distDir, path.relative(fixture.distDir, base));
      for (const file of walkFiles(fixture.distDir)) {
        if (file === sharedAbs || file.startsWith(sharedAbs + path.sep)) continue;
        if (LOADED_CODE.test(file) && !SOURCE_MAP.test(file)) {
          files.push({ path: file, owner: ownChunksItem(fixture.name) });
        }
      }
      for (const sharedFile of evaluation.sharedFiles) files.push(sharedFile);
    }
  }

  // Dedup by content identity. An identical byte string claimed by
  // several owners is attributed once: packages win over shell/own-chunks
  // (the byte IS the package's unit), then the lowest name.
  const byHash = new Map();
  for (const file of files) {
    const content = file.content ?? fs.readFileSync(file.path);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    let entry = byHash.get(hash);
    if (entry === undefined) {
      entry = { size: content.length, owners: new Set() };
      byHash.set(hash, entry);
    }
    entry.owners.add(file.owner);
  }
  const isPackageOwner = (owner) => owner !== SHELL_ITEM && owner !== UNATTRIBUTED && !owner.endsWith(' (own chunks)');
  const items = new Map();
  let totalUniqueBytes = 0;
  for (const { size, owners } of byHash.values()) {
    totalUniqueBytes += size;
    const list = [...owners];
    const packages = list.filter(isPackageOwner).sort();
    const owner = packages.length > 0 ? packages[0] : list.sort()[0];
    items.set(owner, (items.get(owner) ?? 0) + size);
  }
  return { totalUniqueBytes, items, files };
}

/**
 * Fixture dirs (with `mfe.json` and a built dist) under `<root>`'s
 * `template-mfe/src-app/mfe_packages`.
 *
 * @param {string} root
 */
export function findFixtures(root) {
  const base = path.join(root, MFE_PACKAGES_REL);
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'shared')
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(base, name, 'mfe.json')))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Baseline JSON measured by the OLD rule over an old-rule build of the
 * same inputs (a worktree of `main`): the deduplicated download-per-page
 * bytes including the old shell bundle, plus each fixture's old-rule
 * evaluation breakdown for the report-only number.
 *
 * @param {string} root old-rule build root
 * @param {{ shellDistRel?: string }} [options]
 */
export function captureOldRuleBaseline(root, { shellDistRel = DEFAULT_SHELL_DIST } = {}) {
  const fixtures = findFixtures(root).map((name) => ({
    name,
    distDir: path.join(root, MFE_PACKAGES_REL, name, 'dist'),
  }));
  const page = measurePage({ shellDist: path.join(root, shellDistRel), fixtures, rule: 'old' });
  const out = {
    page: {
      totalUniqueBytes: page.totalUniqueBytes,
      items: Object.fromEntries([...page.items].sort(([a], [b]) => a.localeCompare(b))),
    },
    fixtures: {},
  };
  for (const fixture of fixtures) {
    const m = fixtureEvaluationOld(fixture.distDir);
    out.fixtures[fixture.name] = {
      evalBytes: m.totalBytes,
      ownChunkBytes: m.ownChunkBytes,
      sharedBytes: m.sharedBytes,
      packages: Object.fromEntries([...m.packages].sort(([a], [b]) => a.localeCompare(b))),
    };
  }
  return out;
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {{ page: { totalUniqueBytes: number, items: Record<string, number> }, fixtures: Map<string, { evalBytes: number, ownChunkBytes: number, sharedBytes: number, packages: Record<string, number> }> }}
 */
export function normalizeBaseline(raw) {
  if (typeof raw !== 'object' || raw === null || typeof raw.page !== 'object' || raw.page === null) {
    throw new Error('size baseline must be { page: { totalUniqueBytes, items }, fixtures: { <fixture>: {...} } }');
  }
  const { totalUniqueBytes, items } = raw.page;
  if (typeof totalUniqueBytes !== 'number' || typeof items !== 'object' || items === null) {
    throw new Error('size baseline "page" must be { totalUniqueBytes, items }');
  }
  const itemSum = Object.values(items).reduce((n, b) => {
    if (typeof b !== 'number') throw new Error('size baseline page items must be byte counts');
    return n + b;
  }, 0);
  if (itemSum !== totalUniqueBytes) {
    throw new Error(`size baseline page: items ${itemSum} do not add up to totalUniqueBytes ${totalUniqueBytes}`);
  }
  if (typeof raw.fixtures !== 'object' || raw.fixtures === null) {
    throw new Error('size baseline needs a "fixtures" object of per-fixture evaluation numbers');
  }
  const fixtures = new Map();
  for (const [dir, value] of Object.entries(raw.fixtures)) {
    if (
      value === null ||
      typeof value !== 'object' ||
      typeof value.evalBytes !== 'number' ||
      typeof value.ownChunkBytes !== 'number' ||
      typeof value.sharedBytes !== 'number' ||
      typeof value.packages !== 'object' ||
      value.packages === null
    ) {
      throw new Error(
        `size baseline fixture "${dir}" must be { evalBytes, ownChunkBytes, sharedBytes, packages } ` +
          `(the old-rule evaluation breakdown)`,
      );
    }
    fixtures.set(dir, {
      evalBytes: value.evalBytes,
      ownChunkBytes: value.ownChunkBytes,
      sharedBytes: value.sharedBytes,
      packages: value.packages,
    });
  }
  return { page: { totalUniqueBytes, items }, fixtures };
}

/**
 * @param {{
 *   baseline: { page: { totalUniqueBytes: number, items: Record<string, number> }, fixtures: Map<string, { evalBytes: number }> };
 *   exceptions: Record<string, unknown>;
 *   page: { totalUniqueBytes: number, items: Map<string, number> } | undefined;
 *   fixtures: Map<string, { evalBytes: number }>;
 *   errors?: Map<string, string>;
 * }} input
 */
export function evaluate({ baseline, exceptions, page, fixtures, errors = new Map() }) {
  const failures = [];
  const fixtureRows = [];
  const baseItems = baseline.page.items;
  const curItems = page?.items ?? new Map();

  const items = [...new Set([...curItems.keys(), ...Object.keys(baseItems)])].sort().map((name) => ({
    name,
    baseline: baseItems[name] ?? 0,
    current: curItems.get(name) ?? 0,
    grown: (curItems.get(name) ?? 0) > (baseItems[name] ?? 0),
  }));

  let pageStatus = 'ok';
  if (page === undefined) {
    pageStatus = 'FAIL (not measured)';
    failures.push(`page: not measured - ${errors.get('(page)') ?? 'no build output'}`);
  } else {
    const delta = page.totalUniqueBytes - baseline.page.totalUniqueBytes;
    const grown = items.filter((item) => item.grown);
    if (delta > 0) {
      const uncovered = grown.filter((item) => {
        const reason = exceptions[item.name];
        return typeof reason !== 'string' || reason.trim().length === 0;
      });
      if (uncovered.length > 0) {
        pageStatus = `FAIL (+${delta}B over baseline)`;
        failures.push(
          `page: download grew ${baseline.page.totalUniqueBytes} -> ${page.totalUniqueBytes} (+${delta}B); ` +
            `no exception in ${EXCEPTIONS_REL} names grown item(s) with a reason: ` +
            uncovered.map((item) => `${item.name} (${item.baseline} -> ${item.current})`).join(', '),
        );
      } else {
        pageStatus = `exempted (+${delta}B): every grown item is named with a reason`;
      }
    }
  }

  for (const dir of [...baseline.fixtures.keys()].sort()) {
    const base = baseline.fixtures.get(dir);
    const entry = fixtures.get(dir);
    if (!entry) {
      failures.push(`${dir}: not measured - ${errors.get(dir) ?? 'no build output'}`);
      continue;
    }
    fixtureRows.push({ name: dir, baseline: base.evalBytes, current: entry.evalBytes });
  }
  for (const dir of [...fixtures.keys()].sort()) {
    if (!baseline.fixtures.has(dir)) {
      const entry = fixtures.get(dir);
      fixtureRows.push({ name: dir, baseline: 0, current: entry.evalBytes });
    }
  }
  return { failures, rows: { page: { status: pageStatus, items }, fixtures: fixtureRows } };
}

/**
 * Version drift across runtimes: every `<pkg>@<version>` directory the
 * shell and the fixture dists deliver, grouped by package name. A
 * package two runtimes carry at differing versions is drift — allowed
 * by the sharing model (each runtime loads exactly what it was built
 * with) and reported here.
 *
 * @param {string} rootDir
 * @param {string} shellDistRel
 * @param {string[]} fixtureDists
 * @returns {{ versions: Map<string, Set<string>> }}
 */
export function versionDrift(rootDir, shellDistRel, fixtureDists) {
  const versions = new Map();
  const scan = (distDir) => {
    let manifest = {};
    try {
      manifest = readManifest(distDir);
    } catch {
      // No manifest (the shell) — the shared dir convention still holds.
    }
    const base = sharedDir(distDir, manifest);
    if (!fs.existsSync(base)) return;
    const scanDir = (dir, scoped) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (scoped) {
          const match = /^(.*?)@([^@]+)$/.exec(entry.name);
          if (match) {
            const name = `${path.basename(dir)}/${match[1]}`;
            (versions.get(name) ?? versions.set(name, new Set()).get(name)).add(match[2]);
          }
          continue;
        }
        if (entry.name.startsWith('@')) {
          scanDir(path.join(dir, entry.name), true);
          continue;
        }
        const match = /^(.*?)@([^@]+)$/.exec(entry.name);
        if (match) {
          (versions.get(match[1]) ?? versions.set(match[1], new Set()).get(match[1])).add(match[2]);
        }
      }
    };
    scanDir(base, false);
  };
  scan(path.resolve(rootDir, shellDistRel));
  for (const distDir of fixtureDists) scan(distDir);
  return { versions };
}

function check({ rootDir, shellDistRel, log, logError }) {
  const baselinePath = path.join(rootDir, BASELINE_REL);
  const baseline = normalizeBaseline(readJson(baselinePath, 'size baseline'));

  const exceptionsPath = path.join(rootDir, EXCEPTIONS_REL);
  const exceptions = fs.existsSync(exceptionsPath) ? readJson(exceptionsPath, 'size-gate exceptions') : {};

  const names = [...new Set([...baseline.fixtures.keys(), ...findFixtures(rootDir)])].sort();
  const fixtures = [];
  const evalNow = new Map();
  const errors = new Map();
  for (const name of names) {
    const distDir = path.join(rootDir, MFE_PACKAGES_REL, name, 'dist');
    try {
      const m = fixtureEvaluationNew(distDir);
      evalNow.set(name, { evalBytes: m.totalBytes, ownChunkBytes: m.ownChunkBytes, sharedBytes: m.sharedBytes });
      fixtures.push({ name, distDir });
    } catch (error) {
      errors.set(name, error instanceof Error ? error.message : String(error));
    }
  }

  let page;
  try {
    page = measurePage({
      shellDist: path.resolve(rootDir, shellDistRel),
      fixtures,
      rule: 'new',
    });
  } catch (error) {
    errors.set('(page)', error instanceof Error ? error.message : String(error));
  }

  const { failures, rows } = evaluate({ baseline, exceptions, page, fixtures: evalNow, errors });

  // Number 1 — download per page.
  const cur = page?.totalUniqueBytes ?? 0;
  log(
    `[size-metric] page download: baseline=${baseline.page.totalUniqueBytes}B ` +
      `current=${cur}B ${rows.page.status}`,
  );
  for (const item of rows.page.items) {
    if (item.current === 0 && item.baseline === 0) continue;
    const reason = exceptions[item.name];
    log(
      `[size-metric]   ${item.name}: baseline=${item.baseline}B current=${item.current}B` +
        `${item.grown ? (typeof reason === 'string' && reason.trim() ? ` grown, excepted: ${reason.trim()}` : ' GROWN') : ''}`,
    );
  }
  // Number 2 — evaluation per extension (report only).
  for (const row of rows.fixtures) {
    log(`[size-metric]   eval ${row.name}: baseline=${row.baseline}B current=${row.current}B (report only)`);
  }
  // Version drift (report only): every
  // `package@version` the runtimes deliver, naming any package two or
  // more runtimes carry at differing versions.
  const drift = versionDrift(rootDir, shellDistRel, fixtures.map((f) => f.distDir));
  for (const [name, versions] of drift.versions) {
    if (versions.size > 1) {
      log(`[size-metric]   version drift: ${name} delivered at ${[...versions].sort().join(', ')}`);
    }
  }
  if (drift.versions.size > 0 && [...drift.versions.values()].every((v) => v.size === 1)) {
    log('[size-metric]   version drift: none — every delivered package@version agrees across runtimes');
  }
  if (failures.length > 0) {
    for (const failure of failures) logError(`[size-metric] FAIL: ${failure}`);
    return 1;
  }
  log(`[size-metric] PASS: page download within baseline or every grown item covered by a recorded exception`);
  return 0;
}

/**
 * @param {{
 *   rootDir?: string;
 *   argv?: string[];
 *   log?: (line: string) => void;
 *   logError?: (line: string) => void;
 * }} [options]
 * @returns {number} 0 on success, 1 on failure.
 */
export function runCli(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const argv = options.argv ?? [];
  const log = options.log ?? console.log;
  const logError = options.logError ?? console.error;

  try {
    const flag = (name) => {
      const i = argv.indexOf(name);
      if (i === -1) return undefined;
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${name} needs a value`);
      return value;
    };
    const shellDist = flag('--shell-dist');
    const capture = flag('--capture-old-rule');
    if (capture !== undefined) {
      const target = path.resolve(capture);
      const shellDistRel = shellDist !== undefined ? shellDist : DEFAULT_SHELL_DIST;
      log(JSON.stringify(captureOldRuleBaseline(target, { shellDistRel }), null, 2));
      return 0;
    }
    return check({ rootDir, shellDistRel: shellDist ?? DEFAULT_SHELL_DIST, log, logError });
  } catch (error) {
    logError(`[size-metric] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  process.exitCode = runCli({ argv: process.argv.slice(2) });
}
