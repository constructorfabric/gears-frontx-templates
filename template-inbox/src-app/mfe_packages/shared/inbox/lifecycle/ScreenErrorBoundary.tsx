import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from '@gears-frontx/ui-kit';
import type { Translate } from '../i18n/translate';
import sharedStyles from '../ui/shared.module.css';

export type ScreenErrorBoundaryProps = {
  children: ReactNode;
  t: Translate;
  /**
   * Clears a caught failure when it changes - the frame passes the path
   * inside the screen, so leaving the broken page for another one renders
   * that page normally instead of keeping the alert.
   */
  resetKey?: string;
  /** What the reload button does; the page reload unless a test says otherwise. */
  onReload?: () => void;
};

type ScreenErrorBoundaryState = { failed: boolean; resetKey: string | undefined };

/**
 * What replaces a screen that failed to render: an alert with a way out,
 * instead of the blank shadow root React would otherwise leave.
 *
 * Every inbox frame puts one around its route tree, so a crashing screen
 * leaves the shell and its menu working and every other screen one click
 * away. "Try again" renders the screen afresh (enough for a failure that
 * depended on a moment's state), reload starts the page over. Query failures
 * never reach here - the screens render their own error state for those - so
 * what lands here is a bug, and the console keeps its stack.
 */
export class ScreenErrorBoundary extends Component<ScreenErrorBoundaryProps, ScreenErrorBoundaryState> {
  state: ScreenErrorBoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<ScreenErrorBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: ScreenErrorBoundaryProps,
    state: ScreenErrorBoundaryState
  ): Partial<ScreenErrorBoundaryState> | null {
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
