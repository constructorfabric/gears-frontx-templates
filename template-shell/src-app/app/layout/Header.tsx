/**
 * Header Component
 *
 * Application header with user info display and, where the app has an auth
 * runtime, the user menu that signs out.
 * Seeded with the template; the project owns this file and edits it directly.
 */

import React, { useEffect, useRef } from 'react';
import { useAppSelector, useFrontX, useTranslation, getLanguageMetadata, type Language } from '@gears-frontx/react';
import type { HeaderState } from './state';
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  NativeSelect,
  Skeleton,
  VisuallyHidden,
} from '@gears-frontx/ui-kit';
import { SHELL_LANGUAGES, isShellLanguage } from '@/app/i18n/shellLanguages';
import { useShellWord } from '@/app/i18n/useShellWord';
import { reloadPage } from '@/app/mfe/pageReload';
import { useOtherHeadingOne } from './useOtherHeadingOne';
import styles from './Header.module.css';

export interface HeaderProps {
  children?: React.ReactNode;
  /**
   * Which control renders the header's language switch: the kit's select for
   * the shell as shipped (`kit`, the default), or a plain native select for
   * projects created without the UI kit, which `App.no-uikit.tsx` asks for.
   * Both list the project's languages by their own names and both change the
   * language through `setLanguage`. The same choice picks the user menu's
   * rendering: the kit's dropdown menu, or a plain `details` disclosure.
   */
  languageControl?: 'kit' | 'plain';
}

/**
 * The header's language switch. One behavior, two renderings: the kit's
 * native select where the kit is in, a bare `select` where it is not. The
 * accessible name comes from the shell namespace, the options from the
 * project's own language list, and a choice goes out through `setLanguage`,
 * so the same event reaches the registry, the screens and the persistence
 * whatever the rendering is. A current language the project does not list
 * (Studio can set any of the SDK's languages) keeps a disabled option of its
 * own, so the select always shows the language in force.
 */
const LanguageControl = ({ plain }: { plain: boolean }) => {
  const { language, setLanguage } = useTranslation();

  // `t` answers a dictionary miss with the raw key, and the shell namespace
  // loads its dictionary asynchronously, so a render that outruns the load
  // (or a load that fails for good) would carry the key as the accessible
  // name. The shell word hook serves the English word instead, the way the
  // menu and the backdrop already read their words.
  const languageLabel = useShellWord('shell:header.language', 'Language');

  // The options carry only listed codes (the disabled unlisted option cannot
  // be picked), but nothing structural enforces that, so the value is checked
  // before it goes out instead of being trusted with a cast.
  const change = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (isShellLanguage(next)) {
      setLanguage(next);
    }
  };

  const current = language ?? '';

  const options = [
    // An unlisted current language gets a disabled option so the select's
    // value matches one of its options: without it the browser shows the
    // first entry ("English") while the app is in another language, and
    // picking English then fires no change event, so the control could not
    // switch back. The option carries the language's own name from the SDK's
    // metadata, or the bare code when the SDK does not know it, and it is
    // marked as that language for screen readers, like every option here.
    ...(current !== '' && !isShellLanguage(current)
      ? [
          <option key={current} value={current} lang={current} disabled>
            {getLanguageMetadata(current as Language)?.name ?? current}
          </option>,
        ]
      : []),
    ...SHELL_LANGUAGES.map((metadata) => (
      <option key={metadata.code} value={metadata.code} lang={metadata.code}>
        {metadata.name}
      </option>
    )),
  ];

  if (plain) {
    return (
      <select
        className={styles.languagePlain}
        aria-label={languageLabel}
        value={language ?? ''}
        onChange={change}
      >
        {options}
      </select>
    );
  }

  return (
    <NativeSelect
      className={styles.languageControl}
      aria-label={languageLabel}
      value={language ?? ''}
      onChange={change}
    >
      {options}
    </NativeSelect>
  );
};

export const Header: React.FC<HeaderProps> = ({ children, languageControl = 'kit' }) => {
  const headerState = useAppSelector((state) => state['layout/header'] as HeaderState | undefined);

  // The signed-out fallback for the user block, read through the shell word
  // hook like the select's accessible name: `t` would echo the raw key until
  // the shell dictionary has landed (or for good, if the load fails).
  const userLabel = useShellWord('shell:header.user', 'User');
  const signOutLabel = useShellWord('shell:header.signOut', 'Sign out');

  // An app built without `auth()` has no session to end, so its header keeps
  // the plain user block and offers no sign-out.
  const { auth } = useFrontX();

  const headingRef = useRef<HTMLHeadingElement>(null);
  const screenHasHeadingOne = useOtherHeadingOne(headingRef);

  // The plain disclosure closes the way the kit menu does: on Escape, which
  // also brings focus back to the user block, and on a pointer down outside
  // it. A native `details` does neither by itself, and its sign-out button
  // would stay over the page. Escape counts only while focus is inside the
  // disclosure and no other layer has handled it (`defaultPrevented`), like
  // the project's other document-level Escape handlers: an Escape meant for a
  // modal, a popup or a screen's field neither closes the menu nor moves focus.
  const plainMenuRef = useRef<HTMLDetailsElement>(null);
  const plainMenu = Boolean(auth) && languageControl === 'plain';
  useEffect(() => {
    if (!plainMenu) return undefined;
    const close = (): boolean => {
      const details = plainMenuRef.current;
      if (!details?.open) return false;
      details.open = false;
      return true;
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const details = plainMenuRef.current;
      if (!details?.contains(document.activeElement)) return;
      if (close()) details.querySelector('summary')?.focus();
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (!plainMenuRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [plainMenu]);

  const user = headerState?.user;
  const loading = headerState?.loading ?? false;

  const getInitials = (): string => {
    if (!user?.displayName) return (user?.email?.[0] || '?').toUpperCase();
    const parts = user.displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return user.displayName.slice(0, 2).toUpperCase();
  };

  const userName = user?.displayName || user?.email || userLabel;
  const userBlock = (
    <>
      <Avatar>
        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={userName} />}
        <AvatarFallback>{getInitials()}</AvatarFallback>
      </Avatar>
      <span>{userName}</span>
    </>
  );

  // The sign-out is the runtime's own `logout()`, called once and in the
  // click's own turn, so a provider that replaces the current one after the
  // click never receives it. When it finishes, resolved or rejected, the
  // runtime announces `auth/loggedOut`, which clears the header user and asks
  // for it again (`bootstrapEffects.ts`). A resolved logout reloads the page:
  // the start-up check of the new page finds no session and opens the sign-in
  // window. The reload is the user's, not a step of the sign-in chain, so it
  // goes straight to the `pageReload` seam and not through `refresh_page` and
  // its automatic reload guard. A `redirect` transition is not reloaded over:
  // a redirect provider navigates itself. A logout that throws or rejects is
  // only reported: no reload, and the announcement's refetch brings the name
  // back when the session survived.
  const signOut = (): void => {
    if (!auth) return;
    const failed = (error: unknown): void => {
      console.warn('[Header] the sign-out failed', error);
    };
    let pending: ReturnType<typeof auth.logout>;
    try {
      pending = auth.logout();
    } catch (error) {
      failed(error);
      return;
    }
    pending.then((transition) => {
      if (transition?.type !== 'redirect') reloadPage();
    }, failed);
  };

  let userControl: React.ReactNode;
  if (!auth) {
    userControl = <div className={styles.signedIn}>{userBlock}</div>;
  } else if (languageControl === 'plain') {
    // Without the kit: a native disclosure, keyboard-operable as it is, that
    // closes on Escape and on a pointer down outside it (the effect above),
    // and when focus moves to an element outside it (Tab out), as the kit
    // menu does. Focus that leaves for no element (another window) or moves
    // between the summary and the button keeps it open.
    userControl = (
      <details
        ref={plainMenuRef}
        className={styles.userMenuPlain}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && !event.currentTarget.contains(next)) {
            event.currentTarget.open = false;
          }
        }}
      >
        <summary className={styles.signedIn} aria-label={userName}>
          {userBlock}
        </summary>
        <button
          type="button"
          className={styles.signOutPlain}
          onClick={(event) => {
            // Focus goes to the user block before the button is hidden, as on
            // Escape: a hidden focused button would drop focus to the body.
            const details = event.currentTarget.closest('details');
            details?.querySelector('summary')?.focus();
            details?.removeAttribute('open');
            signOut();
          }}
        >
          {signOutLabel}
        </button>
      </details>
    );
  } else {
    userControl = (
      <DropdownMenu>
        <DropdownMenuTrigger className={styles.userTrigger} aria-label={userName}>
          {userBlock}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={signOut}>{signOutLabel}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <header className={styles.header}>
      {/* Every page needs exactly one h1 (axe: page-has-heading-one). A
          screen normally renders its own; this visually hidden one names the
          app only while nothing else on the page is a level-one heading, so a
          screen without one still leaves the page with a single h1. The
          visual brand is the logo in the sidebar. */}
      {screenHasHeadingOne ? null : (
        <h1 ref={headingRef}>
          <VisuallyHidden>FrontX</VisuallyHidden>
        </h1>
      )}
      {children}
      <LanguageControl plain={languageControl === 'plain'} />
      <div>
        {loading ? (
          <div className={styles.userRow}>
            <Skeleton className={styles.avatarSkeleton} />
            <Skeleton className={styles.nameSkeleton} />
          </div>
        ) : (
          userControl
        )}
      </div>
    </header>
  );
};

Header.displayName = 'Header';
