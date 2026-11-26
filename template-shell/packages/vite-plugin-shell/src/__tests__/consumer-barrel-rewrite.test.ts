/**
 * The consumer half of barrel handling in the shell plugin under the
 * boot-chunk model: the host's own named imports from a side-effect-free
 * shared barrel are rewritten to the defining modules, and the emitted
 * fetch lists deliver that package through its member chunks — every
 * specifier the host chunks keep is answered by a list item, and every
 * import edge an item carries resolves to another item — so the runtime
 * mints one module instance per chunk and the host evaluates only the
 * chunks it reaches. A namespace import read only through static
 * `ns.Member` accesses is rewritten the same way; a namespace
 * used dynamically keeps the barrel and the whole-entry chunk.
 *
 * Node cannot `import()` `blob:` URLs, so the tests mint mirrors instead:
 * each emitted chunk file is mirrored with its specifiers rewritten to
 * the mirror of the item the same resolution rules name, then imported —
 * real ESM execution of exactly the bytes the chunks carry.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ConsumerBarrelFallback } from '@gears-frontx/unit-producer';
import { build } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { vitePluginShell } from '../index';

interface ListItem {
  location: string;
  contentHash: string;
  answers: string[];
  imports: Array<string | { unit: string }>;
}
interface ImportMapJson {
  imports: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
}

function makeHost(root: string, mainSource: string): void {
  const write = (rel: string, content: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  write(
    'package.json',
    JSON.stringify({ name: 'host', version: '0.0.0', type: 'module', dependencies: { icons: '1.0.0' } })
  );
  write(
    'node_modules/icons/package.json',
    JSON.stringify({ name: 'icons', version: '1.0.0', type: 'module', sideEffects: false, exports: { '.': './dist/index.js' } })
  );
  write('node_modules/icons/dist/index.js', "export { Icon } from './icons/icon.js';\nexport { Other } from './icons/other.js';\n");
  write('node_modules/icons/dist/icons/icon.js', "import { tag } from '../tag.js';\nexport const Icon = tag('ICON_BODY');\n");
  write('node_modules/icons/dist/icons/other.js', "export const Other = 'OTHER_BODY';\n");
  write('node_modules/icons/dist/tag.js', 'export const tag = (s) => s;\n');
  write(
    'index.html',
    '<!doctype html><html><head><title>h</title></head><body><script type="module" src="/src/main.js"></script></body></html>\n'
  );
  write('src/main.js', mainSource);
}

function makeNested(root: string): void {
  const write = (rel: string, content: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
  pkgJson.dependencies.nested = '1.0.0';
  write('package.json', JSON.stringify(pkgJson));
  write(
    'node_modules/nested/package.json',
    JSON.stringify({ name: 'nested', version: '1.0.0', type: 'module', sideEffects: false, exports: { '.': './dist/index.js' } })
  );
  write(
    'node_modules/nested/dist/index.js',
    "export { a } from './a/a.js';\nexport { deep } from './a/b/deep.js';\nexport { x } from './c/x.js';\nexport { util } from './util.js';\n"
  );
  write('node_modules/nested/dist/util.js', "export const util = () => 'U';\n");
  write(
    'node_modules/nested/dist/a/a.js',
    "import { util } from '../util.js';\nimport { deep } from './b/deep.js';\nexport const a = () => 'A' + util() + deep();\n"
  );
  write(
    'node_modules/nested/dist/a/b/deep.js',
    "import { util } from '../../util.js';\nexport const deep = () => 'D' + util();\n"
  );
  write(
    'node_modules/nested/dist/c/x.js',
    "import { y } from '../d/e/y.js';\nimport { util } from '../util.js';\nexport const x = () => 'X' + util() + y(false);\n"
  );
  write(
    'node_modules/nested/dist/d/e/y.js',
    "import { x } from '../../c/x.js';\nimport { deep } from '../../a/b/deep.js';\nexport const y = (again) => (again ? x() : 'Y' + deep());\n"
  );
}

function makeKit(root: string): void {
  const write = (rel: string, content: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
  pkgJson.dependencies.kit = '1.0.0';
  write('package.json', JSON.stringify(pkgJson));
  write(
    'node_modules/kit/package.json',
    JSON.stringify({ name: 'kit', version: '1.0.0', type: 'module', sideEffects: false, exports: { '.': './dist/index.js' }, dependencies: { icons: '1.0.0' } })
  );
  write('node_modules/kit/dist/index.js', "export { Button } from './button.js';\nexport { Card } from './card.js';\n");
  write(
    'node_modules/kit/dist/button.js',
    "import { Icon } from 'icons';\nexport const Button = () => 'BUTTON:' + Icon;\n"
  );
  write('node_modules/kit/dist/card.js', "export const Card = 'CARD';\n");
}

/** Extract the balanced-brace JSON object containing `marker` from a source text. */
function balancedJson(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`marker ${marker} not found`);
  const open = source.lastIndexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < source.length && source[i] !== c) {
        if (source[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`unbalanced object at ${open}`);
}

/** Resolve a relative specifier against an item location (URL rules). */
function resolveRel(fromLocation: string, spec: string): string {
  return new URL(spec, new URL(fromLocation, 'http://r/')).pathname.slice(1);
}

interface EmittedLists {
  /** The inline import map of the built `index.html`. */
  importMap: ImportMapJson;
  /** location → item, over every emitted chunk file. */
  byLocation: Map<string, ListItem>;
  /** Every emitted chunk file, as an item with the answers the import map gives it. */
  items: ListItem[];
  /** Absolute shared dir the item locations resolve under. */
  dir: string;
  /** The inline boot data decoded from the boot chunk. */
  boot: {
    units: ListItem[];
    list: { units: string[] };
  };
}

/** The emitted chunk files of a build + the inline import map and boot data. */
function readEmitted(root: string): EmittedLists {
  const shared = path.join(root, 'dist', 'shared');
  const items: ListItem[] = [];
  const byLocation = new Map<string, ListItem>();
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const location = path.relative(shared, full).split(path.sep).join('/');
        const item: ListItem = {
          location,
          contentHash: createHash('sha256').update(fs.readFileSync(full)).digest('hex'),
          answers: [],
          imports: [],
        };
        items.push(item);
        byLocation.set(location, item);
      }
    }
  };
  walk(shared);
  const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf-8');
  const map = /<script type="importmap"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  const importMap = JSON.parse(map![1]!) as ImportMapJson;
  const assets = path.join(root, 'dist', 'assets');
  const bootSource = fs
    .readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(assets, f), 'utf-8'))
    .find((s) => s.includes('"unitsBase"'))!;
  const boot = JSON.parse(
    balancedJson(bootSource, '"unitsBase"')
  ) as EmittedLists['boot'];
  return { importMap, byLocation, items, dir: shared, boot };
}

/**
 * The chunk the import map answers `specifier` with: inside the importing
 * chunk's package scope first, then at the top level (the host chunks'
 * own imports), then in any scope.
 */
function answerOf(
  emitted: EmittedLists,
  specifier: string,
  importer?: ListItem
): ListItem | undefined {
  const { imports, scopes = {} } = emitted.importMap;
  // The importing chunk's package scope: the scope URL ends with the
  // directory the chunk sits in.
  const dir = importer?.location.slice(0, importer.location.lastIndexOf('/') + 1);
  const scope =
    dir === undefined
      ? undefined
      : scopes[Object.keys(scopes).find((key) => key.endsWith(`/shared/${dir}`)) ?? ''];
  const url =
    scope?.[specifier] ??
    imports[specifier] ??
    Object.values(scopes).find((other) => other[specifier] !== undefined)?.[specifier];
  return url === undefined ? undefined : emitted.byLocation.get(url.replace(/^\.?\/shared\//, ''));
}

/** The item answering `specifier` at the host chunks' top level. */
function entryItem(emitted: EmittedLists, specifier: string): ListItem | undefined {
  return answerOf(emitted, specifier);
}

/**
 * Mirrors a chunk file, rewriting each specifier the way the minter
 * does — bare specifiers to the answering item's mirror, relative
 * specifiers to the item at the resolved location — then imports the
 * mirror.
 */
async function loadItem(
  root: string,
  emitted: EmittedLists,
  specifier: string
): Promise<Record<string, unknown>> {
  const mirror = path.join(root, 'mirror');
  const mirrored = new Map<string, string>();
  const visit = (item: ListItem): string => {
    const target = path.join(mirror, `${item.contentHash}.mjs`);
    const known = mirrored.get(target);
    if (known !== undefined) return known;
    mirrored.set(target, target);
    const text = fs.readFileSync(path.join(emitted.dir, item.location), 'utf-8').replace(
      /(from|import)(\s*["'])([^"']+)(["'])/g,
      (_whole, kind: string, gap: string, spec: string, quote: string) => {
        let resolved: ListItem | undefined;
        if (spec.startsWith('./') || spec.startsWith('../')) {
          resolved = emitted.byLocation.get(resolveRel(item.location, spec));
          if (resolved === undefined) {
            // Emitted relative refs name the deterministic chunk name
            // (`<stem>.js`); the item location hashes it — match by stem.
            const stem = spec.replace(/\.js$/, '').split('/').pop()!;
            resolved = emitted.items.find(
              (i) =>
                i.location
                  .split('/')
                  .pop()!
                  .replace(/\.[0-9a-f]{64}\.js$/, '') === stem
            );
          }
        } else {
          resolved = answerOf(emitted, spec, item);
        }
        if (resolved === undefined) {
          throw new Error(`"${spec}" in ${item.location} resolves to no item`);
        }
        return `${kind}${gap}${pathToFileURL(visit(resolved)).href}${quote}`;
      }
    );
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    return target;
  };
  const entry = entryItem(emitted, specifier);
  if (entry === undefined) throw new Error(`'${specifier}' names no list item`);
  return (await import(pathToFileURL(visit(entry)).href)) as Record<string, unknown>;
}

async function buildHost(root: string): Promise<EmittedLists & { chunks: string }> {
  await build({
    root,
    logLevel: 'silent',
    plugins: [vitePluginShell()],
    build: { outDir: 'dist', emptyOutDir: true, minify: false },
  });
  const assets = path.join(root, 'dist', 'assets');
  const chunks = fs
    .readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(assets, f), 'utf-8'))
    .join('\n');
  return { ...readEmitted(root), chunks };
}

/** The units the inline boot list names. */
function bootUnits(emitted: EmittedLists): ListItem[] {
  const named = new Set(emitted.boot.list.units);
  return emitted.boot.units.filter((u) => named.has(u.contentHash));
}

/** The specifiers the inline boot list answers. */
function bootAnswers(emitted: EmittedLists): Set<string> {
  return new Set(bootUnits(emitted).flatMap((i) => i.answers));
}

describe('vitePluginShell consumer barrel rewrite (boot-chunk model)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vpsh-barrel-')));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('rewrites the host import to the defining module and the list answers it through member chunks', async () => {
    const root = path.join(tmp, 'host');
    makeHost(root, "import { Icon } from 'icons';\nconsole.log(Icon);\n");
    const emitted = await buildHost(root);

    expect(emitted.chunks).toMatch(/from\s*["']icons\/dist\/icons\/icon\.js["']/);
    expect(emitted.chunks).not.toMatch(/from\s*["']icons["']/);
    // The rewritten specifier is answered by a boot-list item — and
    // only the chunks it reaches are listed (the unused member's chunk
    // is not on the list).
    const answers = bootAnswers(emitted);
    expect(answers.has('icons/dist/icons/icon.js')).toBe(true);
    // Only the used member's chunk is listed: the unused `other.js`
    // member and the barrel itself answer nothing on the boot list.
    expect(
      bootUnits(emitted).some(
        (i) => i.location.includes('dist-icons-other') || i.location.includes('dist-index')
      )
    ).toBe(false);
    const mod = await loadItem(root, emitted, 'icons/dist/icons/icon.js');
    expect((mod as { Icon: string }).Icon).toBe('ICON_BODY');
  });

  it('loads a package with nested modules across its chunks', async () => {
    const root = path.join(tmp, 'host');
    makeHost(root, "import { a, x } from 'nested';\nconsole.log(a(), x());\n");
    makeNested(root);
    const emitted = await buildHost(root);
    expect(entryItem(emitted, 'nested/dist/a/a.js')).toBeDefined();
    expect(entryItem(emitted, 'nested/dist/c/x.js')).toBeDefined();
    // Every relative import of every emitted item resolves to a sibling
    // item — deterministic chunk names match by stem under the hashed
    // locations.
    for (const item of emitted.items) {
      const text = fs.readFileSync(path.join(emitted.dir, item.location), 'utf-8');
      for (const m of text.matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+)["']/g)) {
        const stem = m[1].replace(/\.js$/, '').split('/').pop()!;
        const owner =
          emitted.byLocation.get(resolveRel(item.location, m[1])) ??
          emitted.items.find(
            (i) =>
              i.location
                .split('/')
                .pop()!
                .replace(/\.[0-9a-f]{64}\.js$/, '') === stem
          );
        expect(owner, `${item.location} "${m[1]}"`).toBeDefined();
      }
    }
    const a = await loadItem(root, emitted, 'nested/dist/a/a.js');
    const x = await loadItem(root, emitted, 'nested/dist/c/x.js');
    expect((a.a as () => string)()).toBe('AUDU');
    expect((x.x as () => string)()).toBe('XUYDU');
  });

  it('loads the icons a shared kit chunk imports through their own chunks', async () => {
    const root = path.join(tmp, 'host');
    makeHost(root, "import { Button } from 'kit';\nconsole.log(Button());\n");
    makeKit(root);
    const emitted = await buildHost(root);
    const buttonItem = entryItem(emitted, 'kit/dist/button.js');
    expect(buttonItem).toBeDefined();
    const buttonText = fs.readFileSync(path.join(emitted.dir, buttonItem!.location), 'utf-8');
    expect(buttonText).toMatch(/from\s*["']icons\/dist\/icons\/icon\.js["']/);
    const kitMod = await loadItem(root, emitted, 'kit/dist/button.js');
    expect((kitMod.Button as () => string)()).toBe('BUTTON:ICON_BODY');
  });

  it('loads a subpath entry whose chunk imports sibling chunks', async () => {
    const root = path.join(tmp, 'host');
    makeHost(root, "import { feature } from 'subs/feature';\nconsole.log(feature());\n");
    const write = (rel: string, content: string): void => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), content);
    };
    const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    pkgJson.dependencies.subs = '1.0.0';
    write('package.json', JSON.stringify(pkgJson));
    write(
      'node_modules/subs/package.json',
      JSON.stringify({
        name: 'subs',
        version: '1.0.0',
        type: 'module',
        exports: { '.': './esm/index.mjs', './feature': './esm/feature/main.mjs' },
      })
    );
    write('node_modules/subs/esm/index.mjs', "export { helper } from './shared.mjs';\n");
    write('node_modules/subs/esm/shared.mjs', "export const helper = () => 'HELPER';\n");
    write(
      'node_modules/subs/esm/feature/main.mjs',
      "import { helper } from '../shared.mjs';\nexport const feature = () => 'FEATURE:' + helper();\n"
    );
    const emitted = await buildHost(root);
    expect(bootAnswers(emitted).has('subs/feature')).toBe(true);
    const feature = await loadItem(root, emitted, 'subs/feature');
    expect((feature.feature as () => string)()).toBe('FEATURE:HELPER');
  });

  it('rewrites a namespace import read only through static member accesses', async () => {
    const root = path.join(tmp, 'host');
    makeHost(root, "import * as I from 'icons';\nconsole.log(I.Icon);\n");
    const emitted = await buildHost(root);

    // `I.Icon` is statically resolvable, so it is carried to the
    // defining module exactly like `import { Icon } from 'icons'`.
    expect(emitted.chunks).toMatch(/from\s*["']icons\/dist\/icons\/icon\.js["']/);
    expect(emitted.chunks).not.toMatch(/from\s*["']icons["']/);
    expect(bootAnswers(emitted).has('icons/dist/icons/icon.js')).toBe(true);
    const mod = await loadItem(root, emitted, 'icons/dist/icons/icon.js');
    expect((mod as { Icon: string }).Icon).toBe('ICON_BODY');
  });

  it('keeps the barrel for a namespace import used dynamically', async () => {
    const root = path.join(tmp, 'host');
    // `I` is passed whole — not a static `I.Member` read — so the
    // namespace import cannot be rewritten and the barrel stands.
    makeHost(root, "import * as I from 'icons';\nconsole.log(I);\n");
    const emitted = await buildHost(root);

    expect(emitted.chunks).toMatch(/from\s*["']icons["']/);
    // The package-name specifier is answered by a boot-list item.
    expect(bootAnswers(emitted).has('icons')).toBe(true);
  });

  it('answers the barrel specifiers the fallback reverts the host chunks to, through the import map and the boot list', async () => {
    const root = path.join(tmp, 'host');
    makeHost(root, "import { Icon } from 'icons';\nconsole.log(Icon);\n");
    const target = 'icons/dist/icons/icon.js';
    // The fallback turning the rewrite back to the barrel, as it does when
    // no produced unit answers the rewritten specifier.
    const apply = vi.spyOn(ConsumerBarrelFallback, 'apply').mockImplementation((params) => {
      for (const chunk of params.chunks) {
        if (!chunk.imports.includes(target)) continue;
        const file = path.join(params.outDir, chunk.fileName);
        fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').split(target).join('icons'));
        chunk.imports.splice(chunk.imports.indexOf(target), 1, 'icons');
      }
      return new Map([[target, 'reverted for the test']]);
    });
    try {
      const emitted = await buildHost(root);

      expect(emitted.chunks).toMatch(/from\s*["']icons["']/);
      expect(emitted.importMap.imports['icons']).toBeDefined();
      expect(emitted.importMap.imports[target]).toBeUndefined();
      expect(bootAnswers(emitted).has('icons')).toBe(true);
      const mod = await loadItem(root, emitted, 'icons');
      expect((mod as { Icon: string }).Icon).toBe('ICON_BODY');
    } finally {
      apply.mockRestore();
    }
  });
});
