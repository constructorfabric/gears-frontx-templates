/**
 * MFE evaluation-scope gate,
 * list model. The runtime performs no reach walk — the gate walks the
 * EMITTED per-entry fetch lists: every item on every entry's combined
 * lists (the manifest's `lists`, nested `lazy`/`patterns` lists included)
 * is code a load of that fixture can evaluate.
 *
 * Two fixture classes, derived structurally from each fixture's own
 * declared `dependencies` (the shared set over the build graph the plugin resolves):
 *
 *   - child fixture: no `@gears-frontx/mfes` declared. A child must reach
 *     NO mfes item answering a registry, loader (`MfeHandler` /
 *     `MfeHandlerMF`) or mediator module specifier — the heavy module
 *     paths bound by `resolveHeavyItems` — and no
 *     `@gears-frontx/gts-plugin` item unless the fixture declares custom
 *     action schemas (a non-empty `schemas[]` in its `mfe.json`). Small
 *     mfes modules a child legitimately uses — `mediator/ActionHandler.js`,
 *     errors, bridge interfaces — are fine.
 *   - nested host: `@gears-frontx/mfes` declared (the fixture genuinely
 *     builds a registry — `demo-mfe`, `widgets-fixture-a`). It must reach
 *     BOTH the type system and the mfes runtime.
 *
 * Both classes must be represented; an unrepresented class fails closed.
 *
 * The gate reads `dist/mfe-manifest.json` per fixture, so it runs after
 * the fixture builds (the CI job builds each fixture with the real
 * `vite-plugin-mfe-gts` first; locally, `vite build` in each fixture dir).
 *
 * CLI entry: `node scripts/evaluation-scope-check.mjs` (exit 0 on success).
 * Core logic is exported for unit tests in
 * `scripts/evaluation-scope-check.test.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { packageOfLocation, readEntryLists, sharedDir } from './shared-unit-reach.mjs';

const MFE_PACKAGES_REL = path.join('template-mfe', 'src-app', 'mfe_packages');
const MANIFEST_REL = path.join('dist', 'mfe-manifest.json');

const GTS_PLUGIN = '@gears-frontx/gts-plugin';
const MFES_RUNTIME = '@gears-frontx/mfes';
const CAPABILITIES = ['child', 'nested-host'];

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

/**
 * Discovers MFE fixture dirs the way the shell's scanners do: a directory
 * carrying an `mfe.json`, not starting with `.`, not `shared`.
 *
 * @param {string} mfePackagesDir
 * @returns {string[]} absolute fixture dir paths, sorted by name.
 */
export function findMfePackageDirs(mfePackagesDir) {
  if (!fs.existsSync(mfePackagesDir)) return [];
  return fs
    .readdirSync(mfePackagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'shared')
    .map((entry) => path.join(mfePackagesDir, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'mfe.json')))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Fixture class from its declared dependencies: `@gears-frontx/mfes`
 * declared means the fixture is a nested host (it genuinely builds a
 * registry); anything else is a child fixture.
 *
 * @param {Record<string, string>} dependencies
 * @returns {'child' | 'nested-host'}
 */
export function capabilityOf(dependencies) {
  return dependencies[MFES_RUNTIME] !== undefined ? 'nested-host' : 'child';
}

/**
 * Module paths (the package's preserved-module ESM `dist/` specifiers the
 * produced items answer, e.g. `@gears-frontx/mfes/dist/registry/MfeRegistry.js`)
 * of the heavy mfes runtime a child fixture must not load: the registry,
 * the loader (`MfeHandler` / `MfeHandlerMF`) and the actions-chains
 * mediator. Small modules a child legitimately uses —
 * `mediator/ActionHandler.js`, errors, bridge interfaces — are not
 * listed. The list is bound to the mfes output by module path: a module
 * is present when a unit answers its specifier or a file the output
 * emitted for it carries its name (`resolveHeavyItems`).
 */
export const MFES_HEAVY_MODULES = Object.freeze([
  // registry
  'dist/registry/MfeRegistry.js',
  'dist/registry/MfeRegistryFactory.js',
  'dist/runtime/DefaultMfeRegistry.js',
  'dist/runtime/DefaultMfeRegistryFactory.js',
  // loader
  'dist/handler/MfeHandler.js',
  'dist/handler/mfe-handler-mf/MfeHandlerMF.js',
  // mediator
  'dist/mediator/ActionsChainsMediator.js',
  'dist/mediator/DefaultActionsChainsMediator.js',
]);

/** The specifier spellings an mfes item answers for each heavy module. */
const HEAVY_SPECIFIERS = MFES_HEAVY_MODULES.map((m) => `${MFES_RUNTIME}/${m}`);

/**
 * Binds `MFES_HEAVY_MODULES` to the emitted output by module path: returns
 * the set of mfes units — across the unit table the output's manifest
 * carries — that answer a heavy module specifier or are the chunk named for
 * a heavy module. Throws when a listed module is present as no unit and as
 * no emitted file — the list drifted from the shipped package and must be
 * updated, never silently dropped.
 *
 * @param {Array<{ location: string, contentHash?: string, answers?: string[] }>} mfesItems every mfes unit of the output
 * @param {string[]} [emittedFiles] the output's mfes files, relative to the shared directory
 * @returns {Set<string>} the content identities of the heavy items
 */
export function resolveHeavyItems(mfesItems, emittedFiles = []) {
  const answered = new Set();
  for (const item of mfesItems) {
    for (const specifier of item.answers ?? []) answered.add(specifier);
  }
  // A module is also present when the output holds a file named for it —
  // `<stem>.<sha256>.js`, the producer's content-addressed chunk name — so a
  // small module the unit table does not answer by specifier is still found
  // by its module path.
  const named = (m) => {
    const stem = heavyStem(m);
    return [...mfesItems.map((i) => i.location), ...emittedFiles].some((file) =>
      new RegExp(`(^|/)${escapeRegExp(stem)}\\.[0-9a-f]{64}\\.js$`).test(file),
    );
  };
  const missing = MFES_HEAVY_MODULES.filter(
    (m) => !answered.has(`${MFES_RUNTIME}/${m}`) && !named(m),
  );
  if (missing.length > 0) {
    throw new Error(
      `heavy-module list out of sync with the emitted @gears-frontx/mfes output: ` +
        `modules present as no unit and no file: ${missing.join(', ')}`,
    );
  }
  const heavy = new Set(HEAVY_SPECIFIERS);
  const heavyStems = MFES_HEAVY_MODULES.map(heavyStem);
  const isHeavy = (item) =>
    (item.answers ?? []).some((a) => heavy.has(a)) ||
    heavyStems.some((stem) =>
      new RegExp(`(^|/)${escapeRegExp(stem)}\\.[0-9a-f]{64}\\.js$`).test(item.location),
    );
  return new Set(mfesItems.filter(isHeavy).map((item) => item.contentHash));
}

/** The chunk-name stem the producer gives a module path: extension stripped, non-filename characters collapsed to `-`. */
function heavyStem(modulePath) {
  return modulePath.replace(/\.[cm]?[jt]sx?$/, '').replace(/[^\w$.-]+/g, '-');
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every file the output's shared directory holds for the mfes package, relative to it. */
function mfesFiles(base) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  };
  // The package directory is `<scope>/<name>@<version>` (`@gears-frontx/mfes@0.7.0`).
  const [scope, name] = MFES_RUNTIME.split('/');
  const scopeDir = path.join(base, scope);
  if (fs.existsSync(scopeDir)) {
    for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith(`${name}@`)) walk(path.join(scopeDir, entry.name));
    }
  }
  return out;
}

/**
 * The heavy mfes items of one fixture's output. The drift check of
 * `resolveHeavyItems` binds the heavy-module list to every mfes item the
 * OUTPUT emits — not just the slice the fixture's entries reach — so a
 * drifted list surfaces instead of silently disabling the check. It runs
 * only where the fixture's entry lists reach an mfes item: an output whose
 * entries reach none (a leaf) may still carry a partial mfes slice no load
 * evaluates, which says nothing about the shipped package, and with no
 * mfes item reached there is nothing heavy for the verdict to find.
 *
 * @param {{ manifest: { units?: object[] }, reachedUnits: Map<string, Set<object>> }} scope as `fixtureScope` returns it
 * @returns {Set<string>} the content identities of the heavy items
 */
export function heavyItemsOf(scope) {
  if ((scope.reachedUnits.get(MFES_RUNTIME)?.size ?? 0) === 0) return new Set();
  const emitted = (scope.manifest.units ?? []).filter(
    (item) => packageOfLocation(item.location) === MFES_RUNTIME,
  );
  return resolveHeavyItems(emitted, mfesFiles(scope.base));
}

/**
 * Failures of one fixture's emitted lists against its class's rule.
 *
 *   - child: no reached mfes item may be heavy (registry / loader /
 *     mediator); no `@gears-frontx/gts-plugin` item unless the fixture
 *     declared custom action schemas;
 *   - nested-host: both `@gears-frontx/gts-plugin` and
 *     `@gears-frontx/mfes` must be reachable.
 *
 * @param {'child' | 'nested-host'} capability
 * @param {{ reachedPackages: Set<string>, reachedUnits: Map<string, Set<object>> }} reach
 * @param {{ heavyItems: Set<string>, hasCustomSchemas: boolean }} options
 * @returns {string[]}
 */
export function judge(capability, reach, { heavyItems, hasCustomSchemas }) {
  const failures = [];
  const has = (name) => reach.reachedPackages.has(name);
  const units = (name) => reach.reachedUnits.get(name)?.size ?? 0;
  if (capability === 'nested-host') {
    for (const name of [GTS_PLUGIN, MFES_RUNTIME]) {
      if (!has(name)) failures.push(`${name} NOT reachable`);
    }
    return failures;
  }
  const heavy = [];
  for (const item of reach.reachedUnits.get(MFES_RUNTIME) ?? []) {
    if (heavyItems.has(item.contentHash)) {
      heavy.push(...(item.answers ?? []).filter((a) => HEAVY_SPECIFIERS.includes(a)));
    }
  }
  if (heavy.length > 0) {
    failures.push(`${MFES_RUNTIME} registry/loader/mediator reachable: ${[...new Set(heavy)].sort().join(', ')}`);
  }
  if (has(GTS_PLUGIN) && !hasCustomSchemas) {
    failures.push(`${GTS_PLUGIN} reachable (${units(GTS_PLUGIN)} unit(s)) with no custom action schemas declared`);
  }
  return failures;
}

/**
 * Evaluation scope of one fixture: every item on every entry's combined
 * lists — the bytes a load of that fixture can evaluate.
 *
 * @param {string} distDir
 */
export function fixtureScope(distDir) {
  const { manifest, base, entries } = readEntryLists(distDir);
  const reachedUnits = new Map();
  const reachedPackages = new Set();
  for (const { doc } of entries.flatMap((e) => e.docs)) {
    for (const item of doc.items) {
      const name = packageOfLocation(item.location) ?? '(unattributed shared)';
      reachedPackages.add(name);
      let set = reachedUnits.get(name);
      if (set === undefined) reachedUnits.set(name, (set = new Set()));
      set.add(item);
    }
  }
  return { manifest, base, reachedUnits, reachedPackages };
}

function check({ rootDir, log, logError }) {
  const mfePackagesDir = path.join(rootDir, MFE_PACKAGES_REL);
  const dirs = findMfePackageDirs(mfePackagesDir);
  if (dirs.length === 0) {
    logError(`[evaluation-scope] FAIL: no MFE fixtures found under ${mfePackagesDir}`);
    return 1;
  }

  const failures = [];
  const covered = new Set();
  for (const dir of dirs) {
    const name = path.basename(dir);
    const pkg = readJson(path.join(dir, 'package.json'), `${name} package.json`);
    const capability = capabilityOf(pkg.dependencies ?? {});
    covered.add(capability);
    const mfeJson = readJson(path.join(dir, 'mfe.json'), `${name} mfe.json`);
    const hasCustomSchemas = Array.isArray(mfeJson.schemas) && mfeJson.schemas.length > 0;

    const manifestPath = path.join(dir, MANIFEST_REL);
    if (!fs.existsSync(manifestPath)) {
      failures.push(`${name}: no emitted manifest at ${manifestPath} - build the fixture first`);
      continue;
    }
    let scope;
    try {
      scope = fixtureScope(path.dirname(manifestPath));
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    let heavyItems;
    try {
      heavyItems = heavyItemsOf(scope);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const reach = { reachedUnits: scope.reachedUnits, reachedPackages: scope.reachedPackages };
    const reachable = [...reach.reachedPackages].sort();
    for (const failure of judge(capability, reach, { heavyItems, hasCustomSchemas })) {
      failures.push(
        `${name} (${capability}): ${failure} (reachable shared set: ${reachable.join(', ') || '(none)'})`,
      );
    }
    const runtimeUnits = [GTS_PLUGIN, MFES_RUNTIME]
      .map((pkgName) => `${pkgName}=${reach.reachedUnits.get(pkgName)?.size ?? 0}`)
      .join(' ');
    const heavy = [
      ...new Set(
        [...(reach.reachedUnits.get(MFES_RUNTIME) ?? [])]
          .filter((item) => heavyItems.has(item.contentHash))
          .flatMap((item) => (item.answers ?? []).filter((a) => HEAVY_SPECIFIERS.includes(a))),
      ),
    ].sort();
    log(
      `[evaluation-scope] ${name}: ${capability}${hasCustomSchemas ? ' (custom schemas)' : ''} -> ` +
        `${reachable.length} package(s) reached on the emitted entry lists; units ${runtimeUnits}; ` +
        `heavy mfes modules: ${heavy.join(', ') || 'none'}`,
    );
  }

  for (const capability of CAPABILITIES) {
    if (!covered.has(capability)) {
      failures.push(`no fixture covers the "${capability}" capability`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) logError(`[evaluation-scope] FAIL: ${failure}`);
    return 1;
  }
  log(`[evaluation-scope] PASS: ${dirs.length} fixture(s) — children stay light, nested hosts reach both runtimes`);
  return 0;
}

/**
 * @param {{
 *   rootDir?: string;
 *   log?: (line: string) => void;
 *   logError?: (line: string) => void;
 * }} [options]
 * @returns {number} 0 on success, 1 on failure.
 */
export function runCli(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const log = options.log ?? console.log;
  const logError = options.logError ?? console.error;

  try {
    return check({ rootDir, log, logError });
  } catch (error) {
    logError(`[evaluation-scope] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  process.exitCode = runCli();
}
