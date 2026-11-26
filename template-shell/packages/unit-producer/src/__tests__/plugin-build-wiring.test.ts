/**
 * Scenario: the wiring both Vite plugins share. The `external` chain
 * answers the sharing rule first and then the project's own option in
 * every form Rollup accepts, in every environment's build; the fallback
 * reproduction covers what the chunks import after the barrel fallback,
 * removes only the files its first pass wrote and merges both runs' cache
 * outcomes.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ExternalChain, FallbackReproduction } from '../PluginBuildWiring';
import type { PackageCacheSummary } from '../PackageCacheReport';
import type { ProducedSharedPackage, UnitProducer } from '../UnitProducer';

const never = (): boolean => false;
type ExternalFn = (s: string, i: string | undefined, r: boolean) => boolean;

describe('ExternalChain.chain', () => {
  it('answers the sharing rule first', () => {
    const external = ExternalChain.chain((s) => s === 'shared', 'other');
    expect(external('shared', undefined, false)).toBe(true);
    expect(external('other', undefined, false)).toBe(true);
    expect(external('neither', undefined, false)).toBe(false);
  });

  it('answers each form the previous option can take', () => {
    expect(ExternalChain.chain(never, undefined)('x', undefined, false)).toBe(false);
    expect(ExternalChain.chain(never, 'x')('x', undefined, false)).toBe(true);
    expect(ExternalChain.chain(never, /^x\//)('x/y', undefined, false)).toBe(true);
    expect(ExternalChain.chain(never, ['a', /^b/])('bb', undefined, false)).toBe(true);
    expect(ExternalChain.chain(never, ['a', /^b/])('c', undefined, false)).toBe(false);
    const fn = ExternalChain.chain(never, (s, importer, resolved) => s === 'f' && importer === 'i' && resolved);
    expect(fn('f', 'i', true)).toBe(true);
    expect(fn('f', 'i', false)).toBe(false);
  });

  it('never externalizes what a bundled importer imports, whatever the project configured', () => {
    const external = ExternalChain.chain(
      (s) => s === 'shared',
      ['other'],
      (importer) => importer === 'fill'
    );
    expect(external('shared', 'fill', false)).toBe(false);
    expect(external('other', 'fill', false)).toBe(false);
    expect(external('shared', 'app', false)).toBe(true);
  });

  it('reads a null or undefined function answer as not external', () => {
    expect(ExternalChain.chain(never, () => null)('x', undefined, false)).toBe(false);
    expect(ExternalChain.chain(never, () => undefined)('x', undefined, false)).toBe(false);
  });
});

describe('ExternalChain.install', () => {
  it('wraps the build and every environment build', () => {
    const top = { rollupOptions: { external: 'top' as unknown } };
    const client = { rollupOptions: { external: 'c' as unknown } };
    const ssr = { rollupOptions: { external: [/^s/] as unknown } };
    const bare = { rollupOptions: {} as { external?: unknown } };
    ExternalChain.install(
      { build: top, environments: { client: { build: client }, ssr: { build: ssr }, bare: { build: bare } } },
      (s) => s === 'shared'
    );
    for (const [options, own] of [
      [top.rollupOptions, 'top'],
      [client.rollupOptions, 'c'],
      [ssr.rollupOptions, 'sx'],
    ] as const) {
      const external = options.external as ExternalFn;
      expect(typeof external).toBe('function');
      expect(external('shared', undefined, false)).toBe(true);
      expect(external(own, undefined, false)).toBe(true);
      expect(external('nope', undefined, false)).toBe(false);
    }
    expect((bare.rollupOptions.external as ExternalFn)('shared', undefined, false)).toBe(true);
  });

  it('wraps a rollupOptions object shared by several builds once', () => {
    let calls = 0;
    const rollupOptions = { external: undefined as unknown };
    ExternalChain.install(
      { build: { rollupOptions }, environments: { client: { build: { rollupOptions } } } },
      () => {
        calls += 1;
        return false;
      }
    );
    (rollupOptions.external as ExternalFn)('x', undefined, false);
    expect(calls).toBe(1);
  });

  it('creates rollupOptions where a build has none', () => {
    const build = {} as { rollupOptions?: { external?: unknown } };
    ExternalChain.install({ build }, (s) => s === 'shared');
    expect((build.rollupOptions?.external as ExternalFn)('shared', undefined, false)).toBe(true);
  });
});

describe('FallbackReproduction.specifiers', () => {
  const base = { consumerSpecifiers: ['a', 'ui/x'], dynamicSpecifiers: new Set<string>() };
  it('is undefined when the chunks import the same specifiers', () => {
    expect(
      FallbackReproduction.specifiers({ ...base, importedBefore: new Set(['a']), importedAfter: new Set(['a']) })
    ).toBeUndefined();
  });
  it('swaps a dropped specifier for the added one', () => {
    expect(
      FallbackReproduction.specifiers({ ...base, importedBefore: new Set(['a', 'ui/x']), importedAfter: new Set(['a', 'ui']) })
    ).toEqual(['a', 'ui']);
  });
  it('covers a drop with nothing added', () => {
    expect(
      FallbackReproduction.specifiers({ ...base, importedBefore: new Set(['a', 'ui/x']), importedAfter: new Set(['a']) })
    ).toEqual(['a']);
  });
  it('keeps a dropped specifier a chunk still imports dynamically', () => {
    expect(
      FallbackReproduction.specifiers({
        ...base,
        dynamicSpecifiers: new Set(['ui/x']),
        importedBefore: new Set(['a', 'ui/x']),
        importedAfter: new Set(['a', 'ui']),
      })
    ).toEqual(['a', 'ui', 'ui/x']);
  });
});

describe('FallbackReproduction.mergeCache', () => {
  it('keeps the first outcome of a shared package and every package of either run', () => {
    const first: PackageCacheSummary = {
      hits: 0,
      misses: 2,
      packages: [
        { name: 'a', version: '1.0.0', outcome: 'miss' },
        { name: 'b', version: '1.0.0', outcome: 'miss' },
      ],
    };
    const second: PackageCacheSummary = {
      hits: 2,
      misses: 0,
      packages: [
        { name: 'a', version: '1.0.0', outcome: 'hit' },
        { name: 'c', version: '1.0.0', outcome: 'hit' },
      ],
    };
    expect(FallbackReproduction.mergeCache(first, second)).toEqual({
      hits: 1,
      misses: 2,
      packages: [
        { name: 'a', version: '1.0.0', outcome: 'miss' },
        { name: 'b', version: '1.0.0', outcome: 'miss' },
        { name: 'c', version: '1.0.0', outcome: 'hit' },
      ],
    });
  });
});

describe('FallbackReproduction.run', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function fakeProducer(outputDir: string, files: string[], name: string, outcome: 'hit' | 'miss') {
    return {
      produce: async () => {
        for (const f of files) {
          mkdirSync(join(outputDir, f, '..'), { recursive: true });
          writeFileSync(join(outputDir, f), 'u');
        }
        return [{ name } as ProducedSharedPackage];
      },
      cacheOutcomes: (): PackageCacheSummary => ({
        hits: outcome === 'hit' ? 1 : 0,
        misses: outcome === 'miss' ? 1 : 0,
        packages: [{ name, version: '1.0.0', outcome }],
      }),
    } as unknown as UnitProducer;
  }

  it('removes only what the first pass wrote before the second', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'reproduce-'));
    dirs.push(dist);
    const out = join(dist, 'shared');
    mkdirSync(out);
    writeFileSync(join(out, 'keep.txt'), 'not a unit');
    let imported = new Set(['ui/x']);
    const seen: string[][] = [];
    const result = await FallbackReproduction.run({
      producerFor: (specifiers) => {
        seen.push([...specifiers]);
        return seen.length === 1
          ? fakeProducer(out, ['first/a.js', 'both.js'], 'one', 'miss')
          : fakeProducer(out, ['both.js', 'second.js'], 'two', 'hit');
      },
      outputDir: out,
      consumerSpecifiers: ['ui/x'],
      dynamicSpecifiers: new Set(),
      importedNow: () => imported,
      applyFallback: () => {
        imported = new Set(['ui']);
      },
      onError: (m) => {
        throw new Error(m);
      },
    });
    expect(seen).toEqual([['ui/x'], ['ui']]);
    expect(readdirSync(out).sort()).toEqual(['both.js', 'keep.txt', 'second.js']);
    expect(existsSync(join(out, 'first'))).toBe(false);
    expect(result.cache.packages.map((p) => p.name)).toEqual(['one', 'two']);
  });

  it('produces once when the fallback changes nothing', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'reproduce-'));
    dirs.push(dist);
    let runs = 0;
    await FallbackReproduction.run({
      producerFor: () => {
        runs += 1;
        return fakeProducer(dist, ['u.js'], 'one', 'miss');
      },
      outputDir: dist,
      consumerSpecifiers: ['ui'],
      dynamicSpecifiers: new Set(),
      importedNow: () => new Set(['ui']),
      applyFallback: () => {},
      onError: (m) => {
        throw new Error(m);
      },
    });
    expect(runs).toBe(1);
  });
});
