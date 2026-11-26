/**
 * `BarrelRewritePolicy` — reads a package's `sideEffects` declaration:
 * whether `moduleRelPath` (posix path relative to the package root) is
 * free of side effects — the precondition for rewriting imports away from
 * a barrel.
 *  - `sideEffects: false` — every module is side-effect free.
 *  - `sideEffects: [...]` — every module except the listed files; entries
 *    support an optional `./` prefix and webpack/minimatch wildcards:
 *    `*` matches within a path segment, `**` across zero or more
 *    segments, and an entry without a slash matches the file name in
 *    any directory.
 *  - absent or `true` — the package declares no freedom.
 */

export class BarrelRewritePolicy {
  static declaresSideEffectFreedom(
    sideEffects: boolean | string[] | undefined,
    moduleRelPath: string
  ): boolean {
    if (sideEffects === false) return true;
    if (sideEffects === undefined || sideEffects === true) return false;
    const normalize = (p: string): string => p.replace(/^\.\//, '');
    const target = normalize(moduleRelPath);
    for (const entry of sideEffects) {
      // A pattern without a slash matches the file name in any
      // directory, as the bundlers read it (`*.css` is `**/*.css`).
      const written = normalize(entry);
      const pattern = written.includes('/') ? written : `**/${written}`;
      const regex = new RegExp(
        '^' +
          pattern
            .replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
            .replace(/\\\*\\\*\//g, '(?:.*/)?')
            .replace(/\\\*\\\*/g, '.*')
            .replace(/\\\*/g, '[^/]*') +
          '$'
      );
      if (regex.test(target)) return false;
    }
    return true;
  }

  /**
   * Whether the package's `sideEffects` declaration guarantees a
   * side-effect-only import (`import 'pkg'`) can have no JavaScript
   * effect: `sideEffects: false` (nothing has effects), or a file list
   * whose every entry names a non-JavaScript asset by extension
   * (`**`/`*.css`, `*.scss`, `assets/*.svg`). An extensionless or
   * JS-extension entry — or the declaration being absent/`true` — leaves
   * the possibility of JS side effects, so the import stands.
   */
  static declaresOnlyAssetSideEffects(
    sideEffects: boolean | string[] | undefined
  ): boolean {
    if (sideEffects === false) return true;
    if (!Array.isArray(sideEffects) || sideEffects.length === 0) return false;
    const JS_EXTENSIONS = new Set([
      'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx',
    ]);
    return sideEffects.every((entry) => {
      const file = entry.replace(/^\.\//, '').split('/').pop() ?? '';
      const dot = file.lastIndexOf('.');
      if (dot < 0) return false;
      const ext = file.slice(dot + 1).toLowerCase();
      // A wildcard extension (`*`, `*.*`) can match JavaScript.
      if (ext === '' || ext.includes('*')) return false;
      return !JS_EXTENSIONS.has(ext);
    });
  }
}
