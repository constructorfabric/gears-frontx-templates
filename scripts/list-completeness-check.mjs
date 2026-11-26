/**
 * Build-time list-completeness gate:
 * every chunk reachable from an entry is on its list. Walks each built
 * output's fetch lists — each fixture manifest's `lists`, resolved through
 * its unit table `units`, plus the shell's inline boot list and its lazy
 * lists — and fails on a violated list leg: a content identity a list
 * names that the unit table does not hold, a `{ unit }` edge no unit on
 * the list or its parent chain answers, a specifier edge of a delivered
 * package nothing answers, a unit naming a missing or mismatched chunk, a
 * nested list repeating a chunk the parent chain already carries, or a
 * specifier two units of the combined lists both answer.
 *
 * CLI entry: `node scripts/list-completeness-check.mjs [--shell-dist <dir>]`
 * (exit 0 on success). Runs after the builds (each fixture's `vite build`,
 * the shell's `vite build`). `--shell-dist` is relative to the checked root
 * (default `template-shell/dist`); the composed CI copy builds the shell to
 * `dist`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { checkOutputLists, distPathOfUrl, resolveList, sharedDir, unitsByHash, unitsDirOf } from './shared-unit-reach.mjs';
import { findMfePackageDirs } from './evaluation-scope-check.mjs';

const MFE_PACKAGES_REL = path.join('template-mfe', 'src-app', 'mfe_packages');
const MANIFEST_REL = path.join('dist', 'mfe-manifest.json');
const SHELL_DIST_REL = path.join('template-shell', 'dist');

/** Extract the shell boot data (`unitsBase`, `units`, `list`) embedded in the emitted fill chunk. */
export function readBootData(shellDist) {
  for (const entry of fs.readdirSync(shellDist, { withFileTypes: true })) {
    const dir = entry.isDirectory() ? path.join(shellDist, entry.name) : shellDist;
    for (const file of fs.readdirSync(dir)) {
      if (!/frontx-shell-fill-[^/]*\.js$/.test(file)) continue;
      const text = fs.readFileSync(path.join(dir, file), 'utf-8');
      const runAt = text.indexOf('.run({');
      if (runAt === -1) continue;
      let depth = 0;
      let end = -1;
      for (let i = text.indexOf('{', runAt); i < text.length; i += 1) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end !== -1) {
        try {
          return JSON.parse(text.slice(text.indexOf('{', runAt), end + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * The same completeness legs applied to the shell's inline boot data:
 * every item chunk exists under `unitsBase` with matching bytes, edges
 * resolve, and no lazy list repeats a boot-list chunk.
 *
 * @param {string} shellDist
 * @returns {string[]}
 */
export function checkBootLists(shellDist) {
  const boot = readBootData(shellDist);
  if (
    boot === null ||
    typeof boot.list !== 'object' ||
    !Array.isArray(boot.list?.units) ||
    !Array.isArray(boot.units)
  ) {
    return ['shell fill chunk carries no readable fill data (.run({...}))'];
  }
  const unitsDir = unitsDirOf(boot.unitsBase);
  const base = path.resolve(shellDist, unitsDir);
  const violations = [];
  const byHash = unitsByHash(boot.units);
  const missing = [];
  const docs = [{ rel: '(boot list)', doc: resolveList(boot.list, byHash, missing) }];
  for (const hash of new Set(missing)) {
    violations.push(`boot data names content identity ${hash}, which its unit table does not hold`);
  }
  // The native boot's import map must point into the emitted shared dir.
  const htmlPath = path.join(shellDist, 'index.html');
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf-8') : '';
  const mapMatch = /<script type="importmap"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (mapMatch === null) {
    violations.push('emitted index.html carries no inline import map for the shared chunks');
  } else {
    const map = JSON.parse(mapMatch[1]);
    for (const record of [map.imports ?? {}, ...Object.values(map.scopes ?? {})]) {
      for (const [spec, url] of Object.entries(record)) {
        const rel = distPathOfUrl(String(url), unitsDir);
        if (!fs.existsSync(path.join(shellDist, rel))) {
          violations.push(`import map: specifier "${spec}" points at "${url}", which is not an emitted file`);
        }
      }
    }
  }
  const answers = new Set();
  for (const { doc } of docs) for (const i of doc.items ?? []) for (const a of i.answers ?? []) answers.add(a);
  const bootHashes = new Set(docs[0].doc.items.map((i) => i.contentHash));
  // A lazy doc's parent chain is the boot list alone — its edges must
  // resolve on that chain, not on the union of every emitted answer
  // (an edge answered only by a different parent's items
  // leaves a native second-round fetch).
  const bootAnswers = new Set(docs[0].doc.items.flatMap((i) => i.answers ?? []));
  for (const { rel, doc } of docs) {
    const isLazy = rel !== '(boot list)';
    for (const item of doc.items ?? []) {
      if (isLazy && bootHashes.has(item.contentHash)) {
        violations.push(`${rel}: carries chunk ${item.contentHash} ("${item.location}") the boot list already delivers — lazy lists hold only the delta`);
      }
      const file = path.join(base, item.location);
      if (!fs.existsSync(file)) {
        violations.push(`${rel}: item names chunk "${item.location}" but no such file exists`);
      } else {
        const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        if (actual !== item.contentHash) {
          violations.push(`${rel}: item "${item.location}" declares contentHash ${item.contentHash} but file SHA-256 is ${actual}`);
        }
      }
      for (const edge of item.imports ?? []) {
        if (typeof edge !== 'string') {
          const onList = (doc.items ?? []).some((i) => i.contentHash === edge.unit) || (isLazy && bootHashes.has(edge.unit));
          if (!onList) {
            violations.push(`${rel}: resolved unit edge ${edge.unit} of "${item.location}" has no answering item on this list or its parent chain`);
          }
          continue;
        }
        const root = edge.startsWith('@') ? edge.split('/').slice(0, 2).join('/') : edge.split('/')[0];
        if (edge.startsWith('node:')) continue;
        const onChain = isLazy
          ? (doc.items ?? []).some((i) => (i.answers ?? []).includes(edge)) || bootAnswers.has(edge)
          : (doc.items ?? []).some((i) => (i.answers ?? []).includes(edge));
        if (!onChain && answers.has(edge)) {
          violations.push(`${rel}: specifier "${edge}" imported by "${item.location}" is answered by no item on this list or its parent chain`);
        } else if (!answers.has(edge) && (doc.items ?? []).some((i) => (i.answers ?? []).some((a) => a === edge || a.startsWith(`${root}/`)))) {
          violations.push(`${rel}: specifier "${edge}" imported by "${item.location}" is answered by no emitted item`);
        }
      }
    }
  }
  return violations;
}

function check({ rootDir, shellDistRel, log, logError }) {
  const failures = [];
  const shellDist = path.resolve(rootDir, shellDistRel);
  if (!fs.existsSync(shellDist)) {
    failures.push(`no shell build at ${shellDist} — build the shell first`);
  } else {
    for (const v of checkBootLists(shellDist)) failures.push(`template-shell: ${v}`);
    log('[list-completeness] template-shell: boot data checked');
  }

  const mfePackagesDir = path.join(rootDir, MFE_PACKAGES_REL);
  const dirs = findMfePackageDirs(mfePackagesDir);
  if (dirs.length === 0) {
    failures.push(`no MFE fixtures found under ${mfePackagesDir}`);
  }
  for (const dir of dirs) {
    const name = path.basename(dir);
    const manifestPath = path.join(dir, MANIFEST_REL);
    if (!fs.existsSync(manifestPath)) {
      failures.push(`${name}: no emitted manifest at ${manifestPath} — build the fixture first`);
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).manifest;
    const base = sharedDir(path.dirname(manifestPath), manifest);
    for (const v of checkOutputLists(manifest, base)) failures.push(`${name}: ${v}`);
    log(`[list-completeness] ${name}: emitted lists checked`);
  }

  if (failures.length > 0) {
    for (const failure of failures) logError(`[list-completeness] FAIL: ${failure}`);
    return 1;
  }
  log('[list-completeness] PASS: every chunk reachable from an entry is on its list');
  return 0;
}

export function runCli(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const argv = options.argv ?? [];
  const log = options.log ?? console.log;
  const logError = options.logError ?? console.error;
  try {
    const i = argv.indexOf('--shell-dist');
    if (i !== -1 && argv[i + 1] === undefined) throw new Error('--shell-dist needs a value');
    const shellDistRel = i === -1 ? SHELL_DIST_REL : argv[i + 1];
    return check({ rootDir, shellDistRel, log, logError });
  } catch (error) {
    logError(`[list-completeness] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) process.exitCode = runCli({ argv: process.argv.slice(2) });
