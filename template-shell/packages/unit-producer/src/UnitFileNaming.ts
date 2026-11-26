/**
 * `UnitFileNaming` — the naming of the files a producer emits:
 *
 *   chunks `<pkg>@<version>/<path>.<hash>.js`
 *
 * Fetch lists are not files: they are held in the registered manifest,
 * so nothing here writes a list document.
 */

export class UnitFileNaming {
  /** `<pkg>@<version>` — the content-identity key and chunk directory. */
  static packageKey(name: string, version: string): string {
    return `${name}@${version}`;
  }

  /** Chunk file location relative to the output dir. */
  static chunkLocation(key: string, chunkPath: string, hash: string): string {
    return `${key}/${chunkPath}.${hash}.js`;
  }

  /**
   * A chunk or entry file's `<path>` segment from its module path:
   * extension stripped and non-filename characters collapsed, so the
   * file sits directly inside the `<pkg>@<version>` directory.
   */
  static namePathOf(modulePath: string): string {
    return modulePath
      .replace(/\.[cm]?[jt]sx?$/, '')
      .replace(/[^\w$.-]+/g, '-');
  }
}
