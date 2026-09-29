import { act, createElement } from 'react';
import type { EndpointDescriptor, MutationDescriptor } from '@gears-frontx/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../__test-utils__/renderScreen';
import { resetQueryCache, useApiMutation, useApiQuery, type MutationResult, type QueryResult } from './queries';

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
  const calls: { signal: AbortSignal | undefined; response: Deferred<T> }[] = [];
  const descriptor: EndpointDescriptor<T> = {
    key: ['/api', 'GET', key],
    fetch: (options) => {
      const response = deferred<T>();
      calls.push({ signal: options?.signal, response });
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
  const screen = renderScreen(createElement(QueryProbe<T>, { descriptor, onResult: (result) => results.push(result) }));
  return {
    screen,
    latest: () => results[results.length - 1],
    rerender: (next: EndpointDescriptor<T>) =>
      screen.rerender(createElement(QueryProbe<T>, { descriptor: next, onResult: (result) => results.push(result) })),
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
    calls[0].response.resolve('answer');
    await flush();

    expect(first.latest()).toMatchObject({ data: 'answer', isLoading: false, error: null });
    expect(second.latest()).toMatchObject({ data: 'answer', isLoading: false });

    // A remount after the answer arrived is served from the cache.
    first.screen.unmount();
    const third = mountQuery(descriptor);
    await flush();
    expect(calls).toHaveLength(1);
    expect(third.latest().data).toBe('answer');
    second.screen.unmount();
    third.screen.unmount();
  });

  it('evicts a failed request so the next mount asks again', async () => {
    const { descriptor, calls } = controlledEndpoint<string>('failing');
    const first = mountQuery(descriptor);
    calls[0].response.reject(new Error('boom'));
    await flush();
    expect(first.latest()).toMatchObject({ data: undefined, isLoading: false });
    expect(first.latest().error?.message).toBe('boom');
    first.screen.unmount();

    mountQuery(descriptor).screen.unmount();
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
    probe.screen.unmount();
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
    probe.screen.unmount();
  });

  it('aborts a pending request once nobody is waiting for it, and starts over on the next mount', async () => {
    const { descriptor, calls } = controlledEndpoint<string>('abandoned');
    const probe = mountQuery(descriptor);
    probe.screen.unmount();
    await flush();

    expect(calls[0].signal?.aborted).toBe(true);
    mountQuery(descriptor).screen.unmount();
    expect(calls).toHaveLength(2);
  });

  it("keeps a pending request alive through StrictMode's unmount and remount", async () => {
    const { descriptor, calls } = controlledEndpoint<string>('strict');
    const results: QueryResult<string>[] = [];
    const screen = renderScreen(
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
    screen.unmount();
  });
});

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
    const screen = renderScreen(
      createElement(MutationProbe<string, string>, { options, onResult: (result) => results.push(result) })
    );
    return { screen, latest: () => results[results.length - 1] };
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
    probe.screen.unmount();
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

    reader.screen.unmount();
    mountQuery(read.descriptor).screen.unmount();
    expect(read.calls).toHaveLength(2);
    writer.screen.unmount();
  });

  it('still evicts after the caller unmounted, but calls back and updates nothing', async () => {
    const read = controlledEndpoint<string>('read-after-unmount');
    mountQuery(read.descriptor).screen.unmount();
    read.calls[0].response.resolve('cached');
    await flush();

    const { endpoint, calls } = mutationEndpoint();
    const onSuccess = vi.fn();
    const writer = mountMutation({ endpoint, invalidates: [read.descriptor], onSuccess });
    act(() => writer.latest().mutate('x'));
    writer.screen.unmount();

    const consoleError = vi.spyOn(console, 'error');
    calls[0].response.resolve('ok');
    await flush();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    mountQuery(read.descriptor).screen.unmount();
    expect(read.calls.length).toBeGreaterThan(1);
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
    probe.screen.unmount();
  });
});
