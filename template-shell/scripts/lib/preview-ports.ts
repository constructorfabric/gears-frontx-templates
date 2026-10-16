/**
 * Strict preview ports for `dev:all`.
 *
 * The dev aggregate addresses every screen at the port its package's `preview`
 * script declares. A preview Vite that finds that port taken moves to the next
 * free one by default, and the screen then silently fails to load from the
 * address the aggregate names. `dev:all` checks every declared port before it
 * builds anything and stops with the port and the package when one is taken,
 * and starts each preview with `--strictPort` so a port taken in between still
 * fails the run instead of moving.
 */

import { createServer } from 'node:net';

import type { MfeInfo } from './mfe-tools.js';

/** The host a `vite preview` without `--host` listens on, so the probe binds where the preview would. */
export const PREVIEW_HOST = 'localhost';

/** Whether a server can listen on `port` at `host` right now. */
export function isPortFree(port: number, host: string = PREVIEW_HOST): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.once('listening', () => {
      server.close(() => resolvePromise(true));
    });
    server.listen({ port, host, exclusive: true });
  });
}

/** The packages whose declared preview port is taken. */
export async function findTakenPreviewPorts(
  packages: readonly MfeInfo[],
  isFree: (port: number) => Promise<boolean> = (port) => isPortFree(port),
): Promise<MfeInfo[]> {
  const taken: MfeInfo[] = [];
  for (const mfe of packages) {
    if (!(await isFree(mfe.port))) taken.push(mfe);
  }
  return taken;
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
