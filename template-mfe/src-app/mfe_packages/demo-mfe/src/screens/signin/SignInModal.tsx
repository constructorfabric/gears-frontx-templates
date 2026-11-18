import React, { useCallback, useRef, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import {
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SHARED_PROPERTY_THEME,
  type AuthLoginInput,
  type AuthRuntime,
} from '@gears-frontx/react';
import { Button, Input, Label } from '@gears-frontx/ui-kit';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { useBridgeProperty } from '../../shared/useBridgeProperty';
import { useHostDirection } from '../../shared/useHostDirection';
import { kitThemeScopeFor } from '../../shared/kitThemeScope';
import styles from './SignInModal.module.css';

/**
 * Props for the SignInModal component.
 */
interface SignInModalProps {
  bridge: ChildMfeBridge;
  /**
   * The host shell's auth runtime as the sign-in app joined it
   * (`init-signin.ts`), or `undefined` when the join failed.
   */
  auth: AuthRuntime | undefined;
}

/** The credentials the form collects and hands to `app.auth.login`. */
interface SignInCredentials {
  username: string;
  password: string;
}

// Stable reference for translation modules (hoisted to module level to prevent re-render loops)
const languageModules = import.meta.glob('./i18n/*.json') as Record<
  string,
  () => Promise<{ default: Record<string, string> }>
>;

/**
 * The example sign-in modal for the shell's popup domain.
 *
 * The shell's sign-in flow (issue 112) mounts this extension on the popup
 * domain - the modal extension domain - and then holds its `sign_in` action
 * open until a session exists on the realm's shared auth runtime. The two
 * halves meet nowhere in transit: the modal signs in by itself, straight
 * through the joined runtime, and sends nothing to the shell - no
 * `executeActionsChain`, no credentials, no action of any kind. The session's
 * appearance is what resolves the shell's wait, and the shell unmounts this
 * modal and reloads the page; the modal cannot be dismissed by the user
 * (`cancelable: false` in `mfe.json`), so it stays until then.
 *
 * The runtime is the one `authRealmShared()` joins on the sign-in runtime's
 * own app (`init-signin.ts`), handed in as `auth`: signing in through it is
 * signing in through the host's own provider, so `AuthEvents.LoggedIn` fires
 * where the shell's handler listens. When the join failed there is no
 * runtime, the modal renders its error line instead of a form, and the
 * shell's own timeout with the chain's reload fallback ends the flow.
 *
 * A failed login (the provider rejects the credentials, or the joined runtime
 * carries no login at all) shows the translated error line and leaves the
 * form filled for another attempt. A submit with either field left blank never
 * reaches the provider: the form refuses it with the same error line, since
 * the provider would refuse it too.
 *
 * Uses @gears-frontx/ui-kit components, styled from its design tokens.
 * Runs inside Shadow DOM with isolated styles.
 */
export const SignInModal: React.FC<SignInModalProps> = ({ bridge, auth }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_THEME, 'default');
  const language = useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_LANGUAGE, 'en');
  useHostDirection(containerRef, language);

  // Load translations using the shared hook
  const { t, loading } = useScreenTranslations(languageModules, bridge);

  /*
   * The placeholder is for the first load only, while no dictionary has
   * arrived yet. Every later load keeps the form mounted: choosing a language
   * starts one, and replacing the inputs with the placeholder would drop the
   * keyboard focus to the document and unmount the busy submit of a login in
   * flight. The words already on screen stay until the new dictionary lands.
   * The flag is set during render, not in an effect, so the first finished
   * load shows the content in the same render.
   */
  const [hasLoadedTranslations, setHasLoadedTranslations] = useState(false);
  if (!loading && !hasLoadedTranslations) {
    setHasLoadedTranslations(true);
  }

  // The typed credentials, and whether the last login was refused. The error
  // is state rather than a thrown render: the form stays on the screen with
  // the typed values, so the next attempt is a correction, not a retyping.
  const [credentials, setCredentials] = useState<SignInCredentials>({ username: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  // The in-flight mark, a ref rather than the state above: it holds before
  // React re-renders with the disabled button, so two submits in one tick
  // cannot both reach the login. It drops only on a refusal, which leaves the
  // form open for a corrected second attempt, and stays up after a resolved
  // login, which has started a session the shell unmounts this modal for.
  const submitInFlightRef = useRef(false);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      // The runtime is optional on the joined app and `login` is optional on
      // the runtime (a provider without a login flow), so both narrow here:
      // a submit with nothing to call through is refused, the state the
      // modal renders as its unavailable line.
      const login = auth?.login;
      if (submitInFlightRef.current || !login) return;
      // A field left blank cannot be a provider's answer to correct: the form
      // refuses the submit here, so a request that can only come back refused
      // never leaves the modal. The rule is the provider's own (any non-empty
      // credentials), decided locally instead of by a failed round trip.
      if (!credentials.username || !credentials.password) {
        setFailed(true);
        return;
      }

      submitInFlightRef.current = true;
      setFailed(false);
      setSubmitting(true);
      try {
        await login({
          type: 'password',
          payload: { username: credentials.username, password: credentials.password },
        } satisfies AuthLoginInput);
        // The session has started, so the typed password does not have to wait
        // in state and in the DOM until the shell takes this modal down: the
        // login is done with it. The form stays mounted and the submit stays
        // busy, so no second attempt can start from here.
        setCredentials({ username: '', password: '' });
        // A resolved login starts a session; the shell's sign_in wait ends on
        // its own and this modal is unmounted with the page reload after it.
        // Nothing is sent upward from here, and the submit stays busy and
        // disabled: a second login before the shell takes the modal down
        // would start a second session.
      } catch (error) {
        // The provider's reason stays on the console, the way `init-signin.ts`
        // warns about a failed join; the form shows its own translated error
        // line and stays filled for the corrected attempt.
        console.warn('[SignInModal] login failed', error);
        submitInFlightRef.current = false;
        setFailed(true);
        setSubmitting(false);
      }
    },
    [auth, credentials.password, credentials.username],
  );

  const kitThemeScope = kitThemeScopeFor(theme);

  // Placeholder while the first dictionary is still in flight; a later load
  // keeps the form mounted (see above).
  if (loading && !hasLoadedTranslations) {
    return (
      // The placeholder carries no loading semantics of its own; the status region announces them.
      <div
        ref={containerRef}
        className={styles.screen}
        data-theme={kitThemeScope}
        role="status"
        aria-busy="true"
      >
        <p className={styles.description}>&nbsp;</p>
      </div>
    );
  }

  // The join failed (its cause is in the console warning from
  // init-signin.ts): the modal can only report it, on its error line. The
  // shell's sign_in action cannot resolve here, so the sender's timeout and
  // the chain's reload fallback end the flow. A joined runtime whose provider
  // offers no login lands here too.
  if (!auth?.login) {
    return (
      <div ref={containerRef} className={styles.screen} data-theme={kitThemeScope}>
        <div className={styles.intro}>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.error} role="alert">
            {t('unavailable')}
          </p>
        </div>
      </div>
    );
  }

  // A later translation load keeps the form mounted; the busy mark on the
  // screen is what announces it while the inputs stay in place.
  return (
    <div
      ref={containerRef}
      className={styles.screen}
      data-theme={kitThemeScope}
      aria-busy={loading || undefined}
    >
      <div className={styles.intro}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.description}>{t('description')}</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <Label htmlFor="signin-username">{t('username_label')}</Label>
          <Input
            id="signin-username"
            name="username"
            type="text"
            autoComplete="username"
            placeholder={t('username_placeholder')}
            value={credentials.username}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setCredentials((current) => ({ ...current, username: event.target.value }))
            }
          />
        </div>
        <div className={styles.field}>
          <Label htmlFor="signin-password">{t('password_label')}</Label>
          <Input
            id="signin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder={t('password_placeholder')}
            value={credentials.password}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setCredentials((current) => ({ ...current, password: event.target.value }))
            }
          />
        </div>

        {/* The one error line: a login the provider refused. */}
        {failed ? (
          <p className={styles.error} role="alert">
            {t('error')}
          </p>
        ) : null}

        <div className={styles.actions}>
          <Button type="submit" disabled={submitting}>
            {submitting ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>
    </div>
  );
};

SignInModal.displayName = 'SignInModal';
