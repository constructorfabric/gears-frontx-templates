/**
 * Tests for the exported pure parts of `scripts/verify-preflight.ts`: argument
 * parsing, the host port resolution (with the read of the project's Vite
 * config injected, so the stub tests name a stub and load no Vite), the start
 * plan (every refusal the run makes before it starts anything), the re-read
 * of the browser step once the servers are up, the browser resolution order,
 * the launch flag sets, the messages, the child
 * liveness the READY gate re-checks, the run-once guard the stop goes through,
 * and the stop itself: the typed outcomes, the group signal escalation and the
 * leader exit wait it reads the group behind, the per-child and per-dir steps,
 * and the signal reactions, with the process work injected as plain functions.
 * The viteConfigPort describe right after the host port block is the one
 * place a test loads Vite: it runs the real config reader against a temporary
 * directory.
 *
 * The script runs its command only when it is the process entry point, so the
 * tests import it plainly: the import has no side effects. The command-level
 * describe at the end is the one exception: it runs the script as a child
 * process, on paths that need no servers and no browser, and is skipped on
 * win32.
 */

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as preflight from '../scripts/verify-preflight';
import type {
  BrowserResolveInput,
  BrowserResolution,
  ParsedArgs,
  PortStatus,
  PreflightOptions,
} from '../scripts/verify-preflight';

/** What parseArgs falls back to with no arguments and an empty environment. */
const defaultOptions: PreflightOptions = {
  hostPort: undefined,
  cdpPort: 9222,
  browserFlag: undefined,
  noStart: false,
  timeoutMs: 120_000,
};

/** Narrows a parse result to its options, failing the test when it is not one. */
function optionsOf(parsed: ParsedArgs): PreflightOptions {
  if (parsed.kind !== 'options') {
    throw new Error(`expected parsed options, got kind "${parsed.kind}"`);
  }
  return parsed.options;
}

/** Narrows a parse result to its error message, failing the test when it parsed. */
function errorMessage(parsed: ParsedArgs): string {
  if (parsed.kind !== 'error') {
    throw new Error(`expected a parse error, got kind "${parsed.kind}"`);
  }
  return parsed.message;
}

/** Narrows a resolution to its not-found report, failing the test when a browser was found. */
function notFoundReport(resolution: BrowserResolution): Extract<BrowserResolution, { kind: 'not-found' }> {
  if (resolution.kind !== 'not-found') {
    throw new Error(`expected no browser to be found, got one from "${resolution.source}"`);
  }
  return resolution;
}

/** A resolver input with nothing anywhere, overridable per test. */
function resolveInput(overrides: Partial<BrowserResolveInput> = {}): BrowserResolveInput {
  return {
    platform: 'darwin',
    arch: 'arm64',
    home: '/home/tester',
    browserFlag: undefined,
    envBrowser: undefined,
    fileExists: () => false,
    listDir: () => [],
    commandExists: () => false,
    ...overrides,
  };
}

const PLAYWRIGHT_CACHE = join('/home/tester', 'Library', 'Caches', 'ms-playwright');

/** Where the resolver looks for a Chrome for Testing build of one version, on macOS. */
function chromeForTestingExecutable(version: number): string {
  return join(
    PLAYWRIGHT_CACHE,
    `chromium-${version}`,
    'chrome-mac-arm64',
    'Google Chrome for Testing.app',
    'Contents',
    'MacOS',
    'Google Chrome for Testing',
  );
}

/** Where the resolver looks for a chrome-headless-shell build of one version, on macOS. */
function headlessShellExecutable(version: number): string {
  return join(
    PLAYWRIGHT_CACHE,
    `chromium_headless_shell-${version}`,
    'chrome-headless-shell-mac-arm64',
    'chrome-headless-shell',
  );
}

const CHROME_APP = join('/Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome');

describe('parseArgs', () => {
  it('defaults to an unresolved host port, the walk driver CDP port, the full wait, and no browser', () => {
    expect(optionsOf(preflight.parseArgs([]))).toEqual(defaultOptions);
  });

  it('parses every value flag in both the spaced and the = form', () => {
    expect(optionsOf(preflight.parseArgs(['--host-port', '4200']))).toEqual({
      ...defaultOptions,
      hostPort: 4200,
    });
    expect(optionsOf(preflight.parseArgs(['--cdp-port=9333']))).toEqual({
      ...defaultOptions,
      cdpPort: 9333,
    });
    expect(optionsOf(preflight.parseArgs(['--browser', '/opt/flag-chrome']))).toEqual({
      ...defaultOptions,
      browserFlag: '/opt/flag-chrome',
    });
    expect(optionsOf(preflight.parseArgs(['--timeout=30000']))).toEqual({
      ...defaultOptions,
      timeoutMs: 30_000,
    });
  });

  it('turns on --no-start, and refuses a value written onto it', () => {
    expect(optionsOf(preflight.parseArgs(['--no-start']))).toEqual({ ...defaultOptions, noStart: true });
    expect(errorMessage(preflight.parseArgs(['--no-start=1']))).toContain('--no-start does not take a value');
  });

  it('no longer knows --stop: stopping is Ctrl-C or SIGTERM to the running preflight', () => {
    expect(errorMessage(preflight.parseArgs(['--stop']))).toContain('--stop unknown flag');
  });

  it('answers --help and -h with the help kind', () => {
    expect(preflight.parseArgs(['--help'])).toEqual({ kind: 'help' });
    expect(preflight.parseArgs(['-h'])).toEqual({ kind: 'help' });
  });

  it('reports a value it cannot parse, naming the flag and the offending value', () => {
    expect(errorMessage(preflight.parseArgs(['--host-port', 'abc']))).toContain(
      'expects a port between 1 and 65535, got "abc"',
    );
    expect(errorMessage(preflight.parseArgs(['--cdp-port=65536']))).toContain(
      'expects a port between 1 and 65535, got "65536"',
    );
    expect(errorMessage(preflight.parseArgs(['--timeout', 'soon']))).toContain(
      'expects milliseconds, got "soon"',
    );
  });

  it('demands the values it was not given, including an empty browser path', () => {
    expect(errorMessage(preflight.parseArgs(['--cdp-port']))).toContain('--cdp-port needs a value');
    expect(errorMessage(preflight.parseArgs(['--browser', '']))).toContain(
      '--browser needs a non-empty path',
    );
  });

  it('reports unknown flags and stray arguments', () => {
    expect(errorMessage(preflight.parseArgs(['--wat']))).toContain('--wat unknown flag');
    expect(errorMessage(preflight.parseArgs(['stray']))).toContain('stray unexpected argument');
  });
});

describe('resolveHostPort', () => {
  /**
   * A resolver input for the resolution order, with the read of the project's
   * Vite config injected so these stub tests load no Vite. The stub records
   * the roots it is asked about and answers with `configPort`.
   */
  function resolverInput(configPort: number | undefined): {
    input: preflight.HostPortResolutionInput;
    askedRoots: string[];
  } {
    const askedRoots: string[] = [];
    return {
      askedRoots,
      input: {
        flagPort: undefined,
        envPort: undefined,
        configRoot: '/srv/template-shell',
        resolveConfigPort: (root) => {
          askedRoots.push(root);
          return Promise.resolve(configPort);
        },
      },
    };
  }

  it('--host-port wins over the environment and the project config', async () => {
    const { input, askedRoots } = resolverInput(5630);

    const resolution = await preflight.resolveHostPort({ ...input, flagPort: 4200, envPort: 4310 });

    expect(resolution).toEqual({ port: 4200, source: 'flag' });
    expect(askedRoots).toEqual([]);
  });

  it('the port from FRONTX_VERIFY_HOST_PORT is used when the flag is absent', async () => {
    const { input, askedRoots } = resolverInput(5630);

    const resolution = await preflight.resolveHostPort({ ...input, envPort: 4310 });

    expect(resolution).toEqual({ port: 4310, source: 'env' });
    expect(askedRoots).toEqual([]);
  });

  it("the port the project's vite.config.ts configures is used when neither the flag nor the environment names one", async () => {
    const { input, askedRoots } = resolverInput(5630);

    const resolution = await preflight.resolveHostPort(input);

    expect(resolution).toEqual({ port: 5630, source: 'config' });
    expect(askedRoots).toEqual([input.configRoot]);
  });

  it('a config that names no port leaves the run on Vite\'s own default', async () => {
    const { input } = resolverInput(undefined);

    const resolution = await preflight.resolveHostPort(input);

    expect(resolution).toEqual({ port: 5173, source: 'default' });
  });

  it('a config port outside 1..65535 is not used, and the run falls back to 5173', async () => {
    // A stub standing in for the reader that names 70000 or 0 must not hand
    // the probe and dev:all a port nothing can serve on: the value is held to
    // the same rule parsePort applies, one line says why the default was
    // taken, and the run reports source: default.
    for (const badPort of [70000, 0]) {
      const lines: string[] = [];
      const log = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
        lines.push(parts.map(String).join(' '));
      });
      try {
        const { input } = resolverInput(badPort);

        const resolution = await preflight.resolveHostPort(input);

        expect(resolution).toEqual({ port: 5173, source: 'default' });
        expect(lines).toEqual([
          `[verify-preflight] the project's Vite config names port ${badPort}, which is not a port between 1 and 65535, using 5173`,
        ]);
      } finally {
        log.mockRestore();
      }
    }
  });

  it('a resolver that throws prints one line with the error and falls back to 5173', async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
      lines.push(parts.map(String).join(' '));
    });
    try {
      const resolution = await preflight.resolveHostPort({
        flagPort: undefined,
        envPort: undefined,
        configRoot: '/srv/template-shell',
        resolveConfigPort: () => Promise.reject(new Error('vite config is broken')),
      });

      expect(resolution).toEqual({ port: 5173, source: 'default' });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('vite config is broken');
      expect(lines[0]).toContain('5173');
    } finally {
      log.mockRestore();
    }
  });

  it('the READY line names the host the environment chose, so the driver is given a live origin', async () => {
    const { input } = resolverInput(5630);
    const resolved = await preflight.resolveHostPort({ ...input, envPort: 4310 });

    const line = preflight.readyLine({ pid: 9, hostPort: resolved.port, cdpPort: 9222 });

    expect(line).toBe('[verify-preflight] READY pid=9 --host http://localhost:4310 --cdp-port 9222');
  });
});

describe('resolveEnvHostPort', () => {
  const NAME = preflight.FRONTX_VERIFY_HOST_PORT;

  it('names no port when the variable is unset or empty, so the next source is used', () => {
    expect(preflight.resolveEnvHostPort({})).toEqual({});
    expect(preflight.resolveEnvHostPort({ [NAME]: '' })).toEqual({});
  });

  it('returns the port the variable names', () => {
    expect(preflight.resolveEnvHostPort({ [NAME]: '4310' })).toEqual({ port: 4310 });
  });

  it('accepts both ends of the range', () => {
    expect(preflight.resolveEnvHostPort({ [NAME]: '1' })).toEqual({ port: 1 });
    expect(preflight.resolveEnvHostPort({ [NAME]: '65535' })).toEqual({ port: 65535 });
  });

  it('returns one message for every value that is not a port, naming the variable and the value', () => {
    // The same message dev-all throws, so a rule or wording change cannot land
    // in one script and not the other.
    for (const raw of ['0', '65536', 'not-a-port', ' 4310 ', '0x10E6', '4310.0']) {
      expect(preflight.resolveEnvHostPort({ [NAME]: raw })).toEqual({
        error: `${NAME} expects a port between 1 and 65535, got "${raw}"`,
      });
    }
  });
});

describe('viteConfigPort', () => {
  /**
   * The real reader against a real config file: a temporary directory holds a
   * small vite.config.ts and the reader runs Vite the way the run does. The
   * directory is removed again whether the check passes or fails. The config
   * imports nothing, so the reader's bundler has nothing to resolve from a
   * directory that has no node_modules of its own.
   */
  async function withViteConfig(content: string, check: (dir: string) => Promise<void>): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'frontx-vite-config-'));
    writeFileSync(join(dir, 'vite.config.ts'), content);
    try {
      await check(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('reads the dev port a temporary project config sets', async () => {
    await withViteConfig('export default { server: { port: 5630 } };\n', async (dir) => {
      await expect(preflight.viteConfigPort(dir)).resolves.toBe(5630);
    });
  });

  it("a config that decides its port from the dev ConfigEnv resolves it as a dev start does", async () => {
    // Both values Vite's dev start supplies and loadConfigFromFile does not:
    // isPreview false, and NODE_ENV development when the process names none.
    // The config names 5630 only when it sees both, and 4173 otherwise, so a
    // read that misses either lands on a port no dev run uses.
    const content = [
      'export default (env) => ({',
      "  server: { port: env.isPreview === false && process.env.NODE_ENV === 'development' ? 5630 : 4173 },",
      '});',
      '',
    ].join('\n');
    await withViteConfig(content, async (dir) => {
      const previousNodeEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      try {
        await expect(preflight.viteConfigPort(dir)).resolves.toBe(5630);
        // Put back, not left set: the run goes on to start dev:all, and that
        // child inherits this process's environment.
        expect(process.env.NODE_ENV).toBeUndefined();
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }
    });
  });

  it('a NODE_ENV the process already set is left as it is, for the load and afterwards', async () => {
    const content = [
      'export default () => ({',
      "  server: { port: process.env.NODE_ENV === 'development' ? 5630 : 4173 },",
      '});',
      '',
    ].join('\n');
    await withViteConfig(content, async (dir) => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(preflight.viteConfigPort(dir)).resolves.toBe(4173);
        expect(process.env.NODE_ENV).toBe('production');
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }
    });
  });

  it('an empty NODE_ENV counts as unset for the load, and is put back empty', async () => {
    // Vite's resolveConfig tests the value for truth, not for presence, so an
    // empty NODE_ENV is one it fills with development before the config runs.
    // A read that defaults only an unset value lands on 4173 here while a dev
    // run lands on 5630, and the restore has to give back the empty string
    // rather than deleting the variable or keeping development.
    const content = [
      'export default () => ({',
      "  server: { port: process.env.NODE_ENV === 'development' ? 5630 : 4173 },",
      '});',
      '',
    ].join('\n');
    await withViteConfig(content, async (dir) => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = '';
      try {
        await expect(preflight.viteConfigPort(dir)).resolves.toBe(5630);
        expect(process.env.NODE_ENV).toBe('');
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }
    });
  });

  it('a config that names no port gives undefined, so the run reports source default', async () => {
    await withViteConfig('export default {};\n', async (dir) => {
      await expect(preflight.viteConfigPort(dir)).resolves.toBeUndefined();
    });
  });
});

describe('resolveBrowserExecutable', () => {
  it('an explicit --browser wins over the environment and the Playwright cache', () => {
    const resolution = preflight.resolveBrowserExecutable(
      resolveInput({
        browserFlag: '/opt/flag-chrome',
        envBrowser: '/opt/env-chrome',
        listDir: () => ['chromium-1148'],
        fileExists: (path) => path === '/opt/flag-chrome' || path === chromeForTestingExecutable(1148),
      }),
    );

    expect(resolution).toEqual({ kind: 'found', path: '/opt/flag-chrome', source: 'explicit' });
  });

  it('falls back to FRONTX_VERIFY_BROWSER when --browser is absent', () => {
    const resolution = preflight.resolveBrowserExecutable(
      resolveInput({
        envBrowser: '/opt/env-chrome',
        fileExists: (path) => path === '/opt/env-chrome',
      }),
    );

    expect(resolution).toEqual({ kind: 'found', path: '/opt/env-chrome', source: 'explicit' });
  });

  it('resolves through the Playwright cache and picks the newest version in it', () => {
    const existing = new Set([chromeForTestingExecutable(1140), chromeForTestingExecutable(1148)]);
    const resolution = preflight.resolveBrowserExecutable(
      resolveInput({
        listDir: () => ['chromium-1148', 'not-a-browser-dir', 'chromium-1140'],
        fileExists: (path) => existing.has(path),
      }),
    );

    expect(resolution).toEqual({ kind: 'found', path: chromeForTestingExecutable(1148), source: 'playwright' });
  });

  it('picks the newest cache version whichever layout it uses', () => {
    const existing = new Set([chromeForTestingExecutable(1148), headlessShellExecutable(1152)]);
    const resolution = preflight.resolveBrowserExecutable(
      resolveInput({
        listDir: () => ['chromium-1148', 'chromium_headless_shell-1152'],
        fileExists: (path) => existing.has(path),
      }),
    );

    expect(resolution).toEqual({ kind: 'found', path: headlessShellExecutable(1152), source: 'playwright' });
  });

  it('on an Intel Mac probes the x64 build in the cache', () => {
    const intel = join(
      PLAYWRIGHT_CACHE,
      'chromium-1148',
      'chrome-mac-x64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    );
    const resolution = preflight.resolveBrowserExecutable(
      resolveInput({ arch: 'x64', listDir: () => ['chromium-1148'], fileExists: (path) => path === intel }),
    );

    expect(resolution).toEqual({ kind: 'found', path: intel, source: 'playwright' });
  });

  it('on linux finds both the Chrome for Testing and the older Chromium cache layouts', () => {
    const linuxCache = join('/home/tester', '.cache', 'ms-playwright');
    for (const layout of ['chrome-linux64', 'chrome-linux']) {
      const executable = join(linuxCache, 'chromium-1148', layout, 'chrome');
      const resolution = preflight.resolveBrowserExecutable(
        resolveInput({
          platform: 'linux',
          arch: 'x64',
          listDir: () => ['chromium-1148'],
          fileExists: (path) => path === executable,
        }),
      );

      expect(resolution).toEqual({ kind: 'found', path: executable, source: 'playwright' });
    }
  });

  it('on macOS uses the Google Chrome app even when a PATH command exists', () => {
    const resolution = preflight.resolveBrowserExecutable(
      resolveInput({
        fileExists: (path) => path === CHROME_APP,
        commandExists: (command) => command === 'google-chrome',
      }),
    );

    expect(resolution).toEqual({ kind: 'found', path: CHROME_APP, source: 'chrome-app' });
  });

  it('falls through to the well-known PATH commands, in their listed order', () => {
    const resolution = preflight.resolveBrowserExecutable(
      resolveInput({
        commandExists: (command) => command === 'google-chrome' || command === 'chromium',
      }),
    );

    expect(resolution).toEqual({ kind: 'found', path: 'google-chrome', source: 'path' });
  });

  it('on linux the Google Chrome app is not a place looked, and a PATH miss is reported', () => {
    const report = notFoundReport(preflight.resolveBrowserExecutable(resolveInput({ platform: 'linux' })));

    expect(report.places).toContain('Google Chrome app: only looked for on macOS');
    expect(report.places).toContain('PATH: none of google-chrome, chromium, chromium-browser found');
  });

  it('a named browser that does not exist stops the resolution instead of being skipped', () => {
    const resolution = preflight.resolveBrowserExecutable(resolveInput({ browserFlag: '/opt/missing-chrome' }));

    expect(resolution).toEqual({ kind: 'missing-explicit', path: '/opt/missing-chrome', source: 'flag' });
  });

  it('the same refusal comes when the missing path is named by the environment alone', () => {
    const resolution = preflight.resolveBrowserExecutable(resolveInput({ envBrowser: '/opt/missing-chrome' }));

    expect(resolution).toEqual({ kind: 'missing-explicit', path: '/opt/missing-chrome', source: 'env' });
  });

  it('when both name a browser, the flag is the source the refusal reports', () => {
    const resolution = preflight.resolveBrowserExecutable(
      resolveInput({ browserFlag: '/opt/missing-flag-chrome', envBrowser: '/opt/missing-env-chrome' }),
    );

    expect(resolution).toEqual({ kind: 'missing-explicit', path: '/opt/missing-flag-chrome', source: 'flag' });
  });
});

describe('noBrowserFoundMessage', () => {
  it('numbers every place the resolver looked, in order, and how to name a browser by hand', () => {
    const report = notFoundReport(preflight.resolveBrowserExecutable(resolveInput()));

    const message = preflight.noBrowserFoundMessage(report);

    expect(message).toContain('No browser executable found for the verification walk.');
    report.places.forEach((place, index) => {
      expect(message).toContain(`${index + 1}. ${place}`);
    });
    expect(message).toContain('--browser /path/to/chrome, or set FRONTX_VERIFY_BROWSER');
  });
});

describe('missingExplicitBrowserMessage', () => {
  it('names the missing path and says it came from the --browser flag', () => {
    const message = preflight.missingExplicitBrowserMessage({
      kind: 'missing-explicit',
      path: '/opt/missing-chrome',
      source: 'flag',
    });

    expect(message).toContain(
      'The browser named by the --browser flag does not exist: /opt/missing-chrome',
    );
    expect(message).toContain('never replaced by a fallback');
  });

  it('names FRONTX_VERIFY_BROWSER when the path came from the environment', () => {
    const message = preflight.missingExplicitBrowserMessage({
      kind: 'missing-explicit',
      path: '/opt/missing-chrome',
      source: 'env',
    });

    expect(message).toContain(
      'The browser named by the FRONTX_VERIFY_BROWSER environment variable does not exist: /opt/missing-chrome',
    );
    expect(message).not.toContain('--browser');
  });
});

describe('browserLaunchArgs', () => {
  it('the first attempt uses the new headless engine with the sandbox on, and carries the port and dir', () => {
    const args = preflight.browserLaunchArgs(9222, '/tmp/frontx-verify-a', false);

    expect(args.join(' ')).not.toContain('--no-sandbox');
    expect(args).toContain('--headless=new');
    expect(args).toContain('--remote-debugging-port=9222');
    expect(args).toContain('--user-data-dir=/tmp/frontx-verify-a');
    expect(args[args.length - 1]).toBe('about:blank');
  });

  it('the retry only adds --no-sandbox: same headless engine, port and dir', () => {
    const args = preflight.browserLaunchArgs(9333, '/tmp/frontx-verify-b', true);

    expect(args).toContain('--no-sandbox');
    expect(args).toContain('--headless=new');
    expect(args.join(' ')).not.toContain('--headless=old');
    expect(args).toContain('--remote-debugging-port=9333');
    expect(args).toContain('--user-data-dir=/tmp/frontx-verify-b');
  });
});


describe('planStart', () => {
  const answering: PortStatus[] = [
    { label: 'host', port: 5173, state: 'answering' },
    { label: 'orders-mfe', port: 3010, state: 'answering' },
  ];
  const free: PortStatus[] = [
    { label: 'host', port: 5173, state: 'free' },
    { label: 'orders-mfe', port: 3010, state: 'free' },
  ];
  const mixed: PortStatus[] = [
    { label: 'host', port: 5173, state: 'occupied' },
    { label: 'orders-mfe', port: 3010, state: 'free' },
  ];
  const base = { cdpPort: 9222, noStart: false, statuses: free, cdpAnswering: false };

  /** Narrows a plan to its refusal message, failing the test when the plan goes ahead. */
  function refusal(plan: preflight.StartPlan): string {
    if (plan.kind !== 'refuse') throw new Error('expected a refusal, got a plan that goes ahead');
    return plan.message;
  }

  it('all ports free and a silent CDP port: start dev:all and launch a browser', () => {
    expect(preflight.planStart(base)).toEqual({ kind: 'go', startServers: true, launchBrowser: true });
  });

  it('every port answering and CDP answering: start nothing, reuse both', () => {
    expect(preflight.planStart({ ...base, statuses: answering, cdpAnswering: true })).toEqual({
      kind: 'go',
      startServers: false,
      launchBrowser: false,
    });
  });

  it('servers answer, CDP silent: launch the browser only', () => {
    expect(preflight.planStart({ ...base, statuses: answering })).toEqual({
      kind: 'go',
      startServers: false,
      launchBrowser: true,
    });
  });

  it('ports free, CDP answering: start dev:all only and reuse the browser', () => {
    expect(preflight.planStart({ ...base, cdpAnswering: true })).toEqual({
      kind: 'go',
      startServers: true,
      launchBrowser: false,
    });
  });

  it('a mix of taken and free ports refuses, whatever the CDP port says', () => {
    for (const cdpAnswering of [false, true]) {
      expect(refusal(preflight.planStart({ ...base, statuses: mixed, cdpAnswering }))).toContain(
        'Refusing to start dev:all: some of its ports are taken and some are free',
      );
    }
  });

  it('a free non-default host port starts dev:all like any other free port', () => {
    // The host port the run resolved is the one it pins the started dev:all
    // to, so a free port on any number is startable, the template default
    // included.
    expect(
      preflight.planStart({ ...base, statuses: [{ label: 'host', port: 4200, state: 'free' }] }),
    ).toEqual({ kind: 'go', startServers: true, launchBrowser: true });
  });

  it('a non-default host port is fine when the servers already answer on it', () => {
    expect(
      preflight.planStart({
        ...base,
        statuses: [{ label: 'host', port: 4200, state: 'answering' }],
        cdpAnswering: true,
      }),
    ).toEqual({ kind: 'go', startServers: false, launchBrowser: false });
  });

  it('--no-start refuses when a server does not answer, before the mixed check', () => {
    const message = refusal(preflight.planStart({ ...base, noStart: true, statuses: mixed }));

    expect(message).toContain('--no-start refuses to start them');
  });

  it('--no-start refuses when the servers answer but no browser serves CDP', () => {
    const message = refusal(preflight.planStart({ ...base, noStart: true, statuses: answering, cdpPort: 9333 }));

    expect(message).toContain('No browser serves CDP at http://127.0.0.1:9333/json/version');
    expect(message).toContain('--no-start refuses to launch one');
  });

  it('--no-start with everything answering goes ahead and starts nothing', () => {
    expect(preflight.planStart({ ...base, noStart: true, statuses: answering, cdpAnswering: true })).toEqual({
      kind: 'go',
      startServers: false,
      launchBrowser: false,
    });
  });
});

describe('rereadBrowserPlan', () => {
  const input = (overrides: Partial<preflight.BrowserRecheckInput> = {}): preflight.BrowserRecheckInput => ({
    cdpAnsweringNow: false,
    ...overrides,
  });

  it('a browser that answers once the servers are up is reused, not launched onto', () => {
    // The first probe can be a whole server wait old: a browser that was
    // silent then can be serving now, and the launch onto its port would fail.
    expect(preflight.rereadBrowserPlan(input({ cdpAnsweringNow: true }))).toEqual({ kind: 'reuse' });
  });

  it('a browser that no longer answers once the servers are up is launched afresh, so READY never names a dead port', () => {
    // A plan that refused a launch was read before the wait, from a probe that
    // has since gone stale, so the fresh answer is the one that decides.
    expect(preflight.rereadBrowserPlan(input())).toEqual({ kind: 'launch' });
  });
});

describe('isCdpVersionBody', () => {
  it('accepts a /json/version body with a webSocketDebuggerUrl and nothing else', () => {
    expect(preflight.isCdpVersionBody({ webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/x' })).toBe(true);
    expect(preflight.isCdpVersionBody({ Browser: 'nginx' })).toBe(false);
    expect(preflight.isCdpVersionBody(null)).toBe(false);
    expect(preflight.isCdpVersionBody('<html>')).toBe(false);
  });
});

describe('isAnsweringStatus', () => {
  it('a 2xx counts as answering, and so does a 3xx because redirects are read manually', () => {
    expect(preflight.isAnsweringStatus(200)).toBe(true);
    expect(preflight.isAnsweringStatus(204)).toBe(true);
    expect(preflight.isAnsweringStatus(301)).toBe(true);
    expect(preflight.isAnsweringStatus(307)).toBe(true);
    expect(preflight.isAnsweringStatus(399)).toBe(true);
  });

  it('a 4xx or 5xx from some other service on the port does not count', () => {
    expect(preflight.isAnsweringStatus(404)).toBe(false);
    expect(preflight.isAnsweringStatus(500)).toBe(false);
    expect(preflight.isAnsweringStatus(199)).toBe(false);
    expect(preflight.isAnsweringStatus(400)).toBe(false);
  });
});

describe('the port state refusals', () => {
  const states: PortStatus[] = [
    { label: 'host', port: 5173, state: 'occupied' },
    { label: 'orders-mfe', port: 3010, state: 'free' },
  ];

  it('the --no-start refusal names every port with its state', () => {
    const message = preflight.serversNotRunningMessage(states);

    expect(message).toContain('port 5173 (host): in use, not answering HTTP');
    expect(message).toContain('port 3010 (orders-mfe): free');
    expect(message).toContain('--no-start');
  });

  it('the mixed-state refusal names every port with its state and the way out', () => {
    const message = preflight.mixedPortStatesMessage(states);

    expect(message).toContain('Refusing to start dev:all');
    expect(message).toContain('port 5173 (host): in use, not answering HTTP');
    expect(message).toContain('port 3010 (orders-mfe): free');
    expect(message).toContain('stop it with Ctrl-C');
    expect(message).not.toContain('--stop');
  });

  it('the mixed-state refusal points at finding the holder of a busy port, and keeps the live-supervisor hint', () => {
    const message = preflight.mixedPortStatesMessage(states);

    // The common mixed state is an orphaned group holding some ports, with no
    // verify-preflight left to Ctrl-C, so the reader needs the way to the
    // actual holder; the Ctrl-C hint stays for the live-supervisor case.
    expect(message).toContain('find what holds a port with');
    expect(message).toContain('`lsof -nP -iTCP:<port> -sTCP:LISTEN`');
    expect(message).toContain('stop it with Ctrl-C in its terminal');
  });
});

describe('serverTimeoutMessage', () => {
  it('names the deadline, the ports that never answered, and the output tail', () => {
    const message = preflight.serverTimeoutMessage({
      timeoutMs: 120_000,
      neverAnswered: [
        { label: 'host', port: 5173 },
        { label: 'orders-mfe', port: 3010 },
      ],
      outputTail: ['VITE v6.4.6  ready in 312 ms', 'error when starting dev server: listen EADDRINUSE'],
    });

    expect(message).toContain('did not answer on every port within 120000 ms');
    expect(message).toContain('port 5173 (host)');
    expect(message).toContain('port 3010 (orders-mfe)');
    expect(message).toContain('Last 2 lines dev:all printed:');
    expect(message).toContain('error when starting dev server: listen EADDRINUSE');
  });

  it('says so when dev:all printed nothing', () => {
    const message = preflight.serverTimeoutMessage({ timeoutMs: 1, neverAnswered: [], outputTail: [] });

    expect(message).toContain('dev:all printed nothing.');
  });
});

describe('browserLaunchFailureMessage', () => {
  it('names the CDP URL, both launch flag sets, and the output tail it was given', () => {
    const message = preflight.browserLaunchFailureMessage({
      executable: '/opt/flag-chrome',
      cdpPort: 9222,
      cdpPortTaken: false,
      attempts: [
        preflight.browserLaunchArgs(9222, '/tmp/frontx-verify-a', false),
        preflight.browserLaunchArgs(9222, '/tmp/frontx-verify-b', true),
      ],
      outputTail: ['[12345:12345:0731/000000.000:ERROR:sandbox_mac.mm(96)] Failed to look up the sandbox', 'Exiting.'],
    });

    expect(message).toContain('http://127.0.0.1:9222/json/version');
    expect(message).toContain('Executable tried: /opt/flag-chrome');
    expect(message).toContain('Launch 1 flags: --headless=new --disable-gpu');
    expect(message).toContain('Launch 2 flags: --headless=new --no-sandbox');
    expect(message).toContain('Failed to look up the sandbox');
  });

  it('when the CDP port is held by something else it says so, and empty output is not hidden', () => {
    const message = preflight.browserLaunchFailureMessage({
      executable: '/opt/flag-chrome',
      cdpPort: 9222,
      cdpPortTaken: true,
      attempts: [['--headless=new']],
      outputTail: [],
    });

    expect(message).toContain('Port 9222 is in use but does not answer /json/version');
    expect(message).toContain('the browser printed nothing.');
  });
});

describe('the retry notice', () => {
  it('says the retry turns the sandbox off for this browser only', () => {
    expect(preflight.FIRST_LAUNCH_RETRY_LINE).toBe(
      "first launch failed; retrying with --no-sandbox (Chrome's sandbox is off for this browser only)",
    );
  });
});

describe('firstCallOnly', () => {
  it('runs the stop once: a second signal gets the same promise and changes nothing', async () => {
    const calls: Array<[number, string]> = [];
    const stop = preflight.firstCallOnly(async (code: number, why: string) => {
      calls.push([code, why]);
    });

    expect(stop.started()).toBe(false);
    const first = stop.call(0, 'SIGINT');
    const second = stop.call(1, 'SIGTERM');

    expect(second).toBe(first);
    expect(stop.started()).toBe(true);
    await first;
    expect(calls).toEqual([[0, 'SIGINT']]);
  });

  it('current() hands back the running stop with no arguments, and nothing before one starts', async () => {
    // The READY-while-stopping branch only wants the shutdown already in
    // flight: it has no exit code and no reason of its own to pass, so it asks
    // through current() instead of a call whose arguments would be ignored.
    const stop = preflight.firstCallOnly(async (_code: number, _why: string) => {});
    expect(stop.current()).toBeUndefined();

    const first = stop.call(0, 'SIGINT');
    expect(stop.current()).toBe(first);
    await first;
    expect(stop.current()).toBe(first);
  });
});

describe('stopReportWriter', () => {
  it('writes each line on its own, prefixed with the script name and terminated, for a synchronous writer', () => {
    // The stop ends in process.exit and piped output is asynchronous on macOS,
    // so the run hands this writer an fs.writeSync: the formatting is what is
    // pinned here, one write per line so none can be left queued.
    const writes: string[] = [];
    const log = preflight.stopReportWriter((text) => writes.push(text));

    log('browser (pid 4242) was stopped');
    log('removed /tmp/frontx-verify-a');

    expect(writes).toEqual([
      '[verify-preflight] browser (pid 4242) was stopped\n',
      '[verify-preflight] removed /tmp/frontx-verify-a\n',
    ]);
  });

  it('a write that throws does not throw out of the writer, and later lines still go out', () => {
    // writeSync(2, ...) throws EAGAIN on a non-blocking pipe and EPIPE once the
    // reader of `| tee` is gone. The stop calls the writer before its
    // try/finally and from inside the per-step catch blocks, so a throw here
    // would abort the stop before any child is signalled and skip the exit.
    const attempted: string[] = [];
    const log = preflight.stopReportWriter((text) => {
      attempted.push(text);
      throw new Error('EPIPE: broken pipe, write');
    });

    expect(() => log('browser (pid 4242) was stopped')).not.toThrow();
    expect(() => log('dev:all (pid 4243) was stopped')).not.toThrow();
    // Swallowing the error must not swallow the attempt: every line is still
    // handed to the write, so a transient failure loses one line, not the rest.
    expect(attempted).toEqual([
      '[verify-preflight] browser (pid 4242) was stopped\n',
      '[verify-preflight] dev:all (pid 4243) was stopped\n',
    ]);
  });
});

describe('keepRunningLine', () => {
  it('tells the reader to keep it running and how to stop it, with its own pid', () => {
    expect(preflight.keepRunningLine(4242)).toBe(
      'keep this running during the walk; stop it with Ctrl-C (or SIGTERM to pid 4242)',
    );
  });
});


describe('PROFILE_DIR_PREFIX', () => {
  it('is the one prefix the profile dir and the hand-cleanup advice both name', () => {
    // The mkdtempSync that makes the dir and the printed advice that tells a
    // reader what to look for take the prefix from this constant, so the name
    // the advice points at cannot drift from the dir the run really created.
    expect(preflight.PROFILE_DIR_PREFIX).toBe('frontx-verify-');

    const message = preflight.summaryText({
      hostPort: 5173,
      cdpPort: 9222,
      mfes: [],
      serversStarted: true,
      browser: {
        executable: 'chromium',
        pid: 6002,
        userDataDir: `${preflight.PROFILE_DIR_PREFIX}abc123`,
      },
      ownedChildren: [{ name: 'browser', pgid: 6002 }],
    });

    expect(message).toContain(`its user data dir ${preflight.PROFILE_DIR_PREFIX}*`);
  });
});

describe('summaryText', () => {
  it('prints the walk driver arguments with the host origin and the CDP port', () => {
    // Servers that already answer can sit on any host port, a custom one included.
    const message = preflight.summaryText({
      hostPort: 4200,
      cdpPort: 9222,
      mfes: [{ name: 'orders-mfe', port: 3010 }],
      serversStarted: false,
      browser: { executable: '/opt/flag-chrome', pid: 5150, userDataDir: '/tmp/frontx-verify-a' },
      ownedChildren: [],
    });

    expect(message).toContain('--host http://localhost:4200 --cdp-port 9222');
    expect(message).toContain('host: http://localhost:4200 (already running)');
    expect(message).toContain('mfe orders-mfe: http://localhost:3010 (port 3010) (already running)');
    expect(message).toContain('cdp: http://127.0.0.1:9222/json/version (port 9222)');
    expect(message).toContain('browser: /opt/flag-chrome (pid 5150)');
    expect(message).toContain('browser user data dir: /tmp/frontx-verify-a');
  });

  it('servers started by this run and a reused browser: no already-running note, browser marked not started', () => {
    // A run that starts the servers reports the port it resolved and pinned
    // dev:all to, the Vite default included.
    const message = preflight.summaryText({
      hostPort: 5173,
      cdpPort: 9333,
      mfes: [],
      serversStarted: true,
      browser: { executable: 'chromium', pid: undefined, userDataDir: undefined },
      ownedChildren: [{ name: 'dev:all', pgid: 6001 }],
    });

    expect(message).toContain('--host http://localhost:5173 --cdp-port 9333');
    expect(message).toContain('host: http://localhost:5173');
    expect(message).not.toContain('(already running)');
    expect(message).toContain('mfe packages: none discovered');
    expect(message).toContain('browser: chromium (not started by this run)');
    // No dir of its own to name (the advice block may still speak of the
    // frontx-verify-* prefix a started browser's dir carries).
    expect(message).not.toContain('browser user data dir:');
  });

  it('names every child this run started with its process group, and how to stop them if the supervisor dies hard', () => {
    const message = preflight.summaryText({
      hostPort: 5173,
      cdpPort: 9222,
      mfes: [],
      serversStarted: true,
      browser: { executable: 'chromium', pid: 6002, userDataDir: '/tmp/frontx-verify-b' },
      ownedChildren: [
        { name: 'dev:all', pgid: 6001 },
        { name: 'browser', pgid: 6002 },
      ],
    });

    expect(message).toContain('dev:all: started by this run, process group 6001');
    expect(message).toContain('browser: started by this run, process group 6002');
    expect(message).toContain('if this supervisor is killed hard after READY');
    expect(message).toContain('`pgrep -g <pgid>`');
    // The probe matches the id alone: the advice says so, and sends the reader
    // to the listed process names and commands instead of trusting the answer.
    expect(message).toContain('proves only that some group with that id exists now, not that it is this');
    expect(message).toContain('`ps -o pid,pgid,command -p <pids>`');
    expect(message).toContain("recognisable as this project's dev");
    expect(message).toContain('frontx-verify-*');
    expect(message).toContain('kill -- -<pgid>');
    // The old advice read a non-empty probe as ownership, which a reused group
    // id turns into a signal at an unrelated group; it must not come back.
    expect(message).not.toContain('only if it lists processes');
    // The groups are named for the reader, but never in a copyable kill line:
    // a reaped leader's group id can be reused by another process.
    expect(message).not.toContain('kill -- -6001 -6002');
  });

  it('a run that started nothing names no children and no kill command', () => {
    const message = preflight.summaryText({
      hostPort: 5173,
      cdpPort: 9222,
      mfes: [],
      serversStarted: false,
      browser: { executable: 'chromium', pid: undefined, userDataDir: undefined },
      ownedChildren: [],
    });

    expect(message).not.toContain('started by this run, process group');
    expect(message).not.toContain('killed hard');
  });
});

describe('readyLine', () => {
  it('is one marker line in the exact form an agent greps for, carrying its own pid and the driver arguments', () => {
    const line = preflight.readyLine({ pid: 4242, hostPort: 5173, cdpPort: 9222 });

    expect(line).toBe('[verify-preflight] READY pid=4242 --host http://localhost:5173 --cdp-port 9222');
    expect(line).toMatch(/^\[verify-preflight\] READY pid=(none|\d+) --host \S+ --cdp-port \d+$/);
    expect(line).not.toContain('\n');
  });

  it('a run that started nothing offers no pid: it exits right after printing, so the line says pid=none', () => {
    const line = preflight.readyLine({ pid: undefined, hostPort: 5173, cdpPort: 9222 });

    expect(line).toBe('[verify-preflight] READY pid=none --host http://localhost:5173 --cdp-port 9222');
    expect(line).toMatch(/^\[verify-preflight\] READY pid=(none|\d+) --host \S+ --cdp-port \d+$/);
  });

  it('takes the origin and the port from its inputs, so a custom host port is named as it is', () => {
    expect(preflight.readyLine({ pid: 7, hostPort: 4200, cdpPort: 9333 })).toBe(
      '[verify-preflight] READY pid=7 --host http://localhost:4200 --cdp-port 9333',
    );
  });
});

describe('readyDecision', () => {
  it('READY prints while no stop runs', () => {
    expect(preflight.readyDecision(false)).toEqual({ kind: 'print' });
  });

  it('a stop that has already started defers the ready print to the shutdown in flight', () => {
    // A SIGTERM while the server wait is pending leaves probes that can still
    // succeed inside the stop's grace, so the continuation can reach the ready
    // print with a teardown underway. READY there would hand a live pid and
    // driver arguments for services that are going away, and an agent waiting
    // on it would start its walk against them; the stop's own report and exit
    // are what the run returns instead.
    expect(preflight.readyDecision(true)).toEqual({ kind: 'defer' });
  });
});

describe('ownedChildSummaries', () => {
  it('pairs every started child with its process group, which for a detached child is its pid', () => {
    expect(
      preflight.ownedChildSummaries([
        { label: 'dev:all', pid: 6001 },
        { label: 'browser', pid: 6002 },
      ]),
    ).toEqual([
      { name: 'dev:all', pgid: 6001 },
      { name: 'browser', pgid: 6002 },
    ]);
  });

  it('a child that never got a pid has no group to name and is left out', () => {
    expect(preflight.ownedChildSummaries([{ label: 'browser', pid: undefined }])).toEqual([]);
  });
});

describe('helpText', () => {
  it('documents every flag, the env var, how to run it, and how to stop it', () => {
    const help = preflight.helpText();

    expect(help).toContain('verify-preflight: prepare the browser verification walk in one command.');
    expect(help).toContain('npx tsx scripts/verify-preflight.ts');
    expect(help).toContain('--host-port <n>');
    expect(help).toContain('--cdp-port <n>');
    expect(help).toContain('--browser <path>');
    expect(help).toContain('--no-start');
    expect(help).toContain('--timeout <ms>');
    expect(help).toContain('FRONTX_VERIFY_BROWSER');
    expect(help).toContain('FRONTX_VERIFY_HOST_PORT');
    expect(help).toContain('vite.config.ts');
    expect(help).toContain('Ctrl-C or SIGTERM');
    expect(help).not.toContain('--stop');
  });

  it('says a signal stop that could not free everything exits 1', () => {
    const help = preflight.helpText();

    expect(help).toContain('Exit codes: 0 ready with nothing to supervise, or a signal stop that freed');
    expect(help).toContain('or a signal stop could not free what it started');
    expect(help).toContain('a profile dir stayed behind');
  });
});

describe('stopOutcomeText', () => {
  it('the text is built from the outcome kind, not matched out of it', () => {
    expect(preflight.stopOutcomeText({ kind: 'stopped', pid: 4242, groupRemains: false })).toBe('was stopped');
    expect(preflight.stopOutcomeText({ kind: 'stopped', pid: 4242, groupRemains: true })).toBe(
      'was stopped, but members of its process group remain; check with `pgrep -g 4242`',
    );
    expect(preflight.stopOutcomeText({ kind: 'gone', pid: undefined, groupRemains: false })).toBe(
      'had already exited',
    );
  });

  it('a child that survived SIGKILL is reported with its pid, so a manual kill knows where to aim', () => {
    expect(preflight.stopOutcomeText({ kind: 'survived', pid: 4242 })).toBe(
      'survived SIGKILL and needs a manual kill (pid 4242)',
    );
  });
});

describe('stoppedChildLine', () => {
  it('names the child, its pid, and the outcome', () => {
    expect(preflight.stoppedChildLine('dev:all', { kind: 'stopped', pid: 4242, groupRemains: false })).toBe(
      'dev:all (pid 4242) was stopped',
    );
    expect(preflight.stoppedChildLine('dev:all', { kind: 'gone', pid: undefined, groupRemains: false })).toBe(
      'dev:all (pid none) had already exited',
    );
  });

  it('for a surviving child the pid rides inside the outcome text instead of the prefix', () => {
    expect(preflight.stoppedChildLine('browser', { kind: 'survived', pid: 4242 })).toBe(
      'browser: survived SIGKILL and needs a manual kill (pid 4242)',
    );
  });
});

describe('goneChildOutcome', () => {
  it('a leader that exited on its own still gets its group probed, and remaining members are named', () => {
    const outcome = preflight.goneChildOutcome(4242, true);

    expect(outcome).toEqual({ kind: 'gone', pid: 4242, groupRemains: true });
    expect(preflight.stopOutcomeText(outcome)).toBe(
      'had already exited, but members of its process group remain; check with `pgrep -g 4242`',
    );
  });

  it('a group with nothing left in it reports the plain already-exited text', () => {
    const outcome = preflight.goneChildOutcome(4242, false);

    expect(outcome).toEqual({ kind: 'gone', pid: 4242, groupRemains: false });
    expect(preflight.stopOutcomeText(outcome)).toBe('had already exited');
  });
});

describe('running', () => {
  it('a child that has neither exited nor been signalled is running', () => {
    expect(preflight.running({ exitCode: null, signalCode: null })).toBe(true);
  });

  it('an exit code, or a signal, says it is not', () => {
    expect(preflight.running({ exitCode: 1, signalCode: null })).toBe(false);
    expect(preflight.running({ exitCode: null, signalCode: 'SIGTERM' })).toBe(false);
  });
});

/** A child stand-in for the exit wait: an event emitter with the two fields Node sets when it reaps a child. */
function exitWaitChild(exitCode: number | null = null, signalCode: NodeJS.Signals | null = null): ChildProcess {
  return Object.assign(new EventEmitter(), { exitCode, signalCode }) as ChildProcess;
}

describe('waitForExit', () => {
  it('answers true at once for a child this process has already reaped, with no event waited for', async () => {
    expect(await preflight.waitForExit(exitWaitChild(0, null), 60_000)).toBe(true);
    expect(await preflight.waitForExit(exitWaitChild(null, 'SIGTERM'), 60_000)).toBe(true);
  });

  it('answers true when the exit event fires within the budget', async () => {
    const child = exitWaitChild();
    const wait = preflight.waitForExit(child, 60_000);
    child.emit('exit', 0, null);

    await expect(wait).resolves.toBe(true);
    // The wait puts one 'exit' listener on the child and leaves none behind,
    // so a stop that runs waitForExit per phase does not leak a listener.
    expect(child.listenerCount('exit')).toBe(0);
  });

  it('answers false when the budget passes before the exit', async () => {
    const child = exitWaitChild();

    await expect(preflight.waitForExit(child, 20)).resolves.toBe(false);
    // The timeout path removes its listener: a leaked one per stop phase
    // would go unnoticed otherwise.
    expect(child.listenerCount('exit')).toBe(0);
  });

  it('an exit that lands after the budget does not turn the answer into true', async () => {
    const child = exitWaitChild();
    const wait = preflight.waitForExit(child, 20);
    await new Promise((resolve) => setTimeout(resolve, 60));
    child.emit('exit', 0, null);

    await expect(wait).resolves.toBe(false);
  });
});

describe('browserExitedAfterCdpMessage', () => {
  it('names the pid that answered CDP and is already gone, so no READY is printed against it', () => {
    expect(preflight.browserExitedAfterCdpMessage(4242)).toBe('browser exited right after serving CDP (pid 4242)');
  });

  it('a child that never got a pid is named none', () => {
    expect(preflight.browserExitedAfterCdpMessage(undefined)).toBe(
      'browser exited right after serving CDP (pid none)',
    );
  });
});

describe('stopAllChildren', () => {
  const browser = { label: 'browser', profileDir: '/tmp/frontx-verify-b' };
  const devAll = { label: 'dev:all', profileDir: undefined };

  it('stops every child one at a time and reports each by label, pid and outcome', async () => {
    const lines: string[] = [];
    const stopped: string[] = [];

    const { keepDirs, cleanupFailed } = await preflight.stopAllChildren(
      [browser, devAll],
      async (child) => {
        stopped.push(child.label);
        return { kind: 'stopped', pid: 4242, groupRemains: false };
      },
      (line) => lines.push(line),
    );

    expect(stopped).toEqual(['browser', 'dev:all']);
    expect(lines).toEqual(['browser (pid 4242) was stopped', 'dev:all (pid 4242) was stopped']);
    expect(keepDirs).toEqual([]);
    expect(cleanupFailed).toBe(false);
  });

  it('a child that survives SIGKILL keeps its profile dir for the run that still owns it', async () => {
    const { keepDirs, cleanupFailed } = await preflight.stopAllChildren(
      [browser],
      async () => ({ kind: 'survived', pid: 4242 }),
      () => {},
    );

    expect(keepDirs).toEqual(['/tmp/frontx-verify-b']);
    expect(cleanupFailed).toBe(true);
  });

  it('a child whose group still has members keeps its dir too, stopped or gone: members still hold it', async () => {
    const { keepDirs, cleanupFailed } = await preflight.stopAllChildren(
      [
        { label: 'browser', profileDir: '/tmp/frontx-verify-b' },
        { label: 'gone-browser', profileDir: '/tmp/frontx-verify-g' },
      ],
      async (child) =>
        child.label === 'browser'
          ? { kind: 'stopped', pid: 4242, groupRemains: true }
          : { kind: 'gone', pid: 4243, groupRemains: true },
      () => {},
    );

    expect(keepDirs).toEqual(['/tmp/frontx-verify-b', '/tmp/frontx-verify-g']);
    expect(cleanupFailed).toBe(true);
  });

  it('a child whose stop throws is logged and the remaining children are still stopped', async () => {
    const lines: string[] = [];
    const stopped: string[] = [];

    const { keepDirs, cleanupFailed } = await preflight.stopAllChildren(
      [browser, devAll],
      async (child) => {
        if (child.label === 'browser') throw new Error('stop blew up');
        stopped.push(child.label);
        return { kind: 'stopped', pid: 7, groupRemains: false };
      },
      (line) => lines.push(line),
    );

    expect(stopped).toEqual(['dev:all']);
    expect(lines).toEqual(['could not stop browser: stop blew up', 'dev:all (pid 7) was stopped']);
    // The child that could not be stopped was not seen to exit, so its dir is
    // kept: removing the dir of a live browser is what the stop must not do.
    expect(keepDirs).toEqual(['/tmp/frontx-verify-b']);
    expect(cleanupFailed).toBe(true);
  });

  it('a child with no profile dir still fails the cleanup when it survives, keeps members, or cannot be stopped', async () => {
    // dev:all has no profile dir, so there is nothing to keep for it. The flag
    // is what the exit code reads, and a stop that left any of these behind,
    // grandchildren included, must read as failed all the same: without the
    // flag a dev:all whose vite children outlived it would exit 0.
    const { keepDirs, cleanupFailed } = await preflight.stopAllChildren(
      [
        { label: 'dev:all', profileDir: undefined },
        { label: 'gone-dev:all', profileDir: undefined },
        { label: 'throwing-dev:all', profileDir: undefined },
      ],
      async (child) => {
        if (child.label === 'dev:all') return { kind: 'survived', pid: 4242 };
        if (child.label === 'gone-dev:all') return { kind: 'gone', pid: 4243, groupRemains: true };
        throw new Error('stop blew up');
      },
      () => {},
    );

    expect(keepDirs).toEqual([]);
    expect(cleanupFailed).toBe(true);
  });
});

describe('stopGroupSignals', () => {
  it('sends no signal to a group that is already gone and reports it stopped with nothing remaining', async () => {
    const signals: string[] = [];
    const exitWaits: number[] = [];

    const outcome = await preflight.stopGroupSignals(
      4242,
      async (ms) => {
        exitWaits.push(ms);
        return true;
      },
      () => false,
      () => true,
      (pgid, signal) => signals.push(`${pgid}:${signal}`),
      async () => {},
    );

    expect(signals).toEqual([]);
    expect(exitWaits).toEqual([]);
    expect(outcome).toEqual({ kind: 'stopped', pid: 4242, groupRemains: false });
  });

  it('runs the phases in order while the leader stays unreaped: signal, its exit wait, the group drain', async () => {
    // The escalation only reaches SIGKILL because the leader did not exit in
    // the SIGTERM grace: only then does this process still hold it unreaped.
    // Per phase the order is the decided one: the signal, the leader's exit
    // bounded by that phase's budget, then the drain the remaining members get.
    let members = true;
    let exitWaits = 0;
    let groupWaits = 0;
    const log: string[] = [];

    const outcome = await preflight.stopGroupSignals(
      4242,
      async () => {
        exitWaits += 1;
        log.push('exit-wait');
        return exitWaits >= 2; // outlives the SIGTERM grace, exits under SIGKILL
      },
      () => members,
      () => true, // the leader is still unreaped when the SIGKILL turn is decided
      (pgid, signal) => log.push(`signal:${signal}`),
      async () => {
        groupWaits += 1;
        log.push('group-wait');
        if (groupWaits === 2) members = false; // the group disperses under SIGKILL
      },
    );

    expect(log).toEqual([
      'signal:SIGTERM',
      'exit-wait',
      'group-wait',
      'signal:SIGKILL',
      'exit-wait',
      'group-wait',
    ]);
    expect(outcome).toEqual({ kind: 'stopped', pid: 4242, groupRemains: false });
  });

  it('a group whose leader never exits outlives SIGKILL and is reported as survived', async () => {
    const signals: string[] = [];

    const outcome = await preflight.stopGroupSignals(
      4242,
      async () => false, // the leader does not exit within any wait budget
      () => true,
      () => true, // still unreaped at every signal turn
      (pgid, signal) => signals.push(`${pgid}:${signal}`),
      async () => {},
    );

    // A false exit wait never ends the escalation: SIGKILL follows SIGTERM, so
    // the check that the kill was sent is what a regression skipping it lacks.
    expect(signals).toEqual(['4242:SIGTERM', '4242:SIGKILL']);
    expect(outcome).toEqual({ kind: 'survived', pid: 4242 });
    expect(preflight.stopOutcomeText(outcome)).toBe('survived SIGKILL and needs a manual kill (pid 4242)');
  });

  it('a leader that exits on SIGTERM ends the stop on the group probe read after the exit, with no SIGKILL', async () => {
    // The zombie case: while this process has not reaped its own child, the
    // child still counts as a member of its group, so the probe reads alive
    // until the exit has fired and is believed only then. The leader exits on
    // SIGTERM, the probe turns false once it is read after the exit, and the
    // escalation ends without a SIGKILL.
    let leaderExited = false;
    const signals: string[] = [];

    const outcome = await preflight.stopGroupSignals(
      4242,
      async () => {
        leaderExited = true; // the exit event fires within the wait
        return true;
      },
      () => !leaderExited, // alive until the exit, empty once read after it
      () => !leaderExited, // and reaped before any SIGKILL turn is reached
      (pgid, signal) => signals.push(`${pgid}:${signal}`),
      async () => {},
    );

    expect(signals).toEqual(['4242:SIGTERM']);
    expect(outcome).toEqual({ kind: 'stopped', pid: 4242, groupRemains: false });
  });

  it('members that remain once the SIGTERM grace is spent are groupRemains, with no SIGKILL', async () => {
    // The leader exits on SIGTERM and is reaped, so the id is no longer
    // guaranteed to be ours and no further signal goes out. The members that
    // outlived the grace are what keeps the profile dir and gets the
    // `pgrep -g` advice, reported the way the gone path reports them.
    const signals: string[] = [];
    const drainBudgets: number[] = [];

    const outcome = await preflight.stopGroupSignals(
      4242,
      async () => true, // the leader exits within the SIGTERM grace
      () => true, // members outlive the grace
      () => true, // and it is reaped before the SIGKILL turn, so none is reached
      (pgid, signal) => signals.push(`${pgid}:${signal}`),
      async (pgid, ms) => {
        drainBudgets.push(ms);
      },
    );

    expect(signals).toEqual(['4242:SIGTERM']);
    // One drain, the rest of the SIGTERM grace: there is no SIGKILL phase.
    expect(drainBudgets).toHaveLength(1);
    expect(drainBudgets[0]).toBeLessThanOrEqual(preflight.KILL_GRACE_MS);
    expect(outcome).toEqual({ kind: 'stopped', pid: 4242, groupRemains: true });
    expect(preflight.stopOutcomeText(outcome)).toBe(
      'was stopped, but members of its process group remain; check with `pgrep -g 4242`',
    );
  });

  it('members still exiting a second after the leader are waited out inside the grace: stopped, no SIGKILL', async () => {
    // The live defect: the leader (npm) exits fast on SIGTERM, the group probe
    // read right after its exit saw the vite, esbuild and Chrome helpers still
    // shutting down from the same signal, and a 250 ms settle called that tail
    // final. The members now get the rest of the SIGTERM grace, so a tail that
    // disperses one second in ends the stop clean, with no SIGKILL at all.
    const signals: string[] = [];
    const drainBudgets: number[] = [];
    let members = true;

    const outcome = await preflight.stopGroupSignals(
      4242,
      async () => true, // the leader exits at once on SIGTERM
      () => members,
      () => true, // reaped already, and the loop breaks before a SIGKILL turn
      (pgid, signal) => signals.push(`${pgid}:${signal}`),
      async (pgid, ms) => {
        drainBudgets.push(ms);
        members = false; // the remaining members finish exiting one second later
      },
    );

    // The one drain window is the rest of the SIGTERM grace after the leader's
    // exit, not a short settle: the wait resolves at once, so almost the whole
    // grace is left, and the observed one second tail fits inside it.
    expect(drainBudgets).toHaveLength(1);
    expect(drainBudgets[0]).toBeGreaterThan(preflight.KILL_GRACE_MS - 100);
    expect(drainBudgets[0]).toBeLessThanOrEqual(preflight.KILL_GRACE_MS);
    expect(signals).toEqual(['4242:SIGTERM']);
    expect(outcome).toEqual({ kind: 'stopped', pid: 4242, groupRemains: false });
  });

  it('a leader that outlives the grace gets the SIGKILL phase and its own settle budget', async () => {
    // SIGKILL goes out only because the leader was still unreaped after the
    // SIGTERM grace, and that phase is not a leftover of the first: it gets the
    // whole SIGKILL_SETTLE_MS for the members to disperse in.
    const signals: string[] = [];
    const drainBudgets: number[] = [];
    let members = true;
    let exitWaits = 0;

    const outcome = await preflight.stopGroupSignals(
      4242,
      async () => {
        exitWaits += 1;
        return exitWaits >= 2; // the leader exits only under SIGKILL
      },
      () => members,
      () => exitWaits < 2, // still unreaped when the SIGKILL turn is decided
      (pgid, signal) => signals.push(`${pgid}:${signal}`),
      async (pgid, ms) => {
        drainBudgets.push(ms);
        if (drainBudgets.length === 2) members = false; // gone under the SIGKILL settle
      },
    );

    expect(signals).toEqual(['4242:SIGTERM', '4242:SIGKILL']);
    // The second window is the SIGKILL settle, not a leftover of the grace:
    // the leader exits at once, so it is the whole SIGKILL_SETTLE_MS bar the
    // run's own clock, and the bound leaves that clock its few milliseconds.
    expect(drainBudgets[1]).toBeGreaterThan(preflight.SIGKILL_SETTLE_MS - 100);
    expect(drainBudgets[1]).toBeLessThanOrEqual(preflight.SIGKILL_SETTLE_MS);
    expect(outcome).toEqual({ kind: 'stopped', pid: 4242, groupRemains: false });
  });

  it('a leader reaped between the timed-out SIGTERM wait and the SIGKILL turn gets no SIGKILL', async () => {
    // The SIGTERM grace runs out with the leader unreaped, so the exit wait
    // reports false and the escalation turns towards SIGKILL. The leader then
    // exits and is reaped inside the drain window, before that turn is decided:
    // the rule is checked again right before the signal, finds the leader gone,
    // and the turn ends with no SIGKILL at all. The members still there are
    // reported the way the leader-exited path reports them.
    const signals: string[] = [];
    let leaderAlive = true;

    const outcome = await preflight.stopGroupSignals(
      4242,
      async () => false, // the SIGTERM grace times out with the leader unreaped
      () => true, // the group still has members throughout
      () => leaderAlive,
      (pgid, signal) => signals.push(`${pgid}:${signal}`),
      async () => {
        leaderAlive = false; // the leader exits and is reaped in the drain window
      },
    );

    // No SIGKILL: one there would be a signal the rule refuses to send.
    expect(signals).toEqual(['4242:SIGTERM']);
    // The leader-exited path: stopped, with the members named for a manual stop.
    expect(outcome).toEqual({ kind: 'stopped', pid: 4242, groupRemains: true });
    expect(preflight.stopOutcomeText(outcome)).toBe(
      'was stopped, but members of its process group remain; check with `pgrep -g 4242`',
    );
  });

  it('a signal that cannot be delivered ends the escalation, and the final probe decides the outcome', async () => {
    const outcome = await preflight.stopGroupSignals(
      4242,
      async () => true,
      () => true,
      () => true,
      () => {
        throw new Error('EPERM');
      },
      async () => {},
    );

    expect(outcome).toEqual({ kind: 'survived', pid: 4242 });
  });

  it('a group that disperses between the probe and the signal is still reported stopped', async () => {
    let members = true;

    const outcome = await preflight.stopGroupSignals(
      4242,
      async () => true,
      () => members,
      () => true,
      () => {
        members = false; // the group vanished before the signal landed
        throw new Error('ESRCH');
      },
      async () => {},
    );

    expect(outcome).toEqual({ kind: 'stopped', pid: 4242, groupRemains: false });
  });
});

describe('the stop budgets', () => {
  it('the SIGTERM grace and the SIGKILL settle are the decided budgets', () => {
    // The grace is what a stopping group gets to empty in before it is judged;
    // the settle is the SIGKILL phase's share. Each phase splits its budget
    // between the leader's exit wait and the group drain, so these two numbers
    // are how long a stop can take and how long a tail is tolerated.
    expect(preflight.KILL_GRACE_MS).toBe(5_000);
    expect(preflight.SIGKILL_SETTLE_MS).toBe(3_000);
  });
});

describe('groupGoneByErrno', () => {
  it('only ESRCH means the group is gone; EPERM, or any other errno, still means members remain', () => {
    expect(preflight.groupGoneByErrno('ESRCH')).toBe(true);
    expect(preflight.groupGoneByErrno('EPERM')).toBe(false);
    expect(preflight.groupGoneByErrno('EACCES')).toBe(false);
    expect(preflight.groupGoneByErrno(undefined)).toBe(false);
  });
});

/**
 * Resolves once the child has spawned, or rejects with the spawn error: `pid`
 * is only assigned by then, and the 'error' listener keeps a spawn that failed
 * from crashing the worker as an unhandled error.
 */
function spawned(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('spawn', () => resolve());
    child.once('error', reject);
  });
}

describe('groupHasMembers', () => {
  // Process groups are POSIX-only, so win32 is skipped rather than failed on a
  // `process.kill(-pgid, ...)` that has no meaning there.
  it.skipIf(process.platform === 'win32')(
    'reads a live detached group as having members and the same group as empty once its leader exited',
    async () => {
      const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
      await spawned(child);
      // The spawn is known to have worked, so the cast below is the pid the
      // kernel handed out and not a guess over `undefined`.
      expect(child.pid).toBeDefined();
      const pgid = child.pid as number;
      try {
        expect(preflight.groupHasMembers(pgid)).toBe(true);
      } finally {
        process.kill(-pgid, 'SIGKILL');
      }
      await new Promise((resolve) => child.once('exit', resolve));
      // ESRCH on the probe: the group is gone, so it has no members.
      expect(preflight.groupHasMembers(pgid)).toBe(false);
    },
  );
});

describe('profileDirsToRemove', () => {
  it('the stop removes every profile dir except the one a surviving browser still runs with', () => {
    expect(
      preflight.profileDirsToRemove(['/tmp/frontx-verify-a', '/tmp/frontx-verify-b'], ['/tmp/frontx-verify-b']),
    ).toEqual(['/tmp/frontx-verify-a']);
    expect(preflight.profileDirsToRemove(['/tmp/frontx-verify-a'], [])).toEqual(['/tmp/frontx-verify-a']);
    expect(preflight.profileDirsToRemove([], [])).toEqual([]);
  });
});

describe('removeProfileDirs', () => {
  it('removes each dir on its own: one failure is logged and the rest are still removed', () => {
    const lines: string[] = [];
    const removed: string[] = [];

    const result = preflight.removeProfileDirs(
      ['/tmp/frontx-verify-a', '/tmp/frontx-verify-b'],
      (dir) => {
        if (dir === '/tmp/frontx-verify-a') throw new Error('EBUSY: resource busy');
        removed.push(dir);
      },
      (line) => lines.push(line),
    );

    expect(result).toEqual(['/tmp/frontx-verify-b']);
    expect(removed).toEqual(['/tmp/frontx-verify-b']);
    expect(lines).toContain('could not remove /tmp/frontx-verify-a: EBUSY: resource busy');
    expect(lines).toContain('removed /tmp/frontx-verify-b');
  });

  it('with no dirs there is nothing to remove and nothing to say', () => {
    expect(preflight.removeProfileDirs([], () => {}, () => {})).toEqual([]);
  });
});

describe('stopCleanupFailed', () => {
  it('a failed child cleanup, a kept dir, or a dir that stayed, is a failed cleanup; a stop that freed everything is not', () => {
    // The child flag stands on its own, without any dir behind it: dev:all has
    // no profile dir, and a stop that left its grandchildren behind still
    // failed, so the exit code has to say so.
    expect(preflight.stopCleanupFailed(true, [], [], [])).toBe(true);
    // A kept dir is a survivor, a stop that threw, or a group that still has
    // members: none of those was seen to be fully gone.
    expect(preflight.stopCleanupFailed(false, ['/tmp/frontx-verify-b'], ['/tmp/frontx-verify-a'], [])).toBe(true);
    // A dir the stop tried to remove in vain stayed where it was.
    expect(preflight.stopCleanupFailed(false, [], ['/tmp/frontx-verify-a'], [])).toBe(true);
    expect(preflight.stopCleanupFailed(false, [], ['/tmp/frontx-verify-a'], ['/tmp/frontx-verify-a'])).toBe(false);
    expect(preflight.stopCleanupFailed(false, [], [], [])).toBe(false);
  });
});

describe('failedAttemptStep', () => {
  it('an attempt that was stopped, or had already exited, frees its profile dir so the run retries', () => {
    expect(preflight.failedAttemptStep(1, { kind: 'stopped', pid: 4242, groupRemains: false })).toEqual({
      kind: 'retry',
    });
    expect(preflight.failedAttemptStep(1, { kind: 'gone', pid: 4242, groupRemains: false })).toEqual({
      kind: 'retry',
    });
    expect(preflight.failedAttemptStep(1, { kind: 'gone', pid: undefined, groupRemains: false })).toEqual({
      kind: 'retry',
    });
  });

  it('an attempt that survived SIGKILL keeps its dir and fails the run with the pid to kill', () => {
    expect(preflight.failedAttemptStep(1, { kind: 'survived', pid: 4242 })).toEqual({
      kind: 'fail',
      message: 'browser launch 1 survived SIGKILL and needs a manual kill (pid 4242)',
    });
  });

  it('an attempt whose group still has members keeps its dir and fails the run with the probe', () => {
    expect(preflight.failedAttemptStep(1, { kind: 'stopped', pid: 4242, groupRemains: true })).toEqual({
      kind: 'fail',
      message: 'browser launch 1 was stopped, but members of its process group remain; check with `pgrep -g 4242`',
    });
    expect(preflight.failedAttemptStep(2, { kind: 'gone', pid: 4343, groupRemains: true })).toEqual({
      kind: 'fail',
      message: 'browser launch 2 had already exited, but members of its process group remain; check with `pgrep -g 4343`',
    });
  });

  it('the tagged kind is the whole answer: only a fail carries a message, so a retry cannot read as a kept dir', () => {
    const outcomes: preflight.StopOutcome[] = [
      { kind: 'stopped', pid: 4242, groupRemains: false },
      { kind: 'stopped', pid: 4242, groupRemains: true },
      { kind: 'gone', pid: 4242, groupRemains: false },
      { kind: 'gone', pid: undefined, groupRemains: false },
      { kind: 'gone', pid: 4242, groupRemains: true },
      { kind: 'survived', pid: 4242 },
    ];

    for (const outcome of outcomes) {
      const step = preflight.failedAttemptStep(1, outcome);
      expect(Object.keys(step).sort()).toEqual(step.kind === 'fail' ? ['kind', 'message'] : ['kind']);
    }
  });
});

describe('signalReaction', () => {
  it('the first signal starts the stop, with the why the stop reports', () => {
    expect(preflight.signalReaction('SIGINT', false, false)).toEqual({
      kind: 'start',
      why: 'SIGINT: stopping what this run started',
    });
  });

  it('a signal while the stop already runs prints the wait note, once, and is then silent', () => {
    expect(preflight.signalReaction('SIGINT', true, false)).toEqual({
      kind: 'note',
      line: '[verify-preflight] already stopping, please wait',
    });
    expect(preflight.signalReaction('SIGTERM', true, true)).toEqual({ kind: 'ignore' });
    expect(preflight.signalReaction('SIGHUP', true, true)).toEqual({ kind: 'ignore' });
  });
});

/**
 * The command boundary, exercised the way a caller reaches it: the script run
 * as a child process. Only the paths that need no servers and no browser are
 * run here, so the spawns are quick and leave nothing behind: the help text,
 * the --no-start refusal, the argument error, and one fixture run whose
 * dev:all child records the environment it was started with. `node --import
 * tsx` is the runner the package's own scripts reach through `npx tsx`,
 * spelled directly against the node binary running the tests so no npm layer
 * sits in between. The script refuses to run on win32 (process groups), so the
 * suite is skipped there like the real-process group probe above.
 */
const SCRIPT_PATH = fileURLToPath(new URL('../scripts/verify-preflight.ts', import.meta.url));
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TSX_CLI = join(PACKAGE_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

interface CommandRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * The environment a command run gets: this process's own, without the
 * variables the preflight and dev:all read their ports from, then `env`. A
 * value exported in the shell running the tests (the docs tell people to
 * export FRONTX_VERIFY_MOVE_PREVIEW_PORTS for a run beside another project)
 * cannot decide what a test sees.
 */
function commandEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const inherited = { ...process.env };
  delete inherited.FRONTX_VERIFY_MOVE_PREVIEW_PORTS;
  delete inherited.FRONTX_VERIFY_HOST_PORT;
  return { ...inherited, ...env };
}

function runCommand(args: readonly string[], env: NodeJS.ProcessEnv = {}): CommandRun {
  // spawnSync blocks the event loop, so vitest's per-test timeout cannot fire
  // while the child hangs: the bound and the kill have to live here. A hang in
  // the --no-start probe path, or tsx stalling on load, then comes back as
  // result.error, which is thrown so the failure names the cause instead of
  // leaving the worker stuck until the whole run is killed.
  const result = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT_PATH, ...args], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf-8',
    timeout: 30_000,
    killSignal: 'SIGKILL',
    env: commandEnv(env),
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * The same run from another working directory, with the tsx CLI spelled by
 * path. A fixture project has no node_modules of its own, so the bare `tsx`
 * specifier `--import` would resolve could not be found from there, and the
 * working directory is what the run reads the project in and starts dev:all
 * from.
 *
 * The spawn is asynchronous on purpose. The CDP stub that answers the child
 * lives in this process, and a synchronous spawn holds the event loop for the
 * whole run, so the stub's HTTP callback never runs: the child's probe times
 * out and the run falls to looking for a browser, which passes only where one
 * is installed. Awaiting the child keeps this process turning, so the stub
 * answers and the test proves the handoff rather than the browser search. The
 * child's output is captured the same way the synchronous call captured it,
 * and the bound and the kill still live here, because a run that stalls before
 * it reaches its own timeout would otherwise sit until the whole worker is
 * killed. A run stopped at the bound comes back with a null status, as the
 * synchronous call did.
 */
async function runCommandIn(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): Promise<CommandRun> {
  const child = spawn(process.execPath, [TSX_CLI, SCRIPT_PATH, ...args], {
    cwd,
    env: commandEnv(env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout?.setEncoding('utf-8');
  child.stderr?.setEncoding('utf-8');
  child.stdout?.on('data', (chunk: string) => stdout.push(chunk));
  child.stderr?.on('data', (chunk: string) => stderr.push(chunk));
  const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
  return new Promise<CommandRun>((resolve, reject) => {
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout: stdout.join(''), stderr: stderr.join('') });
    });
  });
}

/** Starts a server on a free port of the loopback interface and answers that port. */
function listenOnFreePort(server: HttpServer): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') reject(new Error('the OS assigned no port'));
      else resolve(address.port);
    });
  });
}

/** A high port that is free right now: bound once with port 0, then released. */
function freeHighPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => (port > 0 ? resolve(port) : reject(new Error('the OS assigned no port'))));
    });
  });
}

describe.skipIf(process.platform === 'win32')('the command', () => {
  it('--help exits 0 and prints the flags', () => {
    const run = runCommand(['--help']);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Usage:');
    expect(run.stdout).toContain('--host-port <n>');
    expect(run.stdout).toContain('--cdp-port <n>');
    expect(run.stdout).toContain('--browser <path>');
    expect(run.stdout).toContain('--no-start');
    expect(run.stdout).toContain('--timeout <ms>');
    expect(run.stdout).toContain('--help, -h');
    expect(run.stdout).not.toContain('READY');
  });

  it('--no-start on ports nothing answers exits 1 with the not-running message', async () => {
    const [hostPort, cdpPort] = await Promise.all([freeHighPort(), freeHighPort()]);
    const run = runCommand(['--no-start', '--host-port', String(hostPort), '--cdp-port', String(cdpPort)]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Servers are not running, and --no-start refuses to start them');
    expect(run.stderr).toContain(`port ${hostPort} (host): free`);
    expect(run.stdout).not.toContain('READY');
  });

  it('a FRONTX_VERIFY_HOST_PORT that is not a port exits 1 and names the variable and the value', () => {
    // The run reads the environment where it reads the flags, so a value that
    // is not a port stops it before anything is probed: waiting on a port
    // nothing will serve would only be seen as a timeout.
    const run = runCommand(['--no-start'], { FRONTX_VERIFY_HOST_PORT: 'not-a-port' });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('FRONTX_VERIFY_HOST_PORT expects a port between 1 and 65535, got "not-a-port"');
    expect(run.stdout).not.toContain('READY');
  });

  it('refuses FRONTX_VERIFY_MOVE_PREVIEW_PORTS=1 before probing, since it checks each screen at its declared port', async () => {
    const [hostPort, cdpPort] = await Promise.all([freeHighPort(), freeHighPort()]);
    const run = runCommand(['--no-start', '--host-port', String(hostPort), '--cdp-port', String(cdpPort)], {
      FRONTX_VERIFY_MOVE_PREVIEW_PORTS: '1',
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('FRONTX_VERIFY_MOVE_PREVIEW_PORTS=1 is not supported here');
    expect(run.stdout).not.toContain('host port');
    expect(run.stderr).not.toContain('Servers are not running');
  });

  it('a FRONTX_VERIFY_HOST_PORT that is not a port does not stop a run that names the port with the flag', async () => {
    // The flag wins over the variable, so the variable is not read at all when
    // the flag names the port: a value the run would never use must not fail
    // it. The run still stops at the --no-start refusal, which names the port
    // the flag gave and never the variable.
    const [hostPort, cdpPort] = await Promise.all([freeHighPort(), freeHighPort()]);
    const run = runCommand(['--no-start', '--host-port', String(hostPort), '--cdp-port', String(cdpPort)], {
      FRONTX_VERIFY_HOST_PORT: 'not-a-port',
    });

    expect(run.stderr).not.toContain('FRONTX_VERIFY_HOST_PORT');
    expect(run.stdout).toContain(`[verify-preflight] host port ${hostPort} (source: flag)`);
    expect(run.stderr).toContain(`port ${hostPort} (host): free`);
  });

  it('the dev:all it starts receives FRONTX_VERIFY_HOST_PORT set to the resolved port', async () => {
    // The command boundary is the seam this describe already uses: the script
    // is run as a child process. Its dev:all child is a fixture script in a
    // temporary project, and that child records the environment it was given,
    // so the handoff is read from the process that received it rather than
    // from a helper the test would have to reach into the script for. The
    // CDP probe is answered by a stub, so no browser is looked for or
    // launched, and the record is the only thing this run has to produce.
    const project = mkdtempSync(join(tmpdir(), 'frontx-preflight-spawn-'));
    const cdp = createHttpServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/browser/fixture' }));
    });
    try {
      writeFileSync(
        join(project, 'package.json'),
        JSON.stringify({ name: 'fixture', private: true, scripts: { 'dev:all': 'node record-env.cjs' } }),
      );
      writeFileSync(
        join(project, 'record-env.cjs'),
        'require("node:fs").writeFileSync("spawn-env.json", JSON.stringify({ port: process.env.FRONTX_VERIFY_HOST_PORT }));\n',
      );
      const [cdpPort, hostPort] = await Promise.all([listenOnFreePort(cdp), freeHighPort()]);
      // Awaited, so the stub above answers the child's CDP probe while it
      // runs. The fixture dev:all exits at once, so the run reports that and
      // stops instead of waiting out its port budget. The inherited value is
      // a port of its own, so the record proves the run pinned the resolved
      // one over it rather than passing the environment through.
      const run = await runCommandIn(project, ['--host-port', String(hostPort), '--cdp-port', String(cdpPort), '--timeout', '5000'], {
        FRONTX_VERIFY_HOST_PORT: '9999',
      });

      expect(run.status).toBe(1);
      expect(run.stderr).toContain('dev:all exited unexpectedly');
      expect(JSON.parse(readFileSync(join(project, 'spawn-env.json'), 'utf-8'))).toEqual({ port: String(hostPort) });
    } finally {
      await new Promise<void>((done) => cdp.close(() => done()));
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('an unknown flag exits non-zero, names the flag, and points at --help', () => {
    const run = runCommand(['--wat']);

    expect(run.status).not.toBe(0);
    expect(run.status).not.toBeNull();
    expect(run.stderr).toContain('--wat unknown flag');
    expect(run.stderr).toContain('--help');
    expect(run.stdout).not.toContain('READY');
  });
});
