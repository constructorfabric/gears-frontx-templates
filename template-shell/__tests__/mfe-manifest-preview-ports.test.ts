/**
 * Tests for the per-package preview port override of the dev manifest
 * generator (`--preview-port <package>=<port>`, passed by `dev:all` only for a
 * preview it moved off a taken port).
 *
 * The override must touch nothing but the port of the moved package's
 * publicPath: without it the aggregate is byte for byte what it was before the
 * override existed, and with it every other byte stays.
 *
 * Each fixture package carries its address both in its authored `mfe.json`
 * (`manifest.remoteEntry`) and in its built `dist/mfe-manifest.json`, with the
 * built publicPath left at Module Federation's "auto" placeholder, as the
 * template's own packages build today. The address then comes from the
 * remoteEntry origin, whichever of the two files the generator reads it from.
 *
 * The fixture is laid out as a project (`src-app/mfe_packages/<name>`,
 * `public/`), so the same packages also serve the cases that run the real
 * script with its command line, as `dev:all` does.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ManifestGenerator } from '../scripts/generate-mfe-manifests';

const MFE_MANIFEST_PATH = 'dist/mfe-manifest.json';
const SHELL_DIR = resolve(__dirname, '..');

let workspace: string;
let mfePackagesDir: string;
let outputFile: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'mfe-preview-ports-'));
  mfePackagesDir = join(workspace, 'src-app', 'mfe_packages');
  outputFile = join(workspace, 'public', 'generated-mfe-manifests.json');
  mkdirSync(mfePackagesDir, { recursive: true });
  mkdirSync(join(workspace, 'public'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

/**
 * One built package addressed at `remoteEntry`, named `<token>` (by default
 * `<name>`) in every id, whose built manifest names `publicPath` (by default
 * the build's "auto").
 */
function builtPackage(
  name: string,
  remoteEntry: string | undefined,
  token = name.replace(/-/g, '_'),
  publicPath = 'auto',
): void {
  const packagePath = join(mfePackagesDir, name);
  mkdirSync(join(packagePath, 'dist'), { recursive: true });
  const manifestId = `gts.frontx.mfes.mfe.mf_manifest.v1~fixture.${token}.mfe.manifest.v1`;
  const entryId = `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~fixture.${token}.mfe.home.v1`;
  writeFileSync(
    join(packagePath, 'mfe.json'),
    JSON.stringify({ manifest: { id: manifestId, ...(remoteEntry !== undefined && { remoteEntry }) } }),
  );
  writeFileSync(
    join(packagePath, MFE_MANIFEST_PATH),
    JSON.stringify({
      manifest: {
        id: manifestId,
        name,
        ...(remoteEntry !== undefined && { remoteEntry }),
        metaData: {
          name,
          type: 'app',
          buildInfo: { buildVersion: '0', buildName: name },
          remoteEntry: { name: 'remoteEntry.js', path: 'assets', type: 'module' },
          globalName: name,
          publicPath,
        },
        shared: [],
      },
      entries: [
        {
          id: entryId,
          requiredProperties: [],
          actions: [],
          domainActions: [],
          manifest: manifestId,
          exposedModule: './lifecycle',
          exposeAssets: { js: { async: [], sync: [] }, css: { async: [], sync: [] } },
        },
      ],
      extensions: [
        {
          id: `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~fixture.${token}.screens.home.v1`,
          domain: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
          entry: entryId,
        },
      ],
    }),
  );
}

function generate(previewPorts?: ReadonlyMap<string, number>): string {
  const generator =
    previewPorts === undefined
      ? new ManifestGenerator(mfePackagesDir, outputFile, MFE_MANIFEST_PATH, null)
      : new ManifestGenerator(mfePackagesDir, outputFile, MFE_MANIFEST_PATH, null, previewPorts);
  generator.run();
  return readFileSync(outputFile, 'utf-8');
}

function publicPaths(aggregate: string): string[] {
  return (JSON.parse(aggregate) as Array<{ manifest: { metaData: { publicPath: string } } }>).map(
    (config) => config.manifest.metaData.publicPath,
  );
}

describe('the dev manifest without a moved preview', () => {
  it('addresses every package at its remoteEntry origin, and an empty override changes no byte', () => {
    builtPackage('billing-mfe', 'http://localhost:3010/assets/remoteEntry.js');
    builtPackage('orders-mfe', 'http://localhost:3011/assets/remoteEntry.js');

    const plain = generate();

    expect(publicPaths(plain)).toEqual(['http://localhost:3010/', 'http://localhost:3011/']);
    expect(generate(new Map())).toBe(plain);
  });
});

describe('the dev manifest with a moved preview', () => {
  it('moves only the port of the named package and leaves every other byte as it was', () => {
    builtPackage('billing-mfe', 'http://localhost:3010/assets/remoteEntry.js');
    builtPackage('orders-mfe', 'http://localhost:3011/assets/remoteEntry.js');
    const plain = generate();

    const moved = generate(new Map([['orders-mfe', 51234]]));

    expect(publicPaths(moved)).toEqual(['http://localhost:3010/', 'http://localhost:51234/']);
    expect(moved.replaceAll('http://localhost:51234/', 'http://localhost:3011/')).toBe(plain);
  });

  it('keeps the host of the address and replaces only the port', () => {
    builtPackage('billing-mfe', 'http://127.0.0.1:3010/billing/remoteEntry.js');

    expect(publicPaths(generate(new Map([['billing-mfe', 51234]])))).toEqual(['http://127.0.0.1:51234/']);
  });

  it('refuses a moved port for a package it does not aggregate, and removes the aggregate an earlier run wrote', () => {
    builtPackage('billing-mfe', 'http://localhost:3010/assets/remoteEntry.js');
    generate();
    expect(existsSync(outputFile)).toBe(true);

    expect(() => generate(new Map([['biling-mfe', 51234]]))).toThrow(
      '--preview-port names no aggregated MFE package: biling-mfe',
    );
    expect(existsSync(outputFile)).toBe(false);
  });

  it('refuses a moved port for a package addressed at "/", which names no port to move, and removes the earlier aggregate', () => {
    builtPackage('billing-mfe', undefined);
    generate();
    expect(existsSync(outputFile)).toBe(true);

    expect(() => generate(new Map([['billing-mfe', 51234]]))).toThrow(
      '[billing-mfe] --preview-port 51234 was given, but the package\'s publicPath "/" is not an absolute URL, ' +
        'so it names no port to move. Set manifest.remoteEntry in its mfe.json to the address of its preview server.',
    );
    expect(existsSync(outputFile)).toBe(false);
  });

  it('refuses a moved port for a package whose built manifest names a relative publicPath, naming that field', () => {
    builtPackage('billing-mfe', 'http://localhost:3010/assets/remoteEntry.js', 'billing_mfe', '/billing/');

    expect(() => generate(new Map([['billing-mfe', 51234]]))).toThrow(
      'publicPath "/billing/" is not an absolute URL, so it names no port to move. It comes from ' +
        'metaData.publicPath in its built dist/mfe-manifest.json, which wins over manifest.remoteEntry',
    );
  });
});

describe('the generator run with its command line', () => {
  /** The real script, run in the fixture project the way `dev:all` runs it. */
  function runGenerator(...args: string[]) {
    const env = { ...process.env };
    delete env.FRONTX_INCLUDE_TEMPLATE_EXAMPLES;
    return spawnSync(
      process.execPath,
      [
        join(SHELL_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        join(SHELL_DIR, 'scripts', 'generate-mfe-manifests.ts'),
        ...args,
      ],
      { cwd: workspace, encoding: 'utf-8', env },
    );
  }

  it('addresses the package named by --preview-port at that port', () => {
    builtPackage('billing-mfe', 'http://localhost:3010/assets/remoteEntry.js');
    builtPackage('orders-mfe', 'http://localhost:3011/assets/remoteEntry.js');

    const run = runGenerator('--preview-port', 'orders-mfe=51234');

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(publicPaths(readFileSync(outputFile, 'utf-8'))).toEqual([
      'http://localhost:3010/',
      'http://localhost:51234/',
    ]);
  });

  it('takes the port after the last "=", so a package directory name may hold one', () => {
    builtPackage('odd=name-mfe', 'http://localhost:3010/assets/remoteEntry.js', 'odd_name_mfe');

    const run = runGenerator('--preview-port', 'odd=name-mfe=51234');

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(publicPaths(readFileSync(outputFile, 'utf-8'))).toEqual(['http://localhost:51234/']);
  });

  it.each(['billing-mfe=0', 'billing-mfe=65536', 'billing-mfe=next', 'billing-mfe'])(
    'refuses --preview-port %s, naming the value, and removes the aggregate an earlier run wrote',
    (value) => {
      builtPackage('billing-mfe', 'http://localhost:3010/assets/remoteEntry.js');
      expect(runGenerator().status).toBe(0);
      expect(existsSync(outputFile)).toBe(true);

      const run = runGenerator('--preview-port', value);

      expect(run.status).toBe(1);
      expect(run.stderr).toContain(
        `--preview-port expects <package>=<port> with a port between 1 and 65535, got "${value}"`,
      );
      expect(existsSync(outputFile)).toBe(false);
    },
  );
});
