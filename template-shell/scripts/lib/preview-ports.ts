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
 */

import { createServer } from 'node:net';

import type { MfeInfo } from './mfe-tools.js';

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

/** The command `dev:all` starts a package's preview server with. */
export function previewCommand(mfe: MfeInfo): string {
  return `cd src-app/mfe_packages/${mfe.name} && npm run preview -- --strictPort`;
}
