/**
 * `PortableCacheRecord` — a package's cached computation with every
 * absolute path made relative to the package's directories, and back.
 * The cache key holds no location, so the record must not either: an
 * entry written from one install path answers any other. A path inside
 * the package directory becomes `<package>/…`, any other absolute path
 * `<install>/…` relative to the install directory.
 */

import * as path from 'node:path';

import type { CachedPackageBuild } from './PackageBuildCache';

/** The directories a record's paths are made relative to. */
export interface PortableCacheLocation {
  packageDir: string;
  installDir: string;
}

export class PortableCacheRecord {
  protected constructor() {}

  /** `build` with its absolute paths made relative to `dep`'s directories. */
  static portable(build: CachedPackageBuild, dep: PortableCacheLocation): CachedPackageBuild {
    return PortableCacheRecord.mapPaths(build, (id) => PortableCacheRecord.toPortable(id, dep));
  }

  /** A portable record with its paths placed at `dep`'s directories. */
  static located(build: CachedPackageBuild, dep: PortableCacheLocation): CachedPackageBuild {
    return PortableCacheRecord.mapPaths(build, (id) => PortableCacheRecord.toLocated(id, dep));
  }

  /**
   * One module id made portable. An id is a path with an optional
   * leading `\0` (a virtual module) and an optional `?query`; only a
   * genuinely absolute path part is converted, so a virtual id such as
   * `\0react/jsx-runtime?commonjs-external` stays as it is.
   */
  static toPortable(id: string, dep: PortableCacheLocation): string {
    const virtual = id.startsWith('\0') ? '\0' : '';
    const query = id.indexOf('?');
    const end = query < 0 ? id.length : query;
    const abs = id.slice(virtual.length, end);
    if (!path.isAbsolute(abs)) return id;
    const inside = (dir: string): string | undefined => {
      const rel = path.relative(dir, abs);
      return rel.startsWith('..') || path.isAbsolute(rel) ? undefined : rel;
    };
    const inPackage = inside(dep.packageDir);
    const token =
      inPackage !== undefined
        ? `<package>/${inPackage.split(path.sep).join('/')}`
        : `<install>/${path.relative(dep.installDir, abs).split(path.sep).join('/')}`;
    return virtual + token + id.slice(end);
  }

  /** One portable id placed at `dep`'s directories. */
  static toLocated(id: string, dep: PortableCacheLocation): string {
    return id.replace(/<(package|install)>\/([^?]*)/, (_m, base: string, rel: string) =>
      path.resolve(base === 'package' ? dep.packageDir : dep.installDir, rel)
    );
  }

  private static mapPaths(
    build: CachedPackageBuild,
    map: (id: string) => string
  ): CachedPackageBuild {
    const files = <T extends { file: string }>(list: T[] | undefined): T[] | undefined =>
      list?.map((e) => ({ ...e, file: map(e.file) }));
    return {
      ...build,
      chunks: build.chunks.map((c) => ({
        ...c,
        ...(c.entryPoint !== undefined ? { entryPoint: map(c.entryPoint) } : {}),
      })),
      ...(build.entries !== undefined
        ? {
            entries: Object.fromEntries(
              Object.entries(build.entries).map(([spec, file]) => [spec, map(file)])
            ),
          }
        : {}),
      ...(build.excludedEntries !== undefined ? { excludedEntries: files(build.excludedEntries) } : {}),
      ...(build.deferredEntries !== undefined ? { deferredEntries: files(build.deferredEntries) } : {}),
      inputs: build.inputs.map(map),
    };
  }
}
