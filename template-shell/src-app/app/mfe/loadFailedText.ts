export interface LoadFailedProps {
  onRetry: () => void;
}

/** The words of the error state, shared by every rendering of it. */
export const LOAD_FAILED_TEXT = {
  title: 'This screen could not be loaded',
  description: 'Check the connection and try again.',
  retry: 'Retry',
} as const;
