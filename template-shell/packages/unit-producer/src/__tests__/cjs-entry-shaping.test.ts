import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer } from '../UnitProducer';

/**
 * Scenario: a CommonJS package's entry chunks are shaped
 * from package-determined inputs only. Two consumers of the same
 * `package@version` — each requesting a different entry — must mint
 * byte-identical chunks, including when a shared build-machine cache
 * serves the second producer the first one's raw Rollup output. The
 * cache must never smuggle already-shaped bytes back into shaping:
 * mangling is not idempotent, so re-shaping shaped bytes yields
 * different identifiers for identical content.
 *
 * Restored under the Rollup producer: the same byte-identity
 * guarantee holds when the bundler is the producer's pinned Rollup
 * with its commonjs interop rather than the prior esbuild pipeline,
 * and the third consumer exercises the cache-hit path a second time.
 */

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function tmpRoot(label: string): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), `unit-producer-cjs-${label}-`))
  );
  roots.push(root);
  return root;
}


/**
 * A multi-entry CommonJS package: an exports map with several subpath
 * entries, each a `.cjs` wrapper over a shared implementation module
 * — the react-style shape (index + jsx-runtime +
 * compiler-runtime wrappers over `cjs/*.production.js`). Named
 * exports are spelled as `module.exports = { alpha: impl.alpha }`
 * (`exports.X = …` and shorthand `{ X }` would also be detected;
 * this shape exercises the lexer's property-access arm).
 */
function installCjsPackage(root: string): void {
  const dir = join(root, 'node_modules', 'multi-cjs');
  write(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'multi-cjs',
      version: '1.0.0',
      type: 'commonjs',
      exports: {
        '.': './index.cjs',
        './alpha': './alpha.cjs',
        './beta': './beta.cjs',
      },
    })
  );
  write(
    join(dir, 'impl.cjs'),
    [
      '"use strict";',
      'function alphaValue(seed) {',
      '  const parts = [seed, "alpha"].filter(Boolean);',
      '  return parts.join("-") + ":" + parts.map((p) => p.length).reduce((a, b) => a + b, 0);',
      '}',
      'function betaValue(seed) {',
      '  const parts = [seed, "beta"].filter(Boolean);',
      '  return parts.join("-") + ":" + parts.map((p) => p.length).reduce((a, b) => a + b, 0);',
      '}',
      'module.exports = { alphaValue, betaValue };',
    ].join('\n')
  );
  write(
    join(dir, 'index.cjs'),
    [
      '"use strict";',
      'const impl = require("./impl.cjs");',
      'module.exports = {',
      '  alphaValue: impl.alphaValue,',
      '  betaValue: impl.betaValue,',
      '  version: "1.0.0",',
      '};',
    ].join('\n')
  );
  write(
    join(dir, 'alpha.cjs'),
    [
      '"use strict";',
      'const impl = require("./impl.cjs");',
      'module.exports = { alpha: impl.alphaValue };',
    ].join('\n')
  );
  write(
    join(dir, 'beta.cjs'),
    [
      '"use strict";',
      'const impl = require("./impl.cjs");',
      'module.exports = { beta: impl.betaValue };',
    ].join('\n')
  );
}

function makeConsumer(label: string): string {
  const root = tmpRoot(label);
  installCjsPackage(root);
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: `consumer-${label}`,
      version: '0.0.0',
      dependencies: { 'multi-cjs': '1.0.0' },
    })
  );
  return root;
}

function filesByBytes(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        walk(p);
      } else if (p.endsWith('.js')) {
        out.set(relative(dir, p).split('\\').join('/'), readFileSync(p, 'utf-8'));
      }
    }
  };
  walk(dir);
  return out;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('UnitProducer — CJS entry shaping is consumer-independent', () => {
  it('two consumers requesting different entries mint byte-identical CJS chunks over a shared cache', async () => {
    // One shared build-machine cache: consumer A's produce fills it,
    // consumer B's produce is served from it. B must emit the same
    // bytes A did — the cache's raw outputs must never be re-shaped.
    const cacheDir = join(tmpRoot('cache'), 'build-cache');
    const rootA = makeConsumer('a');
    const rootB = makeConsumer('b');

    const produce = async (root: string, specifiers: string[]) =>
      new UnitProducer({
        packageRoot: root,
        outputDir: join(root, 'out'),
        consumerSpecifiers: specifiers,
        cacheDir,
      }).produce((m) => {
        throw new Error(m);
      });

    const a = await produce(rootA, ['multi-cjs/alpha']);
    const b = await produce(rootB, ['multi-cjs/beta']);

    // Both consumers produce the same package, and the emitted chunk
    // file sets (content-addressed names) are identical.
    const unitsOf = (produced: typeof a) =>
      new Map(
        produced.flatMap((p) =>
          p.units.map((u) => [u.location, u.contentHash] as const)
        )
      );
    expect(unitsOf(b)).toEqual(unitsOf(a));

    // Byte identity, not just equal hashes, over every chunk file
    // both consumers emitted — `out/` holds only chunks the emitted
    // lists reference, so the published sets legitimately differ.
    const filesA = filesByBytes(join(rootA, 'out'));
    const filesB = filesByBytes(join(rootB, 'out'));
    const shared = [...filesA.keys()].filter((n) => filesB.has(n));
    expect(shared.length).toBeGreaterThan(0);
    for (const name of shared) {
      expect(filesB.get(name), name).toBe(filesA.get(name));
    }

    // A third consumer over the same cache — the second cache-hit
    // after A's fill and B's hit — still mints the same bytes.
    const rootC = makeConsumer('c');
    const c = await produce(rootC, ['multi-cjs', 'multi-cjs/alpha']);
    expect(unitsOf(c)).toEqual(unitsOf(a));
    const filesC = filesByBytes(join(rootC, 'out'));
    const sharedAC = [...filesA.keys()].filter((n) => filesC.has(n));
    expect(sharedAC.length).toBeGreaterThan(0);
    for (const name of sharedAC) {
      expect(filesC.get(name), name).toBe(filesA.get(name));
    }
  }, 120000);
});
