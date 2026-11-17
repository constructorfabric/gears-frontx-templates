import React, { useRef } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/react';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { useBridgeProperty } from '../../shared/useBridgeProperty';
import { useHostDirection } from '../../shared/useHostDirection';
import styles from './CurrentThemeScreen.module.css';

/*
 * This screen renders the SHELL's theme. Its styles read the token names
 * (`--background`, `--primary` and their neighbours) through var(), and the
 * values arrive by inheritance from the host document, where the shell's
 * active theme writes them. That is why `lifecycle-theme` does not extend
 * KitThemedLifecycle and takes no component from @gears-frontx/ui-kit:
 * anchoring the kit's own token values on this shadow host would replace the
 * shell's values for the same names, and the swatches would show the kit's
 * default palette instead of the theme the screen exists to display.
 *
 * The `card` and `placeholder` rules in the module stand in for the kit's Card
 * and Skeleton for that reason.
 */

/**
 * Props for the CurrentThemeScreen component.
 */
interface CurrentThemeScreenProps {
  bridge: ChildMfeBridge;
}

// Stable reference for translation modules (hoisted to module level to prevent re-render loops)
const languageModules = import.meta.glob('./i18n/*.json') as Record<
  string,
  () => Promise<{ default: Record<string, string> }>
>;

/**
 * Current Theme Screen for the MFE remote.
 *
 * Displays the current theme value and demonstrates CSS variable consumption.
 * Shows colored swatches for background, foreground, primary, secondary, muted, accent,
 * destructive using the CSS custom properties.
 *
 * Receives a ChildMfeBridge for communication with the host application.
 * Demonstrates bridge usage by displaying extDomainId, extensionId, theme, and language.
 *
 * Runs inside Shadow DOM with isolated styles.
 *
 * Subscribes to theme and language domain properties to demonstrate
 * host-MFE communication via bridge.
 */
export const CurrentThemeScreen: React.FC<CurrentThemeScreenProps> = ({ bridge }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_THEME, 'default');
  const language = useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_LANGUAGE, 'en');
  useHostDirection(containerRef, language);

  // Load translations using the shared hook
  const { t, loading } = useScreenTranslations(languageModules, bridge);

  // Color swatches data (names will be translated)
  const colorSwatches = [
    { nameKey: 'color_background', className: styles.background, tokens: '--background / --foreground' },
    { nameKey: 'color_foreground', className: styles.foreground, tokens: '--foreground / --background' },
    { nameKey: 'color_primary', className: styles.primary, tokens: '--primary / --primary-foreground' },
    { nameKey: 'color_secondary', className: styles.secondary, tokens: '--secondary / --secondary-foreground' },
    { nameKey: 'color_muted', className: styles.muted, tokens: '--muted / --muted-foreground' },
    { nameKey: 'color_accent', className: styles.accent, tokens: '--accent / --accent-foreground' },
    { nameKey: 'color_destructive', className: styles.destructive, tokens: '--destructive / --destructive-foreground' },
  ];

  // Show skeleton while translations are loading
  if (loading) {
    return (
      <div ref={containerRef} className={styles.screen} role="status" aria-busy="true">
        <div className={`${styles.placeholder} ${styles.placeholderTitle}`} />
        <div className={`${styles.placeholder} ${styles.placeholderDescription}`} />
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <div className={`${styles.placeholder} ${styles.placeholderCardTitle}`} />
            <div className={styles.placeholderLines}>
              <div className={`${styles.placeholder} ${styles.placeholderLine}`} />
              <div className={`${styles.placeholder} ${styles.placeholderLine}`} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.screen}>
      <h1 className={styles.title}>
        {t('title')}
      </h1>
      <p className={styles.description}>
        {t('description')}
      </p>

      <div className={styles.cards}>
        {/* Theme Info Card */}
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <h2 className={styles.cardTitle}>
              {t('theme_information')}
            </h2>
            <dl className={styles.details}>
              <div>
                <dt className={styles.label}>{t('current_theme_label')}:</dt>
                <dd className={styles.themeValue}>{theme}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Color Swatches */}
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <h2 className={styles.cardTitle}>
              {t('theme_color_swatches')}
            </h2>
            <div className={styles.swatches}>
              {colorSwatches.map((swatch) => (
                <div
                  key={swatch.nameKey}
                  className={`${styles.swatch} ${swatch.className}`}
                >
                  <div className={styles.swatchName}>{t(swatch.nameKey)}</div>
                  <div className={styles.swatchTokens}>{swatch.tokens}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CSS Variables Reference */}
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <h2 className={styles.cardTitle}>
              {t('css_custom_properties')}
            </h2>
            <div className={styles.variables}>
              <div>--background</div>
              <div>--foreground</div>
              <div>--primary</div>
              <div>--primary-foreground</div>
              <div>--secondary</div>
              <div>--secondary-foreground</div>
              <div>--muted</div>
              <div>--muted-foreground</div>
              <div>--accent</div>
              <div>--accent-foreground</div>
              <div>--destructive</div>
              <div>--destructive-foreground</div>
            </div>
          </div>
        </div>

        {/* Bridge Info Card */}
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <h2 className={styles.cardTitle}>
              {t('bridge_info')}
            </h2>
            <dl className={styles.details}>
              <div>
                <dt className={styles.term}>{t('domain_id')}</dt>
                <dd className={`${styles.value} ${styles.id}`}>{bridge.extDomainId}</dd>
              </div>
              <div>
                <dt className={styles.term}>{t('instance_id')}</dt>
                <dd className={`${styles.value} ${styles.id}`}>{bridge.extensionId}</dd>
              </div>
              <div>
                <dt className={styles.term}>{t('current_theme')}</dt>
                <dd className={styles.value}>{theme}</dd>
              </div>
              <div>
                <dt className={styles.term}>{t('current_language')}</dt>
                <dd className={styles.value}>{language}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};

CurrentThemeScreen.displayName = 'CurrentThemeScreen';
