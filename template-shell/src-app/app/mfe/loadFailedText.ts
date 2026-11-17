import { useShellWord } from '@/app/i18n/useShellWord';

export interface LoadFailedProps {
  onRetry: () => void;
}

/** The words of the error state in the shell namespace (`shell:loadFailed.*`). */
const LOAD_FAILED_KEYS = {
  title: 'shell:loadFailed.title',
  description: 'shell:loadFailed.description',
  retry: 'shell:loadFailed.retry',
} as const;

export interface LoadFailedText {
  title: string;
  description: string;
  retry: string;
}

/**
 * The plain-English words of the error state, kept on purpose: the shell
 * namespace loads its dictionary asynchronously (registered in
 * `app/i18n/shellTranslations.ts`), so a render that outruns that load would
 * otherwise draw the raw translation keys. The load-failed state is exactly
 * what a user sees when the loading machinery itself has failed, so it may
 * never show a key; `useLoadFailedText` serves these words until the
 * translations arrive and the hook re-renders with them.
 */
export const LOAD_FAILED_TEXT = {
  title: 'This screen could not be loaded',
  description: 'Check the connection and try again.',
  retry: 'Retry',
} as const;

/**
 * The error state's words in the current language, with the English
 * constants above as the fallback for the window before the shell
 * namespace has loaded (the registry echoes the key back when a dictionary
 * misses), served through the shared shell word hook.
 */
export function useLoadFailedText(): LoadFailedText {
  return {
    title: useShellWord(LOAD_FAILED_KEYS.title, LOAD_FAILED_TEXT.title),
    description: useShellWord(LOAD_FAILED_KEYS.description, LOAD_FAILED_TEXT.description),
    retry: useShellWord(LOAD_FAILED_KEYS.retry, LOAD_FAILED_TEXT.retry),
  };
}
