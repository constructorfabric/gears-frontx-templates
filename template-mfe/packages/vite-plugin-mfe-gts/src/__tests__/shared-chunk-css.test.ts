/**
 * Real builds of a fixture MFE package (`fixtures/shared-chunk-css`) through
 * `vitePluginMfeGts`, which owns federation and enforces per-chunk CSS (`build.cssCodeSplit:
 * true`; an override is warned about and ignored).
 *
 * The fixture's exposes share a module that imports a CSS Module. Rollup
 * hoists that CSS into a chunk the exposes share, and
 * `@module-federation/vite` attributes the shared chunk's CSS file to none
 * of them; the host injects into a screen's shadow root only the files its
 * expose lists, so without the plugin's attribution the screens render
 * without the shared styles. The fixture also covers a lazy chunk that
 * statically imports another chunk with CSS (list order), a CSS-only module
 * Vite folds into its importer (`common.css`), a chunk whose only CSS comes
 * from `node_modules` (`sonner/dist/styles.css`, listed for every expose that
 * reaches it like any other CSS the walk adds, also when reached only through
 * a lazy chunk or a direct dynamic import), an expose that imports that
 * stylesheet itself (its file is listed), exposes that share a PostCSS
 * stylesheet (`shared.pcss`), and exposes that reach the `node_modules`
 * stylesheet through static imports of the CSS-only chunk Vite removes, one
 * importing it itself and one through a module — built with per-chunk CSS
 * even when the config asks otherwise, so every one of them lists its CSS.
 * Further exposes cover a direct dynamic stylesheet import
 * (`import('./theme.css')`, a CSS-only chunk Vite removes) written plain,
 * with a comment, spaced with double quotes, and through a module that only
 * imports the stylesheet, a lazily imported stylesheet that compiles to no
 * CSS (Vite keeps its empty chunk, which loads like any other lazy chunk),
 * and stylesheets imported only as `?raw` and `?url`, which Vite does not
 * extract. Two exposes whose only CSS is a stylesheet that compiles to no
 * CSS (`zero-kit/zero.css`, aliased to an empty file) build and list no CSS,
 * also on a watch rebuild whose stylesheets stay in Rollup's transform
 * cache; when the recorder cannot be placed before `vite:css-post`
 * (`FIXTURE_HIDE_CSS_POST`) the recording is off and the CSS-delivery guard
 * fails them naming the empty stylesheet — also when an earlier build of the
 * same plugin instance in the same process recorded it empty
 * (`reused-plugin-builds.mjs`). A plugin listed after the recorder that
 * fills the empty stylesheet gets the filled CSS listed, and a watch rebuild
 * in which the empty stylesheet gains a rule, then loses it again, lists the
 * file, then no CSS. An expose that statically imports the kit stylesheet
 * ahead of a chunk with screen CSS gets the kit file listed where it
 * imported it, and a mirror expose importing the chunk first pins the
 * mapping of surviving chunks to their final names. Env-gated fixture
 * plugins that edit the rendered chunks' static import lists between
 * renderChunk and the attribution (`FIXTURE_IMPORT_EDIT`) guard that the
 * attribution follows the final imports rather than the recorded ones. An
 * expose that imports a component of a shared package (`fixture-shared-kit`,
 * in the shared set) whose component modules import their own stylesheets
 * gets exactly the used components' stylesheets listed, the lazily used one
 * as async. The last cases fail builds whose code loads through
 * `__frontx_lazy` a file the bundle does not have: a chunk another plugin
 * deleted after rendering, and a concatenated path no chunk was built for.
 *
 * The build runs `vite build` in a child process, with NODE_ENV unset and
 * `MFE_VITE_NO_TEST_ENV_CHECK=true`, the federation plugin's documented
 * opt-out of turning itself off under a test runner. Assertions read what
 * the shell consumes: `entries[].exposeAssets` in `dist/mfe-manifest.json`,
 * and for exposes with no entry, `mf-manifest.json`. The builds run in a
 * private copy of the fixture, with its own producer cache; the stand-in
 * packages (`sonner`, `fixture-shared-kit`) are written into the copy's
 * `node_modules`, and the copy is removed after the tests.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { readJson } from './helpers/files';
import { copyFixture, installPackage, type FixtureRun } from './helpers/fixtureRun';
import { buildEnv, runViteBuild, viteBin } from './helpers/vite';

/** The private copy of the fixture the tests build in. */
let fixture: FixtureRun;
let fixtureDir = '';

interface CssLists {
  sync: string[];
  async: string[];
}

/** One expose entry of federation's raw mf-manifest.json. */
type ManifestExpose = { path: string; assets: { css: CssLists; js: { sync: string[] } } };

const outDirs: string[] = [];
/** Watch children started by the running test, for `afterEach` to kill. */
const watchChildren = new Set<ChildProcess>();

beforeAll(() => {
  fixture = copyFixture('shared-chunk-css');
  fixtureDir = fixture.dir;
  // `sonner`: a node_modules stylesheet the fixture's own code imports.
  installPackage(fixture, 'sonner', { version: '0.0.0-fixture', type: undefined }, {
    'dist/styles.css': '[data-sonner-toaster] {\n  position: fixed;\n}\n',
  });
  // `fixture-shared-kit`: a shared package whose component modules import
  // their own stylesheets, behind a side-effect-free barrel.
  const components = ['button', 'badge', 'card'];
  const kitFiles: Record<string, string> = {
    'dist/index.js': components
      .map((c) => `export { Kit${c[0].toUpperCase()}${c.slice(1)} } from './${c}.js';\n`)
      .join(''),
  };
  for (const c of components) {
    kitFiles[`dist/${c}.js`] =
      `import './${c}.css';\n\nexport function Kit${c[0].toUpperCase()}${c.slice(1)}() {\n  return 'kit-${c}';\n}\n`;
    kitFiles[`dist/${c}.css`] = `.kit-${c} {\n  color: rgb(7, 8, 9);\n}\n`;
  }
  installPackage(
    fixture,
    'fixture-shared-kit',
    { sideEffects: ['**/*.css'], exports: { '.': './dist/index.js', './*': './dist/*' } },
    kitFiles
  );
});

afterAll(() => {
  fixture?.remove();
});

afterEach(async () => {
  // A test that Vitest timed out never reached its `finally`, so its child
  // is still watching: stop it here, which runs after a timeout too, and
  // wait for it to close before the outDir it is still writing into is
  // removed.
  await Promise.all([...watchChildren].map((child) => stopWatchBuild(child)));
  for (const dir of outDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  // A test that wrote a rule into the fixture's empty stylesheet must have
  // restored it: the fixture ships it empty and every other test relies on
  // that.
  expect(fs.statSync(path.join(fixtureDir, 'src', 'kit-zero.css')).size).toBe(0);
});

/** One child build may take up to its 120 s limit; the global test timeout is shorter. */
const BUILD_TEST_TIMEOUT_MS = 150_000;

/**
 * Builds the fixture in a child process and returns its outDir. A failed
 * build throws an error carrying the child's `stderr`; `onOutput` receives
 * the stdout and stderr of a build that passed.
 */
function buildFixture(
  exposes: string,
  cssCodeSplit = true,
  extraEnv: Record<string, string> = {},
  logLevel = 'error',
  onOutput?: (output: string) => void
): string {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-chunk-css-'));
  outDirs.push(outDir);
  const result = runViteBuild({
    cwd: fixtureDir,
    args: ['--outDir', outDir, '--logLevel', logLevel],
    env: {
      ...fixture.env,
      FIXTURE_EXPOSES: exposes,
      FIXTURE_CSS_CODE_SPLIT: String(cssCodeSplit),
      ...extraEnv,
    },
  });
  if (result.error || result.status !== 0) {
    throw Object.assign(
      result.error ??
        new Error(
          `vite build exited with ${result.status ?? result.signal}\n${String(result.stderr).slice(-2000)}`
        ),
      { stderr: result.stderr }
    );
  }
  onOutput?.(`${String(result.stdout)}\n${String(result.stderr)}`);
  return outDir;
}

/** The stderr of a fixture build that must fail. */
function failedBuildStderr(exposes: string, extraEnv: Record<string, string> = {}, logLevel = 'error'): string {
  let stderr = '';
  let failed = false;
  try {
    buildFixture(exposes, true, extraEnv, logLevel);
  } catch (error) {
    failed = true;
    stderr = String((error as { stderr?: Buffer }).stderr ?? '');
  }
  expect(failed, 'build should fail').toBe(true);
  return stderr;
}

/** Drops Vite's content hash so assertions name files, not builds. */
function stripHash(file: string): string {
  return file.replace(/-[A-Za-z0-9_-]{8}\.css$/, '.css');
}

function unhashed(lists: CssLists): CssLists {
  return { sync: lists.sync.map(stripHash), async: lists.async.map(stripHash) };
}

/**
 * The expose's stripped CSS lists, failing the test naming the expose when
 * it is missing instead of hiding it behind an empty-list diff.
 */
function exposeCss(raw: { exposes: ManifestExpose[] }, exposePath: string): CssLists {
  const expose = raw.exposes.find((e) => e.path === exposePath);
  expect(expose, exposePath).toBeDefined();
  return unhashed((expose as ManifestExpose).assets.css);
}

/**
 * Every `import(...)` and `__frontx_lazy(...)` call with a string argument,
 * in any quote style, with any spacing and comments around it.
 */
function dynamicImportCalls(code: string): Array<{ callee: string; target: string }> {
  const gap = String.raw`(?:\s|/\*[\s\S]*?\*/)*`;
  const call = new RegExp(String.raw`\b(import|__frontx_lazy)${gap}\(${gap}(['"\`])([^'"\`]+)\2`, 'g');
  return [...code.matchAll(call)].map((m) => ({ callee: m[1], target: m[3] }));
}

/** The built CSS files whose content includes `marker`, as manifest paths. */
function cssFilesWith(outDir: string, marker: string): string[] {
  const assetsDir = path.join(outDir, 'assets');
  return fs
    .readdirSync(assetsDir)
    .filter((f) => f.endsWith('.css'))
    .filter((f) => fs.readFileSync(path.join(assetsDir, f), 'utf-8').includes(marker))
    .map((f) => `assets/${f}`);
}

/** The one built CSS file carrying the kit (sonner) rules, with its hash. */
function kitCssFile(outDir: string): string {
  const kitCss = cssFilesWith(outDir, 'data-sonner-toaster');
  expect(kitCss).toHaveLength(1);
  return kitCss[0];
}

/**
 * One overall budget for the watch tests: every wait is derived from the
 * test's start plus `WATCH_TEST_TIMEOUT_MS - WATCH_WAIT_MARGIN_MS`, so slow
 * runs always fail with the child's captured output inside the test timeout
 * instead of Vitest's generic timeout, which reports nothing about the child
 * and leaves it running.
 */
const WATCH_TEST_TIMEOUT_MS = 180_000;
/** Kept back from the test timeout so the waits always fail first. */
const WATCH_WAIT_MARGIN_MS = 15_000;

/**
 * A `vite build --watch` child over the fixture, with its output captured
 * for polling and for the failure message. Vite's watch branch logs one
 * `built in` line per build, so counting those lines tells a successful
 * rebuild from a failed one, which only logs its error and keeps watching.
 */
function startWatchBuild(
  outDir: string,
  options: { exposes?: string; extraEnv?: Record<string, string> } = {}
): {
  child: ChildProcess;
  buildsSeen: () => number;
  buildsStarted: () => number;
  failed: () => boolean;
  tail: () => string;
} {
  const env = buildEnv({
    ...fixture.env,
    FIXTURE_EXPOSES: options.exposes ?? 'a,b,u,v',
    ...(options.extraEnv ?? {}),
  });
  const child = spawn(process.execPath, [viteBin, 'build', '--watch', '--outDir', outDir], {
    cwd: fixtureDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  watchChildren.add(child);
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk;
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk;
  });
  // A build failure after the `built in` line: the plugin's closeBundle
  // rejection Vite does not await kills the child (the crash prints the
  // error to stderr), and a build-phase error surfaces through Vite's own
  // error logging.
  const failure = /error during build|CSS imported by an exposed module was not attributed/;
  return {
    child,
    buildsSeen: () => (stdout.match(/built in \d+(?:\.\d+)?(?:ms|s|m)/g) ?? []).length,
    // Vite logs "build started..." on every BUNDLE_START, the first build's too.
    buildsStarted: () => (stdout.match(/build started\.\.\./g) ?? []).length,
    failed: () =>
      child.exitCode !== null ||
      child.signalCode !== null ||
      failure.test(stdout) ||
      failure.test(stderr),
    tail: () => `child stdout tail:\n${stdout.slice(-3000)}\nchild stderr tail:\n${stderr.slice(-3000)}`,
  };
}

/**
 * Polls until `predicate` holds or the shared absolute `deadlineMs` passes,
 * naming `what` and the captured output on timeout.
 */
async function waitFor(
  what: string,
  predicate: () => boolean,
  deadlineMs: number,
  context: () => string
): Promise<void> {
  while (Date.now() < deadlineMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out at the watch deadline waiting for ${what}\n${context()}`);
}

/**
 * Closes the watcher, waiting for the child to be gone before returning:
 * SIGTERM first, SIGKILL only when SIGTERM did not end it in time, and the
 * `close` event waited for after the escalation too (bounded), because
 * cleanup removes the outDir the child may still be writing into.
 */
async function stopWatchBuild(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      const killTimer = setTimeout(resolve, 5_000);
      child.once('close', () => {
        clearTimeout(killTimer);
        resolve();
      });
    }, 10_000);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    if (child.exitCode !== null || child.signalCode !== null) {
      clearTimeout(timer);
      resolve();
    }
  });
  watchChildren.delete(child);
}

/** The exposes of the build's mf-manifest.json, or undefined while it is missing. */
function tryReadExposeCss(outDir: string): ManifestExpose[] | undefined {
  try {
    return readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json')).exposes;
  } catch {
    return undefined;
  }
}

/**
 * The entries of the build's enriched mfe-manifest.json, or undefined while
 * it is missing. The plugin writes this file in its own closeBundle, after
 * the CSS-delivery guard, so its presence per build is that build's proof
 * the guard passed.
 */
function tryReadEnrichedEntries(
  outDir: string
): Array<{ exposedModule: string; exposeAssets: { css: CssLists } }> | undefined {
  try {
    return readJson<{ entries: Array<{ exposedModule: string; exposeAssets: { css: CssLists } }> }>(
      path.join(outDir, 'mfe-manifest.json')
    ).entries;
  } catch {
    return undefined;
  }
}

/**
 * The modification stamp of `file`, or undefined while it is missing. The
 * plugin writes the enriched manifest and the build report in its own
 * closeBundle, so a new stamp is that rebuild's proof the file was written
 * again; "built in" only says Rollup finished.
 */
function stampOf(file: string): number | undefined {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
}

describe('vitePluginMfeGts shared-chunk CSS attribution', () => {
  it('points an expose with an extensionless module path at an entry chunk exporting its default', () => {
    const outDir = buildFixture('a,b', true, { FIXTURE_EXPOSE_PATHS: 'extensionless' });
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    for (const expose of ['./lifecycle-a', './lifecycle-b']) {
      const files = raw.exposes.find((e) => e.path === expose)?.assets.js.sync ?? [];
      expect(files, expose).toHaveLength(1);
      expect(fs.readFileSync(path.join(outDir, files[0]), 'utf-8'), expose).toMatch(
        /export\s*\{[^}]*\bas\s+default\b[^}]*\}|export\s+default\s/,
      );
    }
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails the build naming an expose whose module does not resolve', () => {
    const stderr = failedBuildStderr('a', { FIXTURE_EXPOSE_PATHS: 'missing' });
    expect(stderr).toContain("expose './lifecycle-absent'");
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists the shared chunk CSS for every expose that declares CSS of its own, before that CSS, and lazy chunk CSS as async with dependencies first', () => {
    const outDir = buildFixture('a,b');
    const enriched = readJson<{ entries: Array<{ exposedModule: string; exposeAssets: { css: CssLists } }> }>(
      path.join(outDir, 'mfe-manifest.json')
    );
    const css = Object.fromEntries(
      enriched.entries.map((e) => [e.exposedModule, unhashed(e.exposeAssets.css)])
    );
    expect(css).toEqual({
      './lifecycle-a': { sync: ['assets/shared.css', 'assets/lifecycle-a.css'], async: [] },
      './lifecycle-b': {
        sync: ['assets/shared.css', 'assets/lifecycle-b.css'],
        async: ['assets/lazy-dep.css', 'assets/lazy-panel.css', 'assets/lazy-other.css'],
      },
    });
  }, BUILD_TEST_TIMEOUT_MS);

  it('builds an expose whose only CSS sits in the shared chunk and lists that CSS for it', () => {
    const outDir = buildFixture('a,b,c');
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    expect(exposeCss(raw, './lifecycle-c')).toEqual({ sync: ['assets/shared.css'], async: [] });
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists CSS that Vite merged from a CSS-only shared chunk into a lazy importer, and the node_modules-only CSS of a chunk two exposes share', () => {
    const outDir = buildFixture('a,b,d,e,f');
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const css = Object.fromEntries(raw.exposes.map((e) => [e.path, unhashed(e.assets.css)]));
    expect(css['./lifecycle-f']).toEqual({ sync: [], async: ['assets/common.css'] });
    // lifecycle-d and lifecycle-e share the toolbar chunk, whose own CSS file
    // is built only from `sonner/dist/styles.css`; the walk lists it for both,
    // after the CSS of what that chunk imports.
    expect(css['./lifecycle-d']).toEqual({ sync: ['assets/common.css', 'assets/toolbar.css'], async: [] });
    expect(css['./lifecycle-e']).toEqual({ sync: ['assets/common.css', 'assets/toolbar.css'], async: [] });

    const vendorCss = cssFilesWith(outDir, 'data-sonner-toaster');
    expect(vendorCss).toHaveLength(1);
    const listed = raw.exposes.flatMap((e) => [...e.assets.css.sync, ...e.assets.css.async]);
    expect(listed).toContain(vendorCss[0]);
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists node_modules-only CSS reached only lazily: through a lazy chunk, and through a direct dynamic import Vite removes', () => {
    const outDir = buildFixture('a,b,q,r');
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const vendorCss = cssFilesWith(outDir, 'data-sonner-toaster');
    expect(vendorCss).toHaveLength(1);
    // lifecycle-q imports `lazy-toaster.js`, whose only CSS is
    // `sonner/dist/styles.css`; lifecycle-r imports that stylesheet itself.
    for (const expose of ['./lifecycle-q', './lifecycle-r']) {
      const css = raw.exposes.find((e) => e.path === expose)?.assets.css;
      expect(css, expose).toEqual({ sync: [], async: vendorCss });
    }
  }, BUILD_TEST_TIMEOUT_MS);

  it('keeps the node_modules CSS federation lists for an expose that imports it itself', () => {
    const outDir = buildFixture('a,b,g');
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const exposeG = raw.exposes.find((e) => e.path === './lifecycle-g');
    expect(exposeG && unhashed(exposeG.assets.css)).toEqual({ sync: ['assets/lifecycle-g.css'], async: [] });
    const listedFile = path.join(outDir, (exposeG as ManifestExpose).assets.css.sync[0]);
    expect(fs.readFileSync(listedFile, 'utf-8')).toContain('data-sonner-toaster');
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists the CSS of a directly imported lazy stylesheet as async, leaves no dynamic import of a removed file, and builds an expose whose stylesheets are ?raw and ?url only', () => {
    const outDir = buildFixture('a,b,j,k,l,m,n');
    const raw = readJson<{ exposes: Array<{ path: string; assets: { css: CssLists; js: { sync: string[] } } }> }>(
      path.join(outDir, 'mf-manifest.json')
    );
    const exposeCalls = (expose: string): Array<{ callee: string; target: string; exists: boolean }> => {
      const files = raw.exposes.find((e) => e.path === expose)?.assets.js.sync ?? [];
      expect(files.length).toBeGreaterThan(0);
      return files.flatMap((file) => {
        const code = fs.readFileSync(path.join(outDir, file), 'utf-8');
        expect(code).not.toMatch(/theme(-[lmn])?-[A-Za-z0-9_-]{8}\.js/);
        return dynamicImportCalls(code).map((c) => ({
          ...c,
          exists: fs.existsSync(path.join(outDir, path.dirname(file), c.target)),
        }));
      });
    };
    const css = Object.fromEntries(raw.exposes.map((e) => [e.path, unhashed(e.assets.css)]));
    expect(css['./lifecycle-j']).toEqual({ sync: [], async: ['assets/theme.css'] });
    expect(css['./lifecycle-l']).toEqual({ sync: [], async: ['assets/theme-l.css'] });
    expect(css['./lifecycle-m']).toEqual({ sync: [], async: ['assets/theme-m.css'] });
    expect(css['./lifecycle-n']).toEqual({ sync: [], async: ['assets/theme-n.css'] });
    expect(css['./lifecycle-k']).toEqual({ sync: [], async: [] });

    // Plain, commented and spaced, double-quoted forms of `import('./theme*.css')`,
    // and an `import()` of a module that only imports a stylesheet.
    for (const expose of ['./lifecycle-j', './lifecycle-l', './lifecycle-m', './lifecycle-n']) {
      expect(exposeCalls(expose)).toEqual([]);
    }
    // A lazy chunk that stays still loads through the runtime resolver.
    const lazyPanel = exposeCalls('./lifecycle-b');
    expect(lazyPanel.length).toBeGreaterThan(0);
    for (const call of lazyPanel) expect(call).toMatchObject({ callee: '__frontx_lazy', exists: true });
  }, BUILD_TEST_TIMEOUT_MS);

  it('builds an expose that lazily imports a stylesheet compiling to no CSS and loads the chunk Vite keeps through __frontx_lazy', () => {
    const outDir = buildFixture('a,b,o');
    const raw = readJson<{ exposes: Array<{ path: string; assets: { js: { sync: string[] } } }> }>(
      path.join(outDir, 'mf-manifest.json')
    );
    const files = raw.exposes.find((e) => e.path === './lifecycle-o')?.assets.js.sync ?? [];
    expect(files.length).toBeGreaterThan(0);
    const calls = files.flatMap((file) =>
      dynamicImportCalls(fs.readFileSync(path.join(outDir, file), 'utf-8')).map((c) => ({
        ...c,
        exists: fs.existsSync(path.join(outDir, path.dirname(file), c.target)),
      }))
    );
    expect(calls).toEqual([
      { callee: '__frontx_lazy', target: expect.stringMatching(/empty-[A-Za-z0-9_-]{8}\.js$/), exists: true },
    ]);
  }, BUILD_TEST_TIMEOUT_MS);

  it('builds exposes whose only CSS is a stylesheet that compiles to no CSS', () => {
    let output = '';
    const outDir = buildFixture('a,b,u,v', true, {}, 'warn', (o) => {
      output = o;
    });
    // The recorder is placed before vite:css-post, so the build does not
    // warn that the exclusions are off.
    expect(output).not.toContain('could not place the empty-CSS recorder');
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    // `zero-kit/zero.css` compiles to no CSS, so there is no file to deliver:
    // both exposes list no CSS; without the empty-CSS recording the guard
    // would fail the build counting it as CSS the lists never name.
    expect(exposeCss(raw, './lifecycle-u')).toEqual({ sync: [], async: [] });
    expect(exposeCss(raw, './lifecycle-v')).toEqual({ sync: [], async: [] });
    for (const expose of ['./lifecycle-u', './lifecycle-v']) {
      const files = raw.exposes.find((e) => e.path === expose)?.assets.js.sync ?? [];
      expect(files.length, expose).toBeGreaterThan(0);
      // The loader reads the chunk's own `default` export: the chunk an expose names is the entry chunk emitted for its module.
      for (const file of files) {
        expect(fs.readFileSync(path.join(outDir, file), 'utf-8'), `${expose} ${file}`).toMatch(
          /export\s*\{[^}]*\bas\s+default\b[^}]*\}|export\s+default\s/,
        );
      }
    }
  }, BUILD_TEST_TIMEOUT_MS);

  it('builds with per-chunk CSS when the config asks for a single style file, warning that the override is ignored', () => {
    let output = '';
    const outDir = buildFixture('a,b,u,v', false, {}, 'warn', (o) => {
      output = o;
    });
    expect(output).toContain('build.cssCodeSplit is owned by the plugin');
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    expect(exposeCss(raw, './lifecycle-u')).toEqual({ sync: [], async: [] });
    expect(exposeCss(raw, './lifecycle-v')).toEqual({ sync: [], async: [] });
    expect(exposeCss(raw, './lifecycle-a')).toEqual({
      sync: ['assets/shared.css', 'assets/lifecycle-a.css'],
      async: [],
    });
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists the filled CSS when a plugin listed after the recorder fills the empty stylesheet', () => {
    // The appended rule makes `zero-kit/zero.css` compile to CSS that Vite
    // stores: it must reach both exposes, never be skipped as empty.
    const outDir = buildFixture('a,b,u,v', true, { FIXTURE_LATE_CSS_APPENDER: 'true' });
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const filled = cssFilesWith(outDir, 'late-added-rule');
    expect(filled).toHaveLength(1);
    for (const expose of ['./lifecycle-u', './lifecycle-v']) {
      expect(raw.exposes.find((e) => e.path === expose)?.assets.css, expose).toEqual({
        sync: filled,
        async: [],
      });
    }
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails the guard on the empty stylesheet when the recorder cannot be placed before vite:css-post', () => {
    // With vite:css-post unfindable the recorder records nothing, so the
    // guard counts every stylesheet, the empty one too, and fails naming
    // both exposes: a recorder left in place could record a stylesheet empty
    // that a later plugin fills.
    const stderr = failedBuildStderr('a,b,u,v', { FIXTURE_HIDE_CSS_POST: 'true' }, 'warn');
    expect(stderr).toContain('could not place the empty-CSS recorder before vite:css-post');
    expect(stderr).toMatch(/expose '\.\/lifecycle-u' needs: \S*kit-zero\.css/);
    expect(stderr).toMatch(/expose '\.\/lifecycle-v' needs: \S*kit-zero\.css/);
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails the second of two builds sharing one vitePluginMfeGts() instance when its recorder cannot be placed', () => {
    const firstOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-chunk-css-reuse-'));
    const secondOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-chunk-css-reuse-'));
    outDirs.push(firstOutDir, secondOutDir);
    const env = buildEnv({ ...fixture.env, FIXTURE_EXPOSES: 'a,b,u,v' });
    delete env.FIXTURE_HIDE_CSS_POST;
    delete env.FIXTURE_LATE_CSS_APPENDER;
    let stderr = '';
    let failed = false;
    try {
      execFileSync(process.execPath, ['reused-plugin-builds.mjs', firstOutDir, secondOutDir], {
        cwd: fixtureDir,
        env,
        stdio: 'pipe',
        timeout: 120_000,
      });
    } catch (error) {
      failed = true;
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    // The first build records `zero-kit/zero.css` empty and passes. The
    // second cannot place its recorder, so it must count the stylesheet: a
    // recording kept from the first build would skip it and let the build
    // pass on another build's facts.
    expect(fs.existsSync(path.join(firstOutDir, 'mfe-manifest.json')), 'first build should pass').toBe(true);
    expect(failed, 'second build should fail the CSS guard').toBe(true);
    expect(stderr).toContain('could not place the empty-CSS recorder before vite:css-post');
    expect(stderr).toMatch(/expose '\.\/lifecycle-u' needs: \S*kit-zero\.css/);
    expect(stderr).toMatch(/expose '\.\/lifecycle-v' needs: \S*kit-zero\.css/);
  }, BUILD_TEST_TIMEOUT_MS);

  it('keeps building the empty-stylesheet exposes on a watch rebuild whose stylesheets stay cached', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-chunk-css-watch-'));
    outDirs.push(outDir);
    const manifestExposes = (): ManifestExpose[] | undefined => tryReadExposeCss(outDir);
    const watch = startWatchBuild(outDir);
    try {
      const deadline = Date.now() + WATCH_TEST_TIMEOUT_MS - WATCH_WAIT_MARGIN_MS;
      await waitFor('the first build', () => watch.buildsSeen() > 0 || watch.failed(), deadline, watch.tail);
      await waitFor(
        'the first build enriched manifest',
        () => tryReadEnrichedEntries(outDir) !== undefined || watch.failed(),
        deadline,
        watch.tail
      );
      expect(watch.failed(), watch.tail()).toBe(false);
      expect(exposeCss({ exposes: manifestExposes() ?? [] }, './lifecycle-u')).toEqual({ sync: [], async: [] });
      expect(exposeCss({ exposes: manifestExposes() ?? [] }, './lifecycle-v')).toEqual({ sync: [], async: [] });

      // Touch an unrelated JS source. Its content is unchanged, so Rollup
      // serves every module whose file did not change from its transform
      // cache, kit-zero.css included: the rebuild must still succeed with
      // the recording carried over from the first build. A recording
      // cleared in buildStart (or one that missed the cached stylesheet)
      // fails the guard in the plugin's closeBundle, the watcher dies on
      // it, and the enriched mfe-manifest.json (written last, after the
      // guard) is never written again.
      const touched = path.join(fixtureDir, 'src', 'lifecycle-b.js');
      const manifestFile = path.join(outDir, 'mfe-manifest.json');
      const firstStamp = stampOf(manifestFile);
      let lastTouch = Date.now();
      const retouch = (): void => {
        lastTouch = Date.now();
        const now = new Date();
        fs.utimesSync(touched, now, now);
      };
      retouch();
      await waitFor(
        'the rebuild to start',
        () => {
          if (watch.buildsStarted() <= 1 && Date.now() - lastTouch >= 3_000) retouch();
          return watch.buildsStarted() > 1 || watch.failed();
        },
        deadline,
        watch.tail
      );
      await waitFor(
        'the rebuilt enriched manifest',
        () => {
          const stamp = stampOf(manifestFile);
          return (stamp !== undefined && stamp !== firstStamp) || watch.failed();
        },
        deadline,
        watch.tail
      );
      expect(watch.failed(), watch.tail()).toBe(false);
      const rebuiltCss = Object.fromEntries(
        (tryReadEnrichedEntries(outDir) ?? []).map((e) => [e.exposedModule, unhashed(e.exposeAssets.css)])
      );
      expect(rebuiltCss['./lifecycle-a']?.sync).toContain('assets/shared.css');
      expect(rebuiltCss['./lifecycle-b']?.sync).toContain('assets/shared.css');
      await waitFor('the rebuilt manifest', () => manifestExposes() !== undefined, deadline, watch.tail);
      expect(exposeCss({ exposes: manifestExposes() ?? [] }, './lifecycle-u')).toEqual({ sync: [], async: [] });
      expect(exposeCss({ exposes: manifestExposes() ?? [] }, './lifecycle-v')).toEqual({ sync: [], async: [] });
    } finally {
      await stopWatchBuild(watch.child);
    }
  }, WATCH_TEST_TIMEOUT_MS);

  it('records the consumer barrel rewrites of a watch rebuild whose rewritten module stayed unchanged', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-chunk-css-watch-ledger-'));
    outDirs.push(outDir);
    const kitRewrites = (): number | undefined => {
      try {
        const report = readJson<{ consumerBarrels: Array<{ name: string; rewrites: number }> }>(
          path.join(outDir, 'mfe-build-report.json')
        );
        return report.consumerBarrels.find((b) => b.name === 'fixture-shared-kit')?.rewrites ?? 0;
      } catch {
        return undefined;
      }
    };
    // lifecycle-z imports a component from the kit's barrel: the rewrite
    // moves it to the defining module.
    const watch = startWatchBuild(outDir, { exposes: 'a,b,z' });
    try {
      const deadline = Date.now() + WATCH_TEST_TIMEOUT_MS - WATCH_WAIT_MARGIN_MS;
      await waitFor('the first build report', () => kitRewrites() !== undefined || watch.failed(), deadline, watch.tail);
      expect(watch.failed(), watch.tail()).toBe(false);
      expect(kitRewrites(), watch.tail()).toBeGreaterThan(0);

      // Touch an unrelated source: lifecycle-z is served from Rollup's
      // transform cache on the rebuild.
      const touched = path.join(fixtureDir, 'src', 'lifecycle-b.js');
      const reportFile = path.join(outDir, 'mfe-build-report.json');
      const firstStamp = stampOf(reportFile);
      let lastTouch = Date.now();
      const retouch = (): void => {
        lastTouch = Date.now();
        const now = new Date();
        fs.utimesSync(touched, now, now);
      };
      retouch();
      await waitFor(
        'the rebuild to start',
        () => {
          if (watch.buildsStarted() <= 1 && Date.now() - lastTouch >= 3_000) retouch();
          return watch.buildsStarted() > 1 || watch.failed();
        },
        deadline,
        watch.tail
      );
      // The report of the first build is still on disk until the rebuild's
      // closeBundle writes its own: read it only once that happened.
      await waitFor(
        'the rebuilt report',
        () => {
          const stamp = stampOf(reportFile);
          return (stamp !== undefined && stamp !== firstStamp) || watch.failed();
        },
        deadline,
        watch.tail
      );
      expect(watch.failed(), watch.tail()).toBe(false);
      expect(kitRewrites(), watch.tail()).toBeGreaterThan(0);
    } finally {
      await stopWatchBuild(watch.child);
    }
  }, WATCH_TEST_TIMEOUT_MS);

  it('lists the stylesheet on a watch rebuild in which it gains a rule, and none again when it loses it', async () => {
    const kitZeroPath = path.join(fixtureDir, 'src', 'kit-zero.css');
    expect(fs.statSync(kitZeroPath).size, 'kit-zero.css must ship empty').toBe(0);
    const restoreKitZero = (): void => {
      fs.writeFileSync(kitZeroPath, '');
      expect(fs.statSync(kitZeroPath).size).toBe(0);
    };
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-chunk-css-watch-'));
    outDirs.push(outDir);
    const watch = startWatchBuild(outDir);
    /** Writes `content` until the watcher has started build number `build`. */
    const rewriteUntilBuild = async (content: string, build: number, deadline: number): Promise<void> => {
      let lastWrite = Date.now();
      const write = (): void => {
        lastWrite = Date.now();
        fs.writeFileSync(kitZeroPath, content);
      };
      write();
      await waitFor(
        `build ${build} to start`,
        () => {
          if (watch.buildsStarted() >= build || watch.failed()) return true;
          if (Date.now() - lastWrite >= 3_000) write();
          return false;
        },
        deadline,
        watch.tail
      );
      await waitFor(
        `build ${build} to finish`,
        () => watch.buildsSeen() >= build || watch.failed(),
        deadline,
        watch.tail
      );
      await waitFor(
        `build ${build} enriched manifest`,
        () => tryReadEnrichedEntries(outDir) !== undefined || watch.failed(),
        deadline,
        watch.tail
      );
    };
    try {
      const deadline = Date.now() + WATCH_TEST_TIMEOUT_MS - WATCH_WAIT_MARGIN_MS;
      await waitFor('the first build', () => watch.buildsSeen() > 0 || watch.failed(), deadline, watch.tail);
      await waitFor(
        'the first build enriched manifest',
        () => tryReadEnrichedEntries(outDir) !== undefined || watch.failed(),
        deadline,
        watch.tail
      );
      expect(watch.failed(), watch.tail()).toBe(false);
      expect(exposeCss({ exposes: tryReadExposeCss(outDir) ?? [] }, './lifecycle-u')).toEqual({
        sync: [],
        async: [],
      });

      // Give the empty stylesheet a rule: the rebuild re-transforms it, so
      // the recording must drop its stale empty entry, and the stored CSS
      // reaches both exposes.
      await rewriteUntilBuild('.watch-added-rule { color: olive; }\n', 2, deadline);
      expect(watch.failed(), watch.tail()).toBe(false);
      const ruled = cssFilesWith(outDir, 'watch-added-rule');
      expect(ruled).toHaveLength(1);
      expect(tryReadExposeCss(outDir)?.find((e) => e.path === './lifecycle-u')?.assets.css).toEqual({
        sync: ruled,
        async: [],
      });

      // Empty it again: the rebuild must record it empty afresh, or the
      // guard fails both exposes on a stylesheet no file carries.
      await rewriteUntilBuild('', 3, deadline);
      expect(watch.failed(), watch.tail()).toBe(false);
      expect(exposeCss({ exposes: tryReadExposeCss(outDir) ?? [] }, './lifecycle-u')).toEqual({
        sync: [],
        async: [],
      });
      expect(exposeCss({ exposes: tryReadExposeCss(outDir) ?? [] }, './lifecycle-v')).toEqual({
        sync: [],
        async: [],
      });
    } finally {
      restoreKitZero();
      await stopWatchBuild(watch.child);
      restoreKitZero();
    }
  }, WATCH_TEST_TIMEOUT_MS);

  it('lists a removed kit chunk CSS where its importer imported it, ahead of the screen CSS it precedes, and behind it in the mirrored import order', () => {
    const outDir = buildFixture('a,b,s,w,x');
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const kitCss = kitCssFile(outDir);
    // lifecycle-w imports the kit stylesheet before ./shared.js, so Vite
    // removes the kit's CSS-only chunk and the importer's list must keep the
    // kit file where the import was: before the shared (screen) CSS, whose
    // rules then win equal-specificity ties.
    expect(exposeCss(raw, './lifecycle-w')).toEqual({
      sync: [stripHash(kitCss), 'assets/shared.css'],
      async: [],
    });
    // The mirror pins the other half of the recorded order: the surviving
    // shared chunk must get its final name and its recorded place back.
    expect(exposeCss(raw, './lifecycle-x')).toEqual({
      sync: ['assets/shared.css', stripHash(kitCss)],
      async: [],
    });
  }, BUILD_TEST_TIMEOUT_MS);

  it('wires ownChunks end to end: every expose and lazy list names only emitted files, and the statically imported shared chunk is on the lists of the exposes that reach it', () => {
    const outDir = buildFixture('a,b,s,w,x');
    interface ListShape {
      ownChunks?: string[];
    }
    const { manifest } = readJson<{ manifest: { lists?: Record<string, ListShape> } }>(
      path.join(outDir, 'mfe-manifest.json')
    );
    // The lists are held in the manifest: no list document is emitted.
    const emitted: string[] = [];
    const walkDir = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkDir(full);
        else emitted.push(entry.name);
      }
    };
    walkDir(outDir);
    expect(emitted.filter((n) => /\.list\..*\.json$/.test(n))).toEqual([]);
    // Every list is held once, exposed modules' and lazy targets' alike.
    const lists = Object.entries(manifest.lists ?? {}).map(([where, list]) => ({ where, list }));
    expect(lists.length).toBeGreaterThan(0);
    const named: string[] = [];
    for (const { where, list } of lists) {
      expect(Array.isArray(list.ownChunks), where).toBe(true);
      for (const chunk of list.ownChunks ?? []) {
        named.push(chunk);
        // A removed CSS-only chunk has no emitted file and is never listed.
        expect(fs.existsSync(path.join(outDir, chunk)), `${chunk} listed by ${where}`).toBe(true);
      }
    }
    expect(named.some((c) => c === 'assets/shared.js' || /^assets\/shared-.*\.js$/.test(c))).toBe(true);
  }, BUILD_TEST_TIMEOUT_MS);

  it('keeps following the final imports when a later plugin replaces a static import: the CSS of the chunk it dropped is not listed', () => {
    // The fixture import editor swaps lifecycle-w's import of the shared
    // chunk for the kit-toaster chunk before the attribution runs. The kit
    // file stays (w still imports the kit-toaster chunk that carries it) and
    // the shared chunk's CSS, which w no longer imports, must not come back
    // from the recording.
    const outDir = buildFixture('a,b,t,w,y', true, { FIXTURE_IMPORT_EDIT: 'replace' });
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const kitFile = stripHash(kitCssFile(outDir));
    expect(exposeCss(raw, './lifecycle-w')).toEqual({ sync: [kitFile], async: [] });
  }, BUILD_TEST_TIMEOUT_MS);

  it('keeps following the final imports when a later plugin reorders static imports: the edited order, not the recorded one, is the listed order', () => {
    const outDir = buildFixture('a,b,t,w,y', true, { FIXTURE_IMPORT_EDIT: 'reorder' });
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const kitFile = stripHash(kitCssFile(outDir));
    expect(exposeCss(raw, './lifecycle-y')).toEqual({
      sync: [kitFile, 'assets/shared.css'],
      async: [],
    });
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists a shared PostCSS stylesheet for both exposes that share it', () => {
    const outDir = buildFixture('a,b,h,i', false);
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const badge = cssFilesWith(outDir, '.badge');
    expect(badge).toHaveLength(1);
    expect(raw.exposes.find((e) => e.path === './lifecycle-h')?.assets.css).toEqual({ sync: badge, async: [] });
    expect(raw.exposes.find((e) => e.path === './lifecycle-i')?.assets.css).toEqual({ sync: badge, async: [] });
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists the node_modules stylesheet for an expose whose lazy chunk is its only carrier', () => {
    const outDir = buildFixture('a,b,q', false);
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    expect(raw.exposes.find((e) => e.path === './lifecycle-q')?.assets.css).toEqual({
      sync: [],
      async: [kitCssFile(outDir)],
    });
  }, BUILD_TEST_TIMEOUT_MS);

  it('lists the node_modules stylesheet for exposes that reach it only through static imports of the CSS-only chunk Vite removes', () => {
    // Rollup hoists the stylesheet into a CSS-only chunk both exposes reach
    // through static imports, and Vite removes it and strips those imports:
    // the recovered chunk keeps it reachable for both.
    const outDir = buildFixture('a,b,s,t', false);
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const kitFile = kitCssFile(outDir);
    expect(raw.exposes.find((e) => e.path === './lifecycle-s')?.assets.css).toEqual({ sync: [kitFile], async: [] });
    expect(raw.exposes.find((e) => e.path === './lifecycle-t')?.assets.css).toEqual({ sync: [kitFile], async: [] });
  }, BUILD_TEST_TIMEOUT_MS);

  it("lists the stylesheets a shared package's used components import, the lazily used one as async, and no other component's", () => {
    const outDir = buildFixture('a,b,z');
    const raw = readJson<{ exposes: ManifestExpose[] }>(path.join(outDir, 'mf-manifest.json'));
    const button = cssFilesWith(outDir, '.kit-button');
    const badge = cssFilesWith(outDir, '.kit-badge');
    expect(button).toHaveLength(1);
    expect(badge).toHaveLength(1);
    expect(cssFilesWith(outDir, '.kit-card')).toEqual([]);
    const css = raw.exposes.find((e) => e.path === './lifecycle-z')?.assets.css;
    expect(css?.sync).toEqual(button);
    expect(css?.async).toEqual(badge);
    // The package itself is shared: its modules are units, not chunks of
    // the MFE's own build.
    const report = readJson<{ packages?: Array<{ name: string }> }>(path.join(outDir, 'mfe-build-report.json'));
    expect((report.packages ?? []).map((p) => p.name)).toContain('fixture-shared-kit');
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails the build when a chunk still loads through __frontx_lazy a chunk that was deleted after rendering', () => {
    const stderr = failedBuildStderr('a,b', { FIXTURE_SKEW_LAZY_PANEL: 'keep-call' });
    expect(stderr).toMatch(/loads '\.\/lazy-panel-[A-Za-z0-9_-]{8}\.js' through __frontx_lazy, but the bundle has no such file/);
  }, BUILD_TEST_TIMEOUT_MS);

  it('builds when a chunk whose dynamic imports changed after rendering no longer loads the chunk that was deleted', () => {
    const outDir = buildFixture('a,b', true, { FIXTURE_SKEW_LAZY_PANEL: 'drop-call' });
    expect(fs.existsSync(path.join(outDir, 'mfe-manifest.json'))).toBe(true);
    expect(fs.readdirSync(path.join(outDir, 'assets')).filter((f) => /^lazy-panel-.*\.js$/.test(f))).toEqual([]);
  }, BUILD_TEST_TIMEOUT_MS);

  it('fails the build when a chunk loads through __frontx_lazy a concatenated path no chunk has', () => {
    const stderr = failedBuildStderr('a,b,p');
    expect(stderr).toMatch(/loads '\.\/missing-lazy\.js' through __frontx_lazy, but the bundle has no such file/);
  }, BUILD_TEST_TIMEOUT_MS);
});
