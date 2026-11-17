/**
 * Seeded .gitignore CI Guard.
 *
 * A `.gitignore` a template ships lands in every project applied from it, so
 * a rule written for this repository's own dev loop becomes a rule of the
 * team's project. `template-shell/.gitignore` once carried
 * `src-app/mfe_packages/*` (meant for MFE packages composed into
 * template-shell here for local testing): in a project it hid every MFE
 * package `frontx apply` brought in, so `git add -A` tracked none of them and
 * a teammate's clone had no MFEs at all.
 *
 * The rule: no `.gitignore` a template ships may ignore ground any template
 * puts into a project. Under the four-field manifest contract a template's
 * payload is its whole directory (minus the manifest, its `.frontx/ai/<name>/`
 * bundle and its declared `excludedSubtrees`), laid out under the target the
 * batch in `frontx-composition.json` names for it; the bundle lands at
 * `.frontx/ai/<name>/`; an `excludedSubtrees` entry is ground reserved for a
 * nested template, so whatever a project adds there is template ground too.
 *
 * Which `.gitignore` files ship: every `.gitignore` git tracks inside a
 * template directory (`git ls-files`, so an untracked one in a developer
 * checkout never counts) that is payload. Each is laid out at its project
 * path in a scratch git repository together with probes, and
 * `git check-ignore` says which probes a shipped rule would hide:
 * - one per tracked payload file and per tracked bundle file, at its project
 *   path;
 * - per `excludedSubtrees` entry (at its project path): the directory itself;
 *   a file directly inside it with every extension the templates nested there
 *   ship (and none); a directory inside it holding `package.json` and every
 *   nested-template file at its path relative to that template's target - the
 *   shape of a package the team adds next to the shipped ones.
 *
 * CLI entry: `node scripts/seeded-gitignore-check.mjs` (exit 0 on success).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { COMPOSITION_FILENAME, isPayload, readComposition } from './compose-templates.mjs';
import { MANIFEST_FILENAME, findTemplateDirs } from './template-discovery.mjs';

/** File name of the child probe placed inside an excluded subtree. */
export const CHILD_PROBE_NAME = 'seeded-gitignore-probe';
/** Directory name of the child directory probe placed inside an excluded subtree. */
export const CHILD_PROBE_DIR = 'seeded-gitignore-probe-dir';

/** @param {string} value */
function withoutTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/** @param {string} value */
function toPosix(value) {
  return value.split(path.sep).join('/');
}

/**
 * The guard spawns git twice: both runs must see neither the caller's
 * repository (a `GIT_DIR` an outer hook exported) nor the user's config.
 */
export function isolatedGitEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  return { ...env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' };
}

/**
 * @param {string} target project-relative target, `.` for the root
 * @param {string} relPath path relative to the template directory
 */
export function projectPath(target, relPath) {
  return target === '.' ? relPath : `${target}/${relPath}`;
}

/**
 * @typedef {{ dir: string; name: string; excludedSubtrees: string[]; bundle: string; targets: string[] }} Template
 * @typedef {{ template: Template; relPath: string; projectPath: string; absPath: string }} ShippedGitignore
 * @typedef {{ template: Template; boundary: string; probe: string; isDir: boolean; kind: 'tracked' | 'excluded' | 'child' }} Probe
 * @typedef {{ gitignore: ShippedGitignore; line: number; pattern: string; probe: Probe }} Violation
 */

/**
 * Reads one template's manifest and its targets from the batch. The manifest
 * is read defensively: a malformed one is reported, never guessed around.
 *
 * @param {string} templateDir
 * @param {string} rootDir
 * @param {Record<string, string[]>} batch
 * @returns {Template}
 */
export function readTemplate(templateDir, rootDir, batch) {
  const manifestPath = path.join(templateDir, MANIFEST_FILENAME);
  const where = toPosix(path.relative(rootDir, manifestPath));
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`${where}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${where}: the manifest is not a JSON object`);
  }
  const manifest = /** @type {{ name?: unknown; excludedSubtrees?: unknown }} */ (parsed);
  const name = typeof manifest.name === 'string' ? manifest.name : path.basename(templateDir);
  const excluded = manifest.excludedSubtrees;
  const excludedSubtrees =
    excluded === undefined ? [] : Array.isArray(excluded) ? excluded.map((e) => (typeof e === 'string' ? e : '')) : [''];
  const targets = batch[name];
  if (targets === undefined) {
    throw new Error(`${where}: "${name}" has no target in ${COMPOSITION_FILENAME}; add the batch entry a project applies it with`);
  }
  return { dir: templateDir, name, excludedSubtrees, bundle: `.frontx/ai/${name}`, targets };
}

/**
 * Whether a template-relative file is shipped: payload (laid out under the
 * target) or bundle (laid out at `.frontx/ai/<name>/`).
 * @param {string} relPath
 * @param {Template} template
 */
export function isShipped(relPath, template) {
  return isPayload(relPath, template) || relPath.startsWith(`${template.bundle}/`);
}

/** @param {string} rootDir @param {Template} template @param {string[]} trackedFiles */
function templateRelative(rootDir, template, trackedFiles) {
  const prefix = `${toPosix(path.relative(rootDir, template.dir))}/`;
  return trackedFiles.filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length));
}

/**
 * Every project path a shipped template-relative file lands at: one per
 * target for payload, the bundle path for bundle files.
 * @param {Template} template @param {string} relPath
 */
function landingPaths(template, relPath) {
  if (relPath.startsWith(`${template.bundle}/`)) return [relPath];
  return template.targets.map((target) => projectPath(target, relPath));
}

/**
 * The tracked `.gitignore` files that ship, with the project path each lands at.
 * @param {string} rootDir @param {Template[]} templates @param {string[]} trackedFiles
 * @returns {ShippedGitignore[]}
 */
export function findShippedGitignores(rootDir, templates, trackedFiles) {
  return templates.flatMap((template) =>
    templateRelative(rootDir, template, trackedFiles)
      .filter((relPath) => path.posix.basename(relPath) === '.gitignore' && isPayload(relPath, template))
      .flatMap((relPath) =>
        landingPaths(template, relPath).map((landed) => ({
          template,
          relPath,
          projectPath: landed,
          absPath: path.join(template.dir, relPath),
        })),
      )
      .filter(({ absPath }) => fs.existsSync(absPath)),
  );
}

/**
 * `excludedSubtrees` entries and targets that are not usable project paths.
 * @param {string} rootDir @param {Template[]} templates
 */
export function findUnsafeBoundaries(rootDir, templates) {
  const unsafe = (value) =>
    value === '' ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    value.split(/[\\/]/).some((segment) => segment === '.' || segment === '..');
  return templates.flatMap((template) => {
    const where = `${toPosix(path.relative(rootDir, template.dir))} (${template.name})`;
    return [
      ...template.excludedSubtrees
        .filter((entry) => unsafe(withoutTrailingSlash(entry)) || !entry.endsWith('/'))
        .map(
          (entry) =>
            `${where} declares excludedSubtrees entry "${entry}": ` +
            'an entry must be a non-empty relative directory path ending in "/" without "." or ".." segments',
        ),
      ...template.targets
        .filter((target) => target !== '.' && unsafe(target))
        .map(
          (target) =>
            `${where} is applied to target "${target}": ` +
            'a target must be "." or a non-empty relative path without "." or ".." segments',
        ),
    ];
  });
}

/**
 * Two templates shipping a `.gitignore` to the same project path: one would
 * overwrite the other.
 * @param {string} rootDir @param {ShippedGitignore[]} gitignores
 */
export function findGitignoreCollisions(rootDir, gitignores) {
  /** @type {Map<string, ShippedGitignore[]>} */
  const byPath = new Map();
  /** @type {string[]} */
  const collisions = [];
  for (const gitignore of gitignores) {
    const shipped = byPath.get(gitignore.projectPath) ?? [];
    for (const earlier of shipped) {
      collisions.push(
        `${gitignore.projectPath} is shipped by both ${toPosix(path.relative(rootDir, earlier.template.dir))} and ` +
          `${toPosix(path.relative(rootDir, gitignore.template.dir))}: one would overwrite the other in a project`,
      );
    }
    shipped.push(gitignore);
    byPath.set(gitignore.projectPath, shipped);
  }
  return collisions;
}

/** @param {string} value @param {string} dir */
function within(value, dir) {
  return value === dir || value.startsWith(`${dir}/`);
}

/**
 * See the module header for the probe set.
 * @param {string} rootDir @param {Template[]} templates @param {string[]} trackedFiles
 * @returns {Probe[]}
 */
export function buildProbes(rootDir, templates, trackedFiles) {
  /** @type {Probe[]} */
  const probes = [];
  /** @type {{ template: Template; target: string; relPath: string; projectPath: string }[]} */
  const shipped = [];
  for (const template of templates) {
    for (const relPath of templateRelative(rootDir, template, trackedFiles)) {
      if (!isShipped(relPath, template)) continue;
      if (relPath.startsWith(`${template.bundle}/`)) {
        shipped.push({ template, target: '.', relPath, projectPath: relPath });
        probes.push({ template, boundary: template.bundle, probe: relPath, isDir: false, kind: 'tracked' });
        continue;
      }
      for (const target of template.targets) {
        const landed = projectPath(target, relPath);
        shipped.push({ template, target, relPath, projectPath: landed });
        probes.push({ template, boundary: target, probe: landed, isDir: false, kind: 'tracked' });
      }
    }
  }
  for (const template of templates) {
    for (const target of template.targets) {
      for (const entry of template.excludedSubtrees) {
        const boundary = projectPath(target, withoutTrailingSlash(entry));
        probes.push({ template, boundary, probe: boundary, isDir: true, kind: 'excluded' });
        const nested = shipped.filter((file) => file.target !== '.' && within(file.target, boundary));
        const extensions = new Set(nested.map((file) => path.posix.extname(file.relPath)));
        extensions.add('');
        for (const extension of [...extensions].sort()) {
          probes.push({ template, boundary, probe: `${boundary}/${CHILD_PROBE_NAME}${extension}`, isDir: false, kind: 'child' });
        }
        // A package the team adds next to the shipped ones: every nested file
        // at its path below the first directory under the reserved subtree.
        const childRels = new Set([
          'package.json',
          ...nested.map((file) => file.projectPath.slice(boundary.length + 1).split('/').slice(1).join('/')).filter((rel) => rel !== ''),
        ]);
        for (const rel of [...childRels].sort()) {
          probes.push({ template, boundary, probe: `${boundary}/${CHILD_PROBE_DIR}/${rel}`, isDir: false, kind: 'child' });
        }
      }
    }
  }
  return probes;
}

/** @param {string} workDir @param {string} relPath */
function insideWorkDir(workDir, relPath) {
  const target = path.resolve(workDir, relPath);
  if (!target.startsWith(`${workDir}${path.sep}`)) throw new Error(`probe path escapes the scratch repository: ${relPath}`);
  return target;
}

/**
 * Lays the shipped `.gitignore` files and the probes out in a scratch git
 * repository and asks `git check-ignore` which probes a shipped rule hides.
 * @param {ShippedGitignore[]} gitignores @param {Probe[]} probes
 * @returns {Violation[]}
 */
export function findViolations(gitignores, probes) {
  if (gitignores.length === 0 || probes.length === 0) return [];
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-seeded-gitignore-'));
  try {
    const env = isolatedGitEnv();
    const init = spawnSync('git', ['init', '-q'], { cwd: workDir, env, encoding: 'utf8' });
    if (init.status !== 0) throw new Error(`git init failed: ${init.stderr || init.error?.message}`);
    const dirs = new Set();
    const addParents = (relPath) => {
      for (let dir = path.posix.dirname(relPath); dir !== '.' && dir !== '/'; dir = path.posix.dirname(dir)) dirs.add(dir);
    };
    for (const gitignore of gitignores) addParents(gitignore.projectPath);
    for (const { probe, isDir } of probes) {
      addParents(probe);
      if (isDir) dirs.add(probe);
    }
    for (const dir of dirs) fs.mkdirSync(insideWorkDir(workDir, dir), { recursive: true });
    const byPath = new Map();
    for (const gitignore of gitignores) {
      byPath.set(gitignore.projectPath, gitignore);
      fs.copyFileSync(gitignore.absPath, insideWorkDir(workDir, gitignore.projectPath));
    }
    for (const { probe } of probes) {
      const target = insideWorkDir(workDir, probe);
      if (!dirs.has(probe) && !fs.existsSync(target)) fs.writeFileSync(target, '');
    }
    const uniqueProbes = [...new Set(probes.map((probe) => probe.probe))];
    const result = spawnSync(
      'git',
      ['-c', `core.excludesFile=${os.devNull}`, '-c', 'core.ignoreCase=false', 'check-ignore', '--no-index', '--verbose', '-z', '--stdin'],
      { cwd: workDir, env, encoding: 'utf8', input: uniqueProbes.map((probe) => `${probe}\0`).join('') },
    );
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`git check-ignore failed: ${result.stderr || result.error?.message}`);
    }
    const fields = result.stdout.split('\0');
    /** @type {Violation[]} */
    const violations = [];
    for (let i = 0; i + 3 < fields.length; i += 4) {
      const [source, line, pattern, probePath] = fields.slice(i, i + 4);
      if (pattern.startsWith('!')) continue;
      const gitignore = byPath.get(source);
      if (!gitignore) throw new Error(`git check-ignore named an unexpected source "${source}" for ${probePath}`);
      for (const probe of probes.filter((candidate) => candidate.probe === probePath)) {
        violations.push({ gitignore, line: Number(line), pattern, probe });
      }
    }
    return violations;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** @param {string} rootDir @param {Violation} violation */
export function explainViolation(rootDir, { gitignore, line, pattern, probe }) {
  const file = toPosix(path.relative(rootDir, gitignore.absPath));
  const owner = `${toPosix(path.relative(rootDir, probe.template.dir))} (${probe.template.name})`;
  const where =
    probe.kind === 'tracked'
      ? `which ${owner} ships to "${probe.boundary}"`
      : `ground ${owner} reserves for a nested template in "${probe.boundary}"`;
  return `${file}:${line}: "${pattern}" ignores ${probe.probe}, ${where}`;
}

/** @param {string} rootDir */
export function listTrackedFiles(rootDir) {
  const result = spawnSync('git', ['-C', rootDir, 'ls-files', '-z'], { env: isolatedGitEnv(), encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr || result.error?.message}`);
  return result.stdout.split('\0').filter((file) => file !== '');
}

/** @param {{ rootDir: string; log: (line: string) => void; logError: (line: string) => void }} options */
function check({ rootDir, log, logError }) {
  const templateDirs = findTemplateDirs(rootDir);
  if (templateDirs.length === 0) {
    logError(
      `[seeded-gitignore-check] FAIL: no template (a directory carrying ${MANIFEST_FILENAME}) found under ` +
        `${rootDir} - a discovery bug, not a pass.`,
    );
    return 1;
  }
  const batch = readComposition(rootDir);
  const templates = templateDirs.map((templateDir) => readTemplate(templateDir, rootDir, batch));
  const unsafe = findUnsafeBoundaries(rootDir, templates);
  if (unsafe.length > 0) {
    logError(`[seeded-gitignore-check] FAIL: ${unsafe.length} boundary entr(ies) are not usable project paths:`);
    for (const line of unsafe) logError(`  ${line}`);
    return 1;
  }
  const trackedFiles = listTrackedFiles(rootDir);
  const gitignores = findShippedGitignores(rootDir, templates, trackedFiles);
  const collisions = findGitignoreCollisions(rootDir, gitignores);
  if (collisions.length > 0) {
    logError(`[seeded-gitignore-check] FAIL: ${collisions.length} shipped .gitignore collision(s):`);
    for (const line of collisions) logError(`  ${line}`);
    return 1;
  }
  const probes = buildProbes(rootDir, templates, trackedFiles);
  const violations = findViolations(gitignores, probes);
  if (violations.length > 0) {
    logError(`[seeded-gitignore-check] FAIL: ${violations.length} template path(s) ignored in a project:`);
    for (const violation of violations) logError(`  ${explainViolation(rootDir, violation)}`);
    logError(
      '\nA .gitignore inside a template payload is applied into every project, where these paths ' +
        "are the team's source. Put a rule this repository needs for its own tree in the root .gitignore instead.",
    );
    return 1;
  }
  log(
    `Seeded .gitignore check passed: ${gitignores.length} shipped .gitignore file(s) across ` +
      `${templates.length} template(s) ignore none of ${probes.length} probe(s).`,
  );
  return 0;
}

/** @param {{ rootDir?: string; log?: (line: string) => void; logError?: (line: string) => void }} [options] */
export function runCli(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const log = options.log ?? console.log;
  const logError = options.logError ?? console.error;
  try {
    return check({ rootDir, log, logError });
  } catch (error) {
    logError(`[seeded-gitignore-check] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  process.exitCode = runCli();
}
