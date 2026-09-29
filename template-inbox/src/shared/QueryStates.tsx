import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button, Skeleton } from '@gears-frontx/ui-kit';
import type { QueryResult } from '../api/queries';
import type { Translate } from './i18n';
import { ScreenHeading } from './ScreenHeading';
import styles from './shared.module.css';

/** The part of a query result a screen's first paint depends on. */
type GatedQuery = Pick<QueryResult<unknown>, 'isLoading' | 'error' | 'refetch'>;

export type FirstPaint = {
  /** Some query the first paint needs has failed. Wins over `loading`. */
  failed: boolean;
  /** Some query the first paint needs has not answered yet. */
  loading: boolean;
  /** Asks every failed query again. */
  retry: () => void;
};

/**
 * Whether a screen can paint, from every query that paint needs.
 *
 * A screen gates on all of them together rather than on the first one it
 * happens to read: painting as soon as one answers shows the others' empty
 * states for a moment, and a failure anywhere would otherwise read as "no
 * data" instead of as an error.
 */
export const firstPaintOf = (queries: readonly GatedQuery[]): FirstPaint => {
  const failedQueries = queries.filter((query) => query.error !== null);
  return {
    failed: failedQueries.length > 0,
    loading: queries.some((query) => query.isLoading),
    retry: () => {
      for (const query of failedQueries) query.refetch();
    },
  };
};

/** The placeholder a pane shows until its data has arrived. */
export function LoadingPane({ className }: { className?: string }) {
  return (
    <div className={className ?? styles.emptyPane} role="status" aria-busy="true">
      <Skeleton className={styles.loadingBlock} />
    </div>
  );
}

/**
 * What a pane shows instead of its content when a query it needs has failed.
 * Its title is the screen's heading while it stands in for the screen, so a
 * route change still has a heading to move focus to.
 */
export function LoadErrorPane({
  onRetry,
  t,
  className,
}: {
  onRetry: () => void;
  t: Translate;
  className?: string;
}) {
  return (
    <div className={className ?? styles.emptyPane}>
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>
          <ScreenHeading className={styles.inlineHeading}>{t('load_error_title')}</ScreenHeading>
        </AlertTitle>
        <AlertDescription>{t('load_error_description')}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t('retry')}
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}
