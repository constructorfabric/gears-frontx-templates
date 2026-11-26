/**
 * `OrderedParallelMap` — bounded-concurrency map whose result order
 * and failure are independent of completion order (so
 * output never depends on parallelism). Results come back indexed by
 * input position; when several tasks fail, the failure of the lowest
 * input index is rethrown, never the first to finish.
 */

export class OrderedParallelMap {
  static async map<T, R>(
    items: readonly T[],
    limit: number,
    task: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    const width = Math.max(1, Math.floor(limit));
    const results: R[] = new Array<R>(items.length);
    const failures = new Map<number, unknown>();
    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        try {
          results[index] = await task(items[index], index);
        } catch (err) {
          failures.set(index, err);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(width, items.length) }, () => worker())
    );
    if (failures.size > 0) {
      throw failures.get(Math.min(...failures.keys()));
    }
    return results;
  }
}
