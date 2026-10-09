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
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { concurrently } from 'concurrently';
import {
  MFE_PACKAGES_DIR,
  buildMfesSequentially,
  getMFEPackages,
  noDiscoveredPackagesNotice,
  type MfeInfo,
} from './lib/mfe-tools.js';

interface PreviewCommand {
  command: string;
  cwd?: string;
}

// Determine main app command based on available scripts
function getMainAppCommand(): string {
  const rootPkgPath = join(process.cwd(), 'package.json');
  try {
    const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    if (rootPkg.scripts?.['generate:colors']) {
      return 'npm run generate:colors && vite';
    }
  } catch {
    // ignore — fall through to default
  }
  return 'vite';
}

// Build preview-only commands (no build step — MFEs are pre-built)
function buildPreviewCommands(mfes: MfeInfo[]): PreviewCommand[] {
  const commands: PreviewCommand[] = [];

  // Add main app
  commands.push({ command: getMainAppCommand() });

  // MFE preview only (build already done in the sequential step). Each runs
  // with `cwd` set to its package, as `buildMfesSequentially` builds it,
  // rather than a `cd` spliced into the command line.
  for (const mfe of mfes) {
    commands.push({ command: 'npm run preview', cwd: join(MFE_PACKAGES_DIR, mfe.name) });
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

  // Step 1: Build all MFEs (produces dist/ with mf-manifest.json)
  await buildMfesSequentially(packages);

  // Step 2: Generate manifests (reads dist/mf-manifest.json, writes public/generated-mfe-manifests.json).
  // This child is also where the skipped-examples notice is printed, once per run.
  await generateManifests();

  // Step 3: Start host + MFE preview servers concurrently
  const commands = buildPreviewCommands(packages);

  console.log('📝 Running concurrently:');
  commands.forEach(({ command, cwd }, idx) => {
    console.log(`  [${idx}] ${command}${cwd ? ` (in ${relative(process.cwd(), cwd)})` : ''}`);
  });
  console.log();

  // Called through its API, not `npx concurrently`: the import resolves the
  // devDependency pinned in package.json, and a project without it fails
  // `type-check:scripts`. `npx` would instead download whatever version is
  // latest on the registry, or fail offline.
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
