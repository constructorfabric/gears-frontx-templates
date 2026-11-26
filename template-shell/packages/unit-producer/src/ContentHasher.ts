/**
 * `ContentHasher` — SHA-256 content identity of emitted chunk files and
 * the build-cache inputs.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';

export class ContentHasher {
  /**
   * SHA-256 hex digest of a file's bytes. Returns `undefined` when the
   * file cannot be read — a missing hash is a valid state the caller
   * records or rejects as its contract requires.
   */
  static ofFile(filePath: string): string | undefined {
    try {
      const bytes = fs.readFileSync(filePath);
      return ContentHasher.ofBytes(bytes);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[unit-producer] contentHash: could not read "${filePath}" ` +
          `(${reason}).`
      );
      return undefined;
    }
  }

  /** SHA-256 hex digest of a byte buffer. */
  static ofBytes(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  /** SHA-256 hex digest of a text. */
  static ofText(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
}
