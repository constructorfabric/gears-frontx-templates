/**
 * The error state a screen that failed to load shows in its place, built from
 * the UI Kit: announced as an alert, a title, a description and a Retry. The
 * page's one level-one heading is the header's, so the title is a level-two
 * heading.
 */

import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@gears-frontx/ui-kit';
import { LOAD_FAILED_TEXT, type LoadFailedProps } from './MfeScreenContainer';

export function ScreenLoadFailed({ onRetry }: LoadFailedProps) {
  return (
    <Empty role="alert">
      <EmptyHeader>
        <EmptyTitle role="heading" aria-level={2}>
          {LOAD_FAILED_TEXT.title}
        </EmptyTitle>
        <EmptyDescription>{LOAD_FAILED_TEXT.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onRetry}>{LOAD_FAILED_TEXT.retry}</Button>
      </EmptyContent>
    </Empty>
  );
}
