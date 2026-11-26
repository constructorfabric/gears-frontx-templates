import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ProducedFetchList } from '../ProducedFetchList';
import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';
import { declaredDependencies } from './support/declaredDependencies';

/**
 * Scenario: lazy-target list completeness. Two packages emit
 * byte-identical chunks — one content identity, two locations, two
 * different answer sets. A lazy delta that dedupes on content
 * identity or parent location alone can drop the only item that
 * answers the specifier it reaches, leaving the emitted bare
 * specifier to resolve late at runtime (a second fetch round). Every
 * lazy target's list must contain everything it reaches: an item
 * answering each specifier its chunks import, and the item each
 * `{item}` reference points at.
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
    mkdtempSync(join(tmpdir(), `unit-producer-lazy-${label}-`))
  );
  roots.push(root);
  return root;
}


async function produce(
  root: string,
  out: string
): Promise<ProducedSharedPackage[]> {
  return new UnitProducer({
    packageRoot: root,
    outputDir: join(root, out),
    consumerSpecifiers: declaredDependencies(root),
  }).produce((m) => {
    throw new Error(m);
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

/**
 * `twin-a` and `twin-b` ship byte-identical index modules — their
 * chunks share one content identity but answer different specifiers.
 * `kit` reaches `twin-a` statically and `twin-b` through a literal
 * `import()`: the parent list delivers the `twin-a` item, the lazy
 * delta must still emit the item answering `twin-b`.
 */
function makeTwinRoot(label: string): string {
  const root = tmpRoot(label);
  write(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'host',
      version: '0.0.0',
      dependencies: { kit: '1.0.0', 'twin-a': '1.0.0', 'twin-b': '1.0.0' },
    })
  );
  const twinSource = "export const twin = () => 'TWIN';\n";
  for (const name of ['twin-a', 'twin-b']) {
    pkg(
      root,
      name,
      { type: 'module', exports: { '.': './index.js' } },
      { 'index.js': twinSource }
    );
  }
  pkg(
    root,
    'kit',
    {
      type: 'module',
      sideEffects: false,
      exports: { '.': './index.js' },
    },
    {
      'index.js':
        "import 'twin-a';\n" +
        "export const go = () => import('twin-b');\n",
    }
  );
  return root;
}

/** Answers of every item in the list. */
function answersOf(list: ProducedFetchList): Set<string> {
  return new Set(list.items.flatMap((i) => i.answers));
}

describe('UnitProducer — lazy-target list completeness', () => {
  it('emits the item answering a specifier even when a byte-identical twin is already delivered', async () => {
    const root = makeTwinRoot('twins');
    const produced = await produce(root, 'out');
    const kit = produced.find((p) => p.name === 'kit')!;
    const list = kit.lists['kit'];
    expect(list).toBeDefined();
    // The parent list delivers the twin the static edge reaches.
    const parentLocations = new Set(list.items.map((i) => i.location));
    expect(
      [...parentLocations].some((l) => l.startsWith('twin-a@'))
    ).toBe(true);

    expect(list.lazy).toBeDefined();
    const keys = Object.keys(list.lazy!);
    expect(keys.length).toBe(1);
    const lazyDoc = list.lazy![keys[0]];
    // The lazy target's list answers the specifier it reaches — the
    // byte-identical twin's item already in the parent list does not
    // answer it, so dropping the answering record leaves the emitted
    // bare specifier to a second-round fetch.
    expect(answersOf(lazyDoc).has('twin-b')).toBe(true);
    const answering = lazyDoc.items.find((i) =>
      i.answers.includes('twin-b')
    )!;
    expect(answering.location.startsWith('twin-b@')).toBe(true);
    // The answering item's bytes are published.
    expect(existsSync(join(root, 'out', answering.location))).toBe(true);
  }, 120000);

  it('every `{item}` reference and bare specifier in the lazy delta resolves to a delivered item', async () => {
    const root = makeTwinRoot('closure');
    const produced = await produce(root, 'out');
    const kit = produced.find((p) => p.name === 'kit')!;
    const list = kit.lists['kit'];
    const lazyDoc = Object.values(list.lazy!)[0];
    const deliveredHashes = new Set([
      ...list.items.map((i) => i.contentHash),
      ...lazyDoc.items.map((i) => i.contentHash),
    ]);
    const deliveredAnswers = new Set([
      ...answersOf(list),
      ...answersOf(lazyDoc),
    ]);
    for (const item of lazyDoc.items) {
      for (const edge of item.imports) {
        if (typeof edge === 'string') {
          expect(deliveredAnswers.has(edge), edge).toBe(true);
        } else {
          expect(deliveredHashes.has(edge.unit), edge.unit).toBe(true);
        }
      }
    }
  }, 120000);
});
