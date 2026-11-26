// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import crypto from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MFES_HEAVY_MODULES,
  capabilityOf,
  findMfePackageDirs,
  heavyItemsOf,
  judge,
  resolveHeavyItems,
  runCli,
} from './evaluation-scope-check.mjs';

/** @type {string | undefined} */
let rootDir;

afterEach(async () => {
  if (rootDir) await rm(rootDir, { recursive: true, force: true });
  rootDir = undefined;
});

async function makeRoot() {
  rootDir = await mkdtemp(path.join(tmpdir(), 'frontx-scope-'));
  return rootDir;
}

async function write(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

/** @param {string} root */
function run(root) {
  /** @type {string[]} */
  const lines = [];
  const capture = (/** @type {string} */ line) => {
    lines.push(line);
  };
  const exitCode = runCli({ rootDir: root, log: capture, logError: capture });
  return { exitCode, output: lines.join('\n') };
}

const GTS = '@gears-frontx/gts-plugin';
const MFES = '@gears-frontx/mfes';
const FW = '@gears-frontx/framework';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** A list item: location under <pkg>@<ver>, answers, imports. */
const li = (location, answers = [], imports = []) => ({
  location,
  contentHash: sha(location),
  answers,
  imports,
});

const MFES_ITEMS = [
  li(`${MFES}@0.7.0/reg.${'0'.repeat(8)}.js`, [
    `${MFES}/dist/registry/MfeRegistry.js`,
    `${MFES}/dist/registry/MfeRegistryFactory.js`,
    `${MFES}/dist/runtime/DefaultMfeRegistry.js`,
    `${MFES}/dist/runtime/DefaultMfeRegistryFactory.js`,
  ]),
  li(`${MFES}@0.7.0/handler.${'0'.repeat(8)}.js`, [
    `${MFES}/dist/handler/MfeHandler.js`,
    `${MFES}/dist/handler/mfe-handler-mf/MfeHandlerMF.js`,
  ]),
  li(`${MFES}@0.7.0/med.${'0'.repeat(8)}.js`, [
    `${MFES}/dist/mediator/ActionsChainsMediator.js`,
    `${MFES}/dist/mediator/DefaultActionsChainsMediator.js`,
  ]),
  li(`${MFES}@0.7.0/act.${'0'.repeat(8)}.js`, [`${MFES}/dist/mediator/ActionHandler.js`]),
];

/** A reach result as fixtureScope returns it. */
function reach(pkgItems) {
  const reachedUnits = new Map();
  const reachedPackages = new Set();
  for (const [name, items] of Object.entries(pkgItems)) {
    reachedPackages.add(name);
    reachedUnits.set(name, new Set(items));
  }
  return { reachedUnits, reachedPackages };
}

describe('capabilityOf', () => {
  it('labels @gears-frontx/mfes dependents as nested hosts, everything else as child fixtures', () => {
    expect(capabilityOf({ [MFES]: '0.4.0' })).toBe('nested-host');
    expect(capabilityOf({ [MFES]: '0.4.0', [GTS]: '0.4.0' })).toBe('nested-host');
    expect(capabilityOf({ [GTS]: '0.4.0' })).toBe('child');
    expect(capabilityOf({ react: '19.0.0' })).toBe('child');
    expect(capabilityOf({})).toBe('child');
  });
});

describe('resolveHeavyItems', () => {
  it('binds the listed registry/loader/mediator specifiers to the emitted mfes items', () => {
    const heavy = resolveHeavyItems(MFES_ITEMS);
    expect(heavy.size).toBe(3);
    expect(heavy.has(MFES_ITEMS[3].contentHash)).toBe(false);
  });

  it('fails when a listed module specifier is answered by no emitted item', () => {
    expect(() => resolveHeavyItems([MFES_ITEMS[3]])).toThrow(/heavy-module/);
  });

  it('finds a heavy module by the file named for it when no unit answers its specifier', () => {
    const hash = 'a'.repeat(64);
    const named = li(`${MFES}@0.7.0/dist-registry-MfeRegistry.${hash}.js`, []);
    const rest = MFES_ITEMS.map((item) => ({
      ...item,
      answers: item.answers.filter((a) => !a.endsWith('/registry/MfeRegistry.js')),
    }));
    const heavy = resolveHeavyItems([...rest, named]);
    expect(heavy.has(named.contentHash)).toBe(true);
    // Emitted but unreferenced by the unit table: still present.
    expect(() => resolveHeavyItems(rest, [`${MFES}@0.7.0/dist-registry-MfeRegistry.${hash}.js`])).not.toThrow();
    expect(() => resolveHeavyItems(rest)).toThrow(/MfeRegistry\.js/);
  });
});

describe('heavyItemsOf', () => {
  it('binds nothing, and checks no drift, when the entry lists reach no mfes item', () => {
    const scope = { base: '/nonexistent', reachedUnits: new Map([[FW, new Set([li(`${FW}@1.0.0/i.js`, [FW])])]]) };
    expect(heavyItemsOf(scope)).toEqual(new Set());
  });
});

describe('judge', () => {
  const heavy = resolveHeavyItems(MFES_ITEMS);
  const [reg, handler, med, act] = MFES_ITEMS;
  const gtsItem = li(`${GTS}@0.7.0/index.${'0'.repeat(8)}.js`, [GTS]);

  it('fails a child that reaches ANY mfes registry, loader or mediator item', () => {
    const failures = judge('child', reach({ [MFES]: [reg] }), { heavyItems: heavy, hasCustomSchemas: false });
    expect(failures.join('\n')).toMatch(/registry\/loader\/mediator/);
  });

  it('fails a child reaching a heavy module even alongside light mfes modules', () => {
    const failures = judge('child', reach({ [MFES]: [act, handler] }), {
      heavyItems: heavy,
      hasCustomSchemas: true,
    });
    expect(failures.join('\n')).toMatch(/MfeHandlerMF/);
  });

  it('allows a child light mfes modules (ActionHandler) but no type system without custom schemas', () => {
    expect(judge('child', reach({ [MFES]: [act] }), { heavyItems: heavy, hasCustomSchemas: false })).toEqual([]);
    const withGts = judge('child', reach({ [GTS]: [gtsItem], [MFES]: [act] }), {
      heavyItems: heavy,
      hasCustomSchemas: false,
    });
    expect(withGts.join('\n')).toMatch(/gts-plugin/);
  });

  it('allows a child with declared custom action schemas to reach the type system', () => {
    expect(judge('child', reach({ [GTS]: [gtsItem] }), { heavyItems: heavy, hasCustomSchemas: true })).toEqual([]);
  });

  it('requires a nested host to reach both the type system and the mfes runtime', () => {
    expect(judge('nested-host', reach({ [GTS]: [gtsItem], [MFES]: [reg, act] }), {
      heavyItems: heavy,
      hasCustomSchemas: true,
    })).toEqual([]);
    const failures = judge('nested-host', reach({ [GTS]: [gtsItem] }), {
      heavyItems: heavy,
      hasCustomSchemas: true,
    });
    expect(failures.join('\n')).toMatch(/mfes.*NOT reachable/i);
  });
});

/**
 * Writes one synthetic fixture holding its lists in the manifest:
 * package.json deps, mfe.json (optionally with `schemas`), a dist manifest
 * with `units` and `lists`, and the shared dir's chunks.
 *
 * @param {string} root
 * @param {string} name
 * `unreachedItems` go in the unit table only, named by no list: output the
 * fixture emits but no load evaluates.
 *
 * @param {{ deps?: Record<string,string>, schemas?: unknown[], items?: Array<ReturnType<typeof li>>, unreachedItems?: Array<ReturnType<typeof li>>, manifest?: object | null }} opts
 */
async function writeFixture(root, name, { deps = {}, schemas, items = [], unreachedItems = [], manifest } = {}) {
  const dir = path.join(root, 'template-mfe', 'src-app', 'mfe_packages', name);
  await write(path.join(dir, 'package.json'), JSON.stringify({ name, dependencies: deps }));
  const mfeJson = { templateExample: true, manifest: { id: `m.${name}`, remoteEntry: 'http://x/r.js' } };
  if (schemas !== undefined) mfeJson.schemas = schemas;
  await write(path.join(dir, 'mfe.json'), JSON.stringify(mfeJson));
  if (manifest === null) return;
  const full = manifest ?? {
    name,
    metaData: { sharedBase: './shared/' },
    units: [...items, ...unreachedItems],
    lists: { './lifecycle': { units: items.map((item) => item.contentHash), ownChunks: [] } },
  };
  await write(path.join(dir, 'dist', 'mfe-manifest.json'), JSON.stringify({ manifest: full }));
  // Every chunk the unit table names.
  for (const item of [...items, ...unreachedItems]) {
    await write(path.join(dir, 'dist', 'shared', item.location), `// ${item.location}\n`);
  }
}

describe('runCli', () => {
  it('passes when children stay light and nested hosts reach both runtimes', async () => {
    const root = await makeRoot();
    const gtsItem = li(`${GTS}@0.7.0/index.${'0'.repeat(8)}.js`, [GTS]);
    const fwItem = li(`${FW}@1.0.0/index.${'0'.repeat(8)}.js`, [FW]);
    // child: framework only — no gts, no heavy mfes.
    await writeFixture(root, 'kid', { deps: { react: '19' }, items: [fwItem] });
    // nested host: reaches GTS + mfes (heavy items present on its lists).
    await writeFixture(root, 'hosty', {
      deps: { [MFES]: '0.4.0', [GTS]: '0.4.0' },
      items: [fwItem, gtsItem, ...MFES_ITEMS],
    });
    const { exitCode, output } = run(root);
    expect(output).toMatch(/PASS/);
    expect(exitCode).toBe(0);
  });

  it('fails a child whose lists reach the mfes registry', async () => {
    const root = await makeRoot();
    await writeFixture(root, 'kid', { deps: { react: '19' }, items: MFES_ITEMS });
    await writeFixture(root, 'hosty', {
      deps: { [MFES]: '0.4.0' },
      items: [...MFES_ITEMS, li(`${GTS}@0.7.0/index.${'0'.repeat(8)}.js`, [GTS])],
    });
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toMatch(/kid \(child\).*registry\/loader\/mediator/s);
  });

  it('fails a child reaching the type system with no declared schemas, and fails closed on missing coverage', async () => {
    const root = await makeRoot();
    await writeFixture(root, 'kid', {
      deps: { react: '19' },
      items: [li(`${GTS}@0.7.0/index.${'0'.repeat(8)}.js`, [GTS])],
    });
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toMatch(/gts-plugin/);
    expect(output).toMatch(/no fixture covers the "nested-host" capability/);
  });

  it('skips the heavy-list drift check for a leaf whose entry lists reach no mfes item', async () => {
    const root = await makeRoot();
    const gtsItem = li(`${GTS}@0.7.0/index.${'0'.repeat(8)}.js`, [GTS]);
    const fwItem = li(`${FW}@1.0.0/index.${'0'.repeat(8)}.js`, [FW]);
    const [, , , act] = MFES_ITEMS;
    // The leaf's output carries a partial mfes slice (no heavy module at
    // all) on a list no entry reaches.
    await writeFixture(root, 'kid', { deps: { react: '19' }, items: [fwItem], unreachedItems: [act] });
    await writeFixture(root, 'hosty', {
      deps: { [MFES]: '0.4.0', [GTS]: '0.4.0' },
      items: [fwItem, gtsItem, ...MFES_ITEMS],
    });
    const { exitCode, output } = run(root);
    expect(output).not.toMatch(/heavy-module list out of sync/);
    expect(output).toMatch(/kid: child .*heavy mfes modules: none/);
    expect(output).toMatch(/PASS/);
    expect(exitCode).toBe(0);
  });

  it('still fails the drift check for a host whose emitted mfes items miss a heavy specifier', async () => {
    const root = await makeRoot();
    const gtsItem = li(`${GTS}@0.7.0/index.${'0'.repeat(8)}.js`, [GTS]);
    const [reg, , , act] = MFES_ITEMS;
    await writeFixture(root, 'kid', { deps: { react: '19' }, items: [] });
    await writeFixture(root, 'hosty', { deps: { [MFES]: '0.4.0', [GTS]: '0.4.0' }, items: [gtsItem, reg, act] });
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toMatch(/hosty: heavy-module list out of sync/);
    expect(output).toMatch(/MfeHandlerMF\.js/);
  });

  it('still fails a leaf whose entry lists reach a heavy mfes item', async () => {
    const root = await makeRoot();
    const gtsItem = li(`${GTS}@0.7.0/index.${'0'.repeat(8)}.js`, [GTS]);
    const [reg, handler, med, act] = MFES_ITEMS;
    // The leaf reaches the loader; the rest of the mfes output is emitted
    // but unreached.
    await writeFixture(root, 'kid', { deps: { react: '19' }, items: [act, handler], unreachedItems: [reg, med] });
    await writeFixture(root, 'hosty', { deps: { [MFES]: '0.4.0', [GTS]: '0.4.0' }, items: [gtsItem, ...MFES_ITEMS] });
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toMatch(/kid \(child\): @gears-frontx\/mfes registry\/loader\/mediator reachable: .*MfeHandlerMF\.js/);
  });

  it('fails a fixture without a built manifest', async () => {
    const root = await makeRoot();
    await writeFixture(root, 'kid', { deps: {}, manifest: null });
    const { exitCode, output } = run(root);
    expect(exitCode).toBe(1);
    expect(output).toMatch(/no emitted manifest/);
  });
});
