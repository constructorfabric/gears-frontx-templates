import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from '@gears-frontx/ui-kit';
import type { Translate } from '../shared/i18n';
import sharedStyles from '../shared/shared.module.css';

export type AppErrorBoundaryProps = {
  children: ReactNode;
  t: Translate;
  /**
   * Clears a caught failure when it changes - the screen boundary passes the
   * location, so leaving the broken screen for another one renders it
   * normally instead of keeping the alert.
   */
  resetKey?: string;
  /** What the reload button does; the page reload unless a test says otherwise. */
  onReload?: () => void;
};

type AppErrorBoundaryState = { failed: boolean; resetKey: string | undefined };

/**
 * What replaces a subtree that failed to render: an alert with a way out,
 * instead of the blank page React would otherwise leave.
 *
 * `App` puts one around the screen outlet, so a crashing screen leaves the
 * rail working and the rest of the app one click away; `main.tsx` keeps one
 * around the whole app as the last resort. "Try again" renders the subtree
 * afresh (enough for a failure that depended on a moment's state), reload
 * starts the page over. Query failures never reach here - the screens render
 * their own error state for those - so what lands here is a bug, and the
 * console keeps its stack.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: AppErrorBoundaryProps,
    state: AppErrorBoundaryState
  ): Partial<AppErrorBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[inbox] A screen failed to render.', error, info.componentStack);
  }

  render() {
    const { children, t, onReload = () => window.location.reload() } = this.props;
    if (!this.state.failed) return children;

    return (
      <div className={sharedStyles.emptyPane}>
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t('app_error_title')}</AlertTitle>
          <AlertDescription>{t('app_error_description')}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => this.setState({ failed: false })}>
              {t('retry')}
            </Button>
            <Button size="sm" variant="outline" onClick={onReload}>
              {t('reload')}
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );
  }
}
