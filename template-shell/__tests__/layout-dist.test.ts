/**
 * Tests for the production layout step (`scripts/layout-dist.ts`), the last
 * step of `npm run build`.
 *
 * Each case builds a project tree on disk the way the build leaves it: the
 * real `ManifestGenerator` writes the dev aggregate into `public/`, and the
 * copy `vite build` makes of it goes into `dist/`. The layout step then runs
 * over that tree, so the cases check its output against the generator's real
 * output rather than against a restatement of the aggregate shape.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ManifestGenerator } from '../scripts/generate-mfe-manifests';
import { AGGREGATE_FILE, layoutDist } from '../scripts/layout-dist';

const MANIFEST_TYPE = 'gts.frontx.mfes.mfe.mf_manifest.v1';
const ENTRY_TYPE = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1';
const EXTENSION_TYPE = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1';
const SCREEN_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';

let project: string;
let packagesDir: string;

function token(name: string): string {
  return name.replace(/[^a-z0-9]/g, '_');
}

function manifestIdFor(name: string): string {
  return `${MANIFEST_TYPE}~fixture.${token(name)}.mfe.manifest.v1`;
}

/** A built screen package: its scripts, its `mfe.json`, and the `dist/` its `vite build` writes. */
function builtPackage(name: string, port: number, manifestId: string = manifestIdFor(name)): void {
  const dir = join(packagesDir, name);
  const dist = join(dir, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  mkdirSync(join(dist, 'shared'), { recursive: true });
  mkdirSync(join(dist, '@mf-types'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, scripts: { preview: `vite preview --port ${port}` } }));
  writeFileSync(join(dir, 'mfe.json'), '{ "entries": [], "extensions": [] }');

  writeFileSync(join(dist, 'remoteEntry.js'), `// ${name} remote entry`);
  writeFileSync(join(dist, 'mf-manifest.json'), '{}');
  writeFileSync(join(dist, 'assets', 'lifecycle-abc123.js'), `// ${name} lifecycle`);
  writeFileSync(join(dist, 'shared', 'react.js'), '// shared react');
  writeFileSync(join(dist, 'index.html'), '<!doctype html>');
  writeFileSync(join(dist, 'mf-stats.json'), '{}');
  writeFileSync(join(dist, '@mf-types', 'index.d.ts'), '');
  writeFileSync(join(dist, '@mf-types.zip'), '');
  writeFileSync(join(dist, '@mf-types.d.ts'), '');

  const entryId = `${ENTRY_TYPE}~fixture.${token(name)}.mfe.home.v1`;
  writeFileSync(
    join(dist, 'mfe-manifest.json'),
    JSON.stringify({
      manifest: {
        id: manifestId,
        name,
        remoteEntry: `http://localhost:${port}/remoteEntry.js`,
        metaData: {
          name,
          type: 'app',
          buildInfo: { buildVersion: '0', buildName: name },
          remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
          globalName: name,
          publicPath: `http://localhost:${port}/`,
        },
        shared: [{ name: 'react', version: '19.2.4', chunkPath: 'shared/react.js', unwrapKey: null }],
      },
      entries: [
        {
          id: entryId,
          requiredProperties: [],
          actions: [],
          domainActions: [],
          manifest: manifestId,
          exposedModule: './lifecycle',
          exposeAssets: { js: { async: [], sync: ['assets/lifecycle-abc123.js'] }, css: { async: [], sync: [] } },
        },
      ],
      extensions: [{ id: `${EXTENSION_TYPE}~fixture.${token(name)}.screens.home.v1`, domain: SCREEN_DOMAIN, entry: entryId }],
    }),
  );
}

/** What `generate:mfe-manifests` and then `vite build` leave: the dev aggregate in public/ and its copy in dist/. */
function generateAndCopyAggregate(): void {
  mkdirSync(join(project, 'public'), { recursive: true });
  mkdirSync(join(project, 'dist'), { recursive: true });
  const devAggregate = join(project, 'public', AGGREGATE_FILE);
  new ManifestGenerator(packagesDir, devAggregate, 'dist/mfe-manifest.json', null).run();
  copyFileSync(devAggregate, join(project, 'dist', AGGREGATE_FILE));
}

interface Config {
  manifest: { id: string; metaData: { publicPath: string } };
  entries: Array<{ manifest: { metaData: { publicPath: string } } }>;
}

function readAggregate(...segments: string[]): Config[] {
  return JSON.parse(readFileSync(join(project, ...segments, AGGREGATE_FILE), 'utf-8')) as Config[];
}

function publicPaths(configs: Config[]): string[] {
  return configs.flatMap((config) => [
    config.manifest.metaData.publicPath,
    ...config.entries.map((entry) => entry.manifest.metaData.publicPath),
  ]);
}

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'layout-dist-'));
  packagesDir = join(project, 'src-app', 'mfe_packages');
  mkdirSync(packagesDir, { recursive: true });
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe('layoutDist', () => {
  it('copies every screen into dist/mfe/<package>/ without the files the shell never reads', () => {
    builtPackage('orders-mfe', 3010);
    builtPackage('billing-mfe', 3011);
    generateAndCopyAggregate();

    const laidOut = layoutDist(project);

    expect([...laidOut].sort()).toEqual(['billing-mfe', 'orders-mfe']);
    for (const name of laidOut) {
      const copied = join(project, 'dist', 'mfe', name);
      expect(readdirSync(copied).sort()).toEqual(['assets', 'mf-manifest.json', 'remoteEntry.js', 'shared']);
      expect(readFileSync(join(copied, 'assets', 'lifecycle-abc123.js'), 'utf-8')).toBe(`// ${name} lifecycle`);
      expect(existsSync(join(copied, 'shared', 'react.js'))).toBe(true);
    }
  });

  it('addresses each screen in the dist aggregate relative to the aggregate, in the manifest and in every entry', () => {
    builtPackage('orders-mfe', 3010);
    generateAndCopyAggregate();

    layoutDist(project);

    const configs = readAggregate('dist');
    expect(configs.map((config) => config.manifest.id)).toEqual([manifestIdFor('orders-mfe')]);
    expect(publicPaths(configs)).toEqual(['mfe/orders-mfe/', 'mfe/orders-mfe/']);
  });

  it('leaves the dev aggregate in public/ on the preview ports', () => {
    builtPackage('orders-mfe', 3010);
    generateAndCopyAggregate();

    layoutDist(project);

    expect(publicPaths(readAggregate('public'))).toEqual(['http://localhost:3010/', 'http://localhost:3010/']);
  });

  it('replaces a layout an earlier build left behind', () => {
    builtPackage('orders-mfe', 3010);
    generateAndCopyAggregate();
    mkdirSync(join(project, 'dist', 'mfe', 'removed-mfe'), { recursive: true });

    layoutDist(project);

    expect(readdirSync(join(project, 'dist', 'mfe'))).toEqual(['orders-mfe']);
  });

  it('refuses an aggregate that names a manifest no built package declares, before writing anything', () => {
    builtPackage('orders-mfe', 3010);
    generateAndCopyAggregate();
    rmSync(join(packagesDir, 'orders-mfe', 'dist', 'mfe-manifest.json'));
    const before = readFileSync(join(project, 'dist', AGGREGATE_FILE), 'utf-8');

    expect(() => layoutDist(project)).toThrow(/carries manifest .*orders_mfe.*Rebuild the MFE packages/);
    expect(readFileSync(join(project, 'dist', AGGREGATE_FILE), 'utf-8')).toBe(before);
    expect(existsSync(join(project, 'dist', 'mfe'))).toBe(false);
  });

  it('lays out a package the aggregate carries even when its scripts declare no preview port', () => {
    builtPackage('orders-mfe', 3010);
    writeFileSync(join(packagesDir, 'orders-mfe', 'package.json'), JSON.stringify({ name: 'orders-mfe', scripts: {} }));
    generateAndCopyAggregate();

    expect(layoutDist(project)).toEqual(['orders-mfe']);
  });

  it('refuses a manifest id two packages declare, naming both, before writing anything', () => {
    const shared = manifestIdFor('orders-mfe');
    builtPackage('orders-mfe', 3010, shared);
    builtPackage('orders-copy-mfe', 3011, shared);
    generateAndCopyAggregate();
    const before = readFileSync(join(project, 'dist', AGGREGATE_FILE), 'utf-8');

    expect(() => layoutDist(project)).toThrow(/declared by more than one package: (orders-mfe, orders-copy-mfe|orders-copy-mfe, orders-mfe)/);
    expect(readFileSync(join(project, 'dist', AGGREGATE_FILE), 'utf-8')).toBe(before);
    expect(existsSync(join(project, 'dist', 'mfe'))).toBe(false);
  });

  it('names the package file it cannot parse', () => {
    builtPackage('orders-mfe', 3010);
    generateAndCopyAggregate();
    writeFileSync(join(packagesDir, 'orders-mfe', 'dist', 'mfe-manifest.json'), '{ "manifest": ');

    expect(() => layoutDist(project)).toThrow(/Cannot parse src-app\/mfe_packages\/orders-mfe\/dist\/mfe-manifest\.json/);
  });

  it('refuses a dist/ without the aggregate, naming the build step that writes it', () => {
    expect(() => layoutDist(project)).toThrow(/dist\/generated-mfe-manifests\.json does not exist.*vite build/);
  });

  it('lays out nothing for a shell with no screen packages', () => {
    rmSync(packagesDir, { recursive: true });
    generateAndCopyAggregate();

    expect(layoutDist(project)).toEqual([]);
    expect(readAggregate('dist')).toEqual([]);
  });
});
