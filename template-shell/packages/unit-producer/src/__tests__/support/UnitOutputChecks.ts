/**
 * Producer-local output checks: the unit producer verifies its own output
 * in its own tests, against the producer output obligations of the unit
 * format contract (`cpt-frontx-feature-unit-format-contract`,
 * `cpt-frontx-dod-unit-format-contract-producer-obligations`). Run against
 * one or more independent outputs of this producer and the same inputs
 * (each an output directory plus the fetch lists the producer returned),
 * it returns typed violations for what the FEATURE states:
 *
 * - every emitted file carries its content hash in its location, and that
 *   hash is the SHA-256 of the file's bytes;
 * - every unit a list names is a
 *   present file of matching bytes, and the manifest-side unit table and
 *   lists derived from them hold every content identity they name;
 * - fetch-list completeness: unit and specifier edges are answered, one
 *   unit answers each imported specifier, a nested list carries only its
 *   delta over its parent chain, and a list's unit edges are acyclic;
 * - byte identity across output directories, and consumer independence of
 *   a package's chunks.
 *
 * Where the checks recognise a file by its place in the tree
 * (`<pkg>@<version>/` directories, `pattern/` files) that layout is this
 * producer's own convention, used only to group a package's files — it is
 * not asserted as part of the contract.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { basename, join, relative, sep } from 'node:path';

import type { SharedDepImportEdge } from '@gears-frontx/mfes/unit-format';

import type { ManifestLists } from '../../ManifestListBuilder';
import type { ProducedFetchList } from '../../ProducedFetchList';
import type { ProducedSharedPackage } from '../../UnitProducer';

/** One producer output: its directory and the lists the producer returned for it. */
export interface CheckedOutput {
  dir: string;
  produced: readonly ProducedSharedPackage[];
}

const NAME_HASH_PATTERN = /\.([0-9a-f]{64})\./;
// Producer convention: a package's files live under `<pkg>@<version>/`.
const PACKAGE_DIR_PATTERN = /^(.+)@([^@/]+)$/;

/**
 * Output checks for the shared-dependency unit format contract.
 */
export class UnitOutputChecks {
  /**
   * Check two independent outputs of the same producer and the same
   * inputs. Returns one typed violation per contract failure — naming
   * the violated rule and the offending file — or an empty list when both
   * conform and agree byte for byte.
   */
  check(outputA: CheckedOutput, outputB: CheckedOutput): UnitOutputViolation[] {
    return this.checkAll([outputA, outputB]);
  }

  /**
   * Check any number of independent outputs of the same producer and the
   * same inputs — built under different install layouts or consumer
   * configs — and require them byte-identical: each output is checked
   * against the contract, then every output directory is compared byte
   * for byte against the first. A single output checks conformance only.
   * With `manifest` (the unit table and lists a build records), its
   * content identities are checked against the first output's files.
   */
  checkAll(outputs: readonly CheckedOutput[], manifest?: ManifestLists): UnitOutputViolation[] {
    const violations: UnitOutputViolation[] = [];
    for (const output of outputs) {
      violations.push(...this.checkOutput(output));
    }
    const [first, ...rest] = outputs;
    if (first !== undefined) {
      for (const output of rest) {
        violations.push(...this.compareOutputs(first.dir, output.dir));
      }
    }
    if (manifest !== undefined && first !== undefined) {
      violations.push(...this.checkManifest(manifest, first.dir));
    }
    return violations;
  }

  /**
   * The manifest leg of the identity chain: every unit of the table is a
   * present file of matching bytes, and every content identity a list
   * names is held by the table, and every list a list names by key is held.
   */
  private checkManifest(manifest: ManifestLists, dir: string): UnitOutputViolation[] {
    const violations: UnitOutputViolation[] = [];
    const held = new Set<string>();
    for (const unit of manifest.units) {
      held.add(unit.contentHash);
      const file = join(dir, unit.location);
      if (!existsSync(file)) {
        violations.push(
          this.violation(dir, unit.location, 'hash-chain', `manifest unit names "${unit.location}" but no such file exists`),
        );
      } else if (this.sha256File(file) !== unit.contentHash) {
        violations.push(
          this.violation(dir, unit.location, 'hash-chain', `manifest unit "${unit.location}" declares contentHash ${unit.contentHash} but the file differs`),
        );
      }
    }
    for (const [name, list] of Object.entries(manifest.lists)) {
      for (const hash of list.units) {
        if (!held.has(hash)) {
          violations.push(
            this.violation(dir, name, 'list-format', `list "${name}" names content identity ${hash}, which the unit table does not hold`),
          );
        }
      }
      for (const key of [...(list.lazy ?? []), ...(list.patterns ?? [])]) {
        if (manifest.lists[key] === undefined) {
          violations.push(
            this.violation(dir, name, 'list-format', `list "${name}" names list "${key}", which the manifest does not hold`),
          );
        }
      }
    }
    return violations;
  }

  /**
   * Run the per-output checks: each content-addressed name's hash against
   * bytes, then the lists the producer returned.
   */
  private checkOutput(output: CheckedOutput): UnitOutputViolation[] {
    const { dir } = output;
    const violations: UnitOutputViolation[] = [];
    for (const file of this.listFiles(dir)) {
      const rel = relative(dir, file);
      if (NAME_HASH_PATTERN.test(basename(rel))) {
        this.checkFileNameHash(dir, rel, violations);
      } else {
        violations.push(this.violation(dir, rel, 'naming', `file "${rel}" carries no content hash in its location`));
      }
    }
    violations.push(...this.checkLists(output));
    return violations;
  }

  /**
   * The list legs of the contract: every unit's `location`/`contentHash`
   * names a present chunk of matching bytes; every `{ unit }` edge
   * resolves to a unit on the same list or its parent chain; every
   * specifier edge is answered by a unit's `answers` somewhere in the
   * output — when the specifier's root package is delivered in this
   * output. Specifiers of packages outside the delivered set (built-ins,
   * optional peers, native-staying imports) keep their native edge in
   * real output, so they are exempt: a producer convention, not a
   * contract rule.
   */
  private checkLists(output: CheckedOutput): UnitOutputViolation[] {
    const { dir } = output;
    const violations: UnitOutputViolation[] = [];
    /** List id → list, with nested lists reached through their parent. */
    const parsed = new Map<string, ProducedFetchList>();
    const parents = new Map<string, Set<string>>();
    /** Answered specifiers and package roots across the whole output. */
    const answers = new Set<string>();
    const deliveredRoots = new Set<string>();
    const register = (id: string, list: ProducedFetchList, parent?: string): void => {
      parsed.set(id, list);
      if (parent !== undefined) {
        (parents.get(id) ?? parents.set(id, new Set()).get(id)!).add(parent);
      }
      // Every list carries `ownChunks`, a string array of own-chunk
      // locations; a shared-package list names none.
      if (!Array.isArray(list.ownChunks) || list.ownChunks.some((c) => typeof c !== 'string')) {
        violations.push(
          this.violation(dir, id, 'list-format', 'fetch list carries no `ownChunks` string array'),
        );
      } else if (list.ownChunks.length > 0) {
        violations.push(
          this.violation(dir, id, 'list-format', `a shared-package list names own chunks: ${list.ownChunks.join(', ')}`),
        );
      }
      for (const unit of list.items) {
        for (const answered of unit.answers) answers.add(answered);
      }
      for (const [kind, record] of [['lazy', list.lazy], ['patterns', list.patterns]] as const) {
        for (const [key, child] of Object.entries(record ?? {})) {
          register(`${id} > ${kind}:${key}`, child, id);
        }
      }
    };
    for (const pkg of output.produced) {
      deliveredRoots.add(pkg.name);
      for (const [spec, list] of Object.entries(pkg.lists)) {
        register(`${pkg.name}:${spec}`, list);
      }
    }
    const chain = (start: string, links: Map<string, Set<string>>): Set<string> => {
      const seen = new Set<string>();
      const queue = [...(links.get(start) ?? [])];
      while (queue.length > 0) {
        const next = queue.pop() as string;
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(...(links.get(next) ?? []));
      }
      return seen;
    };
    for (const [rel, doc] of parsed) {
      const ancestors = chain(rel, parents);
      // Units a `{ unit }` edge may resolve to: the same list or its
      // parent chain (a nested list's resolved edge legitimately names a
      // chunk the parent chain already delivers).
      const selfAndAncestors = new Set<string>([rel, ...ancestors]);
      const reachableHashes = new Set<string>();
      for (const r of selfAndAncestors) {
        for (const i of parsed.get(r)?.items ?? []) reachableHashes.add(i.contentHash);
      }
      // Every root-to-list chain a load can take. Answer uniqueness and
      // the delta property bind per chain.
      const pathsToRoots = (start: string): string[][] => {
        const ups = [...(parents.get(start) ?? [])].filter((p) => parsed.has(p));
        if (ups.length === 0) return [[start]];
        const out: string[][] = [];
        for (const p of ups) {
          for (const tail of pathsToRoots(p)) {
            if (tail.includes(start)) continue;
            out.push([start, ...tail]);
          }
        }
        return out.length > 0 ? out : [[start]];
      };
      const paths = pathsToRoots(rel);
      const perChain: { answers: Map<string, number>; imported: Set<string>; ancestorHashes: Set<string> }[] =
        paths.map((path) => {
          const answers = new Map<string, number>();
          const imported = new Set<string>();
          const ancestorHashes = new Set<string>();
          for (const r of path) {
            for (const i of parsed.get(r)?.items ?? []) {
              for (const a of i.answers) answers.set(a, (answers.get(a) ?? 0) + 1);
              for (const e of i.imports) {
                if (typeof e === 'string') imported.add(e);
              }
              if (r !== rel) ancestorHashes.add(i.contentHash);
            }
          }
          return { answers, imported, ancestorHashes };
        });
      if (this.hasUnitCycle(doc)) {
        violations.push(
          this.violation(dir, rel, 'list-completeness', 'list units form a cycle through their { unit } edges'),
        );
      }
      for (const item of doc.items) {
        if (perChain.some((c) => c.ancestorHashes.has(item.contentHash))) {
          violations.push(
            this.violation(dir, rel, 'list-completeness', `dependent list carries chunk ${item.contentHash} ("${item.location}") a parent chain's lists already deliver — lazy/pattern lists hold only the delta`),
          );
        }
        const chunkPath = join(dir, item.location);
        if (!existsSync(chunkPath)) {
          violations.push(
            this.violation(dir, rel, 'hash-chain', `list unit names chunk "${item.location}" but no such file exists`),
          );
        } else {
          const actual = this.sha256File(chunkPath);
          if (actual !== item.contentHash) {
            violations.push(
              this.violation(dir, item.location, 'hash-chain', `list declares unit contentHash ${item.contentHash} but file SHA-256 is ${actual}`),
            );
          }
        }
        for (const edge of item.imports as SharedDepImportEdge[]) {
          if (typeof edge !== 'string') {
            if (!reachableHashes.has(edge.unit)) {
              violations.push(
                this.violation(dir, rel, 'list-completeness', `resolved unit edge ${edge.unit} of "${item.location}" has no answering unit on this list or its parent chain`),
              );
            }
            continue;
          }
          if (isBuiltin(edge)) continue;
          const root = edge.startsWith('@')
            ? edge.split('/').slice(0, 2).join('/')
            : edge.split('/')[0];
          if (deliveredRoots.has(root) && !answers.has(edge)) {
            violations.push(
              this.violation(dir, rel, 'list-completeness', `specifier "${edge}" imported by "${item.location}" is answered by no emitted unit`),
            );
          }
        }
      }
      // The uniqueness rule binds the specifiers a chain's lists
      // actually import — an extra unit answering a specifier nothing
      // imports is spare capacity, not a double provision.
      const seenUniques = new Set<string>();
      for (const c of perChain) {
        for (const [specifier, count] of c.answers) {
          if (count > 1 && c.imported.has(specifier) && !seenUniques.has(specifier)) {
            seenUniques.add(specifier);
            violations.push(
              this.violation(dir, rel, 'list-completeness', `specifier "${specifier}" is imported by the combined lists but answered by ${count} units — exactly one unit must answer it`),
            );
          }
        }
      }
    }
    return violations;
  }

  /** Whether the list's units reach themselves through `{ unit }` edges (keyed by `contentHash`). */
  private hasUnitCycle(doc: ProducedFetchList): boolean {
    const edges = new Map<string, string[]>();
    for (const item of doc.items) {
      edges.set(
        item.contentHash,
        item.imports.filter((e): e is { unit: string } => typeof e !== 'string').map((e) => e.unit),
      );
    }
    const state = new Map<string, 1 | 2>();
    const visit = (hash: string): boolean => {
      if (state.get(hash) === 2) return false;
      if (state.get(hash) === 1) return true;
      state.set(hash, 1);
      for (const next of edges.get(hash) ?? []) {
        if (edges.has(next) && visit(next)) return true;
      }
      state.set(hash, 2);
      return false;
    };
    return [...edges.keys()].some(visit);
  }

  /**
   * Consumer independence: given output directories of DIFFERENT builds —
   * different consumer subsets of the shared packages, so their package
   * sets may legitimately differ — every `<pkg>@<version>` directory two
   * of them emit must be byte-identical underneath: identical file sets,
   * identical bytes per file. Package directories only one build emits
   * are out of scope; the chunks of a package must not depend on which
   * subset the consumer used.
   */
  checkConsumerIndependence(outputDirs: readonly string[]): UnitOutputViolation[] {
    const violations: UnitOutputViolation[] = [];
    /** package dir key (`<pkg>@<version>`, '/'-joined) → per-output absolute dirs. */
    const byPackage = new Map<string, string[]>();
    for (const dir of outputDirs) {
      for (const rel of this.packageDirs(dir)) {
        (byPackage.get(rel) ?? byPackage.set(rel, []).get(rel)!).push(dir);
      }
    }
    for (const [pkg, dirs] of byPackage) {
      if (dirs.length < 2) continue;
      const [first, ...rest] = dirs as [string, ...string[]];
      const pkgRel = pkg.split('/').join(sep);
      const base = join(first, pkgRel);
      const filesFirst = new Map(this.listFiles(base).map((f) => [relative(base, f), f] as const));
      for (const other of rest) {
        const otherBase = join(other, pkgRel);
        const filesOther = new Map(this.listFiles(otherBase).map((f) => [relative(otherBase, f), f] as const));
        for (const rel of filesFirst.keys()) {
          if (!filesOther.has(rel)) {
            violations.push(
              this.violation(other, `${pkgRel}${sep}${rel}`, 'consumer-independence', `${pkg} file present in ${first} but absent from ${other}`),
            );
          }
        }
        for (const rel of filesOther.keys()) {
          if (!filesFirst.has(rel)) {
            violations.push(
              this.violation(first, `${pkgRel}${sep}${rel}`, 'consumer-independence', `${pkg} file present in ${other} but absent from ${first}`),
            );
          }
        }
        for (const [rel, pathA] of filesFirst) {
          const pathB = filesOther.get(rel);
          if (pathB !== undefined && !readFileSync(pathA).equals(readFileSync(pathB))) {
            violations.push(
              this.violation(first, `${pkgRel}${sep}${rel}`, 'consumer-independence', `${pkg} file "${rel}" differs between ${first} and ${other} — chunk bytes depend on the consumer subset`),
            );
          }
        }
      }
    }
    return violations;
  }

  /** `<pkg>@<version>` directory names (relative, '/'-joined) under `dir`. */
  private packageDirs(dir: string): string[] {
    const found: string[] = [];
    const scan = (abs: string, rel: string): void => {
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
        const leaf = entry.name.startsWith('@') ? childRel : entry.name;
        if (PACKAGE_DIR_PATTERN.test(leaf)) {
          found.push(childRel);
        } else if (entry.name.startsWith('@') && rel === '') {
          scan(join(abs, entry.name), childRel);
        }
      }
    };
    scan(dir, '');
    return found;
  }

  /**
   * Verify that a content-addressed file's name hash equals the SHA-256 of
   * its bytes.
   */
  private checkFileNameHash(dir: string, rel: string, violations: UnitOutputViolation[]): void {
    const match = basename(rel).match(NAME_HASH_PATTERN);
    if (match === null) return;
    const actual = this.sha256File(join(dir, rel));
    if (actual !== match[1]) {
      violations.push(
        this.violation(dir, rel, 'hash-chain', `file name hash ${match[1]} does not match content SHA-256 ${actual}`),
      );
    }
  }

  /**
   * Compare two output directories byte for byte: identical relative file
   * sets, identical bytes per file.
   */
  private compareOutputs(dirA: string, dirB: string): UnitOutputViolation[] {
    const violations: UnitOutputViolation[] = [];
    const filesA = new Map(this.listFiles(dirA).map((f) => [relative(dirA, f), f] as const));
    const filesB = new Map(this.listFiles(dirB).map((f) => [relative(dirB, f), f] as const));
    for (const rel of filesA.keys()) {
      if (!filesB.has(rel)) {
        violations.push(this.violation(dirB, rel, 'byte-identity', `present in ${dirA} but absent from ${dirB}`));
      }
    }
    for (const rel of filesB.keys()) {
      if (!filesA.has(rel)) {
        violations.push(this.violation(dirA, rel, 'byte-identity', `present in ${dirB} but absent from ${dirA}`));
      }
    }
    for (const [rel, pathA] of filesA) {
      const pathB = filesB.get(rel);
      if (pathB !== undefined && !readFileSync(pathA).equals(readFileSync(pathB))) {
        violations.push(this.violation(dirA, rel, 'byte-identity', `file "${rel}" differs between ${dirA} and ${dirB}`));
      }
    }
    return violations;
  }

  /** Recursively list every regular file under `dir`. */
  private listFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        files.push(...this.listFiles(path));
      } else {
        files.push(path);
      }
    }
    return files;
  }

  private sha256File(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  }

  private violation(
    dir: string,
    rel: string,
    rule: UnitOutputRule,
    detail: string,
  ): UnitOutputViolation {
    const file = rel.startsWith(dir) ? rel : `${dir}${sep}${rel}`;
    return { rule, file, detail };
  }
}

/**
 * The contract rules `UnitOutputChecks` checks, named as the violation
 * taxonomy producer CI reports against:
 *
 * - `naming` — a file does not follow the fixed naming rules
 *   (`<pkg>@<version>/<path>.<hash>.js`,
 *   `<pkg>@<version>/pattern/<name>.<hash>.<ext>`).
 * - `list-format` — a fetch list is missing a field the contract
 *   requires, or names a content identity the unit table does not hold.
 * - `hash-chain` — a content identity a list unit or the unit table
 *   declares does not match the bytes it names (including a file's own
 *   name hash not matching its content).
 * - `list-completeness` — a list-closure violation on a fetch list: a
 *   specifier or `{ unit }` edge with no answering unit on the entry's
 *   combined lists, a specifier answered by more than one unit across
 *   the combined lists, or a nested list carrying a chunk a parent
 *   chain's lists already carry (the delta property).
 * - `consumer-independence` — the same `package@version` emitted by two
 *   builds carrying different consumer subsets disagrees in file set or
 *   bytes under that package's directory.
 * - `byte-identity` — two output directories of the same producer and inputs
 *   disagree in file set or bytes.
 */
export type UnitOutputRule =
  | 'naming'
  | 'list-format'
  | 'hash-chain'
  | 'list-completeness'
  | 'consumer-independence'
  | 'byte-identity';

/**
 * One contract violation: the rule that was violated, the offending file
 * (a path relative to the output directory, or the output directory itself
 * for cross-build disagreements), and a human-readable detail.
 */
export interface UnitOutputViolation {
  /** The contract rule that was violated. */
  rule: UnitOutputRule;
  /**
   * The offending file — a path relative to the output directory it was
   * found in, prefixed by the output directory argument when two output
   * directories are compared.
   */
  file: string;
  /** Human-readable description of the violation. */
  detail: string;
}
