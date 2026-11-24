/**
 * Strict preview ports for `dev:all`.
 *
 * The dev aggregate addresses every screen at the port its package's `preview`
 * script declares. A preview Vite that finds that port taken moves to the next
 * free one by default, and the screen then silently fails to load from the
 * address the aggregate names. Before it builds any screen package, `dev:all`
 * stops when two packages declare the same port or when a declared port is
 * taken on a loopback address, naming the port and the packages, and it starts
 * each preview with `--strictPort` so a port taken in between still fails the
 * run instead of moving.
 *
 * A verification run beside another project may opt in to moving instead
 * (`FRONTX_VERIFY_MOVE_PREVIEW_PORTS=1`): a taken declared port is replaced by
 * a free one, the preview is started there, and the dev manifest generator is
 * told the moved port of that package (`--preview-port <package>=<port>`).
 */

import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { MFE_PACKAGES_DIR, type MfeInfo } from './mfe-tools.js';

/** The host a `vite preview` without `--host` listens on, so the probe binds where the preview would. */
export const PREVIEW_HOST = 'localhost';

/**
 * Both loopback addresses next to `localhost` itself: `localhost` resolves to
 * one of them for the preview, while a browser opening the dev manifest's
 * `localhost` address may reach the other, so a server on either one makes the
 * port unusable.
 */
const LOOPBACK_HOSTS = [PREVIEW_HOST, '127.0.0.1', '::1'];

/** Errors that mean this machine has no such address, not that the port is busy. */
const ADDRESS_UNAVAILABLE = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT']);

/** Whether `port` is in use at `host`; a host this machine does not have is not in use. */
function isPortInUseAt(port: number, host: string): Promise<boolean> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') resolvePromise(true);
      else if (err.code !== undefined && ADDRESS_UNAVAILABLE.has(err.code)) resolvePromise(false);
      else reject(new Error(`Cannot check port ${port} on ${host}: ${err.code ?? err.message}`));
    });
    server.once('listening', () => {
      server.close(() => resolvePromise(false));
    });
    server.listen({ port, host, exclusive: true });
  });
}

/** Whether a server can listen on `port` on every loopback address right now. */
export async function isPortFree(port: number): Promise<boolean> {
  for (const host of LOOPBACK_HOSTS) {
    if (await isPortInUseAt(port, host)) return false;
  }
  return true;
}

/** The packages whose declared preview port is taken. */
export async function findTakenPreviewPorts(packages: readonly MfeInfo[]): Promise<MfeInfo[]> {
  const taken: MfeInfo[] = [];
  for (const mfe of packages) {
    if (!(await isPortFree(mfe.port))) taken.push(mfe);
  }
  return taken;
}

/** Ports more than one package declares, each with the packages declaring it, in discovery order. */
export function findSharedPreviewPorts(packages: readonly MfeInfo[]): Array<{ port: number; names: string[] }> {
  const byPort = new Map<number, string[]>();
  for (const mfe of packages) byPort.set(mfe.port, [...(byPort.get(mfe.port) ?? []), mfe.name]);
  return [...byPort].filter(([, names]) => names.length > 1).map(([port, names]) => ({ port, names }));
}

/** The message `dev:all` stops with when packages declare the same preview port. */
export function sharedPreviewPortsMessage(shared: ReadonlyArray<{ port: number; names: string[] }>): string {
  return [
    'Preview ports declared by more than one package:',
    ...shared.map(({ port, names }) => `  - port ${port}: ${names.join(', ')}`),
    "Give each package its own --port in its preview script (and its mfe.json remoteEntry) and run dev:all again.",
  ].join('\n');
}

/** The message `dev:all` stops with when declared preview ports are taken. */
export function takenPreviewPortsMessage(taken: readonly MfeInfo[]): string {
  const lines = taken.map(
    (mfe) => `  - port ${mfe.port} (${mfe.name}, src-app/mfe_packages/${mfe.name}/package.json)`,
  );
  return [
    `Preview port${taken.length === 1 ? '' : 's'} already in use:`,
    ...lines,
    'The dev manifest points every screen at the port its package declares, so dev:all does not move',
    'a preview to another port. Stop the process that holds the port, or change the --port in that',
    "package's preview script and run dev:all again.",
  ].join('\n');
}

/**
 * Environment variable that lets `dev:all` start a preview whose declared port
 * is taken on a free port instead of stopping, for a verification run beside
 * another project that holds the template's default ports. Exactly `1` opts in,
 * the one spelling `FRONTX_INCLUDE_TEMPLATE_EXAMPLES` takes. Without it the
 * declared ports are used as they are and a taken one stops the run.
 */
export const MOVE_PREVIEW_PORTS_ENV_VAR = 'FRONTX_VERIFY_MOVE_PREVIEW_PORTS';

/** Whether this run may move a preview off a taken declared port. */
export function previewPortsMovable(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[MOVE_PREVIEW_PORTS_ENV_VAR] === '1';
}

/** The loopback address asked when the machine has no address for the host a preview listens on. */
const FALLBACK_LOOPBACK = '127.0.0.1';

/**
 * A port the system hands out as free right now on `host`, by default the host
 * a preview listens on. A host this machine has no address for (`localhost`
 * resolving to `::1` without IPv6) is asked again on 127.0.0.1, as
 * `isPortInUseAt` treats such a host as holding nothing.
 */
export function systemFreePort(host: string = PREVIEW_HOST): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (host !== FALLBACK_LOOPBACK && err.code !== undefined && ADDRESS_UNAVAILABLE.has(err.code)) {
        resolvePromise(systemFreePort(FALLBACK_LOOPBACK));
      } else {
        reject(err);
      }
    });
    server.listen({ port: 0, host, exclusive: true }, () => {
      const address = server.address();
      const port = address !== null && typeof address === 'object' ? address.port : 0;
      server.close(() => (port > 0 ? resolvePromise(port) : reject(new Error('The system gave no free port'))));
    });
  });
}

/** How many ports the system is asked for before the choice gives up. */
const FREE_PORT_ATTEMPTS = 20;

/**
 * A free preview port for each package in `taken`, keyed by package name: one
 * the system hands out, free on every loopback address, and not in `reserved`
 * (the declared ports of the other packages and the host port) nor given to an
 * earlier package of this call. The port may still be taken before the preview
 * binds it; the preview then fails on `--strictPort` rather than moving.
 */
export async function choosePreviewPorts(
  taken: readonly MfeInfo[],
  reserved: ReadonlySet<number>,
  freePort: () => Promise<number> = systemFreePort,
): Promise<Map<string, number>> {
  const used = new Set(reserved);
  const chosen = new Map<string, number>();
  for (const mfe of taken) {
    let port: number | undefined;
    for (let attempt = 0; attempt < FREE_PORT_ATTEMPTS && port === undefined; attempt++) {
      const candidate = await freePort();
      if (!used.has(candidate) && (await isPortFree(candidate))) port = candidate;
    }
    if (port === undefined) {
      throw new Error(`No free port found for the preview of ${mfe.name} after ${FREE_PORT_ATTEMPTS} attempts.`);
    }
    used.add(port);
    chosen.set(mfe.name, port);
  }
  return chosen;
}

/**
 * The moved ports `dev:all` uses: a free port for each package in `taken`
 * that is none of the declared preview ports of `packages` and not the port
 * the host serves on.
 */
export function choosePreviewPortsBesideHost(
  packages: readonly MfeInfo[],
  taken: readonly MfeInfo[],
  hostPort: number,
  freePort: () => Promise<number> = systemFreePort,
): Promise<Map<string, number>> {
  return choosePreviewPorts(taken, new Set([...packages.map((mfe) => mfe.port), hostPort]), freePort);
}

/**
 * The moved ports the dev manifest generator is told about: only those of the
 * packages it aggregates, the ones with an `mfe.json`. `dev:all` also starts a
 * package that declares a `--port` without one; the generator would refuse its
 * name, after every package was built.
 */
export function generatorPreviewPorts(moved: ReadonlyMap<string, number>): Map<string, number> {
  return new Map([...moved].filter(([name]) => existsSync(join(MFE_PACKAGES_DIR, name, 'mfe.json'))));
}

/** The lines `dev:all` prints for the previews it moved, and the host port they keep clear of. */
export function movedPreviewPortsMessage(
  taken: readonly MfeInfo[],
  chosen: ReadonlyMap<string, number>,
  hostPort: number,
): string {
  return [
    `Preview port${taken.length === 1 ? '' : 's'} already in use, moved (${MOVE_PREVIEW_PORTS_ENV_VAR}=1):`,
    ...taken.map((mfe) => `  - ${mfe.name}: port ${mfe.port} -> ${chosen.get(mfe.name)}`),
    `The host keeps port ${hostPort}.`,
  ].join('\n');
}

/** A command `dev:all` runs, and the directory it runs in when not the shell's own. */
export interface PreviewCommand {
  command: string;
  cwd?: string;
}

/**
 * The command `dev:all` starts a package's preview server with, in the
 * package's directory. A moved preview gets `--port` after the package's own
 * script arguments. Vite's CLI keeps the last value of an option given twice,
 * so the package's `vite preview --port <declared>` serves on the moved port;
 * that was checked by hand against Vite 6, and no test here runs a real Vite.
 */
export function previewCommand(mfe: MfeInfo, movedPort?: number): PreviewCommand {
  const port = movedPort === undefined ? '' : `--port ${movedPort} `;
  return { command: `npm run preview -- ${port}--strictPort`, cwd: join(MFE_PACKAGES_DIR, mfe.name) };
}
