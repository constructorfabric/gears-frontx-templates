import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from '@gears-frontx/ui-kit';
import type { Translate } from './i18n';
import styles from '../styles/workspace.module.css';

export type AppErrorBoundaryProps = {
  children: ReactNode;
  t: Translate;
  /** What the reload button does; the page reload unless a test says otherwise. */
  onReload?: () => void;
};

type AppErrorBoundaryState = { failed: boolean };

/**
 * The last line under every screen: a render error anywhere below replaces the
 * blank page React would otherwise leave with a message and a way out.
 *
 * Reloading is the whole recovery on offer. The screens hold their state
 * locally, so there is nothing a partial reset could safely keep, and a
 * "try again" that re-renders the same tree would usually throw the same
 * error. Query failures never reach this boundary - the screens render their
 * own error state for those - so what lands here is a bug, and the console
 * keeps its stack.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[inbox] A screen failed to render.', error, info.componentStack);
  }

  render() {
    const { children, t, onReload = () => window.location.reload() } = this.props;
    if (!this.state.failed) return children;

    return (
      <div className={styles.emptyPane}>
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t('app_error_title')}</AlertTitle>
          <AlertDescription>{t('app_error_description')}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={onReload}>
              {t('reload')}
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );
  }
}
