/**
 * E2E static server — independent hosting for the built template-shell host
 * and each built template-mfe fixture, each on its own origin.
 *
 * Origins (ports in `./ports.mjs`):
 *   shell, no CSP
 *   shell, CSP allows blob: script-src
 *   shell, nonce-based CSP with 'strict-dynamic' + blob:
 *   fixture dists          ports read from each fixture's own
 *                          mfe.json `manifest.remoteEntry`
 *                          (_blank-mfe 3099, demo-mfe 3001, widgets-a 3201,
 *                          widgets-b 3202 at the time of writing)
 *
 * Cache headers (decided): content-hashed assets (shared/ units, assets/)
 * are `public, max-age=31536000, immutable`; documents and manifests are
 * `no-cache`.
 *
 * Fixture origins add `Access-Control-Allow-Origin: *` — the shell fetches
 * manifests, remote entries and unit text cross-origin.
 *
 * The shell's `generated-mfe-manifests.json` is served from the fixture
 * dists on disk (built from each `dist/mfe-manifest.json` at server start,
 * publicPath resolved to the fixture origin), overriding the `[]` the
 * checked-in build ships.
 */

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createSecureServer } from 'node:http2';
import { execFileSync } from 'node:child_process';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { readFileSync, existsSync, statSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHELL_PORT, SHELL_PORT_CSP_BLOB, SHELL_PORT_CSP_STRICT } from './ports.mjs';

// E2E_SERVE_ROOT points the servers at a different build of the same
// inputs — the old-rule worktree of templates `main` eb10640 — so the
// relative timing gate can measure both rules on identical fixtures.
// E2E_PROTOCOL selects the wire protocol for the whole matrix cell:
//   unset / 'http1'  — HTTP/1.1 on http:// (the target-company protocol,
//                      and the default every measurement runs under)
//   'h2'             — HTTP/2 over TLS on https:// with a self-signed
//                      localhost certificate generated at server start;
//                      playwright runs with ignoreHTTPSErrors for this cell
// E2E_COMPRESSION pins the compression dimension for the whole matrix
// cell (compression_matrix): 'none' | 'gzip' | 'brotli'. unset leaves
// the server to negotiate by Accept-Encoding (br > gzip > none). The
// old rule MUST be measured with identical server settings in every
// cell — pass the same E2E_COMPRESSION for the old run.
const PROTOCOL = process.env.E2E_PROTOCOL === 'h2' ? 'h2' : 'http1';
const SCHEME = PROTOCOL === 'h2' ? 'https' : 'http';
const COMPRESSION = ['none', 'gzip', 'brotli'].includes(process.env.E2E_COMPRESSION ?? '')
  ? process.env.E2E_COMPRESSION
  : undefined;

const ROOT = process.env.E2E_SERVE_ROOT
  ? resolve(process.env.E2E_SERVE_ROOT)
  : resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SHELL_DIST = join(ROOT, 'template-shell', 'dist');
const MFE_PACKAGES = join(ROOT, 'template-mfe', 'src-app', 'mfe_packages');
const PROBE_PAGE = fileURLToPath(new URL('./probe.html', import.meta.url));

export const SHELL_ORIGIN = `${SCHEME}://localhost:${SHELL_PORT}`;
export const SHELL_ORIGIN_CSP_BLOB = `${SCHEME}://localhost:${SHELL_PORT_CSP_BLOB}`;
export const SHELL_ORIGIN_CSP_STRICT = `${SCHEME}://localhost:${SHELL_PORT_CSP_STRICT}`;

// Per-origin request counts — a request budget makes the requests per
// shell boot and per MFE load a first-class measured quantity. Each
// server bumps its own counter; `/__e2e/requests` returns the snapshot
// AND resets it, so a test measures exactly the window it brackets.
// Shared-unit requests issued through `fetch()` (`Sec-Fetch-Dest:
// empty`) are also tallied apart: during shell boot the only such
// requests are the realm-cache fill's re-fetches, while the native boot
// loads units as scripts, so the tally splits fill from boot exactly.
const requestCounts = new Map();
const unitFetchCounts = new Map();
function bumpCount(counts, label) {
  counts.set(label, (counts.get(label) ?? 0) + 1);
}
/**
 * The request's URL path, or `null` when the request target does not
 * parse as a URL (`GET //` has an empty host and throws).
 *
 * @param {{ url?: string }} req
 * @returns {string | null}
 */
export function pathOf(req) {
  try {
    return new URL(req.url ?? '/', 'http://x').pathname;
  } catch {
    return null;
  }
}
export function isUnitFetch(req) {
  if (req.headers['sec-fetch-dest'] !== 'empty') return false;
  const path = pathOf(req);
  if (path === null) return false;
  return path.includes('/shared/') && path.endsWith('.js');
}
function countHandler(label, handler) {
  return (req, res) => {
    bumpCount(requestCounts, label);
    if (isUnitFetch(req)) bumpCount(unitFetchCounts, label);
    handler(req, res);
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.zip': 'application/zip',
  '.ts': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// The inline import map is admitted by its sha256 content hash, read
// off the built index.html at server start — the same token the plugin
// logs at build time for hash-based script-src policies.
function importMapCspSource() {
  try {
    const html = readFileSync(join(SHELL_DIST, 'index.html'), 'utf-8');
    const m = /<script type="importmap"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    if (m === null) return null;
    return `'sha256-${createHash('sha256').update(m[1], 'utf-8').digest('base64')}'`;
  } catch {
    return null;
  }
}

const IMPORT_MAP_SOURCE = importMapCspSource();

const CONNECT_SRC =
  `connect-src 'self' http://localhost:* http://127.0.0.1:*` +
  (PROTOCOL === 'h2' ? ' https://localhost:* https://127.0.0.1:*' : '');

const CSP_BLOB =
  "default-src 'self'; script-src 'self' blob:" +
  (IMPORT_MAP_SOURCE !== null ? ` ${IMPORT_MAP_SOURCE}` : '') +
  "; style-src 'self' 'unsafe-inline'; " +
  `img-src 'self' data: blob:; font-src 'self' data:; ${CONNECT_SRC}; worker-src 'self' blob:`;

// nonce-e2e marks the document's own scripts trusted; 'strict-dynamic' drops the
// host allowlist for loads those scripts initiate. blob: kept in script-src.
const CSP_STRICT_DYNAMIC =
  "default-src 'self'; script-src 'nonce-e2e' 'strict-dynamic' blob:; style-src 'self' 'unsafe-inline'; " +
  `img-src 'self' data: blob:; font-src 'self' data:; ${CONNECT_SRC}; worker-src 'self' blob:`;

function fixtureDirs() {
  return readdirSync(MFE_PACKAGES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => join(MFE_PACKAGES, d.name, 'dist'))
    .filter((dist) => existsSync(join(dist, 'mfe-manifest.json')));
}

/** The authored `manifest.remoteEntry` of the package whose built output is `dist`. */
function authoredRemoteEntry(dist) {
  const authored = JSON.parse(readFileSync(join(dist, '..', 'mfe.json'), 'utf-8'));
  return authored.manifest.remoteEntry;
}

function fixtureOrigin(remoteEntry) {
  const url = new URL(remoteEntry);
  return `${SCHEME}://${url.host}`;
}

/**
 * Aggregate `generated-mfe-manifests.json` content: one entry per fixture,
 * with `metaData.publicPath` resolved to the fixture's own origin so the
 * handler's "auto" guard sees a concrete URL.
 */
function buildAggregate(fixtures) {
  const packages = fixtures.map(({ manifest, remoteEntry }) => {
    const outManifest = {
      ...manifest.manifest,
      metaData: { ...manifest.manifest.metaData, publicPath: `${fixtureOrigin(remoteEntry)}/` },
    };
    return {
      manifest: outManifest,
      ...(manifest.domains !== undefined && { domains: manifest.domains }),
      entries: (manifest.entries ?? []).map((e) => ({ ...e, manifest: outManifest.id })),
      extensions: manifest.extensions ?? [],
      ...(manifest.schemas !== undefined && { schemas: manifest.schemas }),
      ...(manifest.labelDictionaries !== undefined && { labelDictionaries: manifest.labelDictionaries }),
    };
  });
  return JSON.stringify(packages);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

/**
 * Precompression cache (compression_matrix): every served file is
 * read ONCE at server start and precompressed to gzip and brotli —
 * no compression time is measured per request. `precompress` caches
 * by a string key; `precompressedBody` looks up the precomputed
 * bodies for a file path (lazily reading the file on first serve).
 * The `E2E_COMPRESSION` env var pins a dimension; when set,
 * `negotiateEncoding` returns the pinned dimension regardless of
 * the client's Accept-Encoding (the harness controls the client).
 */
const precompressed = new Map();

/**
 * @param {string} key
 * @param {Buffer} body
 * @returns {{ none: Buffer; gzip: Buffer; brotli: Buffer }}
 */
function precompress(key, body) {
  let entry = precompressed.get(key);
  if (entry !== undefined) return entry;
  entry = {
    none: body,
    gzip: gzipSync(body, { level: 9 }),
    brotli: brotliCompressSync(body, { quality: 11 }),
  };
  precompressed.set(key, entry);
  return entry;
}

/**
 * @param {string} absFile
 * @returns {{ none: Buffer; gzip: Buffer; brotli: Buffer }}
 */
function precompressedBody(absFile) {
  const cached = precompressed.get(absFile);
  if (cached !== undefined) return cached;
  return precompress(absFile, readFileSync(absFile));
}

/**
 * Picks the encoding for a response. When `E2E_COMPRESSION` is set,
 * the pinned dimension wins (the harness controls the client).
 * Otherwise the server negotiates by Accept-Encoding (br > gzip >
 * none), gated by q-values.
 *
 * @param {string} acceptEncoding
 * @returns {'none' | 'gzip' | 'brotli'}
 */
function negotiateEncoding(acceptEncoding) {
  if (COMPRESSION !== undefined) return COMPRESSION;
  if (!acceptEncoding) return 'none';
  /** @type {Map<string, number>} */
  const q = new Map();
  for (const part of acceptEncoding.split(',')) {
    const [coding, ...params] = part.trim().split(';');
    const name = coding.trim().toLowerCase();
    if (!name) continue;
    let qv = 1;
    for (const p of params) {
      const m = /^\s*q=([0-9.]+)\s*$/i.exec(p.trim());
      if (m) qv = Number.parseFloat(m[1]);
    }
    q.set(name, qv);
  }
  const acceptsStar = q.has('*');
  const codingQ = (coding) => q.get(coding) ?? (acceptsStar ? (q.get('*') ?? 1) : 0);
  const br = codingQ('br');
  const gz = codingQ('gzip');
  if (br > 0 && br >= gz) return 'brotli';
  if (gz > 0) return 'gzip';
  return 'none';
}

/**
 * The HTTP `content-encoding` header value for each dimension. Brotli's
 * coding name on the wire is `br` (RFC 7932), not `brotli`; gzip is
 * `gzip`. `none` sends no header.
 *
 * @param {{ encoding: 'none' | 'gzip' | 'brotli'; }} choice
 * @returns {string | undefined}
 */
function contentEncodingHeader({ encoding }) {
  if (encoding === 'none') return undefined;
  return encoding === 'brotli' ? 'br' : 'gzip';
}

/**
 * Sends a precompressed body, negotiating by Accept-Encoding (or the
 * pinned `E2E_COMPRESSION` dimension). Used for the inline aggregate
 * and the probe page (both precompressed once at start), and called by
 * `serveFile` for files served from dist dirs.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {{ none: Buffer; gzip: Buffer; brotli: Buffer }} bodies
 * @param {string} acceptEncoding
 * @param {Record<string, string>} headers
 */
function serveCompressed(res, bodies, acceptEncoding, headers) {
  const choice = { encoding: negotiateEncoding(acceptEncoding) };
  const body = bodies[choice.encoding];
  const encHeader = contentEncodingHeader(choice);
  const responseHeaders = { ...headers };
  if (encHeader) {
    responseHeaders['content-encoding'] = encHeader;
    responseHeaders['vary'] = responseHeaders['vary']
      ? `${responseHeaders['vary']}, Accept-Encoding`
      : 'Accept-Encoding';
  }
  send(res, 200, body, responseHeaders);
}

export function serveFile(distDir, urlPath, res, extraHeaders) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    // A malformed `%` escape is a bad request, not a reason to take the
    // server down mid-run.
    return send(res, 400, 'bad request');
  }
  const clean = normalize(decoded).replace(/^([/\\])+/, '');
  if (clean.startsWith('..')) return send(res, 403, 'forbidden');
  let file = join(distDir, clean);
  if (!existsSync(file) || !statSync(file).isFile()) {
    // remoteEntry.js ships at dist root while manifests address it under
    // assets/ — fall back to the root file when the assets path misses.
    const alt = join(distDir, clean.split('/').pop());
    if (existsSync(alt) && statSync(alt).isFile()) file = alt;
    else return send(res, 404, 'not found', extraHeaders);
  }
  const hashed = clean.startsWith('shared/') || clean.startsWith('assets/');
  const acceptEncoding =
    /** @type {string | undefined} */ (
      (extraHeaders && extraHeaders['accept-encoding']) ||
      (extraHeaders && extraHeaders['Accept-Encoding'])
    ) ?? '';
  // The shell handler passes the request's Accept-Encoding via an
  // extraHeaders slot the handler does NOT write back out — it is
  // stripped from the response headers below.
  const responseHeaders = { ...extraHeaders };
  delete responseHeaders['accept-encoding'];
  delete responseHeaders['Accept-Encoding'];
  serveCompressed(res, precompressedBody(file), acceptEncoding, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...responseHeaders,
  });
}

// h2 needs TLS — browsers don't do cleartext h2. A throwaway self-signed
// localhost cert per server start keeps the matrix self-contained; the
// playwright side ignores cert errors for this cell.
function h2Credentials() {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-h2-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
  ], { stdio: 'pipe' });
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

function listen(label, handler, port, creds) {
  const counted = countHandler(label, handler);
  // http2.createSecureServer with allowHTTP1 serves both — the request
  // handler signature is identical, so the same handler runs on either
  // protocol and the counts stay comparable cell to cell.
  const server =
    PROTOCOL === 'h2'
      ? createSecureServer({ ...creds, allowHTTP1: true }, counted)
      : createServer(counted);
  return server.listen(port);
}

export function startServers() {
  const fixtures = fixtureDirs().map((dist) => ({
    dist,
    remoteEntry: authoredRemoteEntry(dist),
    manifest: JSON.parse(readFileSync(join(dist, 'mfe-manifest.json'), 'utf-8')),
  }));
  const aggregate = buildAggregate(fixtures);
  const creds = PROTOCOL === 'h2' ? h2Credentials() : undefined;
  const servers = [];

  // Precompress the inline aggregate and the probe page ONCE at server
  // start (compression_matrix) — no compression time is measured per
  // request. Both are reused for every run in the matrix cell.
  const aggregateBodies = precompress('aggregate', Buffer.from(aggregate, 'utf-8'));
  const probeBodies = precompress('probe.html', readFileSync(PROBE_PAGE));

  const requestCountsEndpoint = (req, res) => {
    send(
      res,
      200,
      JSON.stringify({
        total: Object.fromEntries(requestCounts),
        unitFetches: Object.fromEntries(unitFetchCounts),
      }),
      {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-cache',
      },
    );
    requestCounts.clear();
    unitFetchCounts.clear();
  };

  const shellHandler = (csp) => (req, res) => {
    const path = pathOf(req);
    if (path === null) return send(res, 400, 'bad request target');
    const acceptEncoding = /** @type {string} */ (req.headers['accept-encoding'] ?? '');
    if (path === '/__e2e/requests') {
      return requestCountsEndpoint(req, res);
    }
    if (path === '/probe.html') {
      return serveCompressed(res, probeBodies, acceptEncoding, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache',
        ...(csp ? { 'content-security-policy': csp } : {}),
      });
    }
    if (path === '/generated-mfe-manifests.json') {
      return serveCompressed(res, aggregateBodies, acceptEncoding, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-cache',
        ...(csp ? { 'content-security-policy': csp } : {}),
      });
    }
    // SPA fallback: app routes (/blank-home, /uikit-elements, …) get
    // index.html; asset paths 404 as usual.
    const target =
      path === '/' || !extname(path) ? '/index.html' : path;
    serveFile(SHELL_DIST, target, res, {
      'accept-encoding': acceptEncoding,
      ...(csp ? { 'content-security-policy': csp } : {}),
    });
  };

  servers.push(listen(`shell:${SHELL_PORT}`, shellHandler(null), SHELL_PORT, creds));
  servers.push(listen(`shell:${SHELL_PORT_CSP_BLOB}`, shellHandler(CSP_BLOB), SHELL_PORT_CSP_BLOB, creds));
  servers.push(
    listen(`shell:${SHELL_PORT_CSP_STRICT}`, shellHandler(CSP_STRICT_DYNAMIC), SHELL_PORT_CSP_STRICT, creds),
  );

  for (const f of fixtures) {
    const port = Number(new URL(f.remoteEntry).port);
    servers.push(
      listen(`fixture:${port}`, (req, res) => {
        const path = pathOf(req);
        if (path === null) return send(res, 400, 'bad request target');
        if (req.method === 'OPTIONS') {
          return send(res, 204, '', {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, OPTIONS',
            'access-control-allow-headers': '*',
          });
        }
        serveFile(f.dist, path, res, {
          'access-control-allow-origin': '*',
          'accept-encoding': /** @type {string} */ (req.headers['accept-encoding'] ?? ''),
        });
      }, port, creds),
    );
  }

  return {
    fixtureOrigins: fixtures.map((f) => fixtureOrigin(f.remoteEntry)),
    close: () => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))),
    ready: Promise.all(servers.map((s) => new Promise((r) => s.on('listening', r)))),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const s = startServers();
  Promise.resolve(s.ready).then(() => {
    console.log(
      `e2e servers up: shell :${SHELL_PORT}/:${SHELL_PORT_CSP_BLOB}/:${SHELL_PORT_CSP_STRICT}, ` +
        `fixtures ${s.fixtureOrigins.join(', ')}`,
    );
  });
}
