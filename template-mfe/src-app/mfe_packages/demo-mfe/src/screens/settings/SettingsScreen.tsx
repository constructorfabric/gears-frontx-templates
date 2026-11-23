import React, { useCallback, useRef, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import {
  FRONTX_SCREEN_DOMAIN,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SHARED_PROPERTY_THEME,
  getLanguageMetadata,
  Language,
  useSharedProperty,
} from '@gears-frontx/react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
} from '@gears-frontx/ui-kit';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { useHostDirection } from '../../shared/useHostDirection';
import { kitThemeScopeFor } from '../../shared/kitThemeScope';
import { CHROME_ACTION_SET_LANGUAGE } from '../../shared/extension-ids';
import styles from './SettingsScreen.module.css';

/**
 * Props for the SettingsScreen component.
 */
interface SettingsScreenProps {
  bridge: ChildMfeBridge;
}

/*
 * The languages this screen offers, in display order.
 *
 * The list mirrors the shell's own project list, `shellLanguages.ts` in the
 * shell app's `i18n/` folder (there it is `SHELL_LANGUAGE_CODES`, read by the
 * header's language control). A screen cannot import shell app constants, so
 * a project keeps the two lists in step by hand: adding a language to the
 * shell means adding it here too, and the other way around.
 *
 * The codes come from the SDK's `Language` enum and the shown names are the
 * SDK's native names, the same metadata the shell's control reads, so both
 * controls always describe a language the way its speakers write it.
 */
const SETTINGS_LANGUAGE_CODES: readonly Language[] = [Language.English, Language.German];

// Stable reference for translation modules (hoisted to module level to prevent re-render loops)
const languageModules = import.meta.glob('./i18n/*.json') as Record<
  string,
  () => Promise<{ default: Record<string, string> }>
>;

/**
 * Settings Screen for the MFE remote.
 *
 * The example settings screen: a heading and a language choice. Choosing a
 * language sends the shell's `set_language` chrome action over an actions
 * chain, aimed at the screen domain, where the shell registered its handler.
 *
 * The radio group reads its value from the language shared property rather
 * than from local state, so the control follows a change made anywhere else -
 * from the shell header's own language control, for example - instead of
 * drifting away from the language the shell actually runs. The screen never
 * reads localStorage: the language lives on the bridge.
 *
 * Uses @gears-frontx/ui-kit components, styled from its design tokens.
 * Runs inside Shadow DOM with isolated styles.
 */
export const SettingsScreen: React.FC<SettingsScreenProps> = ({ bridge }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useSharedProperty(FRONTX_SHARED_PROPERTY_THEME, { bridge, fallback: 'default' });
  const language = useSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, { bridge, fallback: 'en' });
  useHostDirection(containerRef, language);

  // Load translations using the shared hook
  const { t, loading } = useScreenTranslations(languageModules, bridge);

  /*
   * Skeletons are for the first load only, while no dictionary has arrived
   * yet. Every later load keeps the screen mounted: choosing a language
   * starts one, and replacing the radios with skeletons would drop the
   * keyboard focus to the document and the returning group would not regain
   * it. The words already on screen stay until the new dictionary lands.
   *
   * The flag is set during render rather than in an effect, so when the first
   * load lands React redoes that render before committing it, instead of
   * committing it and then rendering again. `react-hooks/set-state-in-effect`
   * rejects the effect form.
   */
  const [hasLoadedTranslations, setHasLoadedTranslations] = useState(false);
  if (!loading && !hasLoadedTranslations) {
    setHasLoadedTranslations(true);
  }

  // Send the chosen language to the shell. The group's change callback is
  // generically typed and hands back whatever the kit emits, so the value is
  // narrowed against the screen's own language list first: anything else is
  // ignored and nothing is dispatched. Dispatch is acceptance-only: it
  // returns void and never throws, so there is nothing to await or catch
  // here. The shell's screen-domain handler resolves it and switches the
  // language, which comes back to this screen (and every other one) as a
  // property change.
  const handleLanguageChange = useCallback(
    (value: unknown) => {
      const code = SETTINGS_LANGUAGE_CODES.find((candidate) => candidate === value);
      if (code === undefined) {
        return;
      }
      bridge.executeActionsChain({
        action: {
          type: CHROME_ACTION_SET_LANGUAGE,
          target: FRONTX_SCREEN_DOMAIN,
          payload: { language: code },
        },
      });
    },
    [bridge],
  );

  const kitThemeScope = kitThemeScopeFor(theme);

  // Show skeletons while the first dictionary is still in flight; a later
  // load keeps the controls mounted (see above) and only marks the screen
  // busy.
  if (loading && !hasLoadedTranslations) {
    return (
      // A Skeleton carries no loading semantics of its own; the region announces them.
      <div
        ref={containerRef}
        className={styles.screen}
        data-theme={kitThemeScope}
        role="status"
        aria-busy="true"
      >
        <div className={styles.placeholders}>
          <Skeleton className={styles.placeholderTitle} />
          <Skeleton className={styles.placeholderLine} />
        </div>
        <Card>
          <CardContent>
            <div className={styles.placeholders}>
              <Skeleton className={styles.placeholderLine} />
              <Skeleton className={styles.placeholderLineShort} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // A later translation load keeps every control mounted; the busy mark on
  // the screen is what announces it while the radios stay in place.
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

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className={styles.sectionTitle}>{t('language_title')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.languageChoice}>
            <p className={styles.prose}>{t('language_description')}</p>
            {/*
              The group's value is the shell's language shared property, not a
              local copy of it, so the checked radio always names the language
              the shell runs. A code the list above does not offer checks no
              radio instead of failing the render.
            */}
            <RadioGroup
              value={language}
              onValueChange={handleLanguageChange}
              aria-label={t('language_title')}
            >
              {SETTINGS_LANGUAGE_CODES.map((code) => (
                <Label key={code} className={styles.languageOption}>
                  <RadioGroupItem value={code} />
                  {getLanguageMetadata(code)?.name ?? code}
                </Label>
              ))}
            </RadioGroup>
          </div>
        </CardContent>
        <CardContent>
          <dl className={styles.definitions}>
            <div>
              <dt className={styles.term}>{t('current_language')}</dt>
              {/* The raw shared property value, as the shell publishes it. */}
              <dd className={styles.value}>{language}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
};

SettingsScreen.displayName = 'SettingsScreen';
