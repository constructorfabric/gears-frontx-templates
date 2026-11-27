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
import { pathToFileURL } from 'node:url';

import {
  PREVIEW_HOST,
  choosePreviewPorts,
  choosePreviewPortsBesideHost,
  isPortFree,
  movedPreviewPortsMessage,
  previewCommand,
  previewPortsMovable,
  systemFreePort,
} from '../scripts/lib/preview-ports';

const SHELL_DIR = resolve(__dirname, '..');
const TSX_LOADER = pathToFileURL(join(SHELL_DIR, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;

/**
 * How a run whose servers are all stubs ends: the host's stub `vite` exits 3,
 * `concurrently` stops the others, and dev:all exits 1 as the `concurrently`
 * CLI does when a command failed, whichever command ends first.
 */
const EXIT_AFTER_STUB_SERVERS = 1;

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

  it('puts the moved port after the package script arguments, and keeps the preview strict', () => {
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

describe('systemFreePort', () => {
  it('asks 127.0.0.1 when the machine has no address for the host', async () => {
    // 192.0.2.1 is a documentation address no machine has as its own.
    const port = await systemFreePort('192.0.2.1');

    expect(port).toBeGreaterThan(0);
    expect(await isPortFree(port)).toBe(true);
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
    // spawnSync blocks the worker, so a stalled run is bounded here, not by the
    // test timeout. tsx's loader runs the script in this one process: the tsx
    // command would run it in a child that the kill of its parent leaves behind.
    return spawnSync(process.execPath, ['--import', TSX_LOADER, join(SHELL_DIR, 'scripts', 'dev-all.ts')], {
      cwd: project,
      encoding: 'utf-8',
      env,
      timeout: 60_000,
      killSignal: 'SIGKILL',
    });
  }

  /**
   * A run that goes all the way to the servers, every one of them a stub: the
   * packages' local `vite` (build and preview) exits 0 and the host's `vite`,
   * first on the fixture's PATH, exits 3 at once (npm runs offline, so nothing
   * is fetched), and the generator script prints its arguments and exits 0.
   * The first server to exit stops the others, so the run ends by itself.
   */
  function runDevAllToServers(extraEnv: NodeJS.ProcessEnv = {}) {
    writeFileSync(join(project, 'gen.mjs'), "console.log('GENERATOR ARGS: ' + process.argv.slice(2).join(' '));\n");
    mkdirSync(join(project, 'bin'));
    writeFileSync(join(project, 'bin', 'vite'), '#!/bin/sh\nexit 3\n', { mode: 0o755 });
    return runDevAll(
      { npm_config_offline: 'true', PATH: `${join(project, 'bin')}:${process.env.PATH ?? ''}`, ...extraEnv },
      { 'generate:mfe-manifests': 'node gen.mjs' },
    );
  }

  /** The `Running concurrently:` listing a run prints before it starts the servers. */
  function listing(stdout: string): string {
    expect(stdout).toContain('Running concurrently:');
    return stdout.slice(stdout.indexOf('Running concurrently:'));
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

  it('starts each moved preview on its moved port, pins the host to the port of the Vite config, and tells the generator only of packages with an mfe.json', async () => {
    const ordersPort = await holdPort();
    const loosePort = await holdPort();
    const hostPort = await holdPort();
    const freePort = await holdPort();
    await release(holders.pop()!);
    await release(holders.pop()!);
    previewPackage('orders-mfe', ordersPort);
    previewPackage('loose-mfe', loosePort, { mfeJson: false });
    previewPackage('free-mfe', freePort);
    writeFileSync(join(project, 'vite.config.mjs'), `export default { server: { port: ${hostPort} } };\n`);

    const run = runDevAllToServers({ FRONTX_VERIFY_MOVE_PREVIEW_PORTS: '1' });

    expect(run.error).toBeUndefined();
    expect(run.status).toBe(EXIT_AFTER_STUB_SERVERS);
    expect(run.stdout).toContain(`The host keeps port ${hostPort}.`);
    const movedLoose = new RegExp(`loose-mfe: port ${loosePort} -> (\\d+)`).exec(run.stdout)?.[1];
    const movedOrders = new RegExp(`orders-mfe: port ${ordersPort} -> (\\d+)`).exec(run.stdout)?.[1];
    expect(movedLoose).toBeDefined();
    expect(movedOrders).toBeDefined();
    expect(run.stdout).toMatch(new RegExp(`GENERATOR ARGS: --preview-port orders-mfe=${movedOrders}$`, 'm'));
    const servers = listing(run.stdout);
    expect(servers).toContain(`[0] vite --port ${hostPort} --strictPort\n`);
    expect(servers).toContain(
      `npm run preview -- --port ${movedLoose} --strictPort (in src-app/mfe_packages/loose-mfe)`,
    );
    expect(servers).toContain(
      `npm run preview -- --port ${movedOrders} --strictPort (in src-app/mfe_packages/orders-mfe)`,
    );
    expect(servers).toContain('npm run preview -- --strictPort (in src-app/mfe_packages/free-mfe)');
  });

  it('starts the host as plain vite when no preview was moved', async () => {
    const previewPort = await holdPort();
    await release(holders.pop()!);
    previewPackage('orders-mfe', previewPort);

    const run = runDevAllToServers();

    expect(run.error).toBeUndefined();
    expect(run.status).toBe(EXIT_AFTER_STUB_SERVERS);
    expect(listing(run.stdout)).toContain('[0] vite\n');
  });

  it('stops a moved run before building when the host port of the Vite config is taken, naming the variable that picks another', async () => {
    const previewPort = await holdPort();
    const hostPort = await holdPort();
    previewPackage('orders-mfe', previewPort);
    writeFileSync(join(project, 'vite.config.mjs'), `export default { server: { port: ${hostPort} } };\n`);

    const run = runDevAll({ FRONTX_VERIFY_MOVE_PREVIEW_PORTS: '1' });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      `Host port ${hostPort} (the project's Vite config) is already in use; ` +
        'stop the process holding it, or set FRONTX_VERIFY_HOST_PORT to a free port, and run dev:all again.',
    );
    expect(run.stdout).not.toContain('moved');
    expect(run.stdout).not.toContain('Building MFE packages');
  });

  it("prints the fallback to Vite's default port under its own name in a moved run", async () => {
    const previewPort = await holdPort();
    previewPackage('orders-mfe', previewPort);
    writeFileSync(join(project, 'vite.config.mjs'), "throw new Error('broken fixture config');\n");

    // Whether 5173 is free on this machine decides how the run ends, not the line.
    const run = runDevAllToServers({ FRONTX_VERIFY_MOVE_PREVIEW_PORTS: '1' });

    expect(run.error).toBeUndefined();
    expect(run.stdout).toContain("[dev-all] resolving the project's Vite config failed, using 5173:");
    expect(run.stdout).not.toContain('[verify-preflight]');
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
