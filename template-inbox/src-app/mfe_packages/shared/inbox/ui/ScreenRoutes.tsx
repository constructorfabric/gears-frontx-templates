import { Outlet } from '@gears-frontx/routing-tanstack';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@gears-frontx/ui-kit';
import { useInboxT } from '../lifecycle/screenContext';
import { useRouteFocus } from '../lifecycle/useRouteFocus';
import { ScreenHeading } from './ScreenHeading';
import sharedStyles from './shared.module.css';

export type ScreenNotFoundProps = {
  /** Names the screen's not-found page for tests, e.g. `chat-route-not-found`. */
  testId: string;
};

/**
 * An address inside a screen that names no page of it: every inbox screen's
 * route tree passes this as its root's `notFoundComponent`, so the page
 * renders in place of the screen, with the screen's one heading.
 */
export function ScreenNotFound({ testId }: ScreenNotFoundProps) {
  const t = useInboxT();
  return (
    <div className={sharedStyles.emptyPane} data-testid={testId}>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            <ScreenHeading className={sharedStyles.inlineHeading}>{t('page_not_found_title')}</ScreenHeading>
          </EmptyTitle>
          <EmptyDescription>{t('page_not_found_description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

/**
 * The root route component of a screen with one page: the page at `/` and
 * nothing else. One page, so the focus key never changes; the call keeps the
 * screen on the same focus rule as the others should it grow a second route.
 */
export function SinglePageRoot() {
  useRouteFocus('');
  return <Outlet />;
}
