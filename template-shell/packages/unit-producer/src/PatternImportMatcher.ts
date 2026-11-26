/**
 * `PatternImportMatcher` — the lists a statically bounded pattern
 * import inside a shared chunk (``import(`./locales/${lang}.js`)``)
 * needs: one list per file the pattern can name, found relative to the
 * module that makes the call and published at the location the call's
 * computed path resolves to against the calling chunk's location. Only
 * file names starting with the prefix's last segment and ending with
 * the suffix match. A matching file is published as it is, so one that
 * imports other modules, or cannot be read to check that it does not,
 * fails the build; so does a pattern that names no file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { ContentAddressedPublisher } from './ContentAddressedPublisher';
import { ContentHasher } from './ContentHasher';
import { DynamicImportClassifier } from './DynamicImportClassifier';
import { EsmSourceParser } from './EsmSourceParser';
import { ModuleLinkageScanner } from './ModuleLinkageScanner';
import type { ProducedFetchList } from './ProducedFetchList';
import { UnitFileNaming } from './UnitFileNaming';

/** The package a pattern import is made in. */
export interface PatternImportPackage {
  name: string;
  version: string;
  packageDir: string;
}

/** The emitted chunk making the call, and the modules it owns. */
export interface PatternImportCaller {
  location: string;
  /** Absolute entry file, when the chunk is an entry output. */
  entryPoint?: string;
  /** Package-relative modules the chunk owns. */
  modulePaths: readonly string[];
}

export interface MatchedPatternList {
  location: string;
  list: ProducedFetchList;
}

export class PatternImportMatcher {
  private readonly outputDir: string;
  /** (chunk, prefix, suffix) → its matches, found and published once. */
  private readonly matches = new Map<string, MatchedPatternList[]>();

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /** The lists of the files the call `prefix…${}…suffix` can name. */
  match(
    dep: PatternImportPackage,
    caller: PatternImportCaller,
    prefix: string,
    suffix: string,
    onError: (message: string) => never
  ): MatchedPatternList[] {
    const memoKey = `${dep.name}\0${caller.location}\0${prefix}\0${suffix}`;
    const memoized = this.matches.get(memoKey);
    if (memoized !== undefined) return memoized;
    const out = new Map<string, MatchedPatternList>();
    const problems: string[] = [];
    for (const sourceDir of this.sourceDirs(dep, caller, prefix, onError)) {
      const found = this.filesIn(dep, sourceDir, prefix, suffix, problems);
      for (const file of found) {
        const matched = this.publish(dep, caller, sourceDir, file, problems, onError);
        if (matched !== undefined && !out.has(matched.location)) out.set(matched.location, matched);
      }
    }
    if (out.size === 0) {
      onError(
        `[unit-producer] the pattern import of "${dep.name}" in "${caller.location}" ` +
          `with prefix "${prefix}" matches no file` +
          (problems.length > 0 ? ` (${problems.join('; ')})` : '')
      );
    }
    const list = [...out.values()];
    this.matches.set(memoKey, list);
    return list;
  }

  /**
   * The package-relative directories of the modules that make a
   * pattern call inside the chunk: every owned module whose source
   * spells the prefix — the bundler leaves the prefix as the module
   * wrote it, relative to that module — else the chunk's entry module.
   */
  private sourceDirs(
    dep: PatternImportPackage,
    caller: PatternImportCaller,
    prefix: string,
    onError: (message: string) => never
  ): string[] {
    const dirOf = (rel: string): string => path.posix.dirname(rel);
    const dirs = new Set<string>();
    for (const rel of caller.modulePaths) {
      let source: string;
      try {
        source = fs.readFileSync(path.join(dep.packageDir, rel), 'utf-8');
      } catch {
        return onError(
          `[unit-producer] module "${rel}" of "${dep.name}" in "${caller.location}" ` +
            `cannot be read to find the module making the pattern import ` +
            `with prefix "${prefix}"`
        );
      }
      if (source.includes(prefix)) dirs.add(dirOf(rel));
    }
    if (dirs.size > 0) return [...dirs];
    if (caller.entryPoint !== undefined) {
      const rel = path.relative(dep.packageDir, caller.entryPoint).split(path.sep).join('/');
      if (rel !== '' && !rel.startsWith('..')) return [dirOf(rel)];
    }
    return onError(
      `[unit-producer] no module of "${dep.name}" in "${caller.location}" spells ` +
        `the pattern import prefix "${prefix}"`
    );
  }

  /** The files under the package the pattern can name, from `sourceDir`. */
  private filesIn(
    dep: PatternImportPackage,
    sourceDir: string,
    prefix: string,
    suffix: string,
    problems: string[]
  ): string[] {
    const relPrefix = path.posix.join(sourceDir, prefix);
    const isDirPrefix = prefix === '' || prefix.endsWith('/');
    const base = path.resolve(dep.packageDir, relPrefix);
    const dir = isDirPrefix ? base : path.dirname(base);
    const inside = path.relative(dep.packageDir, dir);
    if (inside.startsWith('..') || path.isAbsolute(inside)) {
      problems.push(`"${relPrefix}" resolves outside the package`);
      return [];
    }
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      problems.push(`directory "${inside === '' ? '.' : inside}" does not exist`);
      return [];
    }
    const namePrefix = isDirPrefix ? '' : path.basename(base);
    return fs
      .readdirSync(dir)
      .sort()
      .map((name) => path.join(dir, name))
      .filter((file) => {
        const name = path.basename(file);
        if (!fs.statSync(file).isFile()) return false;
        if (namePrefix !== '' && !name.startsWith(namePrefix)) return false;
        return suffix === '' || name.endsWith(suffix);
      });
  }

  /**
   * Publishes one matching file at the location the runtime resolves
   * the call's computed path to. The list keeps the location as a URL
   * spells it (percent-encoded); the file is written at the decoded
   * path, which the runtime's request reaches. A file whose location
   * leaves the package's own locations is no match.
   */
  private publish(
    dep: PatternImportPackage,
    caller: PatternImportCaller,
    sourceDir: string,
    file: string,
    problems: string[],
    onError: (message: string) => never
  ): MatchedPatternList | undefined {
    const key = UnitFileNaming.packageKey(dep.name, dep.version);
    const name = path.basename(file);
    const fileRel = path.relative(dep.packageDir, file).split(path.sep).join('/');
    const computed = path.posix.relative(sourceDir, fileRel);
    const location = new URL(
      computed.startsWith('.') ? computed : `./${computed}`,
      `http://r/${caller.location}`
    ).pathname.slice(1);
    if (!location.startsWith(`${key}/`)) {
      problems.push(`"${fileRel}" resolves to "${location}" outside "${key}/"`);
      return undefined;
    }
    const bytes = fs.readFileSync(file);
    if (/\.[cm]?[jt]sx?$/.test(name)) this.requireImportFree(dep, name, fileRel, bytes, onError);
    const dest = path.join(this.outputDir, decodeURIComponent(location));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, bytes);
    ContentAddressedPublisher.publish(tmp, dest);
    return {
      location,
      list: {
        items: [
          { location, contentHash: ContentHasher.ofBytes(bytes), answers: [], imports: [] },
        ],
        ownChunks: [],
      },
    };
  }

  private requireImportFree(
    dep: PatternImportPackage,
    name: string,
    fileRel: string,
    bytes: Buffer,
    onError: (message: string) => never
  ): void {
    const text = bytes.toString('utf-8');
    if (EsmSourceParser.parse(text, name) === undefined) {
      onError(
        `[unit-producer] pattern import of "${dep.name}" matches "${fileRel}", ` +
          `which cannot be parsed to check that it imports nothing`
      );
    }
    const imports = [
      ...(ModuleLinkageScanner.statements(text, name) ?? []),
      ...DynamicImportClassifier.classify(text, name).filter((c) => c.kind !== 'opaque'),
    ];
    if (imports.length > 0) {
      onError(
        `[unit-producer] pattern import of "${dep.name}" matches ` +
          `"${fileRel}", which imports other modules; a pattern file ` +
          `is published as it is, so its imports would not resolve`
      );
    }
  }
}
