import { useState } from 'react';

export type AutoSelect = {
  /** Owes `scope` (a channel, a mailbox) an automatic first pick. */
  arm: (scope: string) => void;
};

/**
 * Opens the first item of a list on its own - on entering a screen and again
 * on every switch of the list's scope (a channel, a mailbox) - without ever
 * second-guessing an item the user picked, or re-opening one after the user
 * closed it.
 *
 * The pick is owed to one scope at a time and is paid once the list's data
 * has settled, whether or not the list has anything to pick: left owed on an
 * empty list, it would later open an item the user never chose. It starts
 * owed only when nothing is selected, so a screen that comes back to a
 * selection it kept (in a store) keeps it.
 *
 * Resolved during render rather than in an effect: it is derived state
 * (React's "adjust state when something changes" pattern), so settling it a
 * render early avoids a frame of the empty state.
 */
export function useAutoSelect({
  scope,
  settled,
  firstId,
  selectedId,
  onSelect,
}: {
  scope: string;
  /** The list's data has arrived (or failed); nothing more is coming for this scope. */
  settled: boolean;
  /** The first item of the list as it renders now, if any. */
  firstId: string | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
}): AutoSelect {
  const [owedTo, setOwedTo] = useState<string | null>(selectedId === null ? scope : null);

  if (owedTo === scope && settled) {
    setOwedTo(null);
    if (firstId !== undefined && selectedId !== firstId) onSelect(firstId);
  }

  return { arm: setOwedTo };
}
