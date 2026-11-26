/**
 * `HostSharedSetResolver` — resolves the host's shared set through
 * `SharedSetResolver` from `@gears-frontx/unit-producer`. It describes the
 * declared seed — the host's `dependencies` plus its non-optional
 * `peerDependencies`, never its `devDependencies` — which the build graph
 * extends with every bare package the build imports (`BuildGraphSharing`).
 * The mutually exclusive `exclude` / `include` options apply to it, read
 * from the producing package's own `package.json`: the set is derived,
 * never listed.
 */

import {
  SharedSetResolver,
  SharedSpecifierMatcher,
} from '@gears-frontx/unit-producer';

export class HostSharedSetResolver {
  private readonly packageRoot: string;
  private readonly exclude: readonly string[];
  private readonly include?: readonly string[];

  constructor(
    packageRoot: string,
    exclude?: readonly string[],
    include?: readonly string[]
  ) {
    this.packageRoot = packageRoot;
    this.exclude = exclude ?? [];
    this.include = include;
  }

  /**
   * The shared dependency names for this host, or a build-failing
   * resolution message (closure opt-out rejection, a bundled-vs-declared
   * version mismatch, or a second reachable version of a shared package).
   */
  resolve():
    | { ok: true; sharedDeps: string[]; externalNames: string[] }
    | { ok: false; message: string } {
    const resolver = new SharedSetResolver(this.packageRoot, {
      exclude: this.exclude,
      include: this.include,
    });
    const resolved = resolver.resolve();
    if (!resolved.ok) return resolved;
    // The host keeps the whole declared closure external, so a package
    // the producer may deliver to a shared package is never also inlined
    // into the host's own chunks.
    return {
      ok: true,
      sharedDeps: resolved.sharedDeps,
      externalNames: resolver.declaredClosureNames(),
    };
  }

  /**
   * Whether `specifier` names a member of `sharedDeps` — matching by root
   * package name so a subpath specifier (`react/jsx-runtime`) externalizes
   * with its package. Asset specifiers (`pkg/x.css`) never match.
   */
  static isSharedSpecifier(
    specifier: string,
    sharedDeps: ReadonlySet<string>
  ): boolean {
    return new SharedSpecifierMatcher(sharedDeps).matches(specifier);
  }
}
