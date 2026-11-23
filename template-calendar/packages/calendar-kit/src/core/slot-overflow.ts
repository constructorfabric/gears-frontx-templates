import type { UtcInstant } from './model';

/**
 * Keeps the earliest `maxEventsPerSlot` segments of each slot and counts the rest per slot.
 * Segments whose `slotKeyOf` is `undefined` are never capped. No cap keeps everything.
 */
export const capSegmentsPerSlot = <T extends { readonly start: UtcInstant }>(
  segments: readonly T[],
  slotKeyOf: (segment: T) => string | undefined,
  maxEventsPerSlot: number | undefined
): { readonly visible: readonly T[]; readonly hiddenBySlot: ReadonlyMap<string, number> } => {
  if (maxEventsPerSlot === undefined) {
    return { hiddenBySlot: new Map(), visible: segments };
  }

  if (!Number.isInteger(maxEventsPerSlot) || maxEventsPerSlot < 1) {
    throw new RangeError(`maxEventsPerSlot must be a positive integer: ${maxEventsPerSlot}`);
  }

  const kept = new Set<T>();
  const countBySlot = new Map<string, number>();
  const hiddenBySlot = new Map<string, number>();

  for (const segment of [...segments].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    const key = slotKeyOf(segment);

    if (key === undefined) {
      kept.add(segment);

      continue;
    }

    const count = (countBySlot.get(key) ?? 0) + 1;

    countBySlot.set(key, count);

    if (count <= maxEventsPerSlot) {
      kept.add(segment);
    } else {
      hiddenBySlot.set(key, count - maxEventsPerSlot);
    }
  }

  return {
    hiddenBySlot,
    visible: segments.filter((segment) => kept.has(segment)),
  };
};
