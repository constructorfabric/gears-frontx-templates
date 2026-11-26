/**
 * `ConsumerBarrelRewriteLedger` — what a consumer build's barrel rewrite
 * did, per shared package: how many bindings moved off the barrel, and
 * every reason the barrel is still evaluated (a kept barrel, listed
 * in the build report). It
 * also keeps, per rewritten specifier, the barrel specifier and barrel
 * name behind each moved binding, so a rewrite no produced unit answers
 * can be turned back ({@link ConsumerBarrelFallback}).
 */

import type { ConsumerBarrelRedirect } from './ConsumerBarrelResolver';
import { SharedSetResolver } from './SharedSetResolver';

/** The consumer barrel outcome of one shared package. */
export interface ConsumerBarrelPackageRecord {
  name: string;
  /**
   * `kept` when any import still evaluates the barrel, `rewritten` when
   * bindings moved off it and none does, `not-needed` when the package's
   * entry is no barrel.
   */
  mode: 'rewritten' | 'kept' | 'not-needed';
  /** Bindings moved off the barrel (the barrel bypassed). */
  rewrites: number;
  /** Why the barrel is still evaluated, deduplicated and sorted. */
  keptReasons: string[];
}

/** One recorded rewrite: the redirect plus where the binding came from. */
export interface ConsumerBarrelRewrite extends ConsumerBarrelRedirect {
  /** The specifier the consumer wrote (`pkg`, `pkg/sub`). */
  barrelSpecifier: string;
  /** The binding's name as the barrel exports it. */
  barrelName: string;
}

/**
 * One rewritten specifier as a cache record: the barrel behind each
 * moved binding, so a build served from the cache can still turn a
 * rewrite back.
 */
export interface ConsumerBarrelOriginRecord {
  target: string;
  /** The target is another package's entry specifier, not a module path. */
  entry: boolean;
  bindings: Array<{ name: string; barrelSpecifier: string; barrelName: string }>;
}

interface PackageState {
  rewrites: number;
  keptReasons: Set<string>;
}

export class ConsumerBarrelRewriteLedger {
  private readonly packagesByName = new Map<string, PackageState>();
  /** Rewritten specifier → defining name → origin. */
  private readonly origins = new Map<
    string,
    Map<string, { barrelSpecifier: string; barrelName: string }>
  >();
  /** Rewritten specifier → barrel package → rewritten binding sites. */
  private readonly sites = new Map<string, Map<string, number>>();
  /**
   * Rewritten specifiers that are another package's entry specifier
   * (`pkg`, `pkg/sub`) — a re-export chain landing on a barrel that is
   * evaluated — rather than `<pkg>/<module-path>`.
   */
  private readonly entryTargets = new Set<string>();

  /** Forgets everything (a new build). */
  clear(): void {
    this.packagesByName.clear();
    this.origins.clear();
    this.sites.clear();
    this.entryTargets.clear();
  }

  /**
   * A binding moved off the barrel the consumer wrote. The move counts
   * for that barrel's package; the package the redirect ends in (another
   * one, through a re-export chain) is seen too, and a barrel the
   * redirect still evaluates is recorded as kept.
   */
  recordRewrite(rewrite: ConsumerBarrelRewrite): void {
    const barrelPackage = SharedSetResolver.extractRootPackageName(rewrite.barrelSpecifier);
    this.state(barrelPackage).rewrites += 1;
    this.state(rewrite.packageName);
    if (rewrite.evaluates !== undefined) {
      this.recordKept(rewrite.evaluates.packageName, rewrite.evaluates.reason);
    }
    if (rewrite.modulePath === '') this.entryTargets.add(rewrite.specifier);
    let sites = this.sites.get(rewrite.specifier);
    if (sites === undefined) {
      sites = new Map();
      this.sites.set(rewrite.specifier, sites);
    }
    sites.set(barrelPackage, (sites.get(barrelPackage) ?? 0) + 1);
    let byName = this.origins.get(rewrite.specifier);
    if (byName === undefined) {
      byName = new Map();
      this.origins.set(rewrite.specifier, byName);
    }
    // Several barrels may re-export one binding; the target's own
    // package's barrel, when it is one of them, is the origin kept.
    const kept = byName.get(rewrite.importedName);
    const ownPackage = (s: string): boolean =>
      SharedSetResolver.extractRootPackageName(s) === rewrite.packageName;
    if (kept === undefined || (!ownPackage(kept.barrelSpecifier) && ownPackage(rewrite.barrelSpecifier))) {
      byName.set(rewrite.importedName, {
        barrelSpecifier: rewrite.barrelSpecifier,
        barrelName: rewrite.barrelName,
      });
    }
  }

  recordKept(packageName: string, reason: string): void {
    this.state(packageName).keptReasons.add(reason);
  }

  /** A package seen with an entry that needs no rewrite. */
  recordNotNeeded(packageName: string): void {
    this.state(packageName);
  }

  /**
   * A rewrite turned back after production: the binding is evaluated
   * through the barrel again, and the package's report says why.
   */
  recordFallback(specifier: string, reason: string): void {
    const byName = this.origins.get(specifier);
    if (byName === undefined) return;
    for (const [barrelPackage, count] of this.sites.get(specifier) ?? []) {
      const state = this.state(barrelPackage);
      state.rewrites = Math.max(0, state.rewrites - count);
    }
    this.sites.delete(specifier);
    for (const origin of byName.values()) {
      this.state(SharedSetResolver.extractRootPackageName(origin.barrelSpecifier)).keptReasons.add(
        `"${origin.barrelSpecifier}" evaluated: ${reason}`
      );
    }
  }

  /**
   * Whether a rewritten specifier is another package's entry specifier
   * (a chain landing on an evaluated barrel), not a module specifier.
   */
  isEntryTarget(specifier: string): boolean {
    return this.entryTargets.has(specifier);
  }

  /** Every rewritten specifier. */
  targets(): string[] {
    return [...this.origins.keys()].sort();
  }

  /** Defining names recorded for a rewritten specifier → barrel names. */
  bindingsOf(specifier: string): ReadonlyMap<string, { barrelSpecifier: string; barrelName: string }> {
    return this.origins.get(specifier) ?? new Map();
  }

  /** The origins of every rewritten specifier, sorted, for a cache record. */
  originRecords(): ConsumerBarrelOriginRecord[] {
    return this.targets().map((target) => ({
      target,
      entry: this.entryTargets.has(target),
      bindings: [...this.bindingsOf(target)]
        .map(([name, origin]) => ({ name, ...origin }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    }));
  }

  /** Takes the origins a cache record holds, as if the rewrites had just happened. */
  restoreOrigins(records: readonly ConsumerBarrelOriginRecord[]): void {
    for (const record of records) {
      if (record.entry) this.entryTargets.add(record.target);
      const byName = this.origins.get(record.target) ?? new Map();
      this.origins.set(record.target, byName);
      for (const b of record.bindings) {
        if (!byName.has(b.name)) {
          byName.set(b.name, { barrelSpecifier: b.barrelSpecifier, barrelName: b.barrelName });
        }
      }
    }
  }

  /** Where a binding imported from a rewritten specifier came from. */
  origin(
    specifier: string,
    importedName: string
  ): { barrelSpecifier: string; barrelName: string } | undefined {
    return this.origins.get(specifier)?.get(importedName);
  }

  /** The per-package records, sorted by name. */
  packages(): ConsumerBarrelPackageRecord[] {
    return [...this.packagesByName.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, state]) => ({
        name,
        mode:
          state.keptReasons.size > 0
            ? 'kept'
            : state.rewrites > 0
              ? 'rewritten'
              : 'not-needed',
        rewrites: state.rewrites,
        keptReasons: [...state.keptReasons].sort(),
      }));
  }

  private state(packageName: string): PackageState {
    let state = this.packagesByName.get(packageName);
    if (state === undefined) {
      state = { rewrites: 0, keptReasons: new Set() };
      this.packagesByName.set(packageName, state);
    }
    return state;
  }
}
