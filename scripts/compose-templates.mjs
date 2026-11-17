/**
 * Lays the templates out the way `frontx apply` would, from the batch in
 * `frontx-composition.json`: every template's payload (its directory minus the
 * manifest, minus its `.frontx/ai/<name>/` bundle, minus its declared
 * `excludedSubtrees`, minus `node_modules`) lands under its target, and each
 * bundle lands at `.frontx/ai/<name>/` of the composed root. Nested
 * `package-lock.json` files are dropped, as the shell's own install
 * reconciles the composed workspaces (its lockfile knows nothing of them).
 *
 * Both CI (`main.yml`'s composition step) and the local dev loop
 * (`npm run compose:templates -- --out .harness`) use this one layout, so the
 * tree that is built, type-checked and tested is the tree a project gets.
 * This script is not the CLI: once `@gears-frontx/cli` 0.4.0 is the pinned
 * devDependency, the CI step can become `frontx register`/`frontx apply` over
 * the same batch, and this script stays for the lockfile-free dev loop.
 *
 * CLI entry: `node scripts/compose-templates.mjs --out <dir> [--root <repo>]`;
 * `--out` must not exist yet. Exit 0 on success, 1 on a refused layout.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { MANIFEST_FILENAME, findTemplateDirs } from './template-discovery.mjs';

export const COMPOSITION_FILENAME = 'frontx-composition.json';
// The directories the CLI leaves out of a `path:` origin's payload
// (`adapters/local-fetch.ts`), so a locally composed tree matches an applied one.
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'dist-lib', 'dist-ssr', '.git', 'coverage', '.cache', '.vite']);

/** @param {string} value */
function withoutTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Reads the batch: template name -> targets (project-relative, `.` for the root).
 * @param {string} rootDir
 * @returns {Record<string, string[]>}
 */
export function readComposition(rootDir) {
  const file = path.join(rootDir, COMPOSITION_FILENAME);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const templates = parsed?.templates;
  if (templates === null || typeof templates !== 'object' || Array.isArray(templates)) {
    throw new Error(`${COMPOSITION_FILENAME}: "templates" must be an object of template name -> targets`);
  }
  for (const [name, targets] of Object.entries(templates)) {
    if (!Array.isArray(targets) || targets.length === 0 || targets.some((t) => typeof t !== 'string' || t === '')) {
      throw new Error(`${COMPOSITION_FILENAME}: "${name}" must list at least one target`);
    }
    for (const target of targets) {
      if (path.posix.isAbsolute(target) || target.split('/').some((seg) => seg === '..')) {
        throw new Error(`${COMPOSITION_FILENAME}: "${name}" target "${target}" must be a relative path without ".."`);
      }
    }
  }
  return templates;
}

/**
 * The templates on disk, each with its manifest, bundle folder and payload rule.
 * @param {string} rootDir
 */
export function readTemplates(rootDir) {
  return findTemplateDirs(rootDir).map((dir) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_FILENAME), 'utf8'));
    const excludedSubtrees = (manifest.excludedSubtrees ?? []).map(withoutTrailingSlash);
    return { dir, name: manifest.name, excludedSubtrees, bundle: `.frontx/ai/${manifest.name}` };
  });
}

/**
 * Whether a template-relative file is payload: not the manifest, not the
 * bundle, not inside a declared exclusion.
 * @param {string} relPath
 * @param {{ excludedSubtrees: string[]; bundle: string }} template
 */
export function isPayload(relPath, template) {
  if (relPath === MANIFEST_FILENAME) return false;
  // `.frontx/` is CLI-reserved ground: a template's own bundle is delivered by
  // the CLI's bundle step, anything else under it never reaches a project.
  if (relPath === '.frontx' || relPath.startsWith('.frontx/')) return false;
  return !template.excludedSubtrees
    .map(withoutTrailingSlash)
    .some((subtree) => relPath === subtree || relPath.startsWith(`${subtree}/`));
}

/** @param {string} dir */
function* walk(dir, rel = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relPath = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name), relPath);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      yield relPath;
    }
  }
}

/**
 * @param {{ rootDir: string; outDir: string; log?: (line: string) => void }} options
 * @returns {{ files: number; bundles: number }}
 */
export function compose({ rootDir, outDir, log = () => {} }) {
  if (fs.existsSync(outDir)) throw new Error(`refusing to compose into an existing path: ${outDir}`);
  const batch = readComposition(rootDir);
  const templates = readTemplates(rootDir);
  const byName = new Map(templates.map((t) => [t.name, t]));
  for (const name of Object.keys(batch)) {
    if (!byName.has(name)) throw new Error(`${COMPOSITION_FILENAME} names "${name}", which no template directory declares`);
  }
  /** @type {Map<string, string>} project path -> owner */
  const written = new Map();
  let files = 0;
  let bundles = 0;
  for (const [name, targets] of Object.entries(batch)) {
    const template = byName.get(name);
    const payload = [...walk(template.dir)].filter((rel) => isPayload(rel, template));
    for (const target of targets) {
      for (const rel of payload) {
        if (path.posix.basename(rel) === 'package-lock.json' && target !== '.') continue;
        const projectPath = target === '.' ? rel : `${target}/${rel}`;
        const owner = written.get(projectPath);
        if (owner !== undefined) throw new Error(`"${projectPath}" is written by both ${owner} and ${name}`);
        written.set(projectPath, name);
        const to = path.join(outDir, projectPath);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(path.join(template.dir, rel), to);
        files += 1;
      }
      log(`==> ${name} -> ${target}/ (${payload.length} payload file(s))`);
    }
    const bundleDir = path.join(template.dir, template.bundle);
    if (fs.existsSync(bundleDir)) {
      fs.cpSync(bundleDir, path.join(outDir, template.bundle), { recursive: true });
      bundles += 1;
    }
  }
  return { files, bundles };
}

export function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: { out: { type: 'string' }, root: { type: 'string' } }, strict: true });
  if (!values.out) {
    console.error('usage: node scripts/compose-templates.mjs --out <dir> [--root <repo>]');
    return 2;
  }
  const rootDir = path.resolve(values.root ?? process.cwd());
  const outDir = path.resolve(values.out);
  try {
    const { files, bundles } = compose({ rootDir, outDir, log: console.log });
    console.log(`Composed ${files} file(s) and ${bundles} AI bundle(s) into ${outDir}`);
    return 0;
  } catch (error) {
    console.error(`[compose-templates] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli();
}
