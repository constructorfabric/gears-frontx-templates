import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';

/**
 * Entry stub answered on the root list.
 *
 * A package's barrel re-exports small entries whose bytes Rollup folds
 * into a shared internal chunk. `preserveEntrySignatures: 'strict'`
 * keeps every entry's export signature: the entry whose signature the
 * shared chunk carries becomes the chunk's own entry chunk (it has the
 * bytes), and every OTHER entry sharing that chunk gets a facade stub —
 * `entryPoint` set, `modulePaths` empty — re-exporting from the holder.
 * The barrel facade imports the holder directly, so a stub no list
 * reaches is never published, even though `assignAnswers` let the stub
 * claim the entry's specifiers (the override at the `entryByModule`
 * loop). The specifiers then go unanswered by every emitted item — the
 * evaluation-scope gate's "specifiers answered by no item" failure.
 *
 * The generic rule (see the comment in `emitLists`): every entry-set
 * specifier is answered by an item delivered with the package's ROOT
 * list — the list for the bare package name, emitted only when the
 * whole package is in scope. When that list is emitted, every stub
 * whose holder chunk the barrel already reaches is seeded on it, so
 * the stub is published and its entry specifiers are answered by an
 * emitted item. A consumer's own list (a deep-path entry's list, or a
 * foreign package's list) never seeds stubs, so a barrel-member stub
 * no consumer imports stays unpublished and its unrequested member
 * deep path stays unanswered.
 */
const roots: string[] = [];

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function pkg(
  root: string,
  name: string,
  json: object,
  files: Record<string, string>
): void {
  const dir = join(root, 'node_modules', name);
  write(
    join(dir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', ...json })
  );
  for (const [rel, content] of Object.entries(files)) {
    write(join(dir, rel), content);
  }
}

function tmpRoot(label: string): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), `unit-producer-f251-${label}-`))
  );
  roots.push(root);
  return root;
}


async function produce(
  root: string,
  out: string,
  consumerSpecifiers: readonly string[] = []
): Promise<ProducedSharedPackage[]> {
  return new UnitProducer({
    packageRoot: root,
    outputDir: join(root, out),
    consumerSpecifiers,
  }).produce((m) => {
    throw new Error(m);
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

/**
 * A package whose barrel re-exports two small entries (`base`, `sub`)
 * that share one holder chunk — the ActionsChainsMediator shape, where
 * an abstract base is extended by a subclass in the same chunk set.
 * Both entries are far below the chunk-grouping merge floor, so Rollup
 * folds their bytes into one shared chunk and mints a facade stub for
 * the entry whose signature the holder does not carry; the barrel
 * facade imports the holder directly, so that stub is never reached by
 * the barrel's list.
 */
function makeStubRoot(): string {
  const root = tmpRoot('stub');
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'host',
      version: '0.0.0',
      dependencies: { kit: '1.0.0' },
    })
  );
  pkg(
    root,
    'kit',
    {
      type: 'module',
      sideEffects: false,
      exports: {
        '.': './dist/index.js',
        './base': './dist/base.js',
        './sub': './dist/sub.js',
      },
    },
    {
      'dist/index.js':
        "export { Base } from './base.js';\n" +
        "export { Sub } from './sub.js';\n",
      'dist/base.js': 'export class Base {}\n',
      'dist/sub.js':
        "import { Base } from './base.js';\nexport class Sub extends Base {}\n",
    }
  );
  return root;
}

describe('entry stub answered on the root list', () => {
  it('every entry-set specifier is answered by an emitted item on the root list', async () => {
    const root = makeStubRoot();
    const produced = await produce(root, 'out', ['kit']);
    const kit = produced.find((p) => p.name === 'kit')!;

    // Across every emitted kit list, each entry-set specifier — the
    // exports-map subpath AND the deep-path spelling the
    // evaluation-scope gate checks — must be answered by some emitted
    // item. Before the fix the stub facade owns the specifiers of the
    // entry whose bytes folded into the holder but is never published,
    // so they are answered by no item.
    const answers = new Set(
      Object.values(kit.lists).flatMap((l) =>
        l.items.flatMap((i) => i.answers)
      )
    );
    expect(answers.has('kit')).toBe(true);
    expect(answers.has('kit/base')).toBe(true);
    expect(answers.has('kit/dist/base.js')).toBe(true);
    // `sub` is the entry whose bytes fold into the holder while another
    // entry's signature wins it — the stub facade case.
    expect(answers.has('kit/sub')).toBe(true);
    expect(answers.has('kit/dist/sub.js')).toBe(true);
  }, 120000);

  it('a consumer list answers the imported member and is not padded with the stub the root list seeds', async () => {
    // A consumer importing only `Sub` reaches the sub stub (the
    // member-respell rewrites the named import to `kit/dist/sub.js`)
    // and the holder through it; its list answers the imported member.
    // The root-list seeding the fix adds never reaches a consumer's
    // own list, so a stub no consumer imports stays off it.
    const root = tmpRoot('consumer');
    write(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'host',
        version: '0.0.0',
        dependencies: { kit: '1.0.0', app: '1.0.0' },
      })
    );
    pkg(
      root,
      'kit',
      {
        type: 'module',
        sideEffects: false,
        exports: {
          '.': './dist/index.js',
          './base': './dist/base.js',
          './sub': './dist/sub.js',
          './other': './dist/other.js',
        },
      },
      {
        'dist/index.js':
          "export { Base } from './base.js';\n" +
          "export { Sub } from './sub.js';\n" +
          "export { Other } from './other.js';\n",
        'dist/base.js': 'export class Base {}\n',
        'dist/sub.js':
          "import { Base } from './base.js';\nexport class Sub extends Base {}\n",
        'dist/other.js': 'export class Other {}\n',
      }
    );
    pkg(
      root,
      'app',
      {
        type: 'module',
        sideEffects: false,
        exports: { '.': './dist/index.js' },
        dependencies: { kit: '1.0.0' },
      },
      {
        'dist/index.js':
          "import { Sub } from 'kit';\nexport const run = () => new Sub();\n",
      }
    );
    const produced = await produce(root, 'out', ['app', 'kit']);
    const kit = produced.find((p) => p.name === 'kit')!;

    // The kit root list answers every entry-set specifier.
    const rootAnswers = new Set(
      (kit.lists['kit'] ?? { items: [] }).items.flatMap((i) => i.answers)
    );
    expect(rootAnswers.has('kit/sub')).toBe(true);
    expect(rootAnswers.has('kit/dist/sub.js')).toBe(true);
    expect(rootAnswers.has('kit/other')).toBe(true);
    expect(rootAnswers.has('kit/dist/other.js')).toBe(true);

    // The consumer's list answers the member it imports; an unimported
    // entry's export-subpath spelling stays off it (the stub facade is
    // seeded on the package's root list only, and the holder answers
    // the deep-path spelling — the form the gate checks — not the
    // subpath spelling).
    const app = produced.find((p) => p.name === 'app')!;
    const appList = app.lists['app'];
    expect(appList).toBeDefined();
    const appAnswers = new Set(appList.items.flatMap((i) => i.answers));
    expect(appAnswers.has('kit/dist/sub.js')).toBe(true);
    // `kit/other` is never imported by the consumer and never on its
    // list — the barrel-member deep path the invariant forbids.
    expect(appAnswers.has('kit/other')).toBe(false);
  }, 120000);
});
