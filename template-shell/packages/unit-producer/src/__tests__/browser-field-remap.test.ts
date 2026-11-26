import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer } from '../UnitProducer';

/**
 * A package's `browser` field can remap a module path a relative import
 * names literally (`axios`' `./lib/platform/node/classes/FormData.js`
 * → `./lib/helpers/null.js`). The esbuild build resolves the mapped
 * target — but the emitted external specifier and the recorded
 * `relativeImports` must name the mapped module path too, or the minted
 * blob keeps a relative specifier no unit owns and the browser throws
 * `Failed to resolve module specifier` on it.
 */

const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function makeRoot(): { root: string; depDir: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'unit-producer-browser-')));
  roots.push(root);
  write(
    join(root, 'package.json'),
    JSON.stringify({ name: 'host', version: '0.0.0', dependencies: { aliased: '1.0.0' } })
  );
  const depDir = join(root, 'node_modules', 'aliased');
  write(
    join(depDir, 'package.json'),
    JSON.stringify({
      name: 'aliased',
      version: '1.0.0',
      type: 'module',
      sideEffects: false,
      exports: { '.': './dist/index.js' },
      browser: { './dist/platform/node/thing.js': './dist/null.js' },
    })
  );
  const files: Record<string, string> = {
    'dist/index.js': "export { v } from './lib/x.js';\n",
    'dist/lib/x.js':
      "import thing from '../platform/node/thing.js';\n" +
      "const v = () => thing;\n" +
      // `as default` of an imported binding lands in the scanner's
      // reExports, not ownExports — the SCC entry must still forward it
      // (`export *` never re-exports default). axios's index.js does
      // exactly this (`export { axios as default }`).
      "export { v, thing as default };\n",
    // The remapped source exists on disk — a literal file resolution
    // finds it; the browser field must still win.
    'dist/platform/node/thing.js': "export default 'node-only';\n",
    'dist/null.js': "export default null;\n",
  };
  for (const [rel, content] of Object.entries(files)) write(join(depDir, rel), content);
  return { root, depDir };
}

describe('browser-field module remapping', () => {
  afterEach(() => {
    while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  it('emits the browser-mapped module path in unit text and relativeImports, never the remapped source path', async () => {
    const { root } = makeRoot();
    const produced = await new UnitProducer({
      packageRoot: root,
      outputDir: join(root, 'out'),
    }).produce((m) => {
      throw new Error(m);
    });
    const pkg = produced.find((p) => p.name === 'aliased')!;
    const outDir = join(root, 'out');
    const allModulePaths = pkg.units.flatMap((u) => u.modulePaths);
    const allUnitText = pkg.units
      .filter((u) => existsSync(join(outDir, u.location)))
      .map((u) => readFileSync(join(outDir, u.location), 'utf-8'))
      .join('\n');
    expect(allModulePaths).toContain('dist/null.js');
    // The remapped source path appears nowhere: no emitted specifier,
    // no owned module path.
    expect(allModulePaths).not.toContain('dist/platform/node/thing.js');
    expect(allUnitText).not.toContain('platform/node/thing.js');
    expect(allUnitText).not.toContain('node-only');
  }, 60000);
});
