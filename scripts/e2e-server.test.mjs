import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isUnitFetch, pathOf, serveFile } from '../e2e/server.mjs';

/** @type {string | undefined} */
let distDir;

afterEach(async () => {
  if (distDir) await rm(distDir, { recursive: true, force: true });
  distDir = undefined;
});

/** A response double that records the status `serveFile` writes. */
function fakeResponse() {
  return {
    status: 0,
    writeHead(status) {
      this.status = status;
    },
    end() {},
  };
}

describe('e2e server serveFile', () => {
  it('answers a malformed percent escape with 400 instead of throwing', async () => {
    distDir = await mkdtemp(path.join(tmpdir(), 'e2e-server-'));
    const res = fakeResponse();

    expect(() => serveFile(distDir, '/%E0%A4%A', res, {})).not.toThrow();
    expect(res.status).toBe(400);
  });

  it('still answers a missing file with 404', async () => {
    distDir = await mkdtemp(path.join(tmpdir(), 'e2e-server-'));
    const res = fakeResponse();

    serveFile(distDir, '/missing.js', res, {});

    expect(res.status).toBe(404);
  });
});

describe('e2e server request target', () => {
  it('pathOf answers null for a target that does not parse instead of throwing', () => {
    expect(pathOf({ url: '//' })).toBeNull();
    expect(pathOf({ url: '/shared/a.js?x=1' })).toBe('/shared/a.js');
  });

  it('isUnitFetch treats an unparsable target as not a unit fetch', () => {
    const headers = { 'sec-fetch-dest': 'empty' };
    expect(() => isUnitFetch({ url: '//', headers })).not.toThrow();
    expect(isUnitFetch({ url: '//', headers })).toBe(false);
    expect(isUnitFetch({ url: '/shared/a.js', headers })).toBe(true);
  });
});
