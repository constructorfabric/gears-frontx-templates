import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { MfeFixtureDiscovery } from './MfeFixtureDiscovery.mjs';

/** @type {string | undefined} */
let rootDir;

afterEach(async () => {
  if (rootDir) await rm(rootDir, { recursive: true, force: true });
  rootDir = undefined;
});

async function makeRoot() {
  rootDir = await mkdtemp(path.join(tmpdir(), 'mfe-disc-'));
  return rootDir;
}

async function writeFixture(root, name, withPkg = true) {
  const dir = path.join(root, 'template-mfe', 'src-app', 'mfe_packages', name);
  await mkdir(dir, { recursive: true });
  if (withPkg) await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name }));
}

describe('MfeFixtureDiscovery', () => {
  it('discovers every directory under template-mfe/src-app/mfe_packages that carries a package.json', async () => {
    const root = await makeRoot();
    await writeFixture(root, 'foo');
    await writeFixture(root, 'bar');
    await writeFixture(root, '.hidden', true);
    await writeFixture(root, 'no-pkg', false);
    const d = new MfeFixtureDiscovery({ root });
    const found = d.discover().map((p) => path.relative(root, p)).sort();
    expect(found).toEqual([
      'template-mfe/src-app/mfe_packages/bar',
      'template-mfe/src-app/mfe_packages/foo',
    ]);
  });

  it('carries no package names in logic — discovers whatever directories exist', async () => {
    const root = await makeRoot();
    await writeFixture(root, 'random-name-xyz');
    const d = new MfeFixtureDiscovery({ root });
    const found = d.discover();
    expect(found).toHaveLength(1);
    expect(found[0].endsWith(path.join('template-mfe', 'src-app', 'mfe_packages', 'random-name-xyz'))).toBe(true);
  });

  it('returns [] when the directory does not exist', async () => {
    const root = await makeRoot();
    const d = new MfeFixtureDiscovery({ root });
    expect(d.discover()).toEqual([]);
  });

  it('returns [] when the directory exists but no fixture carries a package.json', async () => {
    const root = await makeRoot();
    await writeFixture(root, 'no-pkg', false);
    const d = new MfeFixtureDiscovery({ root });
    expect(d.discover()).toEqual([]);
  });
});
