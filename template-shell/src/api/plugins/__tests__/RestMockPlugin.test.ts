import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { RestRequestContext } from '@gears-frontx/api';
import { RestMockPlugin } from '../RestMockPlugin';

const request = (method: string, url: string) => ({ method, url, headers: {} }) as unknown as RestRequestContext;

describe('RestMockPlugin, a request no mock key matches', () => {
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the request through and warns once per method and URL, naming the key format and the known keys', async () => {
    const plugin = new RestMockPlugin({ mockMap: { 'GET /api/projects': () => [] } });
    const context = request('get', '/api/projects/list');

    await expect(plugin.onRequest(context)).resolves.toBe(context);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('no mock matches GET /api/projects/list');
    expect(message).toContain('"<METHOD> <full path including baseURL>"');
    expect(message).toContain('Known keys: GET /api/projects.');

    await plugin.onRequest(request('GET', '/api/projects/list'));
    expect(warn).toHaveBeenCalledTimes(1);

    await plugin.onRequest(request('POST', '/api/projects/list'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('lists at most five known keys', async () => {
    const mockMap = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => [`GET /api/${name}`, () => name]));
    await new RestMockPlugin({ mockMap }).onRequest(request('GET', '/api/z'));
    expect(String(warn.mock.calls[0][0])).toContain(
      'Known keys: GET /api/a, GET /api/b, GET /api/c, GET /api/d, GET /api/e (and 2 more).'
    );
  });

  it('does not warn when a key matches, exactly or by a :param pattern', async () => {
    const plugin = new RestMockPlugin({
      mockMap: { 'GET /api/projects/list': () => [], 'GET /api/projects/:id': () => ({}) },
    });

    await expect(plugin.onRequest(request('GET', '/api/projects/list'))).resolves.toHaveProperty('shortCircuit');
    await expect(plugin.onRequest(request('GET', '/api/projects/42'))).resolves.toHaveProperty('shortCircuit');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns again for the same request after setMockMap, listing the new keys', async () => {
    const plugin = new RestMockPlugin({ mockMap: { 'GET /api/old': () => [] } });

    await plugin.onRequest(request('GET', '/api/missing'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('Known keys: GET /api/old.');

    plugin.setMockMap({ 'GET /api/new': () => [] });
    await plugin.onRequest(request('GET', '/api/missing'));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[1][0])).toContain('Known keys: GET /api/new.');
  });

  it('warns once per path, ignoring query string and hash', async () => {
    const plugin = new RestMockPlugin({ mockMap: {} });

    await plugin.onRequest(request('GET', '/api/items?page=1'));
    await plugin.onRequest(request('GET', '/api/items?page=2'));
    await plugin.onRequest(request('GET', '/api/items#section'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('no mock matches GET /api/items;');
  });

  it('stops warning once MAX_WARNED_UNMATCHED distinct paths have warned', async () => {
    const plugin = new RestMockPlugin({ mockMap: {} });

    for (let i = 0; i < 50; i++) {
      await plugin.onRequest(request('GET', `/api/items/${i}`));
    }
    expect(warn).toHaveBeenCalledTimes(50);

    await plugin.onRequest(request('GET', '/api/items/50'));
    expect(warn).toHaveBeenCalledTimes(50);
  });
});
