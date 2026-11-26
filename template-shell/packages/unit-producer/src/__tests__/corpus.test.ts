import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBuiltin } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SharedSetResolver } from '../SharedSetResolver';
import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';

/**
 * CORPUS-1 — the producer over real, exactly-pinned package shapes.
 *
 * The corpus packages are test inputs only: they are pinned at exact
 * versions (each published at least 7 days before pinning, mirrored in
 * this package's `devDependencies`). The suite installs them into a
 * directory of its own, so the corpus does not depend on how a
 * workspace install hoists this package's dependencies, and a synthetic
 * consumer links them into a throwaway `node_modules`. No corpus name
 * appears in production code.
 *
 * The three asserted properties:
 *  1. every entry of the derived shared set builds or is skipped with
 *     a valid reason;
 *  2. every specifier a produced list item reaches is answered —
 *     unless it is a built-in or a package the closure legitimately
 *     does not deliver (optional peers);
 *  3. two consumers requesting different subsets mint byte-identical
 *     package chunks (locations and content hashes).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = realpathSync(join(HERE, '..', '..'));
const NODE_MODULES = join(PACKAGE_DIR, 'node_modules');
// The build-machine cache lets re-runs (and CI) skip re-chunking the
// pinned package versions; bytes are shaped on every run regardless.
const CACHE_DIR = join(NODE_MODULES, '.cache', 'unit-producer-corpus');

/** The corpus: name → exact pinned version (mirrors devDependencies). */
const CORPUS: Record<string, string> = {
  react: '19.1.10',
  'react-dom': '19.1.10',
  'react-is': '19.1.10',
  'react-hook-form': '7.91.0',
  '@mui/material': '9.5.0',
  lodash: '4.18.1',
  'lodash-es': '4.18.1',
  'date-fns': '4.4.0',
  'lucide-react': '1.66.0',
  '@tanstack/react-query': '5.105.1',
  '@tanstack/react-router': '1.170.46',
  '@reduxjs/toolkit': '2.13.0',
  axios: '1.21.0',
  recharts: '3.10.1',
  zod: '4.6.7',
  '@hookform/resolvers': '7.0.1',
};

/**
 * Additional pinned packages the consumer declares so optional-peer
 * edges of corpus packages resolve to a delivered package (the way a
 * real consumer of them installs the styling engine).
 */
const EXTRA_DECLARED: Record<string, string> = {
  '@emotion/react': '11.14.0',
  '@emotion/styled': '11.14.1',
};

const REQUESTED_A = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'lodash',
  'lodash-es',
  'date-fns',
  'zod',
  'axios',
  '@reduxjs/toolkit',
  '@tanstack/react-query',
  '@tanstack/react-router',
  'recharts',
  '@hookform/resolvers/zod',
];

const REQUESTED_B = [
  'react',
  'react-dom/client',
  'lodash/fp',
  'date-fns/format',
  'lucide-react',
  '@tanstack/react-router',
  '@hookform/resolvers/zod',
  'zod/mini',
];

const tempRoots: string[] = [];

/**
 * The corpus install: the corpus and the extra declared packages at their
 * pinned versions, with one version of each package the dependents ask
 * for in different ranges. The producer fails a shared closure that
 * reaches two versions of one package, so the install overrides them as a
 * consumer of these packages must: `react-is` to the pinned one
 * (`prop-types` and `@mui/material` ask for other ranges) and `reselect`
 * to the 5.2.0 `recharts` pins exactly, which `@reduxjs/toolkit` accepts
 * (template-shell's own `reselect` override, for the same reason).
 * Installed once per corpus and reused while the corpus is unchanged.
 */
const CORPUS_MANIFEST = {
  name: 'unit-producer-corpus-install',
  version: '0.0.0',
  private: true,
  dependencies: { ...CORPUS, ...EXTRA_DECLARED },
  overrides: { 'react-is': CORPUS['react-is'], reselect: '5.2.0' },
};
const CORPUS_INSTALL = join(
  NODE_MODULES,
  '.cache',
  'unit-producer-corpus-install',
  createHash('sha256').update(JSON.stringify(CORPUS_MANIFEST)).digest('hex').slice(0, 16)
);
const CORPUS_MODULES = join(CORPUS_INSTALL, 'node_modules');
const CORPUS_READY = join(CORPUS_INSTALL, '.installed');

function installCorpus(): void {
  if (existsSync(CORPUS_READY)) return;
  rmSync(CORPUS_INSTALL, { recursive: true, force: true });
  mkdirSync(CORPUS_INSTALL, { recursive: true });
  writeFileSync(join(CORPUS_INSTALL, 'package.json'), `${JSON.stringify(CORPUS_MANIFEST, null, 2)}\n`);
  execFileSync(
    'npm',
    ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--no-package-lock', '--workspaces=false'],
    { cwd: CORPUS_INSTALL, stdio: 'pipe' }
  );
  writeFileSync(CORPUS_READY, '');
}

/**
 * A synthetic consumer: `dependencies` = the corpus names; its
 * `node_modules` symlinks every package of the corpus install, so
 * transitive closure packages (each corpus package's real
 * dependencies) locate exactly as node would locate them.
 */
function makeConsumer(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-corpus-')));
  tempRoots.push(root);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'corpus-consumer',
      version: '0.0.0',
      dependencies: { ...CORPUS, ...EXTRA_DECLARED },
    })
  );
  const nm = join(root, 'node_modules');
  mkdirSync(nm, { recursive: true });
  for (const entry of readdirSync(CORPUS_MODULES, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    if (entry.name.startsWith('@')) {
      const scopeDir = join(nm, entry.name);
      mkdirSync(scopeDir, { recursive: true });
      for (const inner of readdirSync(join(CORPUS_MODULES, entry.name))) {
        const link = join(scopeDir, inner);
        if (!existsSync(link)) {
          symlinkSync(join(CORPUS_MODULES, entry.name, inner), link, 'dir');
        }
      }
      continue;
    }
    const link = join(nm, entry.name);
    if (!existsSync(link)) symlinkSync(join(CORPUS_MODULES, entry.name), link, 'dir');
  }
  return root;
}

async function produce(
  root: string,
  consumerSpecifiers: string[]
): Promise<ProducedSharedPackage[]> {
  return new UnitProducer({
    packageRoot: root,
    outputDir: join(root, 'out'),
    consumerSpecifiers,
    cacheDir: CACHE_DIR,
  }).produce((m) => {
    throw new Error(m);
  });
}

function assertAnsweredSpecifiersResolve(
  produced: ProducedSharedPackage[],
  root: string
): void {
  const delivered = new Set(produced.map((p) => p.name));
  const answers = new Set<string>();
  for (const p of produced) {
    for (const list of Object.values(p.lists)) {
      for (const item of list.items) {
        for (const a of item.answers) answers.add(a);
      }
    }
  }
  for (const p of produced) {
    for (const [spec, list] of Object.entries(p.lists)) {
      for (const item of list.items) {
        for (const imp of item.imports) {
          if (typeof imp !== 'string') continue;
          if (isBuiltin(imp)) continue;
          const impRoot = SharedSetResolver.extractRootPackageName(imp);
          if (!delivered.has(impRoot)) continue; // optional peer / native external
          expect(
            answers.has(imp),
            `list "${spec}" of "${p.name}" reaches "${imp}", which no item answers`
          ).toBe(true);
        }
        const file = join(root, 'out', item.location);
        expect(existsSync(file), `emitted chunk ${item.location} exists`).toBe(true);
      }
    }
  }
}

afterAll(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe('UnitProducer — corpus (pinned real packages)', () => {
  beforeAll(() => {
    installCorpus();
  }, 600_000);

  it('every entry builds or is skipped with a reason; every answered specifier resolves', async () => {
    const root = makeConsumer();
    const produced = await produce(root, REQUESTED_A);
    const names = produced.map((p) => p.name);
    for (const name of Object.keys(CORPUS)) {
      expect(names, `corpus package ${name} is produced`).toContain(name);
    }
    for (const p of produced) {
      // Every skipped entry carries a reason naming what fails it.
      for (const s of p.skippedEntries ?? []) {
        expect(s.reason.length, `${p.name} ${s.entry} reason`).toBeGreaterThan(0);
        expect(s.entry.startsWith(`${p.name}/`) || s.entry === p.name).toBe(true);
      }
      // Every answered entry specifier has a chunk and, when
      // requested, a list.
      for (const [spec, location] of Object.entries(p.entryUnits)) {
        expect(
          p.units.some((u) => u.location === location),
          `${p.name}: ${spec} → ${location}`
        ).toBe(true);
      }
      for (const spec of Object.keys(p.lists)) {
        expect(p.entryUnits[spec], `${p.name}: ${spec} answered`).toBeDefined();
      }
    }
    assertAnsweredSpecifiersResolve(produced, root);
  }, 600_000);

  it('two consumers requesting different subsets mint byte-identical chunks', async () => {
    const rootA = makeConsumer();
    const rootB = makeConsumer();
    const a = await produce(rootA, REQUESTED_A);
    const b = await produce(rootB, REQUESTED_B);
    const byNameA = new Map(a.map((p) => [`${p.name}@${p.version}`, p]));
    const byNameB = new Map(b.map((p) => [`${p.name}@${p.version}`, p]));
    expect([...byNameA.keys()].sort()).toEqual([...byNameB.keys()].sort());
    for (const [key, pa] of byNameA) {
      const pb = byNameB.get(key)!;
      const unitsA = new Map(pa.units.map((u) => [u.location, u.contentHash]));
      const unitsB = new Map(pb.units.map((u) => [u.location, u.contentHash]));
      expect(unitsB, `${key} chunk set`).toEqual(unitsA);
      // Byte identity, not just equal hashes: compare bytes of every
      // emitted chunk file.
      for (const u of pa.units) {
        const fa = join(rootA, 'out', u.location);
        const fb = join(rootB, 'out', u.location);
        if (!existsSync(fa) || !existsSync(fb)) continue;
        expect(readFileSync(fb).equals(readFileSync(fa)), u.location).toBe(true);
      }
    }
  }, 600_000);
});
