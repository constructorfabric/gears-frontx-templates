/**
 * Tests for the strict preview ports of `dev:all` (`scripts/lib/preview-ports.ts`)
 * and for the Step 0 port checks `dev-all.ts` runs before it builds anything:
 * two packages on one port, a taken preview port, and a host port the
 * environment names that is taken or is not a port.
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
  choosePreviewPorts,
  choosePreviewPortsBesideHost,
  generatorPreviewPorts,
  isPortFree,
  movedPreviewPortsMessage,
  previewCommand,
  previewPortsMovable,
} from '../scripts/lib/preview-ports';

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

  it('starts a moved preview on the moved port, after the package script so it wins, and still strict', () => {
    expect(previewCommand({ name: 'orders-mfe', port: 3010 }, 51234).command).toBe(
      'npm run preview -- --port 51234 --strictPort',
    );
  });

  it('starts the preview in the package directory', () => {
    expect(previewCommand({ name: 'orders-mfe', port: 3010 }).cwd).toBe(
      join(process.cwd(), 'src-app', 'mfe_packages', 'orders-mfe'),
    );
  });
});

describe('previewPortsMovable', () => {
  it('is on only for exactly 1', () => {
    expect(previewPortsMovable({ FRONTX_VERIFY_MOVE_PREVIEW_PORTS: '1' })).toBe(true);
    expect(previewPortsMovable({})).toBe(false);
    expect(previewPortsMovable({ FRONTX_VERIFY_MOVE_PREVIEW_PORTS: 'true' })).toBe(false);
    expect(previewPortsMovable({ FRONTX_VERIFY_MOVE_PREVIEW_PORTS: '0' })).toBe(false);
  });
});

describe('choosePreviewPorts', () => {
  it('gives each taken package its own free port, never a reserved one', async () => {
    const declared = await holdPort();
    const orders = { name: 'orders-mfe', port: declared };
    const reports = { name: 'reports-mfe', port: declared + 1 };

    const chosen = await choosePreviewPorts([orders, reports], new Set([declared, declared + 1]));

    expect([...chosen.keys()]).toEqual(['orders-mfe', 'reports-mfe']);
    const ports = [...chosen.values()];
    expect(new Set(ports).size).toBe(2);
    for (const port of ports) {
      expect(port).not.toBe(declared);
      expect(port).not.toBe(declared + 1);
      expect(await isPortFree(port)).toBe(true);
    }
  });

  it('skips a port the system offers when it is reserved, given to an earlier package, or taken', async () => {
    // Two ports that were free a moment ago: taken and released, so nothing
    // holds them. `held` is taken while they are still bound, so the system
    // cannot hand it one of them.
    const first = await holdPort();
    const second = await holdPort();
    const held = await holdPort();
    const heldServer = holders.pop()!;
    await release(holders.pop()!);
    await release(holders.pop()!);
    holders.push(heldServer);
    const offers = [5791, held, first, first, second];
    const chosen = await choosePreviewPorts(
      [
        { name: 'a-mfe', port: 3001 },
        { name: 'b-mfe', port: 3002 },
      ],
      new Set([5791]),
      async () => offers.shift()!,
    );

    expect(chosen).toEqual(new Map([['a-mfe', first], ['b-mfe', second]]));
  });

  it('gives up with the package named when no offered port is usable', async () => {
    await expect(
      choosePreviewPorts([{ name: 'a-mfe', port: 3001 }], new Set([5791]), async () => 5791),
    ).rejects.toThrow('No free port found for the preview of a-mfe after 20 attempts.');
  });

  it('never gives a moved preview the port the host serves on, nor a declared preview port, even when they are free', async () => {
    // The choice dev:all makes: every port offered before the last one is
    // free, so only the reservation keeps the preview off the host port and
    // the other package's declared port.
    const hostPort = await holdPort();
    const declared = await holdPort();
    const free = await holdPort();
    await Promise.all(holders.splice(0).map(release));
    const offers = [hostPort, declared, free];
    const packages = [
      { name: 'a-mfe', port: 3001 },
      { name: 'b-mfe', port: declared },
    ];

    const chosen = await choosePreviewPortsBesideHost(packages, [packages[0]], hostPort, async () => offers.shift()!);

    expect(chosen).toEqual(new Map([['a-mfe', free]]));
  });

  it('prints every moved package with its declared and chosen port, and the host port', () => {
    expect(
      movedPreviewPortsMessage(
        [{ name: 'orders-mfe', port: 3001 }],
        new Map([['orders-mfe', 51234]]),
        5173,
      ),
    ).toBe(
      'Preview port already in use, moved (FRONTX_VERIFY_MOVE_PREVIEW_PORTS=1):\n  - orders-mfe: port 3001 -> 51234\n' +
        'The host keeps port 5173.',
    );
  });
});

describe('generatorPreviewPorts', () => {
  it('passes on only the moved ports of packages with an mfe.json, the ones the generator aggregates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'generator-preview-ports-'));
    try {
      mkdirSync(join(dir, 'orders-mfe'));
      writeFileSync(join(dir, 'orders-mfe', 'mfe.json'), '{}');
      mkdirSync(join(dir, 'loose-mfe'));

      expect(generatorPreviewPorts(new Map([['orders-mfe', 51234], ['loose-mfe', 51235]]), dir)).toEqual(
        new Map([['orders-mfe', 51234]]),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('dev:all Step 0 port checks', () => {
  let project: string;

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'dev-all-port-'));
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  function previewPackage(name: string, port: number, { mfeJson = true } = {}): void {
    const packageDir = join(project, 'src-app', 'mfe_packages', name);
    mkdirSync(join(packageDir, 'node_modules', '.bin'), { recursive: true });
    if (mfeJson) writeFileSync(join(packageDir, 'mfe.json'), '{ "entries": [], "extensions": [] }');
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name, scripts: { preview: `vite preview --port ${port}` } }));
    // The build a run that gets past Step 0 makes: a stub, so nothing is built.
    writeFileSync(join(packageDir, 'node_modules', '.bin', 'vite'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }

  function runDevAll(extraEnv: NodeJS.ProcessEnv = {}, scripts: Record<string, string> = {}) {
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'fixture', private: true, scripts }));
    // Start from a copy with the variable under test removed, so a value set in
    // the shell running the tests cannot decide what the fixture run sees.
    const env = { ...process.env };
    delete env.FRONTX_VERIFY_HOST_PORT;
    delete env.FRONTX_VERIFY_MOVE_PREVIEW_PORTS;
    Object.assign(env, extraEnv);
    return spawnSync(
      process.execPath,
      [join(SHELL_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(SHELL_DIR, 'scripts', 'dev-all.ts')],
      { cwd: project, encoding: 'utf-8', env },
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

  it('keeps refusing a taken port with the same message when FRONTX_VERIFY_MOVE_PREVIEW_PORTS is set but not to 1', async () => {
    const ordersPort = await holdPort();
    previewPackage('orders-mfe', ordersPort);

    const run = runDevAll({ FRONTX_VERIFY_MOVE_PREVIEW_PORTS: 'true' });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Preview port already in use:');
    expect(run.stderr).toContain(`port ${ordersPort} (orders-mfe, src-app/mfe_packages/orders-mfe/package.json)`);
    expect(run.stdout).not.toContain('moved');
    expect(run.stdout).not.toContain('Building MFE packages');
  });

  it('stops before building when FRONTX_VERIFY_HOST_PORT names a taken port, naming the port and the variable', async () => {
    const hostPort = await holdPort();
    // A free preview port, so the taken host port is the only reason to stop.
    const previewPort = await holdPort();
    await release(holders.pop()!);
    previewPackage('orders-mfe', previewPort);

    const run = runDevAll({ FRONTX_VERIFY_HOST_PORT: String(hostPort) });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`Host port ${hostPort} (FRONTX_VERIFY_HOST_PORT) is already in use`);
    expect(run.stdout).not.toContain('Building MFE packages');
  });

  // A moved run reaches the build and the generator. Both are stubs here: the
  // package's local `vite` exits 0 at once (npm runs offline, so nothing is
  // fetched), and the generator script prints its arguments and exits 9, so
  // the run stops there and starts no server.
  it('keeps the host port of the Vite config clear, and tells the generator only of packages with an mfe.json', async () => {
    const ordersPort = await holdPort();
    const loosePort = await holdPort();
    const hostPort = await holdPort();
    await release(holders.pop()!);
    previewPackage('orders-mfe', ordersPort);
    previewPackage('loose-mfe', loosePort, { mfeJson: false });
    writeFileSync(join(project, 'vite.config.mjs'), `export default { server: { port: ${hostPort} } };\n`);
    writeFileSync(join(project, 'gen.mjs'), "console.log('GENERATOR ARGS: ' + process.argv.slice(2).join(' ')); process.exit(9);\n");

    const run = runDevAll(
      { FRONTX_VERIFY_MOVE_PREVIEW_PORTS: '1', npm_config_offline: 'true' },
      { 'generate:mfe-manifests': 'node gen.mjs' },
    );

    expect(run.stdout).toContain(`The host keeps port ${hostPort}.`);
    expect(run.stdout).toMatch(new RegExp(`loose-mfe: port ${loosePort} -> \\d+`));
    expect(run.stdout).toMatch(/GENERATOR ARGS: --preview-port orders-mfe=\d+$/m);
    expect(run.stderr).toContain('Manifest generation failed with exit code 9');
    expect(run.status).toBe(1);
  });

  it('stops before building when FRONTX_VERIFY_HOST_PORT is not a port, naming the variable and the value', async () => {
    const previewPort = await holdPort();
    await release(holders.pop()!);
    previewPackage('orders-mfe', previewPort);

    const run = runDevAll({ FRONTX_VERIFY_HOST_PORT: 'not-a-port' });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('FRONTX_VERIFY_HOST_PORT expects a port between 1 and 65535, got "not-a-port"');
    expect(run.stdout).not.toContain('Building MFE packages');
  });
});
