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
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ManifestGenerator } from '../scripts/generate-mfe-manifests';

const MFE_MANIFEST_PATH = 'dist/mfe-manifest.json';

let workspace: string;
let mfePackagesDir: string;
let outputFile: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'mfe-preview-ports-'));
  mfePackagesDir = join(workspace, 'mfe_packages');
  outputFile = join(workspace, 'generated-mfe-manifests.json');
  mkdirSync(mfePackagesDir);
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

/** One built package addressed at `remoteEntry`, named `<name>` in every id. */
function builtPackage(name: string, remoteEntry: string | undefined): void {
  const packagePath = join(mfePackagesDir, name);
  mkdirSync(join(packagePath, 'dist'), { recursive: true });
  const token = name.replace(/-/g, '_');
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
          publicPath: 'auto',
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

  it('refuses a moved port for a package it does not aggregate, and leaves no aggregate behind', () => {
    builtPackage('billing-mfe', 'http://localhost:3010/assets/remoteEntry.js');

    expect(() => generate(new Map([['biling-mfe', 51234]]))).toThrow(
      '--preview-port names no aggregated MFE package: biling-mfe',
    );
    expect(existsSync(outputFile)).toBe(false);
  });

  it('refuses a moved port for a package addressed at "/", which names no port to move', () => {
    builtPackage('billing-mfe', undefined);

    expect(() => generate(new Map([['billing-mfe', 51234]]))).toThrow(
      '[billing-mfe] --preview-port 51234 was given, but the package\'s publicPath "/" is not an absolute URL',
    );
    expect(existsSync(outputFile)).toBe(false);
  });
});
