/**
 * `AliasMap` — reads a bundler `resolve.alias` configuration (object or
 * array form) for the two facts the shared-set derivation needs: which
 * raw specifiers an alias rewrites (so they are never externalized
 * verbatim) and which bare packages an alias points at (how a package
 * was reached).
 */

interface AliasEntry {
  find: string | RegExp;
  replacement: string;
}

export class AliasMap {
  private readonly entries: AliasEntry[];

  constructor(alias: unknown) {
    this.entries = AliasMap.parse(alias);
  }

  /** Whether an alias rewrites `source` before it is resolved. */
  rewrites(source: string): boolean {
    return this.entries.some(({ find }) =>
      typeof find === 'string'
        ? source === find || source.startsWith(`${find}/`)
        : new RegExp(find.source, find.flags.replace(/[gy]/g, '')).test(source)
    );
  }

  /** Root names of the bare packages alias replacements point at. */
  targetRoots(): string[] {
    const roots = new Set<string>();
    for (const { replacement } of this.entries) {
      if (
        replacement === '' ||
        replacement.startsWith('.') ||
        replacement.startsWith('/') ||
        /^[a-z][a-z0-9+.-]*:/i.test(replacement) ||
        /^[a-z]:[\\/]/i.test(replacement)
      ) {
        continue;
      }
      const parts = replacement.split('/');
      roots.add(replacement.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
    }
    return [...roots].sort();
  }

  private static parse(alias: unknown): AliasEntry[] {
    if (Array.isArray(alias)) {
      return alias.flatMap((item: { find?: unknown; replacement?: unknown }) =>
        (typeof item?.find === 'string' || item?.find instanceof RegExp) &&
        typeof item.replacement === 'string'
          ? [{ find: item.find, replacement: item.replacement }]
          : []
      );
    }
    if (alias !== null && typeof alias === 'object') {
      return Object.entries(alias as Record<string, unknown>).flatMap(
        ([find, replacement]) =>
          typeof replacement === 'string' ? [{ find, replacement }] : []
      );
    }
    return [];
  }
}
