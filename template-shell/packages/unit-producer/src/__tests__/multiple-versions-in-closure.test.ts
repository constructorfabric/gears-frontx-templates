import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer } from '../UnitProducer';

/**
 * Scenario: two shared packages import the same package and resolve it
 * to different versions. One instance per package is the unit model's
 * premise, so the build fails naming the package, both versions and the
 * package through which the second was reached.
 */
const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function pkg(dir: string, name: string, version: string, files: Record<string, string>, extra: object = {}): void {
  write(
    join(dir, 'package.json'),
    JSON.stringify({ name, version, type: 'module', sideEffects: false, main: './index.js', ...extra })
  );
  for (const [file, content] of Object.entries(files)) write(join(dir, file), content);
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('more than one version of a shared package in the shared closure', () => {
  it('fails the build naming the package, both versions and the importer', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-versions-')));
    roots.push(root);
    write(
      join(root, 'package.json'),
      JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { app: '1.0.0', kit: '1.0.0' } })
    );
    const modules = join(root, 'node_modules');
    pkg(join(modules, 'ui'), 'ui', '1.0.0', { 'index.js': 'export const ui = () => 1;\n' });
    pkg(join(modules, 'app'), 'app', '1.0.0', { 'index.js': "import { ui } from 'ui';\nexport const app = () => ui();\n" }, {
      dependencies: { ui: '1.0.0' },
    });
    pkg(join(modules, 'kit'), 'kit', '1.0.0', { 'index.js': "import { ui } from 'ui';\nexport const kit = () => ui();\n" }, {
      dependencies: { ui: '2.0.0' },
    });
    pkg(join(modules, 'kit', 'node_modules', 'ui'), 'ui', '2.0.0', { 'index.js': 'export const ui = () => 2;\n' });

    await expect(
      new UnitProducer({
        packageRoot: root,
        outputDir: join(root, 'out'),
        consumerSpecifiers: ['app', 'kit'],
      }).produce((message) => {
        throw new Error(message);
      })
    ).rejects.toThrow(/shared dependency "ui": more than one version is reachable.*"1\.0\.0".*"2\.0\.0".*"kit"/s);
  }, 60_000);
});
