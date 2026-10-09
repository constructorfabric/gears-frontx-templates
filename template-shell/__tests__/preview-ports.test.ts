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

import { PREVIEW_HOST, isPortFree, previewCommand } from '../scripts/lib/preview-ports';

const SHELL_DIR = resolve(__dirname, '..');

const holders: Server[] = [];

/** Holds a port on the host a preview listens on, the way another process would. */
function holdPort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ port: 0, host: PREVIEW_HOST }, () => {
      holders.push(server);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no port'));
        return;
      }
      resolvePromise(address.port);
    });
  });
}

function release(server: Server): Promise<void> {
  return new Promise((done) => server.close(() => done()));
}

afterEach(async () => {
  await Promise.all(holders.splice(0).map(release));
});

describe('isPortFree', () => {
  it('reports a port another server listens on as taken, and free once it is released', async () => {
    const port = await holdPort();

    expect(await isPortFree(port)).toBe(false);

    await Promise.all(holders.splice(0).map(release));
    expect(await isPortFree(port)).toBe(true);
  });
});

describe('previewCommand', () => {
  it('starts the preview on a strict port, so a port taken after the check fails instead of moving', () => {
    expect(previewCommand({ name: 'orders-mfe', port: 3010 }).command).toBe('npm run preview -- --strictPort');
  });

  it('starts the preview in the package directory', () => {
    expect(previewCommand({ name: 'orders-mfe', port: 3010 }).cwd).toBe(
      join(process.cwd(), 'src-app', 'mfe_packages', 'orders-mfe'),
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

  function previewPackage(name: string, port: number): void {
    const packageDir = join(project, 'src-app', 'mfe_packages', name);
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, 'mfe.json'), '{ "entries": [], "extensions": [] }');
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name, scripts: { preview: `vite preview --port ${port}` } }));
  }

  function runDevAll() {
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'fixture', private: true }));
    return spawnSync(
      process.execPath,
      [join(SHELL_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(SHELL_DIR, 'scripts', 'dev-all.ts')],
      { cwd: project, encoding: 'utf-8' },
    );
  }

  it('stops before building when two packages declare the same port, naming the port and both packages', async () => {
    const port = await holdPort();
    await release(holders.pop()!);
    previewPackage('orders-mfe', port);
    previewPackage('orders-copy-mfe', port);

    const run = runDevAll();

    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(new RegExp(`port ${port}: (orders-copy-mfe, orders-mfe|orders-mfe, orders-copy-mfe)`));
    expect(run.stdout).not.toContain('Building MFE packages');
  });

  it('stops before building, naming every taken port with its package and no free one', async () => {
    const ordersPort = await holdPort();
    const reportsPort = await holdPort();
    // A port that was free a moment ago: taken and released, so nothing holds it.
    const billingPort = await holdPort();
    await release(holders.pop()!);
    previewPackage('orders-mfe', ordersPort);
    previewPackage('billing-mfe', billingPort);
    previewPackage('reports-mfe', reportsPort);

    const run = runDevAll();

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`port ${ordersPort} (orders-mfe, src-app/mfe_packages/orders-mfe/package.json)`);
    expect(run.stderr).toContain(`port ${reportsPort} (reports-mfe, src-app/mfe_packages/reports-mfe/package.json)`);
    expect(run.stderr).not.toContain('billing-mfe');
    expect(run.stdout).not.toContain('Building MFE packages');
  });
});
