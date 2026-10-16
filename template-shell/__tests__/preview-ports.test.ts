/**
 * Tests for the strict preview ports of `dev:all` (`scripts/lib/preview-ports.ts`).
 *
 * The probe runs against a real listening socket, and one case runs the real
 * `dev-all.ts` over a fixture project whose package declares a taken port: the
 * run has to stop before it builds anything, naming the port and the package.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  PREVIEW_HOST,
  findTakenPreviewPorts,
  isPortFree,
  previewCommand,
  takenPreviewPortsMessage,
} from '../scripts/lib/preview-ports';

const SHELL_DIR = resolve(__dirname, '..');

let holder: Server | undefined;

/** Holds a port on the host a preview listens on, the way another process would. */
function holdPort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ port: 0, host: PREVIEW_HOST }, () => {
      holder = server;
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no port'));
        return;
      }
      resolvePromise(address.port);
    });
  });
}

afterEach(async () => {
  const server = holder;
  holder = undefined;
  if (server) await new Promise<void>((done) => server.close(() => done()));
});

describe('isPortFree', () => {
  it('reports a port another server listens on as taken, and free once it is released', async () => {
    const port = await holdPort();

    expect(await isPortFree(port)).toBe(false);

    await new Promise<void>((done) => holder!.close(() => done()));
    holder = undefined;
    expect(await isPortFree(port)).toBe(true);
  });
});

describe('findTakenPreviewPorts', () => {
  it('returns every package whose declared port is taken, in discovery order', async () => {
    const taken = new Set([3010, 3012]);
    const packages = [
      { name: 'orders-mfe', port: 3010 },
      { name: 'billing-mfe', port: 3011 },
      { name: 'reports-mfe', port: 3012 },
    ];

    const result = await findTakenPreviewPorts(packages, (port) => Promise.resolve(!taken.has(port)));

    expect(result).toEqual([
      { name: 'orders-mfe', port: 3010 },
      { name: 'reports-mfe', port: 3012 },
    ]);
  });
});

describe('takenPreviewPortsMessage', () => {
  it('names each taken port with its package', () => {
    const message = takenPreviewPortsMessage([
      { name: 'orders-mfe', port: 3010 },
      { name: 'reports-mfe', port: 3012 },
    ]);

    expect(message).toContain('port 3010 (orders-mfe, src-app/mfe_packages/orders-mfe/package.json)');
    expect(message).toContain('port 3012 (reports-mfe, src-app/mfe_packages/reports-mfe/package.json)');
  });
});

describe('previewCommand', () => {
  it('starts the preview on a strict port, so a port taken after the check fails instead of moving', () => {
    expect(previewCommand({ name: 'orders-mfe', port: 3010 })).toBe(
      'cd src-app/mfe_packages/orders-mfe && npm run preview -- --strictPort',
    );
  });
});

describe('dev:all with a taken preview port', () => {
  let project: string;

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'dev-all-port-'));
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('stops before building, naming the port and the package', async () => {
    const port = await holdPort();
    const packageDir = join(project, 'src-app', 'mfe_packages', 'orders-mfe');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, 'mfe.json'), '{ "entries": [], "extensions": [] }');
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({ name: 'orders-mfe', scripts: { preview: `vite preview --port ${port}` } }),
    );
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'fixture', private: true }));

    const run = spawnSync(
      process.execPath,
      [join(SHELL_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(SHELL_DIR, 'scripts', 'dev-all.ts')],
      { cwd: project, encoding: 'utf-8' },
    );

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`port ${port} (orders-mfe, src-app/mfe_packages/orders-mfe/package.json)`);
    expect(run.stdout).not.toContain('Building MFE packages');
  });
});
