#!/usr/bin/env node

/**
 * verify-preflight: prepare the browser verification walk in one command.
 *
 * Three things have to be true before the walk driver can run: the dev:all
 * servers answer HTTP, a Chrome is up with a DevTools port the driver can
 * attach to, and the exact driver arguments are known.
 *
 * The script is a supervisor. What it starts (dev:all and the browser) are its
 * own children, each in a process group of its own, and it keeps running for
 * the whole walk. Ctrl-C or SIGTERM to it stops exactly those children and
 * removes the browser profile dir it created. Ownership lives in this process's
 * memory only: there is no state file, and no later process acts on a recorded
 * pid or path. Servers and a browser that were already up are reused and never
 * stopped by it. macOS and Linux only.
 *
 * The pure parts (argument parsing, the host port resolution and the Vite
 * config port reader it falls back on, the start plan and its re-read
 * after the server wait, browser resolution order, the launch flag sets, the
 * messages, the run-once guard, the stop outcomes and the stop steps) are
 * exported for tests; the command runs only when this file is the process
 * entry point.
 *
 * Flags: see helpText(), also printed by `--help`.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { isProcessEntryPoint } from './lib/entry-point.js';
import {
  getMFEPackages,
  noDiscoveredPackagesNotice,
  NODE_BIN_DIR,
  type MfeInfo,
} from './lib/mfe-tools.js';
import { isPortFree, PREVIEW_HOST } from './lib/preview-ports.js';

const SCRIPT_NAME = 'verify-preflight';

/**
 * The host port the walk runs on when nothing names one: neither --host-port,
 * nor FRONTX_VERIFY_HOST_PORT, nor the project's Vite config. 5173 is Vite's
 * own default dev port, what plain `vite` serves on with no port configured.
 */
export const DEFAULT_HOST_PORT = 5173;

/** The walk driver's own default CDP port. */
export const DEFAULT_CDP_PORT = 9222;

/** How long to wait for dev:all to answer on every port. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** How long one browser launch gets to serve /json/version before the retry. */
export const BROWSER_START_TIMEOUT_MS = 15_000;

/**
 * The prefix of the browser profile dir this run creates, and of the dir the
 * hand-cleanup advice names. One constant, used by both the mkdtempSync that
 * makes the dir and the advice that tells a reader what to look for, so the
 * printed name cannot drift from the real one. mkdtempSync appends its own
 * random suffix after this prefix.
 */
export const PROFILE_DIR_PREFIX = 'frontx-verify-';

/** Environment variable that names a browser executable, read when --browser is absent. */
export const FRONTX_VERIFY_BROWSER = 'FRONTX_VERIFY_BROWSER';

/**
 * Environment variable that names the host port, read when --host-port is
 * absent. dev:all (scripts/dev-all.ts) reads the same variable, so the port
 * the run resolves is also the port it starts the host on.
 */
export const FRONTX_VERIFY_HOST_PORT = 'FRONTX_VERIFY_HOST_PORT';

/**
 * How the summary names a browser this run did not start: the one already
 * serving CDP on --cdp-port, whatever executable it happens to be.
 */
const REUSED_BROWSER_LABEL = 'the browser already on the CDP port';

/**
 * Printed verbatim between the two launch attempts, so a reader of the output
 * knows the browser is now running without Chrome's sandbox.
 */
export const FIRST_LAUNCH_RETRY_LINE =
  "first launch failed; retrying with --no-sandbox (Chrome's sandbox is off for this browser only)";

const SERVER_POLL_MS = 500;
const BROWSER_POLL_MS = 250;
/**
 * The budget of the SIGTERM phase of the stop, shared between the two things
 * that phase waits for: the leader's own exit first, then the group members
 * still shutting down from the same signal, which get whatever is left of the
 * grace. A group that still has members once the whole grace is spent is what
 * the escalation to SIGKILL is for.
 */
export const KILL_GRACE_MS = 5_000;
/**
 * The budget of the SIGKILL phase, shared the same way: the leader's exit is
 * waited for within it, and the members that remain get the rest to disperse
 * in. Raised from 1000: the probe that decides `groupRemains` is read only
 * once this window is spent, and a group that is still emptying under SIGKILL
 * must not be judged in the first second of it.
 */
export const SIGKILL_SETTLE_MS = 3_000;
const LOG_TAIL_LINES = 40;
/** How much of a child's output is kept in memory for the failure reports. */
const OUTPUT_KEEP_CHARS = 64 * 1024;

export interface PreflightOptions {
  /**
   * The --host-port value, or undefined when the flag was not given; the run
   * resolves the port then (resolveHostPort) before anything is probed.
   */
  hostPort: number | undefined;
  cdpPort: number;
  /** --browser only; FRONTX_VERIFY_BROWSER is read by the run, so the source of a path is never guessed. */
  browserFlag: string | undefined;
  noStart: boolean;
  timeoutMs: number;
}

export type ParsedArgs =
  | { kind: 'options'; options: PreflightOptions }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

export type PortState = 'answering' | 'occupied' | 'free';

export interface PortTarget {
  label: string;
  port: number;
}

export interface PortStatus extends PortTarget {
  state: PortState;
}

/** Parse the command line. Values may arrive as `--flag value` or `--flag=value`. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const options: PreflightOptions = {
    hostPort: undefined,
    cdpPort: DEFAULT_CDP_PORT,
    browserFlag: undefined,
    noStart: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  const errors: string[] = [];
  const fail = (flag: string, message: string): void => {
    errors.push(`${flag} ${message}`);
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i] ?? '';
    const eq = raw.indexOf('=');
    const flag = eq > 0 ? raw.slice(0, eq) : raw;
    const inlineValue = eq > 0 ? raw.slice(eq + 1) : undefined;

    const readValue = (): string | undefined => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        fail(flag, 'needs a value');
        return undefined;
      }
      i += 1;
      return next;
    };
    const readPort = (): number | undefined => {
      const value = readValue();
      if (value === undefined) return undefined;
      const parsed = parsePort(value);
      if (parsed === undefined) {
        fail(flag, `expects a port between 1 and 65535, got "${value}"`);
        return undefined;
      }
      return parsed;
    };

    switch (flag) {
      case '--help':
      case '-h':
        return { kind: 'help' };
      case '--host-port': {
        const parsedPort = readPort();
        if (parsedPort !== undefined) options.hostPort = parsedPort;
        break;
      }
      case '--cdp-port': {
        const parsedPort = readPort();
        if (parsedPort !== undefined) options.cdpPort = parsedPort;
        break;
      }
      case '--browser': {
        const value = readValue();
        if (value === undefined) break;
        if (value === '') fail(flag, 'needs a non-empty path');
        else options.browserFlag = value;
        break;
      }
      case '--timeout': {
        const value = readValue();
        if (value === undefined) break;
        const parsed = parsePositiveInt(value);
        if (parsed === undefined) fail(flag, `expects milliseconds, got "${value}"`);
        else options.timeoutMs = parsed;
        break;
      }
      case '--no-start':
        if (inlineValue !== undefined) fail(flag, 'does not take a value');
        options.noStart = true;
        break;
      default:
        if (flag.startsWith('-')) fail(flag, 'unknown flag');
        else fail(raw, 'unexpected argument');
        break;
    }
  }

  if (errors.length > 0) return { kind: 'error', message: errors.join('\n') };
  return { kind: 'options', options };
}

/** Where a resolved host port came from; the run prints it so a reader can check it. */
export type HostPortSource = 'flag' | 'env' | 'config' | 'default';

export interface HostPortResolution {
  port: number;
  source: HostPortSource;
}

/**
 * Reads the dev port the project's own Vite config configures: the reader
 * resolveHostPort falls back on behind the flag and the environment.
 */
export type ViteConfigPortResolver = (root: string) => Promise<number | undefined>;

/**
 * The real resolver: the project's own Vite config, read through Vite's
 * loadConfigFromFile, and not a text scan. It bundles and runs the config
 * file Vite finds in the root, whatever supported file name it goes by, so
 * every form a project can write resolves (the object form, the documented
 * function form whose arrow body returns the config, a port computed from the
 * mode), and a `server` or a `port` spelled in a string or a comment stays
 * inert. The config is loaded with the full ConfigEnv a dev start passes
 * (command 'serve', mode 'development', isSsrBuild false, isPreview false),
 * and with NODE_ENV 'development' while it runs when the process had none or
 * had an empty one, which is what Vite's own dev start does: resolveConfig
 * treats a falsy NODE_ENV as unset and fills in development before it loads
 * the config. A function form config that reads isPreview or NODE_ENV then
 * names the same port here as it does in a dev run, instead of falling to a
 * port only this read would pick. The exact previous NODE_ENV is put back
 * afterwards, also when the load throws: an empty string stays empty and an
 * unset value stays unset, so this process
 * goes on with the environment it started with and the dev:all child it later
 * starts does not inherit a value this read supplied. No server is created and
 * no port is bound. loadConfigFromFile runs no plugin hook, which is why it is
 * used here instead of resolveConfig: resolveConfig runs every plugin's config
 * and configResolved hooks, and the module federation plugin in this template
 * does real work in those hooks (it keeps the resolved config and computes its
 * dev entry from it). What comes back is the `server.port` the loaded config
 * holds, so a config that names no port gives undefined here, and the run then
 * reports source: default; a root with no config file reads the same way,
 * since nothing fills Vite's own 5173 in on this path. Whatever is returned is
 * used only after resolveHostPort has held it to the same 1..65535 rule
 * parsePort applies. The import is dynamic, so a caller that injects its own
 * resolver (the tests) loads no Vite at all.
 */
export async function viteConfigPort(root: string): Promise<number | undefined> {
  const { loadConfigFromFile } = await import('vite');
  // The default Vite gives a dev start when the environment names no NODE_ENV
  // or names an empty one: resolveConfig checks the value for truth, not for
  // presence. Supplied for the load only: the config may read it, and the
  // restore below gives back the exact value this process started with, empty
  // string included, so nothing this read supplied reaches dev:all.
  const previousNodeEnv = process.env.NODE_ENV;
  if (!previousNodeEnv) process.env.NODE_ENV = 'development';
  try {
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development', isSsrBuild: false, isPreview: false },
      undefined,
      root,
    );
    const port: unknown = loaded?.config.server?.port;
    return typeof port === 'number' ? port : undefined;
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
}

export interface HostPortResolutionInput {
  /** The --host-port value, or undefined when the flag was not given. */
  flagPort: number | undefined;
  /** The parsed FRONTX_VERIFY_HOST_PORT value, or undefined when the variable is unset. */
  envPort: number | undefined;
  /** The directory whose Vite config the resolver reads: the run's cwd. */
  configRoot: string;
  /**
   * Reads the port the project's Vite config configures. Injected, so the
   * tests name a stub and load no Vite; the run injects viteConfigPort. It
   * is called only when neither the flag nor the environment names the port,
   * and what it returns is used only after the same 1..65535 rule parsePort
   * applies: a value outside that range names no port either, and one line
   * says why the run fell to the default.
   */
  resolveConfigPort: ViteConfigPortResolver;
}

/**
 * The host port the walk runs against, in the order a caller can override the
 * one below it: --host-port, then FRONTX_VERIFY_HOST_PORT, then the port the
 * project's Vite config configures for its dev server, then Vite's own
 * default. The config port is read through the injected resolver, and only
 * when the flag and the variable name none. A resolver that throws prints one
 * line with the error and counts as naming nothing, and a resolver that names
 * a port outside 1 to 65535 prints one line with the value and counts as
 * naming nothing too: both fall through to the default instead of failing, so
 * a config that cannot be resolved, and a config port nothing can serve on,
 * must not keep the walk from starting, and the printed line says why the
 * default was taken. Whatever resolves is the one port the whole run works
 * with: it is probed, it is the port the started dev:all is pinned to, and
 * the summary and the READY line name it, so the walk driver is never given
 * an origin nothing serves on.
 */
export async function resolveHostPort(input: HostPortResolutionInput): Promise<HostPortResolution> {
  if (input.flagPort !== undefined) return { port: input.flagPort, source: 'flag' };
  if (input.envPort !== undefined) return { port: input.envPort, source: 'env' };
  let configPort: number | undefined;
  try {
    configPort = await input.resolveConfigPort(input.configRoot);
  } catch (error) {
    console.log(
      `[${SCRIPT_NAME}] resolving the project's Vite config failed, using ${DEFAULT_HOST_PORT}: ${errorText(error)}`,
    );
  }
  if (configPort !== undefined) {
    if (isValidPortNumber(configPort)) return { port: configPort, source: 'config' };
    console.log(
      `[${SCRIPT_NAME}] the project's Vite config names port ${configPort}, which is not a port between 1 and 65535, using ${DEFAULT_HOST_PORT}`,
    );
  }
  return { port: DEFAULT_HOST_PORT, source: 'default' };
}

export function helpText(): string {
  return [
    `${SCRIPT_NAME}: prepare the browser verification walk in one command.`,
    '',
    'It checks that the dev:all servers answer HTTP (starting them when they are',
    'not up), starts a headless Chrome with a DevTools port the walk driver can',
    'attach to, and prints the exact driver arguments. It then keeps running for',
    'the walk: Ctrl-C or SIGTERM to it stops what it started (only that) and',
    'removes the browser profile dir it created. Servers that already answer and',
    'a browser already serving CDP on --cdp-port are reused and left running.',
    'macOS and Linux only.',
    '',
    'Usage:',
    '  npx tsx scripts/verify-preflight.ts [flags]',
    '',
    'Flags:',
    `  --host-port <n>    Port the dev host answers on. Without the flag it comes from the`,
    `                     ${FRONTX_VERIFY_HOST_PORT} environment variable, then from the port the`,
    `                     project's vite.config.ts configures, then ${DEFAULT_HOST_PORT} (Vite's own`,
    '                     default). Whatever resolves, dev:all is started with the host on that port',
    `  --cdp-port <n>     Chrome DevTools port for the walk driver (default ${DEFAULT_CDP_PORT})`,
    '  --browser <path>   Browser executable to launch. Default order: FRONTX_VERIFY_BROWSER,',
    '                     then Chrome for Testing or chrome-headless-shell in the Playwright',
    '                     cache (newest version first), then the Google Chrome app on macOS,',
    '                     then google-chrome, chromium, chromium-browser on PATH. A path set',
    '                     here or in FRONTX_VERIFY_BROWSER that does not exist is an error;',
    '                     the fallback order runs only when neither names a browser',
    '  --no-start         Start nothing: only check that the servers and a browser already answer',
    `  --timeout <ms>     How long to wait for the servers to answer (default ${DEFAULT_TIMEOUT_MS})`,
    '  --help, -h         Print this help',
    '',
    'Exit codes: 0 ready with nothing to supervise, or a signal stop that freed',
    'everything the run started; 1 something could not be prepared, a child it',
    'started exited on its own, or a signal stop could not free what it started',
    '(a child survived, its stop failed, or a profile dir stayed behind).',
    '',
    'When ready it prints the walk driver arguments, for example:',
    '  --host http://localhost:5173 --cdp-port 9222',
  ].join('\n');
}

/**
 * What the run does, decided from the port states and the CDP probe alone, so
 * every refusal is a decision a test can observe. Servers are reused only when
 * every port answers; otherwise dev:all is started, unless --no-start or a mix
 * of taken and free ports forbids it. The host port itself never forbids a
 * start: whatever resolveHostPort picked is the port dev:all is pinned to. A
 * browser already serving CDP is reused; otherwise one is launched, unless
 * --no-start.
 */
export type StartPlan =
  | { kind: 'refuse'; message: string }
  | { kind: 'go'; startServers: boolean; launchBrowser: boolean };

export interface StartPlanInput {
  cdpPort: number;
  noStart: boolean;
  statuses: readonly PortStatus[];
  cdpAnswering: boolean;
}

export function planStart(input: StartPlanInput): StartPlan {
  const startServers = !input.statuses.every((s) => s.state === 'answering');
  if (startServers) {
    if (input.noStart) return { kind: 'refuse', message: serversNotRunningMessage(input.statuses) };
    if (!input.statuses.every((s) => s.state === 'free')) {
      return { kind: 'refuse', message: mixedPortStatesMessage(input.statuses) };
    }
  }
  const launchBrowser = !input.cdpAnswering;
  if (launchBrowser && input.noStart) return { kind: 'refuse', message: noBrowserNoStartMessage(input.cdpPort) };
  return { kind: 'go', startServers, launchBrowser };
}

/** The input rereadBrowserPlan decides from: the fresh CDP probe. */
export interface BrowserRecheckInput {
  /** The fresh CDP probe, taken once the servers are up. */
  cdpAnsweringNow: boolean;
}

/** The browser step re-decided from the fresh probe: launch, or reuse whatever serves CDP now. */
export type BrowserRecheck = { kind: 'launch' } | { kind: 'reuse' };

/**
 * The browser step, re-decided from a fresh CDP probe once the servers are up.
 * The probe planStart ran can be a whole server wait old by the time the
 * browser step is reached, so both of its answers can have gone stale: a
 * browser that served CDP then can be gone now, and a silent CDP port can have
 * a browser on it now. The fresh answer wins. A browser that was to be
 * launched and now finds CDP answering is not launched: something else came up
 * on the port during the wait, and a second browser onto the occupied port
 * would only fail. A browser that was to be reused and no longer answers is
 * launched afresh, because READY must not be printed against a dead port.
 *
 * --no-start never reaches this choice with a server start behind it: planStart
 * refuses that case when a launch would be needed, and a plan that starts
 * nothing skips the re-read entirely.
 */
export function rereadBrowserPlan(input: BrowserRecheckInput): BrowserRecheck {
  return input.cdpAnsweringNow ? { kind: 'reuse' } : { kind: 'launch' };
}

export type BrowserSource = 'explicit' | 'playwright' | 'chrome-app' | 'path';

/** Where an explicitly named browser path came from: the flag or the environment. */
export type ExplicitBrowserSource = 'flag' | 'env';

/** A named browser that does not exist: the run stops, it does not fall back. */
export interface MissingExplicitBrowser {
  kind: 'missing-explicit';
  path: string;
  source: ExplicitBrowserSource;
}

export interface BrowserResolveInput {
  platform: NodeJS.Platform;
  /** `process.arch`: picks the arm64 or x64 macOS build in the Playwright cache. */
  arch: string;
  home: string;
  browserFlag: string | undefined;
  envBrowser: string | undefined;
  fileExists(path: string): boolean;
  listDir(path: string): readonly string[];
  commandExists(command: string): boolean;
}

export type BrowserResolution =
  | { kind: 'found'; path: string; source: BrowserSource }
  | MissingExplicitBrowser
  | { kind: 'not-found'; places: readonly string[] };

/**
 * The browser resolution order, exactly as the run uses it: --browser, then
 * FRONTX_VERIFY_BROWSER, then the Playwright cache (newest version first),
 * then the Google Chrome app on macOS, then the well-known command names on
 * PATH. A browser named explicitly that does not exist is not a skip: the
 * result is `missing-explicit`, and the run stops instead of silently
 * launching some other browser. The fallback order below is what runs when
 * nothing is named. Filesystem and environment access arrive as inputs so
 * tests can fake them.
 */
export function resolveBrowserExecutable(input: BrowserResolveInput): BrowserResolution {
  const places: string[] = [];
  const explicit = input.browserFlag ?? input.envBrowser;

  if (explicit !== undefined) {
    if (input.fileExists(explicit)) return { kind: 'found', path: explicit, source: 'explicit' };
    return {
      kind: 'missing-explicit',
      path: explicit,
      source: input.browserFlag !== undefined ? 'flag' : 'env',
    };
  }
  places.push(`--browser / ${FRONTX_VERIFY_BROWSER}: not set`);

  const cacheDir = playwrightCacheDir(input.platform, input.home);
  if (cacheDir === undefined) {
    places.push('Playwright cache: no cache location is known for this platform');
  } else {
    const lookup = lookupPlaywrightBrowser(cacheDir, input.platform, input.arch, input.fileExists, input.listDir);
    if (lookup.path !== undefined) return { kind: 'found', path: lookup.path, source: 'playwright' };
    places.push(`Playwright cache ${cacheDir}: ${lookup.detail}`);
  }

  if (input.platform === 'darwin') {
    const chromeApp = join('/Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome');
    if (input.fileExists(chromeApp)) return { kind: 'found', path: chromeApp, source: 'chrome-app' };
    places.push(`Google Chrome app: ${chromeApp} not found`);
  } else {
    places.push('Google Chrome app: only looked for on macOS');
  }

  const pathCommands = ['google-chrome', 'chromium', 'chromium-browser'];
  for (const command of pathCommands) {
    if (input.commandExists(command)) return { kind: 'found', path: command, source: 'path' };
  }
  places.push(`PATH: none of ${pathCommands.join(', ')} found`);

  return { kind: 'not-found', places };
}

export function noBrowserFoundMessage(
  resolution: Extract<BrowserResolution, { kind: 'not-found' }>,
): string {
  const numbered = resolution.places.map((place, idx) => `  ${idx + 1}. ${place}`);
  return [
    'No browser executable found for the verification walk. Places looked, in order:',
    ...numbered,
    'Pass one explicitly with --browser /path/to/chrome, or set FRONTX_VERIFY_BROWSER.',
  ].join('\n');
}

/**
 * Why an explicitly named browser was refused. Naming the source matters: a
 * path from --browser is fixed on the command line, one from the environment
 * may sit in a shell profile far away from this run.
 */
export function missingExplicitBrowserMessage(missing: MissingExplicitBrowser): string {
  const source =
    missing.source === 'flag'
      ? 'the --browser flag'
      : `the ${FRONTX_VERIFY_BROWSER} environment variable`;
  return [
    `The browser named by ${source} does not exist: ${missing.path}`,
    'A browser named explicitly is never replaced by a fallback: fix the path, or unset it to',
    'let verify-preflight resolve a browser on its own.',
  ].join('\n');
}

/**
 * The launch flag set for one attempt. The first attempt never carries
 * --no-sandbox; the retry after a failed first attempt adds it, turning
 * Chrome's sandbox off for this browser only. Both keep --headless=new: the
 * old headless engine is gone from current Chrome.
 */
export function browserLaunchArgs(cdpPort: number, userDataDir: string, sandboxDisabled: boolean): string[] {
  return [
    '--headless=new',
    ...(sandboxDisabled ? ['--no-sandbox'] : []),
    '--disable-gpu',
    '--disable-crashpad',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];
}

export function serversNotRunningMessage(states: readonly PortStatus[]): string {
  return [
    'Servers are not running, and --no-start refuses to start them:',
    ...states.map((s) => `  - port ${s.port} (${s.label}): ${portStateText(s.state)}`),
    'Start them with `npm run dev:all`, or run again without --no-start to let verify-preflight start them.',
  ].join('\n');
}

export function noBrowserNoStartMessage(cdpPort: number): string {
  return [
    `No browser serves CDP at http://127.0.0.1:${cdpPort}/json/version, and --no-start refuses to launch one.`,
    'Start one yourself, pass the port it serves with --cdp-port, or run again without --no-start.',
  ].join('\n');
}

export const UNSUPPORTED_PLATFORM_MESSAGE =
  'verify-preflight runs on macOS and Linux only: it stops what it started through Unix process groups.';

export function mixedPortStatesMessage(states: readonly PortStatus[]): string {
  return [
    'Refusing to start dev:all: some of its ports are taken and some are free. dev:all needs all',
    'of them free, or it would drift to another port or fail on --strictPort:',
    ...states.map((s) => `  - port ${s.port} (${s.label}): ${portStateText(s.state)}`),
    'Stop what holds the busy ports and run again; find what holds a port with',
    '`lsof -nP -iTCP:<port> -sTCP:LISTEN`. If another verify-preflight is still running,',
    'stop it with Ctrl-C in its terminal.',
  ].join('\n');
}

/** True when the body of a /json/version answer is a DevTools endpoint the walk driver can attach to. */
export function isCdpVersionBody(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { webSocketDebuggerUrl?: unknown }).webSocketDebuggerUrl === 'string'
  );
}

/**
 * True for a 2xx and, because the fetch below uses `redirect: 'manual'`, for a
 * 3xx too: a redirect to a base path, a trailing slash, or an auth bounce still
 * comes from a server that is answering. A 4xx or 5xx from some unrelated
 * service holding the port is not our server.
 */
export function isAnsweringStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

export interface ServerTimeout {
  timeoutMs: number;
  neverAnswered: readonly PortTarget[];
  outputTail: readonly string[];
}

export function serverTimeoutMessage(failure: ServerTimeout): string {
  return [
    `dev:all did not answer on every port within ${failure.timeoutMs} ms. Never answered:`,
    ...failure.neverAnswered.map((target) => `  - port ${target.port} (${target.label})`),
    ...outputTailLines('dev:all', failure.outputTail),
  ].join('\n');
}

export interface BrowserLaunchFailureInput {
  executable: string;
  cdpPort: number;
  cdpPortTaken: boolean;
  attempts: readonly (readonly string[])[];
  outputTail: readonly string[];
}

export function browserLaunchFailureMessage(input: BrowserLaunchFailureInput): string {
  const lines = [
    `The browser did not serve CDP at http://127.0.0.1:${input.cdpPort}/json/version.`,
    `Executable tried: ${input.executable}`,
  ];
  input.attempts.forEach((flags, idx) => {
    lines.push(`Launch ${idx + 1} flags: ${flags.join(' ')}`);
  });
  if (input.cdpPortTaken) {
    lines.push(
      `Port ${input.cdpPort} is in use but does not answer /json/version; something else may be holding it.`,
    );
  }
  lines.push(...outputTailLines('the browser', input.outputTail));
  return lines.join('\n');
}

/** The lines that close a failure report: the child's last output, or a note that it printed nothing. */
function outputTailLines(who: string, tail: readonly string[]): string[] {
  if (tail.length === 0) return [`${who} printed nothing.`];
  return [`Last ${tail.length} lines ${who} printed:`, ...tail.map((line) => `  ${line}`)];
}

/** One child this run started, named for the reader together with its process group id. */
export interface OwnedChildSummary {
  name: string;
  pgid: number;
}

/**
 * The children this run started as (name, process group) pairs. A detached
 * child leads a process group of its own, so its group id is its pid; a child
 * that never got a pid, because the spawn itself failed, has no group to name
 * and is left out.
 */
export function ownedChildSummaries(
  children: readonly { label: string; pid: number | undefined }[],
): OwnedChildSummary[] {
  return children.flatMap((child) => (child.pid === undefined ? [] : [{ name: child.label, pgid: child.pid }]));
}

/**
 * The summary lines that name what this run started and how to stop it if this
 * supervisor dies hard: a detached child outlives a SIGKILLed supervisor in
 * its process group, and no state file points at it, so the groups are named
 * here while the run is up to name them. Only the READY summary prints them,
 * so the advice speaks of a kill after READY. Once the supervisor is gone
 * nothing keeps its group leaders unreaped, so a group id can be reused: the
 * reader is told to probe each group with pgrep, which matches process groups
 * on Linux and macOS alike, before it signals one, and to treat what the probe
 * lists as the whole answer about ownership. A probe matches the id alone, so
 * a non-empty answer proves only that some group with that id exists now; the
 * listed process names and commands are what say whether the group is still
 * this run's. No group id is printed in a ready-made kill line, because
 * copying it would signal groups a reaped leader no longer owns; the kill is
 * shown with a placeholder.
 */
export function ownedChildSummaryLines(children: readonly OwnedChildSummary[]): string[] {
  if (children.length === 0) return [];
  return [
    ...children.map((child) => `  ${child.name}: started by this run, process group ${child.pgid}`),
    '  if this supervisor is killed hard after READY, run `pgrep -g <pgid>` for each group above first:',
    '  a non-empty probe proves only that some group with that id exists now, not that it is this',
    "  run's, since the id of a reaped leader can be reused. Look at what the probe lists, with",
    '  `ps -o pid,pgid,command -p <pids>`, and stop only processes recognisable as this project\'s dev',
    `  servers or the preflight browser (its user data dir ${PROFILE_DIR_PREFIX}*); only then run:`,
    '  kill -- -<pgid>',
  ];
}

export interface SummaryInput {
  hostPort: number;
  cdpPort: number;
  mfes: readonly MfeInfo[];
  serversStarted: boolean;
  browser: { executable: string; pid: number | undefined; userDataDir: string | undefined };
  /** The children this run started, named with their process group ids; empty when it reused everything. */
  ownedChildren: readonly OwnedChildSummary[];
}

/** The origin the walk driver is given as --host: no trailing slash, so the driver appends its own paths. */
function hostOrigin(hostPort: number): string {
  return `http://${PREVIEW_HOST}:${hostPort}`;
}

export function summaryText(input: SummaryInput): string {
  const origin = hostOrigin(input.hostPort);
  const serverNote = input.serversStarted ? '' : ' (already running)';
  const lines = [`${SCRIPT_NAME}: ready.`, `  host: ${origin}${serverNote}`];
  if (input.mfes.length === 0) lines.push('  mfe packages: none discovered');
  for (const mfe of input.mfes) {
    lines.push(`  mfe ${mfe.name}: http://${PREVIEW_HOST}:${mfe.port} (port ${mfe.port})${serverNote}`);
  }
  lines.push(`  cdp: http://127.0.0.1:${input.cdpPort}/json/version (port ${input.cdpPort})`);
  const pidNote =
    input.browser.pid === undefined ? ' (not started by this run)' : ` (pid ${input.browser.pid})`;
  lines.push(`  browser: ${input.browser.executable}${pidNote}`);
  if (input.browser.userDataDir !== undefined) {
    lines.push(`  browser user data dir: ${input.browser.userDataDir}`);
  }
  lines.push(...ownedChildSummaryLines(input.ownedChildren));
  lines.push(`${SCRIPT_NAME}: walk driver arguments:`);
  lines.push(`  --host ${origin} --cdp-port ${input.cdpPort}`);
  return lines.join('\n');
}

export function keepRunningLine(pid: number): string {
  return `keep this running during the walk; stop it with Ctrl-C (or SIGTERM to pid ${pid})`;
}

export interface ReadyLineInput {
  /**
   * This supervisor's pid, so `kill -TERM <pid>` reaches this process and
   * nothing it started. Undefined when the run started nothing and is about
   * to exit: there is no supervisor left to signal, so the line says
   * `pid=none` instead of offering a pid that dies with the run, or one the
   * OS has since handed to an unrelated process.
   */
  pid: number | undefined;
  hostPort: number;
  cdpPort: number;
}

/**
 * The one line an agent waits for instead of reading the summary above it: a
 * fixed shape, printed on a line of its own once the walk is ready. It carries
 * the two driver arguments, so nothing has to scrape the human part, and the
 * pid to stop this preflight with when the walk is done, or `pid=none` when
 * nothing is supervised because the run started nothing.
 */
export function readyLine(input: ReadyLineInput): string {
  const pid = input.pid === undefined ? 'none' : input.pid;
  return `[${SCRIPT_NAME}] READY pid=${pid} --host ${hostOrigin(input.hostPort)} --cdp-port ${input.cdpPort}`;
}

/** Whether the walk may be announced as ready: print it, or defer to the stop. */
export type ReadyDecision = { kind: 'print' } | { kind: 'defer' };

/**
 * Whether the ready print may happen, decided from whether the stop has
 * started. A signal or a child's own exit can start the stop while the steps
 * before READY are still in flight, and a probe one of those steps left
 * pending can still succeed inside the stop's grace period, so the
 * continuation can reach the ready print with a teardown already underway.
 * READY printed then would hand out a pid and driver arguments for services
 * that are going away, and an agent waiting on it would start its walk
 * against them. So the run prints only while no stop runs; otherwise it
 * returns the shutdown that is already in flight and lets that stop's report
 * and exit take over.
 */
export function readyDecision(stopStarted: boolean): ReadyDecision {
  return stopStarted ? { kind: 'defer' } : { kind: 'print' };
}

/**
 * What the ready print carries: the summary inputs, the children the run
 * started for its process-group note, and the pid the READY line offers, if a
 * supervisor stays up to take it.
 */
export interface ReadyReport {
  /**
   * How the summary names the browser: the executable this run launched, or
   * the reused-browser label when CDP is served by a browser it did not start
   * (the re-read plan can end in either, whichever way it flips).
   */
  browserExecutable: string;
  browserPid: number | undefined;
  userDataDir: string | undefined;
  /** The children this run started, named with their process group ids. */
  ownedChildren: readonly OwnedChildSummary[];
  /** This supervisor's pid, or undefined when it started nothing and exits right after printing. */
  supervisorPid: number | undefined;
}

/**
 * What resolving a browser for a launch yields: an executable with its
 * source, or the refusal message the run reports. The run resolves up front
 * when the plan says launch; the supervisor calls it again only when the
 * re-read plan (rereadBrowserPlan) asks for a launch the first probe did not
 * foresee.
 */
type BrowserLaunchResolution =
  | { kind: 'found'; path: string; source: BrowserSource }
  | { kind: 'refuse'; message: string };

/**
 * Wrap the stop so only its first call runs: the first signal, child exit or
 * error starts the one stop, and every later call gets that same promise
 * back, so a second Ctrl-C cannot start a second stop over the same children.
 *
 * `current()` is how a caller that only wants the stop already in flight asks
 * for it: it takes no arguments, because the code and the reason of a later
 * call are never used, only those of the call that started the stop. It
 * returns undefined while no stop has started.
 */
export function firstCallOnly<A extends unknown[]>(fn: (...args: A) => Promise<void>): {
  call: (...args: A) => Promise<void>;
  started: () => boolean;
  current: () => Promise<void> | undefined;
} {
  let first: Promise<void> | undefined;
  return {
    call: (...args) => (first ??= fn(...args)),
    started: () => first !== undefined,
    current: () => first,
  };
}

/**
 * The writer the stop report goes out through: one line per call, prefixed
 * with the script name and terminated, so the caller controls the write and
 * can make it synchronous. The stop ends in process.exit, and stdout/stderr
 * writes are asynchronous on macOS whenever output is piped (`| tee`, CI
 * capture), so a report line left in the write queue at the exit would be
 * lost exactly when the report matters most: a failed cleanup. The write
 * itself arrives as an input, so tests can collect the lines.
 *
 * A write that throws is swallowed: writeSync(2, ...) throws EAGAIN on a
 * non-blocking pipe or TTY and EPIPE once the reader of `| tee` is gone, which
 * is exactly the piped case the synchronous write exists for. The stop calls
 * this writer before its try/finally and from inside the per-step catch blocks
 * that keep one failed child or dir from stopping the rest, so a throw here
 * would abort the stop before anything is signalled and skip the exit. A lost
 * report line is always better than a lost cleanup.
 */
export function stopReportWriter(write: (text: string) => void): (line: string) => void {
  return (line) => {
    try {
      write(`[${SCRIPT_NAME}] ${line}\n`);
    } catch {
      // A lost report line must never abort the stop.
    }
  };
}

/**
 * What stopping one child did. The kind is what the run checks: `gone` means
 * the child had already exited before the stop reached it, `stopped` means the
 * child exited and the escalation ended (with `groupRemains` naming the group
 * members that outlived the last signal, since those still hold what they
 * hold), and `survived` means the child itself did not exit even after SIGKILL
 * and is still running with everything it holds. The human text is built
 * separately from the kind, so rewording a message cannot silently break a
 * check on it.
 */
export type StopOutcome =
  | { kind: 'gone'; pid: number | undefined; groupRemains: boolean }
  | { kind: 'stopped'; pid: number; groupRemains: boolean }
  | { kind: 'survived'; pid: number };

/**
 * The outcome for a child that was already gone when the stop reached it. Its
 * process group is still probed: a leader that went away on its own, as npm
 * does when dev:all dies, can leave the vite and MFE grandchildren of its
 * group running and holding the ports, and the report has to point at them.
 * The members are named, never signalled, under the one rule the whole stop
 * follows and stopGroupSignals and stopChild state the same way: the stop
 * signals the group only while this process holds the group's leader unreaped,
 * because once the leader is reaped the id is no longer guaranteed to be ours.
 */
export function goneChildOutcome(pid: number, groupRemains: boolean): StopOutcome {
  return { kind: 'gone', pid, groupRemains };
}

/** The human text for one stop outcome; the kind stays the thing checks match on. */
export function stopOutcomeText(outcome: StopOutcome): string {
  switch (outcome.kind) {
    case 'gone':
      return outcome.groupRemains && outcome.pid !== undefined
        ? `had already exited, but members of its process group remain; check with \`pgrep -g ${outcome.pid}\``
        : 'had already exited';
    case 'stopped':
      return outcome.groupRemains
        ? `was stopped, but members of its process group remain; check with \`pgrep -g ${outcome.pid}\``
        : 'was stopped';
    case 'survived':
      return `survived SIGKILL and needs a manual kill (pid ${outcome.pid})`;
  }
}

/**
 * One line of the stop report for one child. The pid comes from the outcome;
 * for a child that survived, the text already carries it, so the line does not
 * repeat it.
 */
export function stoppedChildLine(label: string, outcome: StopOutcome): string {
  if (outcome.kind === 'survived') return `${label}: ${stopOutcomeText(outcome)}`;
  return `${label} (pid ${outcome.pid ?? 'none'}) ${stopOutcomeText(outcome)}`;
}

/**
 * One child the stop has to stop, and the profile dir it must keep whenever
 * the stop does not see it fully gone: a survivor, a stop that threw, or a
 * group that still has members.
 */
export interface StoppableChild {
  label: string;
  profileDir: string | undefined;
}

/**
 * What stopping every child ended with: the profile dirs the stop has to keep,
 * and whether it saw every child fully gone.
 */
export interface StopAllResult {
  /**
   * The profile dirs the stop has to keep: those of children that survived,
   * those of children whose stop threw, and those whose process group still
   * has members, since none of those was seen to be fully gone and each may
   * still hold its dir.
   */
  keepDirs: string[];
  /**
   * True when the stop did not see every child fully gone: a child survived,
   * a child's process group still had members, or a child's stop threw. This
   * is decided per child, independently of the dirs kept: dev:all has no
   * profile dir, so without this flag a stop that left its grandchildren
   * behind would read as a clean one and the run would exit 0.
   */
  cleanupFailed: boolean;
}

/**
 * Stop every child, one at a time, each in its own try/catch: a stop that
 * throws is logged and the remaining children are still stopped. Returns the
 * dirs the stop has to keep (a survivor's, a throwing stop's, a group with
 * members still in it, since none of those was seen to be fully gone and each
 * may still hold its dir) and the cleanup-failed flag, which is raised for
 * every child the stop did not see fully gone whether or not that child had a
 * dir to keep. The children and their stopping arrive as inputs, so tests
 * can run this without processes.
 */
export async function stopAllChildren<T extends StoppableChild>(
  children: readonly T[],
  stopOne: (child: T) => Promise<StopOutcome>,
  log: (line: string) => void,
): Promise<StopAllResult> {
  const keepDirs: string[] = [];
  let cleanupFailed = false;
  for (const child of children) {
    try {
      const outcome = await stopOne(child);
      log(stoppedChildLine(child.label, outcome));
      // Whatever remains of this child is a cleanup that did not finish, and
      // it still holds its dir: a survivor, or group members the stop left
      // behind, the same rule failedAttemptStep applies to the same outcome on
      // the launch path.
      if (outcome.kind === 'survived' || outcome.groupRemains) {
        cleanupFailed = true;
        if (child.profileDir !== undefined) keepDirs.push(child.profileDir);
      }
    } catch (error) {
      log(`could not stop ${child.label}: ${errorText(error)}`);
      cleanupFailed = true;
      if (child.profileDir !== undefined) keepDirs.push(child.profileDir);
    }
  }
  return { keepDirs, cleanupFailed };
}

/**
 * The profile dirs the stop removes: every dir the run created except the ones
 * it keeps, above all the dir of a browser that survived and still runs with
 * it.
 */
export function profileDirsToRemove(dirs: readonly string[], keep: readonly string[]): string[] {
  const keepSet = new Set(keep);
  return dirs.filter((dir) => !keepSet.has(dir));
}

/**
 * Remove profile dirs one at a time, each in its own try/catch: a browser that
 * still holds files (EBUSY, EPERM) must not keep the other dirs from being
 * removed, and must not keep the stop from exiting. Returns the dirs that were
 * removed; a dir that could not be removed is logged and left in place.
 */
export function removeProfileDirs(
  dirs: readonly string[],
  rm: (dir: string) => void,
  log: (line: string) => void,
): string[] {
  const removed: string[] = [];
  for (const dir of dirs) {
    try {
      rm(dir);
      removed.push(dir);
    } catch (error) {
      log(`could not remove ${dir}: ${errorText(error)}`);
    }
  }
  if (removed.length > 0) log(`removed ${removed.join(', ')}`);
  return removed;
}

/**
 * Whether a finished stop failed to free everything it had started. The child
 * flag comes from stopAllChildren and is true when a child survived, a child's
 * stop threw, or a child's group still has members, whether or not that child
 * had a profile dir to keep (dev:all has none, and its grandchildren still
 * hold the ports). A dir the stop kept, or a dir it tried to remove in vain,
 * is a cleanup that did not finish too. Any of the three makes the signal stop
 * report the failure in its exit code.
 */
export function stopCleanupFailed(
  childCleanupFailed: boolean,
  keptDirs: readonly string[],
  toRemove: readonly string[],
  removed: readonly string[],
): boolean {
  return childCleanupFailed || keptDirs.length > 0 || removed.length < toRemove.length;
}

/**
 * What the launch loop does with an attempt that did not serve CDP, once its
 * child has been stopped. The result is one tagged kind, so a retry can never
 * carry a failure and a failure can never look like a freed dir. An attempt
 * that was stopped, or that had already exited, frees its profile dir, so the
 * run removes the dir and retries. An attempt that survived SIGKILL, or whose
 * process group still has members when the stop ended, still holds its dir and
 * may still hold the CDP port, so the run keeps the dir and fails, naming what
 * a manual kill has to aim at: the pid to kill for a survivor, the `pgrep -g`
 * probe for a group that remains.
 */
export type FailedAttemptStep = { kind: 'fail'; message: string } | { kind: 'retry' };

export function failedAttemptStep(attempt: number, outcome: StopOutcome): FailedAttemptStep {
  if (outcome.kind === 'survived' || outcome.groupRemains) {
    return { kind: 'fail', message: `browser launch ${attempt} ${stopOutcomeText(outcome)}` };
  }
  return { kind: 'retry' };
}

const ALREADY_STOPPING_LINE = 'already stopping, please wait';

/**
 * What one delivered signal does, given whether the stop already runs and
 * whether the wait note was printed. The first signal starts the stop; a
 * signal that arrives while it runs prints the wait note, once, so a second
 * Ctrl-C is not swallowed silently; every later one is ignored, since the
 * running stop cannot be restarted.
 */
export type SignalReaction = { kind: 'start'; why: string } | { kind: 'note'; line: string } | { kind: 'ignore' };

export function signalReaction(signal: string, stopStarted: boolean, notePrinted: boolean): SignalReaction {
  if (!stopStarted) return { kind: 'start', why: `${signal}: stopping what this run started` };
  if (!notePrinted) return { kind: 'note', line: `[${SCRIPT_NAME}] ${ALREADY_STOPPING_LINE}` };
  return { kind: 'ignore' };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A child this process started: the handle, what it printed, and its profile dir. */
interface Owned {
  label: string;
  child: ChildProcess;
  output: string;
  /** The browser profile dir the child was launched with, when it has one. */
  profileDir: string | undefined;
}

async function run(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.kind === 'help') {
    console.log(helpText());
    return 0;
  }
  if (parsed.kind === 'error') {
    console.error(`[${SCRIPT_NAME}] ${parsed.message}`);
    console.error('Run `npx tsx scripts/verify-preflight.ts --help` for the flags.');
    return 1;
  }
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    console.error(`[${SCRIPT_NAME}] ${UNSUPPORTED_PLATFORM_MESSAGE}`);
    return 1;
  }
  const options = parsed.options;

  // The host port is resolved before anything is probed, so every later step
  // works with one port: --host-port, then FRONTX_VERIFY_HOST_PORT, then the
  // port the project's Vite config configures, then Vite's own default. The
  // variable is read and validated only when the flag names no port: the flag
  // wins over the variable, so a run given a valid --host-port must not fail
  // on a variable it will not use. A variable that is not a port stops the run
  // that would have used it, here, where the flags are read: a run left to
  // wait on a port nothing will serve would only be seen as a timeout.
  // The variable is read through the same helper dev-all uses to resolve and
  // validate it, so the accepted values and the message below cannot drift
  // between the two scripts.
  let envPort: number | undefined;
  if (options.hostPort === undefined) {
    const envHostPort = resolveEnvHostPort(env);
    if (envHostPort.error !== undefined) {
      console.error(`[${SCRIPT_NAME}] ${envHostPort.error}`);
      return 1;
    }
    envPort = envHostPort.port;
  }
  const hostPort = await resolveHostPort({
    flagPort: options.hostPort,
    envPort,
    configRoot: process.cwd(),
    resolveConfigPort: viteConfigPort,
  });
  console.log(`[${SCRIPT_NAME}] host port ${hostPort.port} (source: ${hostPort.source})`);
  const cdpUrl = cdpVersionUrl(options.cdpPort);

  const { packages, skippedExamples } = getMFEPackages();
  if (packages.length === 0) {
    console.log(`[${SCRIPT_NAME}] ${noDiscoveredPackagesNotice(skippedExamples)}`);
  }
  const targets: PortTarget[] = [
    { label: 'host', port: hostPort.port },
    ...packages.map((mfe): PortTarget => ({ label: mfe.name, port: mfe.port })),
  ];
  const [cdpAnswering, statuses] = await Promise.all([
    cdpAnswers(cdpUrl),
    Promise.all(targets.map(async (t): Promise<PortStatus> => ({ ...t, state: await classifyPort(t.port) }))),
  ]);

  const plan = planStart({ cdpPort: options.cdpPort, noStart: options.noStart, statuses, cdpAnswering });
  if (plan.kind === 'refuse') {
    console.error(`[${SCRIPT_NAME}] ${plan.message}`);
    return 1;
  }

  // The browser is resolved before anything starts, so a missing browser
  // refuses the run while it owns nothing. The same resolution is handed to
  // the supervisor for a launch the re-read plan can ask for later
  // (rereadBrowserPlan): by then the servers may already be children, and a
  // refusal there goes through the stop, which has nothing left to keep.
  const resolveBrowser = (): BrowserLaunchResolution => {
    const resolution = resolveBrowserExecutable({
      platform: process.platform,
      arch: process.arch,
      home: homedir(),
      browserFlag: options.browserFlag,
      envBrowser: optionalEnvValue(env, FRONTX_VERIFY_BROWSER),
      fileExists: (p) => existsSync(p),
      listDir: (p) => readdirSync(p),
      commandExists: commandExistsOnPath,
    });
    if (resolution.kind !== 'found') {
      return {
        kind: 'refuse',
        message:
          resolution.kind === 'missing-explicit'
            ? missingExplicitBrowserMessage(resolution)
            : noBrowserFoundMessage(resolution),
      };
    }
    return resolution;
  };

  let executable = REUSED_BROWSER_LABEL;
  if (plan.launchBrowser) {
    const resolved = resolveBrowser();
    if (resolved.kind === 'refuse') {
      console.error(`[${SCRIPT_NAME}] ${resolved.message}`);
      return 1;
    }
    executable = resolved.path;
    console.log(`[${SCRIPT_NAME}] browser: ${executable} (from ${resolved.source})`);
  } else {
    console.log(`[${SCRIPT_NAME}] a browser already serves CDP on port ${options.cdpPort}; reusing it as-is`);
  }
  if (!plan.startServers) console.log(`[${SCRIPT_NAME}] servers already answer on every port; reusing them`);

  const summary = (ready: ReadyReport): string =>
    summaryText({
      hostPort: hostPort.port,
      cdpPort: options.cdpPort,
      mfes: packages,
      serversStarted: plan.startServers,
      browser: {
        executable: ready.browserExecutable,
        pid: ready.browserPid,
        userDataDir: ready.userDataDir,
      },
      ownedChildren: ready.ownedChildren,
    });

  // The summary is for a reader. The READY line right after its walk driver
  // arguments is what an agent waits for and takes its flags from. The pid on
  // the line is this supervisor's while it stays up; a run that started
  // nothing offers none, because it exits right after printing.
  const printReady = (ready: ReadyReport): void => {
    console.log(summary(ready));
    console.log(readyLine({ pid: ready.supervisorPid, hostPort: hostPort.port, cdpPort: options.cdpPort }));
  };

  if (!plan.startServers && !plan.launchBrowser) {
    printReady({
      browserExecutable: executable,
      browserPid: undefined,
      userDataDir: undefined,
      ownedChildren: [],
      supervisorPid: undefined,
    });
    console.log(`[${SCRIPT_NAME}] started nothing, so there is nothing to keep running`);
    return 0;
  }
  return supervise(options, targets, hostPort.port, plan, executable, resolveBrowser, printReady);
}

/**
 * Start what the plan asks for as children of this process and stay up until
 * a signal, a child's own exit, or an error; then stop those children only and
 * remove the profile dirs this process created. The browser step is re-decided
 * from a fresh CDP probe once the servers are up (rereadBrowserPlan), and
 * resolveBrowser runs again if that flip asks for a launch the plan did not
 * foresee. Never resolves: every way out goes through the stop, which exits
 * the process.
 */
async function supervise(
  options: PreflightOptions,
  targets: readonly PortTarget[],
  /** The resolved host port, the one the started dev:all is pinned to. */
  hostPort: number,
  plan: Extract<StartPlan, { kind: 'go' }>,
  executable: string,
  resolveBrowser: () => BrowserLaunchResolution,
  printReady: (ready: ReadyReport) => void,
): Promise<number> {
  const owned: Owned[] = [];
  const profileDirs: string[] = [];
  // The executable the browser step launches with: the one the run resolved up
  // front, or the one a re-read plan asks for, below.
  let browserExecutable = executable;
  // A detached child leads a process group of its own, so its group id is its
  // pid; the ready summary names each group so the children can be stopped by
  // hand if this supervisor is killed hard.
  const ownedSummaries = (): OwnedChildSummary[] =>
    ownedChildSummaries(owned.map((o) => ({ label: o.label, pid: o.child.pid })));
  // The stop report is written synchronously, one fd 2 write per line
  // (stopReportWriter): the stop ends in process.exit, and piped output is
  // asynchronous on macOS, so a queued line would be lost at the exit. The
  // writer swallows a failed write, so nothing stderr does can abort the stop.
  const logStopLine = stopReportWriter((text) => {
    writeSync(2, text);
  });
  const rmProfileDir = (dir: string): void => rmSync(dir, { recursive: true, force: true });

  // Every step of the stop carries its own try/catch (in stopAllChildren and
  // removeProfileDirs), so one failing step is logged and the rest still run,
  // and the exit sits in a finally, so no failure can skip it. A cleanup that
  // failed escalates the code to 1: the exit status is the first thing an
  // agent waiting on the run sees, and a signal stop that freed nothing must
  // not report as a clean one.
  const stop = firstCallOnly(async (baseCode: number, why: string): Promise<void> => {
    logStopLine(why);
    let code = baseCode;
    try {
      const { keepDirs, cleanupFailed } = await stopAllChildren(
        [...owned].reverse(),
        (o) => stopChild(o.child),
        logStopLine,
      );
      const toRemove = profileDirsToRemove(profileDirs, keepDirs);
      const removed = removeProfileDirs(toRemove, rmProfileDir, logStopLine);
      // A survivor, a stop that threw, a child whose group kept members even
      // with no dir of its own to keep (dev:all), or a dir that stayed, is a
      // failed cleanup: say so in the exit status the agent waits on.
      if (stopCleanupFailed(cleanupFailed, keepDirs, toRemove, removed)) code = 1;
    } finally {
      process.exit(code);
    }
  });
  let waitNotePrinted = false;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      const reaction = signalReaction(signal, stop.started(), waitNotePrinted);
      if (reaction.kind === 'start') {
        void stop.call(0, reaction.why);
      } else if (reaction.kind === 'note') {
        waitNotePrinted = true;
        console.error(reaction.line);
      }
    });
  }
  const fail = (message: string): Promise<number> => stop.call(1, message).then(() => 1);

  // Spawns after the stop began would escape it, so they are refused. The
  // children stay detached, each in a process group of its own: the stop
  // signals those whole groups, and the ready summary names each group so a
  // supervisor killed hard can be cleaned up by hand with kill -- -<pgid>.
  // An env, when given, replaces the inherited one wholesale, so callers pass
  // process.env spread with their additions on top.
  const startOwned = (
    label: string,
    command: string,
    args: readonly string[],
    profileDir?: string,
    env?: NodeJS.ProcessEnv,
  ): Owned => {
    if (stop.started()) throw new Error('stopping');
    const child = spawn(command, [...args], {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    const o: Owned = { label, child, output: '', profileDir };
    const keep = (chunk: Buffer): void => {
      o.output = (o.output + chunk.toString()).slice(-OUTPUT_KEEP_CHARS);
    };
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);
    owned.push(o);
    return o;
  };
  // A started child that goes away on its own ends the run, also when it
  // went before the watch was attached.
  const watch = (o: Owned): void => {
    const gone = (detail: string): void => {
      const tail = outputTailLines(o.label, tailLines(o.output, LOG_TAIL_LINES));
      void fail([`${o.label} exited unexpectedly (${detail}).`, ...tail].join('\n'));
    };
    if (!running(o.child)) return gone(`exit code ${o.child.exitCode}, signal ${o.child.signalCode}`);
    o.child.once('exit', (code, signal) => gone(signal === null ? `exit code ${code}` : `signal ${signal}`));
    o.child.once('error', (error) => gone(error.message));
  };

  try {
    if (plan.startServers) {
      const npm = join(NODE_BIN_DIR, 'npm');
      // The resolved host port is pinned onto the child, not left to the
      // project's config: dev-all.ts reads FRONTX_VERIFY_HOST_PORT and starts
      // the host with `vite --port <port> --strictPort`, so the host serves on
      // exactly the port this run probed as free and waits for below. Without
      // it a project whose Vite config sets another server.port would have
      // the host come up somewhere the run is not looking.
      const servers = startOwned(
        'dev:all',
        existsSync(npm) ? npm : 'npm',
        ['run', 'dev:all'],
        undefined,
        { ...process.env, [FRONTX_VERIFY_HOST_PORT]: String(hostPort) },
      );
      watch(servers);
      console.log(`[${SCRIPT_NAME}] started dev:all (pid ${servers.child.pid ?? 'none'})`);
      console.log(
        `[${SCRIPT_NAME}] waiting up to ${options.timeoutMs} ms for ports: ${targets.map((t) => t.port).join(', ')}`,
      );
      const neverAnswered = await waitForPorts(targets, options.timeoutMs);
      if (neverAnswered.length > 0) {
        return fail(
          serverTimeoutMessage({
            timeoutMs: options.timeoutMs,
            neverAnswered,
            outputTail: tailLines(servers.output, LOG_TAIL_LINES),
          }),
        );
      }
      console.log(`[${SCRIPT_NAME}] servers are up`);
    }

    // The CDP probe the plan was built from can be a whole server wait old by
    // the time the browser step is reached, so the step is re-decided from a
    // fresh probe (rereadBrowserPlan): a browser that came up on the port
    // during the wait is reused instead of launched onto, and the browser that
    // was to be reused and went silent is launched afresh instead of READY
    // against a dead port.
    let launchBrowser = plan.launchBrowser;
    if (plan.startServers) {
      const recheck = rereadBrowserPlan({ cdpAnsweringNow: await cdpAnswers(cdpVersionUrl(options.cdpPort)) });
      if (recheck.kind === 'reuse' && plan.launchBrowser) {
        console.log(
          `[${SCRIPT_NAME}] a browser already serves CDP on port ${options.cdpPort}; reusing it instead of launching another one`,
        );
      }
      if (recheck.kind === 'launch' && !plan.launchBrowser) {
        console.log(
          `[${SCRIPT_NAME}] the browser that served CDP on port ${options.cdpPort} no longer answers; launching one`,
        );
        const resolved = resolveBrowser();
        if (resolved.kind === 'refuse') return fail(resolved.message);
        browserExecutable = resolved.path;
        console.log(`[${SCRIPT_NAME}] browser: ${browserExecutable} (from ${resolved.source})`);
      }
      launchBrowser = recheck.kind === 'launch';
    }

    let browser: Owned | undefined;
    if (launchBrowser) {
      const attempts: string[][] = [];
      let output = '';
      for (const sandboxDisabled of [false, true]) {
        if (sandboxDisabled) console.log(`[${SCRIPT_NAME}] ${FIRST_LAUNCH_RETRY_LINE}`);
        if (stop.started()) throw new Error('stopping');
        const dir = mkdtempSync(join(tmpdir(), PROFILE_DIR_PREFIX));
        profileDirs.push(dir);
        const flags = browserLaunchArgs(options.cdpPort, dir, sandboxDisabled);
        attempts.push(flags);
        const attempt = startOwned('browser', browserExecutable, flags, dir);
        if (await waitForCdp(options.cdpPort, attempt.child)) {
          browser = attempt;
          break;
        }
        const outcome = await stopChild(attempt.child);
        output += attempt.output;
        const step = failedAttemptStep(attempts.length, outcome);
        if (step.kind === 'fail') return fail(step.message);
        // A retry means the attempt freed its dir: remove it, and drop the
        // attempt from the dirs the stop would otherwise remove again.
        owned.splice(owned.indexOf(attempt), 1);
        if (removeProfileDirs([dir], rmProfileDir, logStopLine).length > 0) {
          profileDirs.splice(profileDirs.indexOf(dir), 1);
        }
      }
      if (browser === undefined) {
        return fail(
          browserLaunchFailureMessage({
            executable: browserExecutable,
            cdpPort: options.cdpPort,
            cdpPortTaken: !(await isPortFree(options.cdpPort)),
            attempts,
            outputTail: tailLines(output, LOG_TAIL_LINES),
          }),
        );
      }
      watch(browser);
      // waitForCdp returns on the first successful probe without re-checking
      // the child, and watch only starts the stop asynchronously: without this
      // synchronous gate the continuation below would still print READY, with
      // the pid and the keep-running line of a teardown already underway.
      if (!running(browser.child)) {
        return fail(browserExitedAfterCdpMessage(browser.child.pid));
      }
    }

    // A signal or a child's own exit can have started the stop while the steps
    // above were in flight, and the probes they left pending can still succeed
    // during the stop's grace, so this continuation can be reached with a
    // teardown already underway. READY is not printed into it: the run returns
    // the shutdown that is already running (stop.current(), which takes no
    // arguments because this branch sets neither the exit code nor the reason:
    // both come from the call that started the stop), whose report and exit
    // take over from here.
    if (readyDecision(stop.started()).kind === 'defer') {
      const running = stop.current();
      if (running === undefined) throw new Error('READY deferred with no stop running');
      return running.then(() => 1);
    }
    printReady({
      browserExecutable: browser === undefined ? REUSED_BROWSER_LABEL : browserExecutable,
      browserPid: browser?.child.pid,
      userDataDir: profileDirs.at(-1),
      ownedChildren: ownedSummaries(),
      supervisorPid: process.pid,
    });
    console.log(`[${SCRIPT_NAME}] ${keepRunningLine(process.pid)}`);
    return await new Promise<number>(() => {});
  } catch (error) {
    return fail(`unexpected failure: ${errorText(error)}`);
  }
}

/**
 * The signals for one child's process group, with the process work injected,
 * so tests run the escalation without processes. One rule runs through the
 * whole stop, and the gone path and stopChild state it the same way: the stop
 * signals the group only while this process holds the group's leader unreaped.
 *
 * SIGTERM goes out on that footing. Then the leader's own exit is waited for
 * (waitForExit), and the group is given the rest of the grace to empty in
 * (waitGroupGone): a leader that exits fast, as npm does while its vite and MFE
 * grandchildren are still shutting down, was signalled together with them, so
 * what outlives its exit is their tail from that same signal and not grounds
 * for another one. If the leader exited in the grace, it has been reaped, and
 * no further signal is sent: what the group still holds is reported as
 * `groupRemains`, named with the `pgrep -g <pgid>` advice, exactly as the gone
 * path reports it. SIGKILL is sent only when the leader did not exit within the
 * SIGTERM grace and is still running when the SIGKILL turn is decided
 * (isLeaderRunning is re-checked right before that signal, and before every
 * signal after the first): a wait that timed out is not proof the leader is
 * still held when the next signal would go out, since it can exit and be
 * reaped between that wait and the next turn. That phase gets its own budget
 * (SIGKILL_SETTLE_MS) before the group is probed once more and the outcome is
 * read.
 *
 * The rule is a deliberate, conservative choice. In exchange for never
 * signalling a group id that may no longer be ours, it accepts that a
 * grandchild which outlives the leader is named for a manual stop
 * (`groupRemains` and the `pgrep -g <pgid>` advice) rather than signalled, so
 * the cleanup of what that grandchild still holds becomes a manual step where
 * a signal might have done it. The unreaped leader is the only tie this
 * process has to the group id: while it is unreaped the id is ours for
 * certain, and once it is reaped the id may be reused, so a signal-0 probe can
 * still find members without being able to say whether they belong to this run
 * or to a group that took the id over. That window is small, but a probe
 * cannot close it, so no signal crosses it.
 *
 * The leader's exit is waited for before the group is read again because, while
 * this process has not reaped its child, the child counts as a group member
 * whether it is alive or a fresh zombie, so a probe taken before that wait
 * cannot tell the members that remain from the leader's corpse, and a group
 * that is already empty reads as alive.
 *
 * `survived` is therefore the leader that did not exit even after SIGKILL.
 * A leader that exited is `stopped`, with `groupRemains` naming the members
 * that outlived the last signal, which is how the callers already treat such a
 * remainder (keep the profile dir, point at the group with `pgrep -g`).
 */
export async function stopGroupSignals(
  pid: number,
  waitForExit: (ms: number) => Promise<boolean>,
  groupHasMembers: (pgid: number) => boolean,
  isLeaderRunning: () => boolean,
  signalGroup: (pgid: number, signal: NodeJS.Signals) => void,
  waitGroupGone: (pgid: number, ms: number) => Promise<void>,
): Promise<StopOutcome> {
  let leaderExited = false;
  for (const [signal, waitMs] of [
    ['SIGTERM', KILL_GRACE_MS],
    ['SIGKILL', SIGKILL_SETTLE_MS],
  ] as const) {
    if (!groupHasMembers(pid)) break;
    // The rule, re-checked right before every signal after the first: no
    // signal goes out unless this process still holds the leader unreaped. The
    // exit wait of the turn before can time out and the leader still exit and
    // be reaped before this turn, which is exactly the case the rule refuses,
    // so the timed-out wait alone does not carry the SIGKILL turn.
    if (signal !== 'SIGTERM' && !isLeaderRunning()) {
      leaderExited = true;
      break;
    }
    try {
      signalGroup(pid, signal);
    } catch {
      break;
    }
    // The leader's exit comes before the group is read again: until this
    // process has reaped its own child, the probe counts the child as a
    // member, zombie or not, and would read an already empty group as alive.
    const phaseDeadline = Date.now() + waitMs;
    // A true wait means Node has reaped the leader, and with it the footing the
    // rule needs: the group id is no longer guaranteed to be ours, so this is
    // the last signal of this stop.
    if (await waitForExit(waitMs)) leaderExited = true;
    // The probe that decides whether members remain is read only after the
    // rest of this phase's budget: right after the leader's exit the other
    // members are still exiting from the same signal, and reading them there
    // judges a group that is emptying as one that remains.
    await waitGroupGone(pid, Math.max(0, phaseDeadline - Date.now()));
    // Reaped leader: no SIGKILL. Members still there are reported below, the
    // way the gone path reports them, and never signalled.
    if (leaderExited) break;
  }
  if (groupHasMembers(pid)) {
    return leaderExited ? { kind: 'stopped', pid, groupRemains: true } : { kind: 'survived', pid };
  }
  return { kind: 'stopped', pid, groupRemains: false };
}

/**
 * Stop one child's process group: SIGTERM, then SIGKILL after a grace period
 * (stopGroupSignals). One rule governs every signal, and stopGroupSignals and
 * the gone path state it the same way: the stop signals the group only while
 * this process holds the group's leader unreaped. Once the leader has exited
 * and been reaped no signal is sent, so the members that remain are reported as
 * `groupRemains` and named with the `pgrep -g <pgid>` advice, exactly as the
 * gone path reports them. The reason is that once the leader is reaped the id
 * is no longer guaranteed to be ours. After every signal the escalation waits
 * for the child's own exit before it reads the group again (waitForExit): an
 * exited but unreaped child is still a member of its group, so a probe taken
 * before that wait would keep a group that is already empty looking like one
 * that survived. Before every signal after the first it re-checks that the
 * child is still running (isLeaderRunning), so a leader that exits and is
 * reaped between the two turns is never signalled. Returns a typed outcome, so
 * the callers check the kind and never the wording.
 */
async function stopChild(child: ChildProcess): Promise<StopOutcome> {
  const pid = child.pid;
  if (pid === undefined) return { kind: 'gone', pid: undefined, groupRemains: false };
  // A child that is not running is reported on, not signalled: there is no
  // stop left to escalate, and the leader is already reaped, so the rule says
  // no signal goes to its group. Its group is still probed here
  // (goneChildOutcome) because even a leader that exited on its own can have
  // left members behind, and those members are named with `pgrep -g` rather
  // than signalled.
  if (!running(child)) return goneChildOutcome(pid, groupHasMembers(pid));
  return stopGroupSignals(
    pid,
    (ms) => waitForExit(child, ms),
    groupHasMembers,
    () => running(child),
    (pgid, signal) => process.kill(-pgid, signal),
    groupGoneWithin,
  );
}

/** The /json/version URL of the DevTools port the walk driver attaches to. */
function cdpVersionUrl(cdpPort: number): string {
  return `http://127.0.0.1:${cdpPort}/json/version`;
}

/**
 * True while a child has neither exited nor been signalled. Reads nothing but
 * the two fields, so tests can pass plain objects; the READY gate re-checks
 * the launched browser with it right before printing.
 */
export function running(child: Pick<ChildProcess, 'exitCode' | 'signalCode'>): boolean {
  return child.exitCode === null && child.signalCode === null;
}

/**
 * Wait, bounded by ms, for this process's own child to exit and be reaped:
 * true when the 'exit' event fires within the budget, or at once when the
 * child has already been reaped, which Node reports through exitCode or
 * signalCode; false when the budget passes first. This is the wait the stop
 * runs after every signal and before it reads the group again: a child that
 * has exited but is not yet reaped is still a member of its group, so a probe
 * taken before this wait counts the child itself as a member and keeps a group
 * that is already empty looking like one that survived.
 */
export function waitForExit(
  child: Pick<ChildProcess, 'exitCode' | 'signalCode' | 'once' | 'removeListener'>,
  ms: number,
): Promise<boolean> {
  if (!running(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(false);
    }, ms);
    const onExit = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

/**
 * The failure for a browser that answered /json/version and then exited before
 * READY: the pid it answered with is one nothing serves anymore, so the run
 * fails instead of printing READY against it.
 */
export function browserExitedAfterCdpMessage(pid: number | undefined): string {
  return `browser exited right after serving CDP (pid ${pid ?? 'none'})`;
}

/**
 * What a failed probe of a process group means: only ESRCH says the group is
 * gone. Every other errno (EPERM: the group exists but this user may not
 * signal it) still says members remain, so a live group is never reported as
 * dispersed, with its dir freed or its `pgrep -g` advisory dropped.
 */
export function groupGoneByErrno(code: string | undefined): boolean {
  return code === 'ESRCH';
}

/**
 * True while the process group still has a member: the signal-0 probe
 * succeeds, or fails with an errno other than ESRCH (groupGoneByErrno).
 */
export function groupHasMembers(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return !groupGoneByErrno((error as NodeJS.ErrnoException).code);
  }
}

/**
 * After a signal to the group, poll until the group has no members left or the
 * wait in milliseconds passes. In the escalation this is how the members that
 * outlive the leader are given the rest of the phase's budget to disperse in:
 * they were signalled together with the leader, so this wait is their tail
 * from the same signal finishing. Whatever the group still holds once it ends
 * is what the escalation judges; it is signalled again only while the leader
 * is still unreaped (stopGroupSignals), and otherwise it is reported as
 * `groupRemains`.
 */
async function groupGoneWithin(pgid: number, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (groupHasMembers(pgid) && Date.now() < deadline) await sleep(100);
}

/** Poll every target until it answers HTTP or the deadline passes; returns the ones that never answered. */
async function waitForPorts(targets: readonly PortTarget[], timeoutMs: number): Promise<PortTarget[]> {
  let pending = [...targets];
  const deadline = Date.now() + timeoutMs;
  while (pending.length > 0 && Date.now() < deadline) {
    const answered = await Promise.all(pending.map((t) => httpAnswers(originUrl(t.port))));
    pending = pending.filter((_, i) => !answered[i]);
    if (pending.length > 0) await sleep(SERVER_POLL_MS);
  }
  return pending;
}

async function waitForCdp(cdpPort: number, child: ChildProcess): Promise<boolean> {
  const url = cdpVersionUrl(cdpPort);
  let failed = false;
  child.once('error', () => {
    failed = true;
  });
  const deadline = Date.now() + BROWSER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await cdpAnswers(url)) return true;
    if (failed || !running(child)) return false;
    await sleep(BROWSER_POLL_MS);
  }
  return false;
}

async function classifyPort(port: number): Promise<PortState> {
  if (await httpAnswers(originUrl(port))) return 'answering';
  return (await isPortFree(port)) ? 'free' : 'occupied';
}

async function httpAnswers(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2_000) });
    return isAnsweringStatus(res.status);
  } catch {
    return false;
  }
}

/** A DevTools endpoint answers /json/version with 200 and a webSocketDebuggerUrl; any other HTTP answer is not one. */
async function cdpAnswers(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return res.ok && isCdpVersionBody(await res.json());
  } catch {
    return false;
  }
}

function commandExistsOnPath(command: string): boolean {
  return spawnSync('which', [command], { encoding: 'utf-8' }).status === 0;
}

function tailLines(text: string, max: number): string[] {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.slice(-max);
}

function originUrl(port: number): string {
  return `http://${PREVIEW_HOST}:${port}/`;
}

function portStateText(state: PortState): string {
  if (state === 'answering') return 'answering HTTP';
  if (state === 'occupied') return 'in use, not answering HTTP';
  return 'free';
}

function optionalEnvValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The port rule the ports this run works with are held to, whatever shape the
 * value arrives in: a safe integer between 1 and 65535. resolveHostPort
 * applies it to the port the project's Vite config names, so a config port is
 * accepted exactly when the same value on --host-port or
 * FRONTX_VERIFY_HOST_PORT would be. parsePositiveInt already enforces the
 * safe integer and the positive lower bound, so parsePort adds only the cap.
 */
function isValidPortNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 65535;
}

/**
 * The port parser every text port value is read with: digits only, so `0x1F90`,
 * `1e3`, `8080.0` and a padded ` 8080 ` are no port at all, and the value must
 * be a positive safe integer, which parsePositiveInt already requires, plus the
 * 1..65535 cap. --host-port, --cdp-port and FRONTX_VERIFY_HOST_PORT (through
 * resolveEnvHostPort below) all read their value with it, so they accept
 * exactly the same values.
 */
export function parsePort(value: string): number | undefined {
  const parsed = parsePositiveInt(value);
  return parsed !== undefined && parsed <= 65535 ? parsed : undefined;
}

/**
 * What FRONTX_VERIFY_HOST_PORT resolves to: the port it names, or the message
 * explaining why it names none. An unset or empty variable names no port, so
 * the caller falls through to the next source. The preflight's own read and
 * dev-all (scripts/dev-all.ts) both call this, so the rule and the message
 * live in one place and a change to either lands in both scripts at once.
 */
export function resolveEnvHostPort(env: NodeJS.ProcessEnv): { port?: number; error?: string } {
  const raw = optionalEnvValue(env, FRONTX_VERIFY_HOST_PORT);
  if (raw === undefined) return {};
  const port = parsePort(raw);
  if (port === undefined) {
    return { error: `${FRONTX_VERIFY_HOST_PORT} expects a port between 1 and 65535, got "${raw}"` };
  }
  return { port };
}

function parsePositiveInt(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function playwrightCacheDir(platform: NodeJS.Platform, home: string): string | undefined {
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'ms-playwright');
  if (platform === 'linux') return join(home, '.cache', 'ms-playwright');
  return undefined;
}

/**
 * The executable inside one versioned Playwright cache directory. Playwright
 * moved from its own Chromium builds (`chrome-linux`) to Chrome for Testing
 * (`chrome-linux64`) and renamed the headless shell directory and binary, so
 * both layouts are probed, newer first. macOS builds are per CPU.
 */
function innerExecutablePaths(headlessShell: boolean, platform: NodeJS.Platform, arch: string): readonly string[] {
  const mac = arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  if (!headlessShell) {
    return platform === 'darwin'
      ? [join(`chrome-${mac}`, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')]
      : [join('chrome-linux64', 'chrome'), join('chrome-linux', 'chrome')];
  }
  return platform === 'darwin'
    ? [join(`chrome-headless-shell-${mac}`, 'chrome-headless-shell'), join(`chrome-${mac}`, 'headless_shell')]
    : [
        join('chrome-headless-shell-linux64', 'chrome-headless-shell'),
        join('chrome-linux', 'headless_shell'),
      ];
}

function lookupPlaywrightBrowser(
  cacheDir: string,
  platform: NodeJS.Platform,
  arch: string,
  fileExists: (path: string) => boolean,
  listDir: (path: string) => readonly string[],
): { path: string | undefined; detail: string } {
  let entries: readonly string[];
  try {
    entries = listDir(cacheDir);
  } catch {
    return { path: undefined, detail: 'directory does not exist' };
  }
  const versioned: { headlessShell: boolean; version: number }[] = [];
  for (const name of entries) {
    const match = /^chromium(_headless_shell)?-(\d+)$/.exec(name);
    if (match === null) continue;
    versioned.push({ headlessShell: match[1] === '_headless_shell', version: Number(match[2]) });
  }
  if (versioned.length === 0) {
    return { path: undefined, detail: 'no chromium-* or chromium_headless_shell-* directories' };
  }
  // Newest version first; at the same version Chrome for Testing comes
  // before the headless shell.
  versioned.sort((a, b) => b.version - a.version || Number(a.headlessShell) - Number(b.headlessShell));
  const probed: string[] = [];
  for (const { headlessShell, version } of versioned) {
    for (const inner of innerExecutablePaths(headlessShell, platform, arch)) {
      const candidate = join(cacheDir, `chromium${headlessShell ? '_headless_shell' : ''}-${version}`, inner);
      probed.push(candidate);
      if (fileExists(candidate)) return { path: candidate, detail: 'found' };
    }
  }
  return { path: undefined, detail: `no executable found; probed: ${probed.join(', ')}` };
}

// Preparing the walk is what running this file does, and only running it: a
// test that imports the pure helpers must not start servers or a browser as a
// side effect of the import.
if (isProcessEntryPoint(import.meta.url)) {
  run(process.argv.slice(2), process.env).then(
    (code) => {
      process.exit(code);
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${SCRIPT_NAME}] unexpected failure: ${message}`);
      process.exit(1);
    },
  );
}
