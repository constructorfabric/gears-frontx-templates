/**
 * `ConsumerBarrelFallback` — the automatic fallback of barrel handling
 * after production ("packages whose barrel can't
 * be skipped are evaluated through it"). A consumer rewrite points an
 * import at `<pkg>/<module-path>`; it stands only when a produced unit
 * answers that module with the defining module's own export names:
 *
 *  - the package was delivered as more than one unit;
 *  - some unit owns the module path;
 *  - when that unit is the package's root unit (the one answering the
 *    package's own specifier), it exports the barrel's names, so every
 *    moved binding must keep its barrel name;
 *  - the unit answering the rewritten specifier exports every name the
 *    consumer imports from it (a nested barrel's entry chunk answers
 *    the paths of the modules it holds but exports only its own names).
 *
 * Anything else is unanswered, and the emitted consumer code is turned
 * back to the barrel specifier and barrel names ({@link revert}).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ConsumerBarrelRewriteLedger } from './ConsumerBarrelRewriteLedger';
import { ModuleLinkageScanner, type ClauseSpecifiers } from './ModuleLinkageScanner';
import { SharedSetResolver } from './SharedSetResolver';

/** The produced-package fields the fallback reads. */
export interface ConsumerBarrelProducedPackage {
  name: string;
  unitMode: string;
  packLocation: string;
  fallbackReason?: string;
  units: ReadonlyArray<{
    location: string;
    modulePaths: readonly string[];
    /** The names the unit exports; absent when not statically known. */
    exports?: readonly string[];
  }>;
  /** Entry specifier (`pkg`, `pkg/sub`) → the unit answering it. */
  entryUnits?: Readonly<Record<string, string>>;
}

export class ConsumerBarrelFallback {
  /**
   * Rewritten specifiers no produced unit answers, each with the reason.
   */
  static unanswered(
    produced: readonly ConsumerBarrelProducedPackage[],
    ledger: ConsumerBarrelRewriteLedger
  ): Map<string, string> {
    const byName = new Map(produced.map((p) => [p.name, p]));
    const unanswered = new Map<string, string>();
    for (const target of ledger.targets()) {
      const name = SharedSetResolver.extractRootPackageName(target);
      const renamed = [...ledger.bindingsOf(target)].some(
        ([definingName, origin]) => origin.barrelName !== definingName
      );
      const reason = ConsumerBarrelFallback.whyUnanswered(
        byName.get(name),
        name,
        target.slice(name.length + 1),
        renamed,
        ledger.isEntryTarget(target) ? target : undefined,
        [...ledger.bindingsOf(target).keys()]
      );
      if (reason !== undefined) unanswered.set(target, reason);
    }
    return unanswered;
  }

  /**
   * Why no produced unit of `pkg` (package `name`) answers a rewrite to
   * `modulePath` — `undefined` when one does. `renamed`: some moved
   * binding's defining name differs from its barrel name.
   * `entrySpecifier`: the rewrite lands on that entry specifier of the
   * package (a re-export chain ending at an evaluated barrel), answered
   * by the unit delivering the entry. `importedNames`: the names the
   * consumer imports from the rewritten specifier — each must be
   * exported by the unit answering it.
   */
  static whyUnanswered(
    pkg: ConsumerBarrelProducedPackage | undefined,
    name: string,
    modulePath: string,
    renamed: boolean,
    entrySpecifier?: string,
    importedNames: readonly string[] = []
  ): string | undefined {
    if (pkg === undefined) return `"${name}" is not delivered as a shared package`;
    const target = entrySpecifier ?? `${name}/${modulePath}`;
    const missingExport = (): string | undefined => {
      const location = pkg.entryUnits?.[target];
      return ConsumerBarrelFallback.missingExport(
        pkg.units.find((u) => u.location === location)?.exports,
        importedNames,
        target
      );
    };
    if (entrySpecifier !== undefined) {
      return pkg.entryUnits?.[entrySpecifier] !== undefined
        ? missingExport()
        : `no unit of "${name}" delivers "${entrySpecifier}"`;
    }
    if (pkg.unitMode !== 'units') {
      return (
        `"${name}" is delivered as one unit` +
        (pkg.fallbackReason !== undefined ? ` (${pkg.fallbackReason})` : '')
      );
    }
    const unit = pkg.units.find((u) => u.modulePaths.includes(modulePath));
    if (unit === undefined) return `no unit of "${name}" owns ${modulePath}`;
    if (unit.location === pkg.packLocation && renamed) {
      return (
        `${modulePath} is held by the root unit of "${name}", which ` +
          `exports the barrel's names`
      );
    }
    return missingExport();
  }

  /**
   * Why the unit answering `target`, exporting `exported`, cannot bind
   * `importedNames` — `undefined` when it exports each of them or its
   * surface is not statically known (`exported` absent).
   */
  static missingExport(
    exported: readonly string[] | undefined,
    importedNames: readonly string[],
    target: string
  ): string | undefined {
    if (exported === undefined) return undefined;
    const missing = importedNames.find((n) => !exported.includes(n));
    return missing === undefined
      ? undefined
      : `the unit answering "${target}" does not export "${missing}"`;
  }

  /**
   * Applies the fallback to a written build: finds the unanswered
   * rewrites, turns them back in every emitted chunk file importing one
   * (`<outDir>/<fileName>`), replaces them in each chunk's `imports` (in
   * place) with the barrel specifiers they came from, and records each in
   * the ledger. Returns the unanswered specifiers with their reasons.
   */
  static apply(params: {
    produced: readonly ConsumerBarrelProducedPackage[];
    ledger: ConsumerBarrelRewriteLedger;
    outDir: string;
    chunks: Iterable<{ fileName: string; imports: string[] }>;
  }): Map<string, string> {
    const { ledger } = params;
    const unanswered = ConsumerBarrelFallback.unanswered(params.produced, ledger);
    if (unanswered.size === 0) return unanswered;
    const targets = new Set(unanswered.keys());
    for (const chunk of params.chunks) {
      if (!chunk.imports.some((i) => targets.has(i))) continue;
      const file = path.join(params.outDir, chunk.fileName);
      if (fs.existsSync(file)) {
        const { code, reverts } = ConsumerBarrelFallback.revert(
          fs.readFileSync(file, 'utf-8'),
          targets,
          ledger,
          chunk.fileName
        );
        if (reverts > 0) fs.writeFileSync(file, code, 'utf-8');
      }
      const imports = new Set<string>();
      for (const imp of chunk.imports) {
        if (!targets.has(imp)) {
          imports.add(imp);
          continue;
        }
        for (const origin of ledger.bindingsOf(imp).values()) {
          imports.add(origin.barrelSpecifier);
        }
      }
      chunk.imports.splice(0, chunk.imports.length, ...imports);
    }
    for (const [target, reason] of unanswered) ledger.recordFallback(target, reason);
    return unanswered;
  }

  /**
   * Turns emitted consumer code back to the barrel for every specifier
   * in `targets`: each static import or re-export from one of them gets
   * the barrel specifier and the binding's barrel name. Tolerates
   * minified output. A namespace import of a rewritten specifier cannot
   * be turned back and throws.
   */
  static revert(
    code: string,
    targets: ReadonlySet<string>,
    ledger: ConsumerBarrelRewriteLedger,
    fileName = 'chunk.js'
  ): { code: string; reverts: number } {
    if (targets.size === 0) return { code, reverts: 0 };
    const statements = ModuleLinkageScanner.statements(code, fileName);
    if (statements === undefined) {
      throw new Error(
        `[unit-producer] emitted chunk "${fileName}" imports a rewritten ` +
          `specifier but cannot be parsed to turn it back to its barrel`
      );
    }
    let out = '';
    let cursor = 0;
    let reverts = 0;
    for (const stmt of statements) {
      const specifier = stmt.specifier;
      if (!targets.has(specifier)) continue;
      if (stmt.sideEffect) {
        // Every binding was tree-shaken away; the import still evaluates
        // the module, so it evaluates the barrel instead.
        const barrels = new Set(
          [...ledger.bindingsOf(specifier).values()].map((o) => o.barrelSpecifier)
        );
        out +=
          code.slice(cursor, stmt.start) +
          [...barrels].map((b) => `import ${JSON.stringify(b)};`).join('');
        cursor = stmt.end;
        continue;
      }
      const parsed = stmt.specifiers;
      if (parsed.namespaceName !== undefined || stmt.star) {
        throw new Error(
          `[unit-producer] a namespace import of "${specifier}" in ` +
            `"${fileName}" cannot be turned back to its barrel`
        );
      }
      const groups = new Map<string, ClauseSpecifiers>();
      const push = (barrel: string, s: ClauseSpecifiers): void => {
        const existing = groups.get(barrel) ?? { named: [] };
        if (s.defaultName) existing.defaultName = s.defaultName;
        existing.named.push(...s.named);
        groups.set(barrel, existing);
      };
      const originOf = (importedName: string): { barrelSpecifier: string; barrelName: string } => {
        const origin = ledger.origin(specifier, importedName);
        if (origin === undefined) {
          throw new Error(
            `[unit-producer] "${importedName}" imported from "${specifier}" ` +
              `in "${fileName}" has no recorded barrel origin`
          );
        }
        return origin;
      };
      if (parsed.defaultName !== undefined) {
        const origin = originOf('default');
        push(
          origin.barrelSpecifier,
          origin.barrelName === 'default'
            ? { named: [], defaultName: parsed.defaultName }
            : { named: [{ imported: origin.barrelName, local: parsed.defaultName }] }
        );
        reverts += 1;
      }
      for (const n of parsed.named) {
        const origin = originOf(n.imported);
        push(origin.barrelSpecifier, {
          named: [{ imported: origin.barrelName, local: n.local }],
        });
        reverts += 1;
      }
      const replacement = [...groups.entries()]
        .map(
          ([barrel, s]) =>
            `${stmt.keyword} ${ModuleLinkageScanner.renderClause(s)} from ${JSON.stringify(barrel)};`
        )
        .join('');
      out += code.slice(cursor, stmt.start) + replacement;
      cursor = stmt.end;
    }
    out += code.slice(cursor);
    return { code: out, reverts };
  }
}
