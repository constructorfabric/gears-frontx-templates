/**
 * Behavioural tests for `vitePluginShell` on a synthetic minimal host
 * project — a fixture host with its own tiny layout (a `src/` entry and
 * a flat `node_modules`), exercising the plugin through a real Vite
 * build and asserting on emitted output, never on plugin source.
 *
 * The fixture is deliberately non-React (vanilla JS deps only): the
 * plugin is framework- and implementation-agnostic — its inputs are the
 * host's `package.json`, the build output and its options.
 *
 * Native boot model: shared units and fetch
 * lists land in the host's own `dist` (under `unitsDir`, default
 * `shared/`); the emitted HTML keeps its native module scripts and
 * gains an inline import map pointing only into the host's own dist
 * (with an emitted `sha256-…` CSP source and optional nonce),
 * modulepreload links for the boot-list items, and a small fill chunk
 * that refills the realm text cache from the shell entry.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { build, type Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ShellPlugin } from '../ShellPlugin';
import { vitePluginShell, type VitePluginShellOptions } from '../index';

const ESM_DEP_SOURCE = `export const value = 41;\nexport default { value };\n`;
const CJS_DEP_SOURCE = `module.exports = { cjsValue: 7 };\n`;

interface FixtureDep {
  name: string;
  version: string;
  cjs?: boolean;
  /** Extra package files (path → source) beside `index.js`. */
  files?: Record<string, string>;
  /** A package `exports` map. */
  exports?: Record<string, string>;
}

/**
 * Writes a minimal host: a `package.json` declaring `deps` as
 * `dependencies`, each dep installed under the host's own `node_modules`,
 * an `index.html` with a `<head>`, and a `src/main.js` entry importing
 * every dep.
 */
function makeFixtureHost(root: string, deps: FixtureDep[]): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture-host',
        version: '0.0.0',
        type: 'module',
        dependencies: Object.fromEntries(deps.map((d) => [d.name, d.version])),
      },
      null,
      2
    ) + '\n'
  );
  for (const dep of deps) {
    const depDir = path.join(root, 'node_modules', dep.name);
    fs.mkdirSync(depDir, { recursive: true });
    fs.writeFileSync(
      path.join(depDir, 'package.json'),
      JSON.stringify(
        {
          name: dep.name,
          version: dep.version,
          main: 'index.js',
          ...(dep.cjs ? {} : { type: 'module' }),
          ...(dep.exports ? { exports: dep.exports } : {}),
        },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(depDir, 'index.js'),
      dep.cjs ? CJS_DEP_SOURCE : ESM_DEP_SOURCE
    );
    for (const [file, source] of Object.entries(dep.files ?? {})) {
      fs.writeFileSync(path.join(depDir, file), source);
    }
  }
  fs.writeFileSync(
    path.join(root, 'index.html'),
    [
      '<!doctype html>',
      '<html>',
      '  <head>',
      '    <meta charset="UTF-8" />',
      '    <title>fixture</title>',
      '  </head>',
      '  <body>',
      '    <script type="module" src="/src/main.js"></script>',
      '  </body>',
      '</html>',
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(root, 'src', 'main.js'),
    deps.map((d) => `import '${d.name}';`).join('\n') + '\n'
  );
}

async function buildFixture(
  root: string,
  options?: VitePluginShellOptions,
  extra?: { base?: string; plugins?: Plugin[] }
): Promise<void> {
  await build({
    root,
    logLevel: 'silent',
    base: extra?.base,
    plugins: [vitePluginShell(options), ...(extra?.plugins ?? [])],
    build: { outDir: 'dist', emptyOutDir: true },
  });
}

interface FillData {
  unitsBase: string;
  units: Array<{
    location: string;
    contentHash: string;
    answers: string[];
    imports: unknown[];
  }>;
  list: {
    units: string[];
    ownChunks: string[];
  };
}

/** The units the fill data's boot list names. */
function bootUnits(data: FillData): FillData['units'] {
  const named = new Set(data.list.units);
  return data.units.filter((u) => named.has(u.contentHash));
}

/**
 * The emitted files under `dir`: the decoded inline import map, the
 * emitted entry/fill module script tags and the fill chunk's embedded
 * data.
 */
function readDist(root: string, urlBase = ''): {
  sharedDir: string;
  emittedShared: string[];
  html: string;
  importMap: Record<string, string>;
  importMapAttrs: string;
  moduleScriptSrcs: string[];
  preloads: string[];
  fill: { fileName: string; source: string; data: FillData };
  entrySrcs: string[];
  chunkSources: Record<string, string>;
} {
  const dist = path.join(root, 'dist');
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf-8');

  const mapTag = /<script type="importmap"([^>]*)>(.*?)<\/script>/s.exec(html);
  expect(mapTag, 'emitted HTML carries no inline import map').not.toBeNull();
  const importMap = JSON.parse(mapTag![2]).imports as Record<string, string>;

  const moduleScriptSrcs = [
    ...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g),
  ]
    .filter((m) => /type=["']module["']/i.test(m[0]))
    .map((m) => m[1]);
  const preloads = [
    ...html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g),
  ].map((m) => m[1]);

  const fillSrc = moduleScriptSrcs.find((s) =>
    /frontx-shell-fill-[^/]*\.js$/.test(s)
  );
  expect(fillSrc, 'no emitted frontx-shell-fill module script').toBeDefined();
  const fillFileName = (
    urlBase !== '' && fillSrc!.startsWith(urlBase)
      ? fillSrc!.slice(urlBase.length)
      : fillSrc!
  ).replace(/^\.?\//, '');
  const fillPath = path.join(dist, fillFileName);
  expect(fs.existsSync(fillPath)).toBe(true);
  const source = fs.readFileSync(fillPath, 'utf-8');
  const dataStart = source.indexOf('"unitsBase"');
  expect(dataStart, 'fill chunk carries no inline data').toBeGreaterThan(-1);
  const open = source.lastIndexOf('{', dataStart);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    } else if (source[i] === '"' || source[i] === "'") {
      const q = source[i];
      i++;
      while (i < source.length && source[i] !== q) {
        if (source[i] === '\\') i++;
        i++;
      }
    }
  }
  expect(end, 'fill chunk inline data is not a balanced object').toBeGreaterThan(open);
  const data = JSON.parse(source.slice(open, end + 1)) as FillData;

  const unitsPath =
    urlBase !== '' && data.unitsBase.startsWith(urlBase)
      ? data.unitsBase.slice(urlBase.length)
      : data.unitsBase.replace(/^\.?\//, '');
  const sharedDir = path.join(dist, unitsPath);
  const emittedShared: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else emittedShared.push(path.relative(sharedDir, full).split(path.sep).join('/'));
    }
  };
  walk(sharedDir);

  const chunkSources: Record<string, string> = {};
  const assetsDir = path.join(dist, 'assets');
  for (const f of fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : []) {
    if (f.endsWith('.js')) {
      chunkSources[f] = fs.readFileSync(path.join(assetsDir, f), 'utf-8');
    }
  }
  return {
    sharedDir,
    emittedShared,
    html,
    importMap,
    importMapAttrs: mapTag![1],
    moduleScriptSrcs,
    preloads,
    fill: { fileName: fillFileName, source, data },
    entrySrcs: moduleScriptSrcs.filter((s) => s !== fillSrc),
    chunkSources,
  };
}

describe('vitePluginShell (synthetic minimal host, native boot model)', () => {
  let tmp: string;

  beforeEach(() => {
    // realpath: macOS `/var` is a symlink to `/private/var`, and Vite's
    // html build rejects an emitted path that climbs out of the root.
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vpsh-fixture-')));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('boots natively: entry script kept, inline import map into own dist, fill chunk appended', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);

    await buildFixture(root);

    const {
      emittedShared,
      html,
      importMap,
      moduleScriptSrcs,
      preloads,
      fill,
      entrySrcs,
      chunkSources,
    } = readDist(root);

    // Chunks emitted into the host's own dist
    // (default unitsDir), under the content-addressed package dir; the
    // fill requests them under the base the import map uses.
    expect(fill.data.unitsBase).toBe('/shared/');
    expect(
      emittedShared.some((f) => /^fixture-esm@1\.0\.0\/.+\.[0-9a-f]{64}\.js$/.test(f))
    ).toBe(true);
    // Lists are not files: no list document is emitted.
    expect(emittedShared.some((f) => /\.list\./.test(f))).toBe(false);

    // The entry module script stays native — it is not replaced by a
    // boot chunk; the fill chunk's script follows it.
    expect(entrySrcs).toHaveLength(1);
    expect(entrySrcs[0]).toMatch(/assets\/index-.*\.js$/);
    expect(moduleScriptSrcs[moduleScriptSrcs.length - 1]).toContain(
      fill.fileName
    );
    expect(html).not.toContain('frontx-shell-boot');

    // The import map answers the shared specifier with an own-dist URL.
    expect(importMap['fixture-esm']).toMatch(
      /^\.?\/shared\/fixture-esm@1\.0\.0\/.+\.js$/
    );
    expect(emittedShared).toContain(
      importMap['fixture-esm'].replace(/^\.?\/shared\//, '')
    );
    for (const url of Object.values(importMap)) {
      expect(url.startsWith('./shared/') || url.startsWith('/shared/')).toBe(true);
    }

    // Boot-list items are preloaded so the native graph fetches in one
    // round; the answering chunk is among them.
    const answering = bootUnits(fill.data).find((i) =>
      i.answers.includes('fixture-esm')
    );
    expect(answering).toBeDefined();
    expect(preloads).toContain(`/shared/${answering!.location}`);

    // A modulepreload link for EVERY boot-list item — the whole
    // boot list is requested in one flat round, no import waterfall.
    const preloadSet = new Set(preloads.map((p) => p.replace(/^\//, '')));
    for (const item of bootUnits(fill.data)) {
      expect(
        preloadSet.has(`shared/${item.location}`),
        `boot-list item ${item.location} has no modulepreload link`
      ).toBe(true);
    }
    // …and the preloads land before the first module script.
    expect(html.indexOf('rel="modulepreload"')).toBeLessThan(
      html.indexOf('type="module"')
    );

    // The fill chunk carries the boot list and bundles the sanctioned
    // unit-loader surface — no bare import of it survives, and no blob
    // machinery is emitted for the shell.
    expect(bootUnits(fill.data).length).toBeGreaterThan(0);
    expect(fill.source).not.toMatch(
      /from\s*["']@gears-frontx\/mfes\/unit-loader["']/
    );
    expect(fill.source).not.toContain('__FRONTX_BOOT_LAZY__');
    expect(Object.values(chunkSources).join('\n')).not.toContain(
      '__FRONTX_BOOT_LAZY__'
    );

    // The app entry chunk keeps the bare specifier the import map
    // resolves; the dep's own code was not bundled.
    expect(Object.values(chunkSources).join('\n')).not.toContain('value = 41');
  });

  it('honours the unitsDir option for the emitted shared files and the import map', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);

    await buildFixture(root, { unitsDir: 'units' });

    const { fill, importMap, emittedShared } = readDist(root);
    expect(fill.data.unitsBase).toBe('/units/');
    expect(fs.existsSync(path.join(root, 'dist', 'units'))).toBe(true);
    expect(emittedShared.some((f) => f.endsWith('.js'))).toBe(true);
    // Lists are not files: no list document is emitted.
    expect(emittedShared.some((f) => /\.list\./.test(f))).toBe(false);
    expect(fs.existsSync(path.join(root, 'dist', 'shared'))).toBe(false);
    expect(importMap['fixture-esm']).toMatch(/^\.?\/units\//);
  });

  it('stamps a nonce on the inline import map when importMapNonce is set', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);

    await buildFixture(root, { importMapNonce: 'test-nonce-1' });

    const { importMapAttrs } = readDist(root);
    expect(importMapAttrs).toContain('nonce="test-nonce-1"');
  });

  it('rejects an importMapNonce with characters outside the CSP nonce grammar', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);

    // A `"` would break out of the `nonce="…"` attribute the import
    // map tag carries — a host-supplied nonce must match the CSP
    // grammar `[A-Za-z0-9+/=_-]+` (base64 + `_-`), nothing else.
    // The build refuses to emit the tag rather than escape it, so a
    // bad nonce never reaches the page.
    await expect(
      buildFixture(root, { importMapNonce: 'bad"nonce' })
    ).rejects.toThrow(/importMapNonce/);
    await expect(
      buildFixture(root, { importMapNonce: 'with space' })
    ).rejects.toThrow(/importMapNonce/);
    await expect(
      buildFixture(root, { importMapNonce: '' })
    ).rejects.toThrow(/importMapNonce/);
    // A valid base64url+`_-` nonce is still accepted (round-trip).
    await expect(
      buildFixture(root, { importMapNonce: 'a-b_cD0/+' })
    ).resolves.toBeUndefined();
  });

  it('excludes a package from the shared set via the exclude option', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);

    await buildFixture(root, { exclude: ['fixture-esm'] });

    // Excluding the only dep empties the shared set: nothing is
    // externalized or produced and the build stays native — the emitted
    // HTML's module script is the app entry chunk itself.
    const dist = path.join(root, 'dist');
    expect(fs.existsSync(path.join(dist, 'shared'))).toBe(false);
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf-8');
    const src = /<script\b[^>]*\bsrc="([^"]+)"/.exec(html)![1];
    const entry = fs.readFileSync(
      path.join(dist, src.replace(/^\.?\//, '')),
      'utf-8'
    );
    // Bundled: no `fixture-esm` specifier survives as an external import —
    // an externalized shared dep would keep it verbatim.
    expect(entry).not.toMatch(/(from|import)\s*["']fixture-esm["']/);
  });

  it('emits no shared output when the shared set is empty and still boots the app', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, []);
    // No deps at all: the plugin stays a plain native html build.
    await buildFixture(root);
    const dist = path.join(root, 'dist');
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf-8');
    expect(html).not.toContain('type="importmap"');
    expect(html).not.toContain('frontx-shell-fill');
    expect(fs.existsSync(path.join(dist, 'shared'))).toBe(false);
    const src = /<script\b[^>]*\bsrc="([^"]+)"/.exec(html)![1];
    const entry = fs.readFileSync(
      path.join(dist, src.replace(/^\.?\//, '')),
      'utf-8'
    );
    expect(entry).not.toContain('__FRONTX_BOOT_LAZY__');
  });

  it('the plugin is a no-op for vite dev (serve command)', () => {
    const plugin = vitePluginShell();
    const hook = typeof plugin.config === 'function' ? plugin.config : plugin.config?.handler;
    // In serve mode the config hook must not externalize anything — dev
    // stays native.
    const result = hook?.call(
      undefined,
      { root: tmp },
      { command: 'serve', mode: 'development' }
    );
    expect(result).toBeNull();
  });

  it('removed option surface: no sharedOutDir, sharedBase, hashCheckRoots or external map files', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);

    // A stale options object carrying the deleted keys must not produce
    // the deleted outputs.
    const stale: VitePluginShellOptions & Record<string, unknown> = {
      sharedOutDir: 'frontx-shared',
      sharedBase: 'https://cdn.example.com/units',
      hashCheckRoots: [tmp],
    };
    await buildFixture(root, stale);

    const dist = path.join(root, 'dist');
    expect(fs.existsSync(path.join(dist, 'frontx-shared'))).toBe(false);
    expect(fs.existsSync(path.join(dist, 'import-map.json'))).toBe(false);
    expect(fs.existsSync(path.join(dist, 'modulepreload.json'))).toBe(false);
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf-8');
    expect(html).not.toContain('cdn.example.com');
    const { fill } = readDist(root);
    expect(fill.data.unitsBase).toBe('/shared/');
  });

  it('produces a single-entry chunk for a CJS dependency and maps its specifier', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-cjs', version: '2.0.0', cjs: true }]);

    await buildFixture(root);

    const { emittedShared, importMap } = readDist(root);
    const chunks = emittedShared.filter((f) =>
      /^fixture-cjs@2\.0\.0\/.+\.[0-9a-f]{64}\.js$/.test(f)
    );
    expect(chunks).toHaveLength(1);
    expect(importMap['fixture-cjs']).toBe(`/shared/${chunks[0]}`);
  });

  it('fixture deps carry no framework code — the plugin never reads React or template specifics', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);
    await buildFixture(root);
    // Nothing in the emitted output references react or template-shell.
    // The shell build report (`shell-build-report.json`)
    // is a side-channel timing report — it carries the host label
    // `template-shell` as data, not chunk code — so it is excluded
    // from this "no framework code in chunk bytes" assertion.
    const dist = path.join(root, 'dist');
    const all = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? all(path.join(dir, e.name)) : [path.join(dir, e.name)]
      );
    for (const file of all(dist)) {
      if (path.basename(file) === 'shell-build-report.json') continue;
      const text = fs.readFileSync(file, 'utf-8');
      expect(text).not.toContain('template-shell');
      expect(text).not.toMatch(/from\s*["']react["']/);
    }
  });

  it('points the import map and the fill script at the Vite base the app entry was served under', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);

    await buildFixture(root, undefined, { base: '/app/' });

    const { html, importMap, entrySrcs, fill } = readDist(root, '/app/');
    expect(entrySrcs[0]).toMatch(/^\/app\/assets\/.*\.js$/);
    expect(html).toContain(`/app/${fill.fileName}`);
    for (const url of Object.values(importMap)) {
      expect(url.startsWith('/app/shared/')).toBe(true);
    }
    expect(fill.data.unitsBase).toBe('/app/shared/');
  });

  it.each([
    ['./', './shared/'],
    ['https://cdn.example.com/console/', 'https://cdn.example.com/console/shared/'],
  ])('gives the fill the units base the import map uses for base %s', async (base, unitsBase) => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);

    await buildFixture(root, undefined, { base });

    const urlBase = base === './' ? '' : base;
    const { importMap, fill, preloads } = readDist(root, urlBase);
    expect(fill.data.unitsBase).toBe(unitsBase);
    for (const url of [...Object.values(importMap), ...preloads]) {
      expect(url.startsWith(unitsBase)).toBe(true);
    }
  });

  it('names the fill chunk after the data it carries', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);
    await buildFixture(root);
    const first = readDist(root).fill;

    // Different shared bytes give different boot units, so different fill
    // data, while the fill runtime stays the same code.
    fs.writeFileSync(
      path.join(root, 'node_modules', 'fixture-esm', 'index.js'),
      `export const value = 42;\nexport default { value };\n`
    );
    await buildFixture(root);
    const second = readDist(root).fill;

    expect(second.data).not.toEqual(first.data);
    expect(second.fileName).not.toBe(first.fileName);
    expect(second.fileName).toMatch(/^assets\/frontx-shell-fill-[0-9a-f]+\.js$/);
    // Only the renamed file is left in the output.
    const fills = fs
      .readdirSync(path.join(root, 'dist', 'assets'))
      .filter((f) => f.startsWith('frontx-shell-fill-'));
    expect(fills).toEqual([path.posix.basename(second.fileName)]);
  });

  it('inserts fill data containing replacement-pattern sequences verbatim', () => {
    const source = `run(${JSON.stringify('__FRONTX_FILL_DATA__')});`;
    const data = { unitsBase: '/a$&b$$c$\'d/', units: [], list: { units: [], ownChunks: [] } };
    expect(ShellPlugin.injectFillData(source, data)).toBe(`run(${JSON.stringify(data)});`);
    expect(ShellPlugin.injectFillData('run();', data)).toBeUndefined();
  });

  it('stamps the nonce on every tag it injects, from importMapNonce or html.cspNonce', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);
    const injectedTags = (html: string): string[] => [
      ...(html.match(/<script type="importmap"[^>]*>/g) ?? []),
      ...(html.match(/<link\b[^>]*rel="modulepreload"[^>]*>/g) ?? []),
      ...(html.match(/<script\b[^>]*frontx-shell-fill-[^>]*>/g) ?? []),
    ];

    await buildFixture(root, { importMapNonce: 'opt-nonce' });
    let tags = injectedTags(readDist(root).html);
    expect(tags.length).toBeGreaterThanOrEqual(3);
    for (const tag of tags) expect(tag).toContain('nonce="opt-nonce"');

    await build({
      root,
      logLevel: 'silent',
      html: { cspNonce: 'vite-nonce' },
      plugins: [vitePluginShell()],
      build: { outDir: 'dist', emptyOutDir: true },
    });
    tags = injectedTags(readDist(root).html);
    expect(tags.length).toBeGreaterThanOrEqual(3);
    for (const tag of tags) expect(tag).toContain('nonce="vite-nonce"');
  });

  it.each([
    ['string', (external: string) => external],
    ['RegExp', (external: string) => new RegExp(`^${external}$`)],
    ['array', (external: string) => [external]],
    ['function', (external: string) => (id: string) => id === external],
  ])('keeps externalizing the shared set beside a project %s external', async (_kind, toExternal) => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);
    fs.appendFileSync(
      path.join(root, 'src', 'main.js'),
      `import * as own from 'fs';\nconsole.log(own);\n`
    );
    await build({
      root,
      logLevel: 'silent',
      plugins: [vitePluginShell()],
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: { external: toExternal('fs') as never },
      },
    });

    const { importMap, chunkSources } = readDist(root);
    // The shared package is external and mapped; the project's own
    // external stays external too.
    expect(importMap['fixture-esm']).toBeDefined();
    const code = Object.values(chunkSources).join('\n');
    expect(code).not.toContain('value = 41');
    expect(code).toMatch(/from\s*["']fs["']/);
  });

  it('keeps document-relative URLs for the default base', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);

    await buildFixture(root);

    const { importMap, entrySrcs } = readDist(root);
    expect(entrySrcs[0]).toMatch(/^\/assets\/.*\.js$/);
    for (const url of Object.values(importMap)) {
      expect(url.startsWith('/shared/') || url.startsWith('./shared/')).toBe(true);
    }
  });

  it('fails the build when the emitted index.html carries no module script to serve', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);
    const stripModuleScripts: Plugin = {
      name: 'strip-module-scripts',
      transformIndexHtml: {
        order: 'post',
        handler: (html) => html.replace(/<script\b[^>]*>\s*<\/script>/gi, ''),
      },
    };

    await expect(
      buildFixture(root, undefined, { plugins: [stripModuleScripts] })
    ).rejects.toThrow(/no <script type="module"/);
  });

  it('emits a fill chunk free of any bare module specifier even when the host shares @gears-frontx/mfes itself', async () => {
    const root = path.join(tmp, 'host');
    // Nested-host templates share @gears-frontx/mfes. The plugin's
    // emitted runtime module sits outside the host's node_modules and
    // matches isConsumerModule, so without a skip the barrel rewrite
    // resolves its `unit-loader` named imports to deep
    // `@gears-frontx/mfes/dist/…` specifiers — externalized by the
    // shared set and unresolvable as a native static import, breaking
    // the fill chunk ("Failed to resolve module specifier").
    makeFixtureHost(root, [
      {
        name: '@gears-frontx/mfes',
        version: '0.0.0',
        exports: { '.': './index.js', './unit-loader': './unit-loader.js' },
        files: {
          'index.js': `export const mfesStub = true;\n`,
          // A pure re-export barrel like the real `./unit-loader`
          // surface: classifies 'barrel', so the consumer rewrite
          // redirects named imports to the deep specifier.
          'unit-loader.js':
            `export { SharedAssetUrlResolver } from './deep.js';\n` +
            `export { SharedUnitFetcher } from './deep.js';\n`,
          'deep.js': `export const SharedAssetUrlResolver = {};\nexport const SharedUnitFetcher = {};\n`,
        },
      },
    ]);
    // sideEffects:false — required for the stub's barrel classification.
    const mfesPkgPath = path.join(root, 'node_modules', '@gears-frontx', 'mfes', 'package.json');
    const mfesPkg = JSON.parse(fs.readFileSync(mfesPkgPath, 'utf-8'));
    mfesPkg.sideEffects = false;
    fs.writeFileSync(mfesPkgPath, JSON.stringify(mfesPkg));

    await buildFixture(root);

    const { fill } = readDist(root);
    expect(fill.source).not.toMatch(
      /(from|import)\s*["']@gears-frontx\/mfes(\/[^"']*)?["']/
    );
  });

  it('produces own-chunk dynamic imports of shared subpaths and answers them through the import map', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [
      {
        name: 'fixture-esm',
        version: '1.0.0',
        exports: { '.': './index.js', './sub': './sub.js' },
        files: { 'sub.js': `export const sub = 'lazy-sub';\n` },
      },
    ]);
    fs.writeFileSync(
      path.join(root, 'src', 'main.js'),
      `import 'fixture-esm';\nglobalThis.later = () => import('fixture-esm/sub');\n`
    );

    await buildFixture(root);

    const { importMap, chunkSources, emittedShared } = readDist(root);
    // The dynamic subpath's specifier is answered by the import map —
    // lazily, natively — not by an embedded dependent list.
    expect(importMap['fixture-esm/sub']).toMatch(/^\.?\/shared\//);
    expect(emittedShared).toContain(
      importMap['fixture-esm/sub'].replace(/^\.?\/shared\//, '')
    );
    // …kept as a bare dynamic import in the host chunk, and stays lazy.
    expect(Object.values(chunkSources).join('\n')).toMatch(
      /import\(\s*["']fixture-esm\/sub["']\s*\)/
    );
  });

  it('keeps own-chunk lazy imports native — no boot list entry, no rewriting', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);
    fs.writeFileSync(path.join(root, 'src', 'lazy.js'), `export const lazy = 1;\n`);
    fs.writeFileSync(
      path.join(root, 'src', 'main.js'),
      `import 'fixture-esm';\nglobalThis.later = () => import('./lazy.js');\n`
    );

    await buildFixture(root);

    const { chunkSources, html } = readDist(root);
    // The lazy own chunk is emitted and imported natively — the emitted
    // code keeps a relative dynamic import, never a __frontx_lazy token.
    const joined = Object.values(chunkSources).join('\n');
    expect(joined).not.toContain('__frontx_lazy');
    expect(html).not.toContain('__frontx_lazy');
  });
  it('keeps what only lazily reached chunks import off the boot list, the preloads and the fill', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [
      { name: 'fixture-boot', version: '1.0.0' },
      { name: 'fixture-lazy', version: '1.0.0' },
    ]);
    fs.writeFileSync(path.join(root, 'src', 'lazy.js'), `import 'fixture-lazy';\nexport const lazy = 1;\n`);
    fs.writeFileSync(
      path.join(root, 'src', 'main.js'),
      `import 'fixture-boot';\nglobalThis.later = () => import('./lazy.js');\n`
    );

    await buildFixture(root);

    const { importMap, preloads, fill } = readDist(root);
    const answers = (spec: string) =>
      bootUnits(fill.data).some((i) => i.answers.includes(spec));
    expect(answers('fixture-boot')).toBe(true);
    expect(answers('fixture-lazy')).toBe(false);
    expect(preloads.some((p) => p.includes('fixture-lazy@'))).toBe(false);
    // The lazy chunk's import is still answered natively by the import map.
    expect(importMap['fixture-lazy']).toMatch(/^\.?\/shared\/fixture-lazy@1\.0\.0\//);
  });

  it('prioritises the shell entry and the boot preloads and starts the fill right after the shell entry', async () => {
    const root = path.join(tmp, 'host');
    makeFixtureHost(root, [{ name: 'fixture-esm', version: '1.0.0' }]);

    await buildFixture(root);

    const { html, fill } = readDist(root);
    const tags = [...html.matchAll(/<(?:script|link)\b[^>]*>/g)].map((m) => m[0]);
    const entry = tags.find((t) => /type="module"/.test(t) && /assets\/index-/.test(t));
    expect(entry).toMatch(/fetchpriority="high"/);
    const shared = tags.filter((t) => /rel="modulepreload"/.test(t) && /\/shared\//.test(t));
    expect(shared.length).toBeGreaterThan(0);
    for (const tag of shared) expect(tag).toMatch(/fetchpriority="high"/);
    const fillTag = tags.find((t) => t.includes(fill.fileName));
    expect(fillTag).toMatch(/fetchpriority="low"/);
    // The fill starts when its chunk has loaded, after the shell entry:
    // its module script follows the entry's, and module scripts run in
    // document order, so the entry has already constructed the MFE
    // handler and published the realm cache.
    const moduleTags = tags.filter((t) => /<script\b[^>]*type="module"/.test(t));
    expect(moduleTags.length).toBeGreaterThan(1);
    expect(moduleTags.indexOf(entry!)).toBeGreaterThanOrEqual(0);
    expect(moduleTags[moduleTags.length - 1]).toContain(fill.fileName);
    expect(moduleTags.indexOf(entry!)).toBeLessThan(
      moduleTags.findIndex((t) => t.includes(fill.fileName))
    );
  });

  it('runs the fill during evaluation of its glue, registers no load listener and publishes no flag', async () => {
    const calls: unknown[] = [];
    let settle!: (outcome: { ok: boolean; error?: unknown }) => void;
    const listeners: string[] = [];
    const errors: unknown[] = [];
    const win: Record<string, unknown> = {
      addEventListener: (type: string) => listeners.push(type),
    };
    const consoleStub = { error: (e: unknown) => errors.push(e) };
    const stub = {
      run: (data: unknown) => {
        calls.push(data);
        return new Promise<unknown>((resolve, reject) => {
          settle = (o) => (o.ok ? resolve({ filled: 0, failed: 0 }) : reject(o.error));
        });
      },
    };
    const evaluate = new Function('ShellCacheFill', 'window', 'console', ShellPlugin.fillGlue());

    evaluate(stub, win, consoleStub);
    // run is called during evaluation, with no wait for load or idle time.
    expect(calls).toHaveLength(1);
    expect(listeners).toEqual([]);
    settle({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    // The shipped glue leaves nothing on the window for a test to read.
    expect(Object.keys(win)).toEqual(['addEventListener']);
    expect(errors).toEqual([]);

    // A failed fill is reported on the console.
    evaluate(stub, win, consoleStub);
    const boom = new Error('boom');
    settle({ ok: false, error: boom });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toEqual([boom]);
    expect(Object.keys(win)).toEqual(['addEventListener']);
  });
});
