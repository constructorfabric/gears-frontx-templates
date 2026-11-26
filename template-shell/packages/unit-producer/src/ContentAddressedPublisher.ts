/**
 * `ContentAddressedPublisher` — publishes a staged file to its
 * content-named destination with a same-filesystem rename, atomic for
 * any concurrent reader or builder.
 *
 * A rename failure is never silently dropped. Only `EEXIST` or
 * `ENOTEMPTY` — the destination already exists, a concurrent build
 * published it first — with a destination holding byte-identical
 * content discards the staged copy; differing bytes behind a
 * content-derived name, an unreadable destination, or any other error
 * code throws, so a broken publish fails the build instead of shipping
 * a list that names a file this build never wrote.
 */

import * as fs from 'node:fs';

export class ContentAddressedPublisher {
  /** Rename failure codes that mean "the destination already exists". */
  private static readonly ALREADY_PUBLISHED = new Set(['EEXIST', 'ENOTEMPTY']);

  protected constructor() {}

  /** Moves `stagedFile` to `dest` (whose directory must exist). */
  static publish(stagedFile: string, dest: string): void {
    try {
      fs.renameSync(stagedFile, dest);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === undefined || !ContentAddressedPublisher.ALREADY_PUBLISHED.has(code)) {
        throw err;
      }
      let identical: boolean;
      try {
        identical = fs.readFileSync(stagedFile).equals(fs.readFileSync(dest));
      } catch {
        throw err;
      }
      if (!identical) {
        // `cause` set by assignment: the Error options argument is
        // ES2022, above this template's documented ES2020 app lib.
        const failure = new Error(
          `[unit-producer] cannot publish '${dest}': a file with the same ` +
            'content-derived name already exists with different bytes ' +
            `(rename failed with ${code}).`
        );
        (failure as { cause?: unknown }).cause = err;
        throw failure;
      }
      fs.rmSync(stagedFile, { force: true });
    }
  }
}
