/**
 * A list's pinned rows and the rest, each in the order they arrived. The
 * selectors already sort pinned rows first, so this is a filter, not a
 * re-sort; the chat and mail lists render the two halves under their own
 * group labels.
 */
export const splitPinned = <Row extends { pinned: boolean }>(
  rows: readonly Row[]
): { pinned: Row[]; others: Row[] } => ({
  pinned: rows.filter((row) => row.pinned),
  others: rows.filter((row) => !row.pinned),
});
