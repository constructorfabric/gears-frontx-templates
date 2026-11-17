#!/usr/bin/env node

/**
 * Dynamic dev:all orchestrator
 *
 * Scans src-app/mfe_packages/ for MFE packages and automatically starts
 * all found packages in parallel with the main app.
 *
 * Port discovery: reads each package's package.json preview (or dev) script
 * for a --port NNNN argument. No separate registry file required.
 */

import { spawn } from 'child_process';
import { relative } from 'path';
import { concurrently } from 'concurrently';
import {
  buildMfesSequentially,
  getMFEPackages,
  noDiscoveredPackagesNotice,
  type MfeInfo,
} from './lib/mfe-tools.js';
import {
  findSharedPreviewPorts,
  findTakenPreviewPorts,
  isPortFree,
  previewCommand,
  sharedPreviewPortsMessage,
  takenPreviewPortsMessage,
  type PreviewCommand,
} from './lib/preview-ports.js';
// The variable's name and the resolution of its value live with the preflight
// that sets the variable; importing both keeps the two scripts on one name,
// one set of accepted values and one message. The import is side-effect free:
// that script runs its command only as the entry point.
import { FRONTX_VERIFY_HOST_PORT, resolveEnvHostPort } from './verify-preflight.js';

/**
 * The command the host (the shell itself) is started with. Without
 * FRONTX_VERIFY_HOST_PORT this is plain `vite`, whose port comes from the
 * project's own vite.config.ts, exactly as before any verification run. The
 * variable is set by verify-preflight to the port it resolved and waits for:
 * `--port` then overrides the config so the host serves on exactly that port,
 * and `--strictPort` fails the run instead of drifting to the next free port
 * when the port is taken in between (the same rule the MFE previews run on).
 */
function hostCommand(hostPort: number | undefined): string {
  return hostPort === undefined ? 'vite' : `vite --port ${hostPort} --strictPort`;
}

// Build preview-only commands (no build step - MFEs are pre-built). The host
// command arrives already resolved: resolving it here would run first in
// Step 3, after the MFE builds, and an invalid FRONTX_VERIFY_HOST_PORT would
// only be reported once they are done.
function buildPreviewCommands(mfes: MfeInfo[], hostCmd: string): PreviewCommand[] {
  const commands: PreviewCommand[] = [];

  // Add main app
  commands.push({ command: hostCmd });

  // MFE preview only (build already done in the sequential step), each in
  // its package on a strict port (scripts/lib/preview-ports.ts)
  for (const mfe of mfes) {
    commands.push(previewCommand(mfe));
  }

  return commands;
}

// Run manifest generation after MFE builds
function generateManifests(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('📋 Generating MFE manifests...\n');

    const proc = spawn('/bin/sh', ['-c', 'npm run generate:mfe-manifests'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Manifest generation failed with exit code ${code}`));
      }
    });
  });
}

// Main execution
async function main() {
  console.log('🚀 Starting dev:all...\n');

  const { packages, skippedExamples } = getMFEPackages();

  if (packages.length === 0) {
    console.log(noDiscoveredPackagesNotice(skippedExamples));
    console.log('Starting main app only...\n');
  } else {
    console.log(`✅ Found ${packages.length} MFE package(s):`);
    packages.forEach((mfe, idx) => {
      console.log(`  [${idx}] ${mfe.name} (port ${mfe.port})`);
    });
    console.log();
  }

  // Step 0: every port this run will hold must be free before any package is
  // built. The host port is resolved and probed here, next to the preview port
  // checks: a FRONTX_VERIFY_HOST_PORT that is not a port, or that names a port
  // something else already holds, fails the run here rather than after the MFE
  // builds, where the host command is first used and `vite --strictPort` would
  // fail only then.
  const hostEnv = resolveEnvHostPort(process.env);
  if (hostEnv.error !== undefined) {
    throw new Error(hostEnv.error);
  }

  const shared = findSharedPreviewPorts(packages);
  if (shared.length > 0) {
    throw new Error(sharedPreviewPortsMessage(shared));
  }
  const taken = await findTakenPreviewPorts(packages);
  if (taken.length > 0) {
    throw new Error(takenPreviewPortsMessage(taken));
  }
  if (hostEnv.port !== undefined && !(await isPortFree(hostEnv.port))) {
    throw new Error(
      `Host port ${hostEnv.port} (${FRONTX_VERIFY_HOST_PORT}) is already in use; stop the process holding it and run dev:all again.`,
    );
  }
  const hostCmd = hostCommand(hostEnv.port);

  // Step 1: Build all MFEs (produces dist/ with mf-manifest.json)
  await buildMfesSequentially(packages);

  // Step 2: Generate manifests (reads dist/mf-manifest.json, writes public/generated-mfe-manifests.json).
  // This child is also where the skipped-examples notice is printed, once per run.
  await generateManifests();

  // Step 3: Start host + MFE preview servers concurrently
  const commands = buildPreviewCommands(packages, hostCmd);

  console.log('📝 Running concurrently:');
  commands.forEach(({ command, cwd }, idx) => {
    console.log(`  [${idx}] ${command}${cwd ? ` (in ${relative(process.cwd(), cwd)})` : ''}`);
  });
  console.log();

  // `concurrently` comes from the devDependency pinned in package.json, so
  // dev:all never fetches it from the registry and works offline. Removing
  // that dependency fails `type-check:scripts` (TS2307).
  const { result } = concurrently(commands, { killOthersOn: ['success', 'failure'] });

  // Exit as the `concurrently` CLI does: 0 when every command succeeded, 1 otherwise.
  result.then(
    () => process.exit(0),
    () => process.exit(1),
  );
}

// The rejection is already phrased as a full report - `buildMfesSequentially`
// names the package, how it failed and the command that shows the real error -
// so it is printed as its message rather than as a value. `console.error` with
// an Error object prints a stack trace, which buries a multi-line hint in frames
// that point at this script instead of at the package to fix.
main().catch((err) => {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
