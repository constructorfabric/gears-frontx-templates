import { act, createElement } from 'react';
import { resetSharedFetchCache, retainSharedFetchCache, type EndpointDescriptor, type MutationDescriptor } from '@gears-frontx/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import {
  resetQueryCache,
  setQueryCacheEpoch,
  useApiMutation,
  useApiQuery,
  type MutationResult,
  type QueryResult,
} from '@inbox-shared/api/queries';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (cause: unknown) => void };

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** A descriptor whose every fetch is recorded and settled by the test. */
const controlledEndpoint = <T,>(key: string) => {
  const calls: { signal: AbortSignal | undefined; staleTime: number | undefined; response: Deferred<T> }[] = [];
  const descriptor: EndpointDescriptor<T> = {
    key: ['/api', 'GET', key],
    fetch: (options) => {
      const response = deferred<T>();
      calls.push({ signal: options?.signal, staleTime: options?.staleTime, response });
      return response.promise;
    },
  };
  return { descriptor, calls };
};

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

function QueryProbe<T>({ descriptor, onResult }: { descriptor: EndpointDescriptor<T>; onResult: (result: QueryResult<T>) => void }) {
  onResult(useApiQuery(descriptor));
  return null;
}

const mountQuery = <T,>(descriptor: EndpointDescriptor<T>) => {
  const results: QueryResult<T>[] = [];
  const view = render(createElement(QueryProbe<T>, { descriptor, onResult: (result) => results.push(result) }));
  return {
    view,
    latest: () => results[results.length - 1],
    rerender: (next: EndpointDescriptor<T>) =>
      view.rerender(createElement(QueryProbe<T>, { descriptor: next, onResult: (result) => results.push(result) })),
  };
};

afterEach(() => {
  resetQueryCache();
});

describe('useApiQuery', () => {
  it('requests once per key however many components read it, and serves the answer to all of them', async () => {
    const { descriptor, calls } = controlledEndpoint<string>('shared');
    const first = mountQuery(descriptor);
    const second = mountQuery(descriptor);

    expect(calls).toHaveLength(1);
    // Past the page-wide fetch cache the shell retains: that cache is shared
    // by every screen package and outlives another screen's write.
    expect(calls[0].staleTime).toBe(0);
    calls[0].response.resolve('answer');
    await flush();

    expect(first.latest()).toMatchObject({ data: 'answer', isLoading: false, error: null });
    expect(second.latest()).toMatchObject({ data: 'answer', isLoading: false });

    // A remount after the answer arrived is served from the cache, on its
    // very first render: no loading frame before the cached answer.
    first.view.unmount();
    const third = mountQuery(descriptor);
    expect(third.latest()).toMatchObject({ data: 'answer', isLoading: false });
    await flush();
    expect(calls).toHaveLength(1);
    second.view.unmount();
    third.view.unmount();
  });

  it('evicts a failed request so the next mount asks again', async () => {
    const { descriptor, calls } = controlledEndpoint<string>('failing');
    const first = mountQuery(descriptor);
    calls[0].response.reject(new Error('boom'));
    await flush();
    expect(first.latest()).toMatchObject({ data: undefined, isLoading: false });
    expect(first.latest().error?.message).toBe('boom');
    first.view.unmount();

    mountQuery(descriptor).view.unmount();
    expect(calls).toHaveLength(2);
  });

  it('goes back to loading when the key changes, instead of showing the previous answer', async () => {
    const one = controlledEndpoint<string>('one');
    const two = controlledEndpoint<string>('two');
    const probe = mountQuery(one.descriptor);
    one.calls[0].response.resolve('first');
    await flush();
    expect(probe.latest().data).toBe('first');

    probe.rerender(two.descriptor);
    expect(probe.latest()).toMatchObject({ data: undefined, isLoading: true });
    probe.view.unmount();
  });

  it('refetches on demand, forgetting the cached answer', async () => {
    const { descriptor, calls } = controlledEndpoint<string>('retry');
    const probe = mountQuery(descriptor);
    calls[0].response.reject(new Error('down'));
    await flush();

    act(() => probe.latest().refetch());
    expect(probe.latest().isLoading).toBe(true);
    expect(calls).toHaveLength(2);
    calls[1].response.resolve('up');
    await flush();
    expect(probe.latest()).toMatchObject({ data: 'up', error: null, isLoading: false });
    probe.view.unmount();
  });

  it('aborts a pending request once nobody is waiting for it, and starts over on the next mount', async () => {
    const { descriptor, calls } = controlledEndpoint<string>('abandoned');
    const probe = mountQuery(descriptor);
    probe.view.unmount();
    await flush();

    expect(calls[0].signal?.aborted).toBe(true);
    mountQuery(descriptor).view.unmount();
    expect(calls).toHaveLength(2);
  });

  it("keeps a pending request alive through StrictMode's unmount and remount", async () => {
    const { descriptor, calls } = controlledEndpoint<string>('strict');
    const results: QueryResult<string>[] = [];
    const view = render(
      createElement(
        (await import('react')).StrictMode,
        null,
        createElement(QueryProbe<string>, { descriptor, onResult: (result) => results.push(result) })
      )
    );
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0].signal?.aborted).toBe(false);
    calls[0].response.resolve('kept');
    await flush();
    expect(results[results.length - 1].data).toBe('kept');
    view.unmount();
  });
});

/*
 * Vitest runs in Node, where a promise rejection nobody handles is reported
 * on `process`; the app's test types carry no Node typings, so the one event
 * this suite listens to is typed here.
 */
type RejectionListener = (reason: unknown) => void;
const nodeProcess = (
  globalThis as unknown as {
    process: {
      on: (event: 'unhandledRejection', listener: RejectionListener) => void;
      off: (event: 'unhandledRejection', listener: RejectionListener) => void;
    };
  }
).process;

const watchUnhandledRejections = (listener: RejectionListener): (() => void) => {
  nodeProcess.on('unhandledRejection', listener);
  return () => nodeProcess.off('unhandledRejection', listener);
};

function MutationProbe<TData, TVariables>(props: {
  options: Parameters<typeof useApiMutation<TData, TVariables>>[0];
  onResult: (result: MutationResult<TVariables>) => void;
}) {
  props.onResult(useApiMutation(props.options));
  return null;
}

describe('useApiMutation', () => {
  const mutationEndpoint = () => {
    const calls: { variables: string; response: Deferred<string> }[] = [];
    const endpoint: MutationDescriptor<string, string> = {
      key: ['/api', 'POST', 'write'],
      fetch: (variables) => {
        const response = deferred<string>();
        calls.push({ variables, response });
        return response.promise;
      },
    };
    return { endpoint, calls };
  };

  const mountMutation = (options: Parameters<typeof useApiMutation<string, string>>[0]) => {
    const results: MutationResult<string>[] = [];
    const view = render(
      createElement(MutationProbe<string, string>, { options, onResult: (result) => results.push(result) })
    );
    return { view, latest: () => results[results.length - 1] };
  };

  it('stays pending until every overlapping call settled, and reports each with its own variables', async () => {
    const { endpoint, calls } = mutationEndpoint();
    const onSuccess = vi.fn();
    const probe = mountMutation({ endpoint, onSuccess });

    act(() => probe.latest().mutate('a'));
    act(() => probe.latest().mutate('b'));
    expect(probe.latest().isPending).toBe(true);

    calls[0].response.resolve('done-a');
    await flush();
    expect(probe.latest().isPending).toBe(true);

    calls[1].response.resolve('done-b');
    await flush();
    expect(probe.latest().isPending).toBe(false);
    expect(onSuccess.mock.calls).toEqual([
      ['done-a', 'a'],
      ['done-b', 'b'],
    ]);
    probe.view.unmount();
  });

  it('evicts the reads it names after a success, so the next mount reads again', async () => {
    const read = controlledEndpoint<string>('read-after-write');
    const reader = mountQuery(read.descriptor);
    read.calls[0].response.resolve('before');
    await flush();

    const { endpoint, calls } = mutationEndpoint();
    const writer = mountMutation({ endpoint, invalidates: [read.descriptor] });
    act(() => writer.latest().mutate('x'));
    calls[0].response.resolve('ok');
    await flush();

    reader.view.unmount();
    mountQuery(read.descriptor).view.unmount();
    expect(read.calls).toHaveLength(2);
    writer.view.unmount();
  });

  it('still evicts after the caller unmounted, but calls back and updates nothing', async () => {
    const read = controlledEndpoint<string>('read-after-unmount');
    // Mounted until the answer is cached: a reader leaving earlier would
    // abort and evict the request itself, and the refetch below would prove
    // nothing about the write.
    const reader = mountQuery(read.descriptor);
    read.calls[0].response.resolve('cached');
    await flush();
    reader.view.unmount();
    await flush();
    mountQuery(read.descriptor).view.unmount();
    expect(read.calls).toHaveLength(1);

    const { endpoint, calls } = mutationEndpoint();
    const onSuccess = vi.fn();
    const writer = mountMutation({ endpoint, invalidates: [read.descriptor], onSuccess });
    act(() => writer.latest().mutate('x'));
    writer.view.unmount();

    const consoleError = vi.spyOn(console, 'error');
    calls[0].response.resolve('ok');
    await flush();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    mountQuery(read.descriptor).view.unmount();
    expect(read.calls).toHaveLength(2);
  });

  it('runs afterSuccess even after the caller unmounted', async () => {
    const { endpoint, calls } = mutationEndpoint();
    const afterSuccess = vi.fn();
    const writer = mountMutation({ endpoint, afterSuccess });
    act(() => writer.latest().mutate('x'));
    writer.view.unmount();

    calls[0].response.resolve('ok');
    await flush();
    expect(afterSuccess).toHaveBeenCalledWith('ok', 'x');
  });

  it('settles a call whose afterSuccess throws as failed, through error and onError', async () => {
    const { endpoint, calls } = mutationEndpoint();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const unhandled = vi.fn();
    const stopWatching = watchUnhandledRejections(unhandled);
    const probe = mountMutation({
      endpoint,
      afterSuccess: () => {
        throw new Error('store refused');
      },
      onSuccess,
      onError,
    });

    act(() => probe.latest().mutate('x'));
    calls[0].response.resolve('ok');
    await flush();

    expect(probe.latest().isPending).toBe(false);
    expect(probe.latest().error?.message).toBe('store refused');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'store refused' }), 'x');
    expect(onSuccess).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unhandled).not.toHaveBeenCalled();
    stopWatching();
    probe.view.unmount();
  });

  it('lets no afterSuccess failure escape after the caller unmounted', async () => {
    const { endpoint, calls } = mutationEndpoint();
    const onError = vi.fn();
    const unhandled = vi.fn();
    const stopWatching = watchUnhandledRejections(unhandled);
    const writer = mountMutation({
      endpoint,
      afterSuccess: () => {
        throw new Error('store refused');
      },
      onError,
    });
    act(() => writer.latest().mutate('x'));
    writer.view.unmount();

    calls[0].response.resolve('ok');
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).not.toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
    stopWatching();
  });

  it('keeps mutate one function across renders, and calls back with the latest options', async () => {
    const { endpoint, calls } = mutationEndpoint();
    const first = vi.fn();
    const second = vi.fn();
    const results: MutationResult<string>[] = [];
    const onResult = (result: MutationResult<string>) => results.push(result);
    const view = render(createElement(MutationProbe<string, string>, { options: { endpoint, onSuccess: first }, onResult }));
    const mutate = results[results.length - 1].mutate;

    act(() => mutate('x'));
    view.rerender(createElement(MutationProbe<string, string>, { options: { endpoint, onSuccess: second }, onResult }));
    expect(results[results.length - 1].mutate).toBe(mutate);

    calls[0].response.resolve('ok');
    await flush();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('ok', 'x');
    view.unmount();
  });

  it('reports the failure of the latest call through error and onError', async () => {
    const { endpoint, calls } = mutationEndpoint();
    const onError = vi.fn();
    const probe = mountMutation({ endpoint, onError });

    act(() => probe.latest().mutate('bad'));
    calls[0].response.reject(new Error('rejected'));
    await flush();

    expect(probe.latest().error?.message).toBe('rejected');
    expect(probe.latest().isPending).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'rejected' }), 'bad');
    probe.view.unmount();
  });
});

describe('the cache epoch', () => {
  afterEach(() => {
    setQueryCacheEpoch(() => 0);
  });

  it('keeps serving the cached answer while the epoch stands, and asks again once it moved', async () => {
    let epoch = 0;
    setQueryCacheEpoch(() => epoch);
    const { descriptor, calls } = controlledEndpoint<string>('epoch');

    const first = mountQuery(descriptor);
    calls[0].response.resolve('before');
    await flush();
    first.view.unmount();

    // Another screen of the page writes: the mock store's revision moves.
    const second = mountQuery(descriptor);
    expect(calls).toHaveLength(1);
    expect(second.latest()).toMatchObject({ data: 'before', isLoading: false });
    second.view.unmount();

    epoch = 1;
    const third = mountQuery(descriptor);
    expect(third.latest()).toMatchObject({ data: undefined, isLoading: true });
    expect(calls).toHaveLength(2);
    calls[1].response.resolve('after');
    await flush();
    expect(third.latest()).toMatchObject({ data: 'after', isLoading: false });
  });

  it("adopts the epoch its own write moved, so the rest of the cache stays valid", async () => {
    let epoch = 0;
    setQueryCacheEpoch(() => epoch);
    const read = controlledEndpoint<string>('kept');
    const reader = mountQuery(read.descriptor);
    read.calls[0].response.resolve('kept');
    await flush();
    reader.view.unmount();

    const endpoint: MutationDescriptor<string, string> = {
      key: ['/api', 'POST', 'own-write'],
      fetch: async () => {
        epoch += 1;
        return 'written';
      },
    };
    const results: MutationResult<string>[] = [];
    render(createElement(MutationProbe<string, string>, { options: { endpoint }, onResult: (result) => results.push(result) }));
    act(() => results[results.length - 1].mutate('x'));
    await flush();

    const again = mountQuery(read.descriptor);
    expect(read.calls).toHaveLength(1);
    expect(again.latest()).toMatchObject({ data: 'kept', isLoading: false });
  });
  it('drops the cache after its own write when another screen wrote meanwhile', async () => {
    let epoch = 0;
    setQueryCacheEpoch(() => epoch);
    const read = controlledEndpoint<string>('dropped');
    const reader = mountQuery(read.descriptor);
    read.calls[0].response.resolve('before');
    await flush();
    reader.view.unmount();

    const endpoint: MutationDescriptor<string, string> = {
      key: ['/api', 'POST', 'raced-write'],
      fetch: async () => {
        // Another screen's write lands while this one runs, then this one.
        epoch += 2;
        return 'written';
      },
    };
    const results: MutationResult<string>[] = [];
    render(createElement(MutationProbe<string, string>, { options: { endpoint }, onResult: (result) => results.push(result) }));
    act(() => results[results.length - 1].mutate('x'));
    await flush();

    const again = mountQuery(read.descriptor);
    expect(again.latest()).toMatchObject({ data: undefined, isLoading: true });
    expect(read.calls).toHaveLength(2);
  });

  it('drops the cache after its own write when another screen wrote after a read already moved it', async () => {
    let epoch = 0;
    setQueryCacheEpoch(() => epoch);
    const read = controlledEndpoint<string>('moved-mid-write');
    const response = deferred<string>();
    const endpoint: MutationDescriptor<string, string> = {
      key: ['/api', 'POST', 'slow-write'],
      fetch: () => response.promise,
    };
    const results: MutationResult<string>[] = [];
    render(createElement(MutationProbe<string, string>, { options: { endpoint }, onResult: (result) => results.push(result) }));
    act(() => results[results.length - 1].mutate('x'));

    // This write lands in the store, a read moves the cache onto it and keeps
    // its answer, then another screen writes before this write's answer arrives.
    epoch = 1;
    const reader = mountQuery(read.descriptor);
    read.calls[0].response.resolve('between the writes');
    await flush();
    reader.view.unmount();
    epoch = 2;
    response.resolve('written');
    await flush();

    const again = mountQuery(read.descriptor);
    expect(again.latest()).toMatchObject({ data: undefined, isLoading: true });
    expect(read.calls).toHaveLength(2);
  });

  it('starts its own request after the epoch moved instead of joining one from before the write', async () => {
    let epoch = 0;
    setQueryCacheEpoch(() => epoch);
    const read = controlledEndpoint<string>('joined');
    const early = mountQuery(read.descriptor);

    epoch = 1;
    const late = mountQuery(read.descriptor);
    expect(read.calls).toHaveLength(2);
    read.calls[1].response.resolve('after the write');
    read.calls[0].response.resolve('before the write');
    await flush();
    expect(late.latest()).toMatchObject({ data: 'after the write', isLoading: false });
    expect(early.latest()).toMatchObject({ data: 'before the write', isLoading: false });
    early.view.unmount();
    late.view.unmount();

    const again = mountQuery(read.descriptor);
    expect(read.calls).toHaveLength(2);
    expect(again.latest()).toMatchObject({ data: 'after the write', isLoading: false });
  });

  it('answers a request the epoch moved under, but does not keep the answer', async () => {
    let epoch = 0;
    setQueryCacheEpoch(() => epoch);
    const read = controlledEndpoint<string>('raced-read');
    const other = controlledEndpoint<string>('other-read');
    const reader = mountQuery(read.descriptor);

    // Another screen writes while the request runs, and a read of another
    // key moves this cache onto the new epoch before the answer arrives.
    epoch = 1;
    mountQuery(other.descriptor);
    read.calls[0].response.resolve('from before the write');
    await flush();
    expect(reader.latest()).toMatchObject({ data: 'from before the write', isLoading: false });
    reader.view.unmount();

    const again = mountQuery(read.descriptor);
    expect(again.latest()).toMatchObject({ data: undefined, isLoading: true });
    expect(read.calls).toHaveLength(2);
  });

  it('evicts nothing during render: a render React throws away leaves the cache as it was', async () => {
    let epoch = 0;
    setQueryCacheEpoch(() => epoch);
    const read = controlledEndpoint<string>('render-only');
    const reader = mountQuery(read.descriptor);
    read.calls[0].response.resolve('kept');
    await flush();
    reader.view.unmount();

    // A render under a moved epoch that never commits (no effect runs).
    epoch = 1;
    const results: QueryResult<string>[] = [];
    renderToString(createElement(QueryProbe<string>, { descriptor: read.descriptor, onResult: (result) => results.push(result) }));
    expect(results[0]).toMatchObject({ data: undefined, isLoading: true });

    // Back on the epoch the answer was cached under, it is still there.
    epoch = 0;
    const again = mountQuery(read.descriptor);
    expect(again.latest()).toMatchObject({ data: 'kept', isLoading: false });
    expect(read.calls).toHaveLength(1);
  });
});

describe('the page-wide fetch cache', () => {
  afterEach(() => {
    setQueryCacheEpoch(() => 0);
    resetSharedFetchCache();
  });

  /**
   * A descriptor that reads through the shared fetch cache the way the REST
   * protocol does under the shell (the descriptor's key as an alias, the
   * caller's `staleTime`), over a backend whose every request the test
   * settles and which gives up a request whose signal aborts.
   */
  const sharedEndpoint = (key: string) => {
    const shared = retainSharedFetchCache();
    const requests: Deferred<string>[] = [];
    const descriptorKey = ['/api', 'GET', key];
    const descriptor: EndpointDescriptor<string> = {
      key: descriptorKey,
      fetch: (options) =>
        shared.getOrFetch(
          ['rest', ...descriptorKey],
          ({ signal }) => {
            const request = deferred<string>();
            signal?.addEventListener('abort', () => request.reject(new DOMException('Aborted', 'AbortError')));
            requests.push(request);
            return request.promise;
          },
          { signal: options?.signal, aliases: [descriptorKey], staleTime: options?.staleTime }
        ),
    };
    return { descriptor, requests };
  };

  it('keeps a read after the epoch moved from joining a shared request from before, and answers both readers with the newer result', async () => {
    let epoch = 0;
    setQueryCacheEpoch(() => epoch);
    const { descriptor, requests } = sharedEndpoint('shared-epoch');
    const early = mountQuery(descriptor);
    await flush();
    expect(requests).toHaveLength(1);

    epoch = 1;
    const late = mountQuery(descriptor);
    await flush();
    expect(requests).toHaveLength(2);
    requests[1].resolve('after the write');
    await flush();

    expect(late.latest()).toMatchObject({ data: 'after the write', isLoading: false, error: null });
    expect(early.latest()).toMatchObject({ data: 'after the write', isLoading: false, error: null });
    early.view.unmount();
    late.view.unmount();
  });

  it('keeps a read after its own write from joining a shared request from before it', async () => {
    const { descriptor, requests } = sharedEndpoint('shared-write');
    const early = mountQuery(descriptor);
    await flush();

    const endpoint: MutationDescriptor<string, string> = { key: ['/api', 'POST', 'shared-write'], fetch: async () => 'written' };
    const results: MutationResult<string>[] = [];
    render(
      createElement(MutationProbe<string, string>, {
        options: { endpoint, invalidates: [descriptor] },
        onResult: (result) => results.push(result),
      })
    );
    act(() => results[results.length - 1].mutate('x'));
    await flush();

    const late = mountQuery(descriptor);
    await flush();
    expect(requests).toHaveLength(2);
    requests[1].resolve('after the write');
    await flush();
    expect(late.latest()).toMatchObject({ data: 'after the write', isLoading: false });
    expect(early.latest()).toMatchObject({ data: 'after the write', isLoading: false });
    early.view.unmount();
    late.view.unmount();
  });
});
