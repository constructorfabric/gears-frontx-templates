/**
 * Behavioural tests for the native boot model:
 * `ImportMapComposer` generates the inline import map — own-dist URLs
 * only, the host chunks' specifiers at the top level, shared chunks'
 * bare imports under their package-directory scopes, sorted, with the
 * `sha256-…` CSP token — and `ShellCacheFill` refills the realm
 * content-identity text cache from the boot list through the shared
 * unit fetcher.
 */

import { createHash } from 'node:crypto';

import { SharedUnitFetcher } from '@gears-frontx/mfes/unit-loader';
import type { SharedDepUnit } from '@gears-frontx/mfes/unit-format';
import { describe, expect, it, vi } from 'vitest';

import { ImportMapComposer } from '../ImportMapComposer';
import { ShellCacheFill } from '../runtime/ShellCacheFill';

const sha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf-8').digest('hex');

function item(
  location: string,
  text: string,
  answers: string[],
  imports: SharedDepUnit['imports'] = []
): SharedDepUnit & { text: string } {
  return { location, contentHash: sha256(text), answers, imports, text };
}

/** The unit as the fill data carries it, without the test-only text. */
const unitOf = ({ text: _text, ...unit }: SharedDepUnit & { text: string }): SharedDepUnit => unit;

/** Fill data for `items`: the unit table and the boot list naming each by content identity. */
function fillData(...items: Array<SharedDepUnit & { text: string }>) {
  return {
    unitsBase: './shared/',
    units: items.map(unitOf),
    list: { units: items.map((i) => i.contentHash), ownChunks: [] },
  };
}

const fail = (m: string): never => {
  throw new Error(m);
};

describe('ImportMapComposer', () => {
  it('answers the host specifiers at the top level and shared chunks edges in package scopes', () => {
    const dep = item('dep@1/chunk-d.js', 'export {};\n', ['dep']);
    const a = item('pkg-a@1/chunk-a.js', 'export {};\n', ['pkg-a', 'pkg-a/sub'], ['dep']);
    const map = ImportMapComposer.compose({
      unitsBaseUrl: './shared/',
      specifiers: ['pkg-a'],
      lists: {
        'pkg-a': { items: [unitOf(a), unitOf(dep)], ownChunks: [] },
        dep: { items: [unitOf(dep)], ownChunks: [] },
      },
      onError: fail,
    });

    // Top level: the host chunks' own bare imports.
    expect(map.imports).toEqual({
      'pkg-a': './shared/pkg-a@1/chunk-a.js',
    });
    // Scope: the shared chunk's bare import, under its package dir.
    expect(map.scopes).toEqual({
      './shared/pkg-a@1/': { dep: './shared/dep@1/chunk-d.js' },
    });
    expect(JSON.parse(map.json)).toEqual({
      imports: map.imports,
      scopes: map.scopes,
    });
    expect(map.cspHash).toBe(
      `sha256-${createHash('sha256').update(map.json, 'utf-8').digest('base64')}`
    );
    expect(map.cspHash).toMatch(/^sha256-[A-Za-z0-9+/=]+$/);
  });

  it('resolves a nested lazy list edges through its parent chain', () => {
    const dep = item('dep@1/chunk-d.js', 'export {};\n', ['dep']);
    const main = item('pkg@1/chunk-m.js', 'export {};\n', ['pkg']);
    const lazy = item('pkg@1/lazy/chunk-l.js', 'export {};\n', [], ['dep']);
    const map = ImportMapComposer.compose({
      unitsBaseUrl: './shared/',
      specifiers: ['pkg'],
      lists: {
        pkg: {
          items: [unitOf(main), unitOf(dep)],
          ownChunks: [],
          lazy: { 'pkg@1/lazy/chunk-l.js': { items: [unitOf(lazy)], ownChunks: [] } },
        },
      },
      onError: fail,
    });

    expect(map.scopes['./shared/pkg@1/lazy/']).toEqual({
      dep: './shared/dep@1/chunk-d.js',
    });
  });

  it('lets two scopes answer one specifier differently, but fails inside one scope', () => {
    const a = item('pkg-x@1/a.js', 'export {};\n', [], ['dep']);
    const depA = item('dep@1/chunk-a.js', 'export {};\n', ['dep']);
    const b = item('pkg-y@1/b.js', 'export {};\n', [], ['dep']);
    const depB = item('dep@2/chunk-b.js', 'export {};\n', ['dep']);
    const ok = ImportMapComposer.compose({
      unitsBaseUrl: './shared/',
      specifiers: [],
      lists: {
        x: { items: [unitOf(a), unitOf(depA)], ownChunks: [] },
        y: { items: [unitOf(b), unitOf(depB)], ownChunks: [] },
      },
      onError: fail,
    });
    expect(ok.scopes['./shared/pkg-x@1/']).toEqual({ dep: './shared/dep@1/chunk-a.js' });
    expect(ok.scopes['./shared/pkg-y@1/']).toEqual({ dep: './shared/dep@2/chunk-b.js' });

    // …but two answers inside one scope (one package, two different
    // chunks answering the same specifier) is a genuine ambiguity.
    const ambA = item('pkg@1/a.js', 'export {};\n', ['dep'], []);
    const ambB = item('pkg@1/b.js', 'export {};\n', ['dep'], []);
    const importer = item('pkg@1/i.js', 'export {};\n', [], ['dep']);
    expect(() =>
      ImportMapComposer.compose({
        unitsBaseUrl: './shared/',
        specifiers: [],
        lists: {
          amb: { items: [unitOf(ambA), unitOf(ambB), unitOf(importer)], ownChunks: [] },
        },
        onError: fail,
      })
    ).toThrow(/two chunks|is answered by/);
  });

  it('leaves a specifier nothing answers unmapped — the chunk stays native like the mint path left it', () => {
    const orphan = item('pkg@1/i.js', 'export {};\n', [], ['ghost']);
    const map = ImportMapComposer.compose({
      unitsBaseUrl: './shared/',
      specifiers: [],
      lists: { o: { items: [unitOf(orphan)], ownChunks: [] } },
      onError: fail,
    });
    expect(map.scopes['./shared/pkg@1/'] ?? {}).toEqual({});
  });

  it('emits an empty map when nothing was produced', () => {
    const map = ImportMapComposer.compose({
      unitsBaseUrl: './shared/',
      specifiers: [],
      lists: {},
      onError: fail,
    });
    expect(map.imports).toEqual({});
    expect(JSON.parse(map.json)).toEqual({ imports: {} });
  });
});

// The realm cache is shared within this file: tests rely on unique texts
// per test and on per-file isolation (vitest isolates each file's realm).
describe('ShellCacheFill', () => {
  const BASE = 'https://host.test/';
  const UNITS = `${BASE}shared/`;

  it('admits every boot-list unit into the realm cache, one entry per content identity', async () => {
    const a = item('pkg-a@1/chunk-a.js', 'export const a = 1;\n', ['pkg-a']);
    const twin = item('pkg-b@1/chunk-b.js', a.text, ['pkg-b']); // same bytes
    const c = item('pkg-c@1/chunk-c.js', 'export const c = 2;\n', ['pkg-c']);
    const fetches: string[] = [];

    const report = await ShellCacheFill.run(
      fillData(a, twin, c),
      {
        documentBase: BASE,
        fetchText: async (url) => {
          fetches.push(url);
          const served = new Map([
            [`${UNITS}${a.location}`, a.text],
            [`${UNITS}${twin.location}`, twin.text],
            [`${UNITS}${c.location}`, c.text],
          ]);
          const text = served.get(url);
          if (text === undefined) throw new Error(`unexpected fetch ${url}`);
          return text;
        },
      }
    );

    expect(report).toEqual({ filled: 2, failed: 0 });
    // The identical-bytes twin never crosses the network.
    expect(fetches.sort()).toEqual(
      [`${UNITS}${a.location}`, `${UNITS}${c.location}`].sort()
    );
    // Admission observed through behaviour: a second fetcher on the
    // same realm cache never calls its fetchFn for an admitted unit,
    // and resolves the filled text.
    const probe = new SharedUnitFetcher(async (url) => {
      throw new Error(`unexpected network fetch ${url}`);
    }, 'probe');
    await expect(
      probe.fetch(`${UNITS}${a.location}`, a.contentHash)
    ).resolves.toBe(a.text);
    await expect(
      probe.fetch(`${UNITS}${c.location}`, c.contentHash)
    ).resolves.toBe(c.text);
  });

  it('reports a failed fetch without throwing', async () => {
    const a = item('pkg-f@1/chunk-f.js', 'export const failing = 1;\n', ['pkg-f']);
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });

    const report = await ShellCacheFill.run(
      fillData(a),
      {
        documentBase: BASE,
        fetchText: async () => {
          throw new Error('network down');
        },
      }
    );

    expect(report).toEqual({ filled: 0, failed: 1 });
    expect(errors.length).toBeGreaterThan(0);
    spy.mockRestore();

    // The failed attempt left no cache entry: a probe fetcher must go to
    // the network (once) and gets the text.
    const probeFetch = vi.fn(async () => a.text);
    await expect(
      new SharedUnitFetcher(probeFetch, 'probe').fetch(
        `${UNITS}${a.location}`,
        a.contentHash
      )
    ).resolves.toBe(a.text);
    expect(probeFetch).toHaveBeenCalledTimes(1);
  });

  it('publishes every in-flight entry at once, so a load starting mid-fill joins them and fetches nothing', async () => {
    const a = item('pkg-j1@1/chunk-j1.js', 'export const j1 = 1;\n', ['pkg-j1']);
    const b = item('pkg-j2@1/chunk-j2.js', 'export const j2 = 2;\n', ['pkg-j2']);
    const texts = new Map([
      [`${UNITS}${a.location}`, a.text],
      [`${UNITS}${b.location}`, b.text],
    ]);
    const textOf = (url: string): string => {
      const text = texts.get(url);
      if (text === undefined) throw new Error(`unexpected fetch ${url}`);
      return text;
    };
    const releases: Array<() => void> = [];
    const fillFetches: string[] = [];

    // The fill is not awaited: its fetches stay in flight.
    const filling = ShellCacheFill.run(
      fillData(a, b),
      {
        documentBase: BASE,
        fetchText: (url) =>
          new Promise<string>((resolve) => {
            fillFetches.push(url);
            releases.push(() => resolve(textOf(url)));
          }),
      }
    );

    // A load starting now, before any fill fetch settled, joins both.
    const loadFetch = vi.fn(async (url: string) => {
      throw new Error(`unexpected load fetch ${url}`);
    });
    const load = new SharedUnitFetcher(loadFetch, 'mfe-load');
    const joined = Promise.all([
      load.fetch(`${UNITS}${a.location}`, a.contentHash),
      load.fetch(`${UNITS}${b.location}`, b.contentHash),
    ]);
    expect(fillFetches).toHaveLength(2);
    releases.forEach((release) => release());

    await expect(joined).resolves.toEqual([a.text, b.text]);
    await expect(filling).resolves.toEqual({ filled: 2, failed: 0 });
    expect(loadFetch).not.toHaveBeenCalled();
  });

  it('fetches from the HTTP cache at low priority', async () => {
    const a = item('pkg-o@1/chunk-o.js', 'export const o = 1;\n', ['pkg-o']);
    const fetchSpy = vi.fn(async () => new Response(a.text));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const report = await ShellCacheFill.run(
        fillData(a),
        { documentBase: BASE }
      );
      expect(report).toEqual({ filled: 1, failed: 0 });
      expect(fetchSpy).toHaveBeenCalledWith(`${UNITS}${a.location}`, {
        cache: 'force-cache',
        priority: 'low',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never throws into the page — an unresolvable location is reported, not thrown', async () => {
    const outside = item('../outside.js', 'export {};\n', ['outside']);
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });
    const report = await ShellCacheFill.run(
      fillData(outside),
      { documentBase: BASE, fetchText: async () => outside.text }
    );
    expect(report).toEqual({ filled: 0, failed: 1 });
    expect(errors.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
