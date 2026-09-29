import type { RestRequestContext } from '@gears-frontx/api';
import { describe, expect, it, vi } from 'vitest';
import { MockResponseError, mockReply, RestMockPlugin, type RestMockMap } from './RestMockPlugin';

const request = (overrides: Partial<RestRequestContext> = {}): RestRequestContext => ({
  method: 'GET',
  url: '/api/things',
  headers: {},
  ...overrides,
});

const mockMap: RestMockMap = {
  'GET /api/things': () => ({ things: [1, 2] }),
  'GET /api/things/special': () => ({ special: true }),
  'POST /api/things': (body) =>
    typeof body === 'object' && body !== null && !Array.isArray(body) && typeof body.name === 'string'
      ? mockReply(201, { created: body.name })
      : mockReply(400, { error: 'name is required' }),
};

describe('RestMockPlugin', () => {
  it('short-circuits a mapped route with its factory value as a 200', async () => {
    const plugin = new RestMockPlugin({ mockMap });

    await expect(plugin.onRequest(request())).resolves.toEqual({
      shortCircuit: { status: 200, headers: { 'x-frontx-short-circuit': 'true' }, data: { things: [1, 2] } },
    });
  });

  it('matches the exact method and path only, so a longer path is its own route', async () => {
    const plugin = new RestMockPlugin({ mockMap });

    const special = await plugin.onRequest(request({ url: '/api/things/special' }));
    expect(special.shortCircuit.data).toEqual({ special: true });
    await expect(plugin.onRequest(request({ method: 'DELETE' }))).rejects.toMatchObject({ status: 404 });
  });

  it('answers an unmapped route with a 404 rather than letting it reach the network', async () => {
    const plugin = new RestMockPlugin({ mockMap });

    const failure = plugin.onRequest(request({ url: '/api/unknown' }));
    await expect(failure).rejects.toBeInstanceOf(MockResponseError);
    await expect(failure).rejects.toMatchObject({ status: 404 });
  });

  it("carries a factory's own status: a success passes through, a 4xx rejects with the body", async () => {
    const plugin = new RestMockPlugin({ mockMap });

    const created = await plugin.onRequest(request({ method: 'POST', body: { name: 'lamp' } }));
    expect(created.shortCircuit).toMatchObject({ status: 201, data: { created: 'lamp' } });

    await expect(plugin.onRequest(request({ method: 'POST', body: {} }))).rejects.toMatchObject({
      status: 400,
      body: { error: 'name is required' },
    });
  });

  it('hands the factory a JSON string body parsed, and anything that is not JSON as absent', async () => {
    const factory = vi.fn(() => ({}));
    const plugin = new RestMockPlugin({ mockMap: { 'POST /api/echo': factory } });

    await plugin.onRequest(request({ method: 'POST', url: '/api/echo', body: '{"a":1}' }));
    await plugin.onRequest(request({ method: 'POST', url: '/api/echo', body: () => undefined }));

    expect(factory.mock.calls).toEqual([[{ a: 1 }], [undefined]]);
  });

  it('waits out the configured delay before answering', async () => {
    vi.useFakeTimers();
    const plugin = new RestMockPlugin({ mockMap, delay: 100 });
    const settled = vi.fn();

    void plugin.onRequest(request()).then(settled);
    await vi.advanceTimersByTimeAsync(99);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('rejects as soon as the request is aborted during the delay, and never calls the factory', async () => {
    vi.useFakeTimers();
    const factory = vi.fn(() => ({}));
    const plugin = new RestMockPlugin({ mockMap: { 'GET /api/things': factory }, delay: 1_000 });
    const controller = new AbortController();

    const pending = plugin.onRequest(request({ signal: controller.signal }));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(factory).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('refuses a request whose signal is already aborted, delay or not', async () => {
    const controller = new AbortController();
    controller.abort();
    const plugin = new RestMockPlugin({ mockMap });

    await expect(plugin.onRequest(request({ signal: controller.signal }))).rejects.toMatchObject({ name: 'AbortError' });
  });
});
