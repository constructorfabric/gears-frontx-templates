/**
 * The error state a screen that failed to load shows in its place, built from
 * the UI Kit: announced as an alert, a title, a description and a Retry. The
 * page's one level-one heading is the header's, so the title is a level-two
 * heading.
 */

import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@gears-frontx/ui-kit';
import { useLoadFailedText, type LoadFailedProps } from './loadFailedText';

export function ScreenLoadFailed({ onRetry }: LoadFailedProps) {
  const text = useLoadFailedText();
  return (
    <Empty role="alert">
      <EmptyHeader>
        <EmptyTitle role="heading" aria-level={2}>
          {text.title}
        </EmptyTitle>
        <EmptyDescription>{text.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onRetry}>{text.retry}</Button>
      </EmptyContent>
    </Empty>
  );
}
