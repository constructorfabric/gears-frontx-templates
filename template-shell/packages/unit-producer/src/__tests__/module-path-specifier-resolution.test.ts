/**
 * Minted module-path specifiers `pkg/<rel>` resolve by file existence
 * inside their own package — the exports map does not gate a spelling
 * the producer itself emits (member rewrites, deep-path answers,
 * owned-module externalizations all carry it). A requested `pkg/<rel>`
 * naming an existing file is covered; one naming nothing still fails.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UnitProducer } from '../UnitProducer';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'up-mpspec-'));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function install(pkg: {
  name: string;
  version: string;
  exports: Record<string, string>;
  files: Record<string, string>;
}): void {
  const dir = path.join(tmp, 'node_modules', ...pkg.name.split('/'));
  for (const [file, source] of Object.entries(pkg.files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), source);
  }
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: pkg.name,
      version: pkg.version,
      type: 'module',
      exports: pkg.exports,
    })
  );
}

async function produce(
  consumerSpecifiers: string[]
): Promise<{ errors: string[] }> {
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      version: '1.0.0',
      dependencies: { gated: '1.0.0' },
    })
  );
  const errors: string[] = [];
  await new UnitProducer({
    packageRoot: tmp,
    outputDir: path.join(tmp, 'out'),
    consumerSpecifiers,
  }).produce((m) => {
    errors.push(m);
    throw new Error(m);
  }).catch(() => {});
  return { errors };
}

describe('UnitProducer — minted module-path specifier resolution', () => {
  it('covers a requested pkg/<rel> specifier naming an existing file the exports map does not spell', async () => {
    install({
      name: 'gated',
      version: '1.0.0',
      exports: { '.': './dist/index.js' },
      files: {
        'dist/index.js':
          "import { leaf } from './internal/leaf.mjs';\nexport const index = () => leaf();\n",
        'dist/internal/leaf.mjs': "export const leaf = () => 'L';\n",
      },
    });
    const { errors } = await produce(['gated/dist/internal/leaf.mjs']);
    expect(errors).toEqual([]);
  });

  it('still fails a pkg/<rel> specifier naming a file that does not exist', async () => {
    install({
      name: 'gated',
      version: '1.0.0',
      exports: { '.': './dist/index.js' },
      files: {
        'dist/index.js': "export const index = () => 'I';\n",
      },
    });
    const { errors } = await produce(['gated/dist/ghost.mjs']);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('gated/dist/ghost.mjs');
  });
});
