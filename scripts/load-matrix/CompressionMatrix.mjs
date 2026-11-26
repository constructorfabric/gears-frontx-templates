/**
 * `CompressionMatrix` — server compression negotiation. The e2e server
 * precompresses every served
 * file to gzip and brotli ONCE at server start (no compression time
 * measured per request) and serves by `Accept-Encoding`. A run can
 * pin a `none` / `gzip` / `brotli` matrix dimension so every cell in
 * that run serves the same compression; the pin overrides the
 * client's `Accept-Encoding` (the measurement harness controls the
 * client and sends a matching Accept-Encoding; the pin forces the
 * server's choice). The old rule MUST be measured with identical
 * server settings in every cell.
 *
 * Encoding priority (when no dimension is pinned): the coding with the
 * highest q-value wins; ties broken by server preference `brotli` >
 * `gzip` > `none`. A coding with `q=0` is disabled. A coding not listed
 * in `Accept-Encoding` is acceptable only if `*` is listed.
 *
 * One class per file (OOP). Pure — no I/O. The server instantiates
 * this with the file bodies it precomputes at start.
 */

import { gzipSync, brotliCompressSync } from 'node:zlib';

/** @typedef {'none' | 'gzip' | 'brotli'} Encoding */

/**
 * The Accept-Encoding coding name for each dimension. Brotli's
 * coding name on the wire is `br` (RFC 7932), not `brotli`; the
 * dimension name exposed to the matrix is `brotli` per the phase
 * contract.
 */
const CODING_OF = /** @type {const} */ ({ brotli: 'br', gzip: 'gzip', none: 'identity' });

/** Server preference order for ties (highest first). */
const ENCODING_PRIORITY = /** @type {const} */ (['brotli', 'gzip']);

/**
 * Parses an `Accept-Encoding` header into a map of coding → q-value
 * (default q=1). `*` is treated as a wildcard admitting any coding
 * the server offers, but never overrides an explicit coding's q.
 *
 * @param {string} header
 * @returns {Map<string, number>}
 */
export function parseAcceptEncoding(header) {
  const out = new Map();
  if (!header) return out;
  for (const part of header.split(',')) {
    const [coding, ...params] = part.trim().split(';');
    const name = coding.trim().toLowerCase();
    if (!name) continue;
    let q = 1;
    for (const p of params) {
      const m = /^\s*q=([0-9.]+)\s*$/i.exec(p.trim());
      if (m) q = Number.parseFloat(m[1]);
    }
    out.set(name, q);
  }
  return out;
}

/**
 * @typedef {Object} PrecompressedFile
 * @property {string} path
 * @property {Buffer} body
 */

/**
 * @typedef {Object} PrecompressedBodies
 * @property {Buffer} none
 * @property {Buffer} gzip
 * @property {Buffer} brotli
 */

export class CompressionMatrix {
  /** @type {Map<string, PrecompressedBodies>} */
  #files = new Map();
  /** @type {Encoding | undefined} */
  #dimension = undefined;

  /**
   * @param {Object} opts
   * @param {PrecompressedFile[]} opts.files
   */
  constructor({ files }) {
    for (const f of files) {
      this.#files.set(f.path, {
        none: f.body,
        gzip: gzipSync(f.body, { level: 9 }),
        brotli: brotliCompressSync(f.body, { quality: 11 }),
      });
    }
  }

  /**
   * Pins a compression dimension for every cell in a run. `undefined`
   * restores Accept-Encoding negotiation. A pinned dimension overrides
   * the client's `Accept-Encoding` (the harness controls the client).
   *
   * @param {Encoding | undefined} dim
   */
  setDimension(dim) {
    if (dim !== undefined && dim !== 'none' && dim !== 'gzip' && dim !== 'brotli') {
      throw new Error(`unknown compression dimension: ${dim}`);
    }
    this.#dimension = dim;
  }

  /** @returns {Encoding | undefined} */
  getDimension() {
    return this.#dimension;
  }

  /**
   * Returns the precomputed bodies for a file path. Throws if the path
   * was not precomputed at construction.
   *
   * @param {string} p
   * @returns {PrecompressedBodies}
   */
  precompressed(p) {
    const bodies = this.#files.get(p);
    if (!bodies) throw new Error(`no precomputed bodies for ${p}`);
    return bodies;
  }

  /**
   * Negotiates the encoding and body for a request. When a dimension is
   * pinned, the pinned encoding is served regardless of the client's
   * `Accept-Encoding` (the harness controls the client). Otherwise the
   * highest-q coding wins, ties broken by server preference
   * (`brotli` > `gzip` > `none`).
   *
   * @param {string} p
   * @param {string} acceptEncoding
   * @returns {{ encoding: Encoding; body: Buffer }}
   */
  negotiate(p, acceptEncoding) {
    const bodies = this.precompressed(p);
    if (this.#dimension !== undefined) {
      if (this.#dimension === 'none') return { encoding: 'none', body: bodies.none };
      return {
        encoding: this.#dimension,
        body: this.#dimension === 'gzip' ? bodies.gzip : bodies.brotli,
      };
    }
    const q = parseAcceptEncoding(acceptEncoding);
    if (q.size === 0) return { encoding: 'none', body: bodies.none };
    const acceptsStar = q.has('*');
    const codingQ = (dim) => {
      const coding = CODING_OF[dim];
      if (q.has(coding)) return /** @type {number} */ (q.get(coding));
      if (acceptsStar) return /** @type {number} */ (q.get('*'));
      return 0;
    };
    /** @type {{ enc: Encoding; q: number }[]} */
    const candidates = [];
    for (const enc of ENCODING_PRIORITY) {
      const encQ = codingQ(enc);
      if (encQ > 0) candidates.push({ enc, q: encQ });
    }
    if (candidates.length === 0) return { encoding: 'none', body: bodies.none };
    // Stable sort by q desc — ENCODING_PRIORITY order is preserved for ties.
    candidates.sort((a, b) => b.q - a.q);
    const best = candidates[0];
    return { encoding: best.enc, body: best.enc === 'gzip' ? bodies.gzip : bodies.brotli };
  }
}
