/**
 * Studio self-contained CSS styles.
 *
 * The studio is a published package mounted into hosts it does not control,
 * so it brings every rule its markup needs in this one sheet, injected into
 * the document head when the overlay mounts. Each class names one part of
 * one studio component (`studio-<component>` and `studio-<component>__<part>`,
 * `--<modifier>` for a variant or state); there are no general-purpose
 * utility classes.
 *
 * Colours, spacing, radius and type read @gears-frontx/ui-kit tokens. Every
 * kit token carries a fallback inside `var()`, so a host that does not load
 * the kit's theme.css still gets a usable panel painted from --foreground and
 * --background.
 */

const STUDIO_STYLE_ID = 'frontx-studio-styles';

const TRANSITION_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

export const STUDIO_CSS = /* css */ `
/* ============================================================
   Gears FrontX Studio - self-contained component styles
   ============================================================ */

/* --- Base normalization ---
   The host may ship no reset of its own. :where() keeps these at
   specificity 0-0-0, so every component rule below wins over them. */
.studio-panel,
.studio-portal-container,
.studio-collapsed {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.5;
}
:where(.studio-panel *, .studio-portal-container *, .studio-collapsed *) { box-sizing: border-box; }
:where(.studio-panel button, .studio-portal-container button, .studio-collapsed button) {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  border: 0 solid transparent;
  background: transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
}
:where(.studio-panel h2, .studio-panel h3, .studio-portal-container h2, .studio-portal-container h3) {
  font-size: inherit;
  font-weight: inherit;
  margin: 0;
}

/* --- Overlay roots --- */
.studio-panel {
  position: fixed;
  z-index: 10000;
}
.studio-collapsed {
  position: fixed;
  z-index: 10000;
}
/* Dropdown content portals in here, above the panel. */
.studio-portal-container {
  position: fixed;
  z-index: 99999;
  pointer-events: none;
}

/* --- Card --- */
.studio-card {
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background-color: var(--card, var(--background));
  color: var(--card-foreground, var(--foreground));
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
}

/* --- Button --- */
.studio-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2, 0.5rem);
  white-space: nowrap;
  border-radius: var(--radius-md, calc(0.5rem - 2px));
  font-size: var(--text-body-size, 0.875rem);
  line-height: var(--text-body-line-height, 1.25rem);
  font-weight: 500;
  transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
  transition-timing-function: ${TRANSITION_EASE};
  transition-duration: 150ms;
  box-shadow: var(--studio-button-shadow, 0 0 #0000);
}
.studio-button:focus-visible {
  outline: 2px solid transparent;
  outline-offset: 2px;
  box-shadow:
    0 0 0 1px var(--ring, color-mix(in oklab, var(--foreground) 50%, transparent)),
    var(--studio-button-shadow, 0 0 #0000);
}
.studio-button:disabled {
  pointer-events: none;
  opacity: 0.5;
}
.studio-button svg {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  pointer-events: none;
}

.studio-button--default {
  background-color: var(--primary, var(--foreground));
  color: var(--primary-foreground, var(--background));
  --studio-button-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
}
.studio-button--default:hover {
  background-color: color-mix(in oklab, var(--primary, var(--foreground)) 90%, transparent);
}
.studio-button--destructive {
  background-color: var(--destructive);
  color: var(--destructive-foreground);
  --studio-button-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}
.studio-button--destructive:hover {
  background-color: color-mix(in oklab, var(--destructive) 90%, transparent);
}
.studio-button--outline {
  border: 1px solid var(--input, color-mix(in oklab, var(--foreground) 20%, transparent));
  background-color: var(--background);
  color: var(--foreground);
  --studio-button-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}
.studio-button--secondary {
  background-color: var(--secondary);
  color: var(--secondary-foreground);
  --studio-button-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}
.studio-button--secondary:hover {
  background-color: color-mix(in oklab, var(--secondary) 80%, transparent);
}
.studio-button--outline:hover,
.studio-button--outline[data-state=open],
.studio-button--ghost:hover,
.studio-button--ghost[data-state=open] {
  background-color: var(--accent, color-mix(in oklab, var(--foreground) 10%, transparent));
}
.studio-button--link {
  color: var(--primary, var(--foreground));
  text-underline-offset: 4px;
}
.studio-button--link:hover {
  text-decoration-line: underline;
}

.studio-button--size-default {
  height: 2.25rem;
  padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
}
.studio-button--size-sm {
  height: 2rem;
  padding: 0 var(--space-3, 0.75rem);
  font-size: var(--text-label-size, 0.75rem);
  line-height: var(--text-label-line-height, 1rem);
}
.studio-button--size-lg {
  height: 2.5rem;
  padding: 0 var(--space-8, 2rem);
}
.studio-button--size-icon {
  height: 2.25rem;
  width: 2.25rem;
}

/* --- Dropdown button: a button that opens a menu --- */
.studio-dropdown-button {
  min-width: 10rem;
  justify-content: space-between;
}
.studio-dropdown-button:where([dir=rtl], [dir=rtl] *) {
  flex-direction: row-reverse;
}

/* --- Glass surface: the panel and the collapsed button --- */
.studio-glass {
  background-color: rgb(255 255 255 / 0.2);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid rgb(255 255 255 / 0.3);
  --studio-button-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  box-shadow: var(--studio-button-shadow);
}

/* --- Collapsed button --- */
.studio-glass-button {
  display: flex;
  width: 3rem;
  height: 3rem;
  padding: 0;
  border-radius: 9999px;
  pointer-events: auto;
}
.studio-glass-button:hover {
  background-color: rgb(255 255 255 / 0.3);
}
/* Under a host's .dark class the glass and its button hover darken. */
.dark .studio-glass {
  background-color: rgb(0 0 0 / 0.5);
  border-color: rgb(255 255 255 / 0.2);
}
.dark .studio-glass-button:hover {
  background-color: rgb(0 0 0 / 0.6);
}
.studio-glass-button__icon {
  color: var(--foreground);
}

/* --- Panel --- */
.studio-panel__surface {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.studio-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
  border-bottom: 1px solid color-mix(in oklab, var(--border, color-mix(in oklab, var(--foreground) 30%, transparent)) 50%, transparent);
  -webkit-user-select: none;
  user-select: none;
}
.studio-header__title {
  font-size: var(--text-body-size, 0.875rem);
  line-height: var(--text-body-line-height, 1.25rem);
  font-weight: 600;
  color: var(--foreground);
}
.studio-header__collapse {
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
}
.studio-panel__content {
  flex: 1 1 0%;
  overflow-y: auto;
  padding: var(--space-4, 1rem);
}
.studio-resize-handle {
  position: absolute;
  right: var(--space-1, 0.25rem);
  bottom: var(--space-1, 0.25rem);
  width: 1.25rem;
  height: 1.25rem;
  cursor: nwse-resize;
}
.studio-resize-handle__icon {
  display: block;
  width: 1.25rem;
  height: 1.25rem;
  color: color-mix(in oklab, var(--muted-foreground) 70%, transparent);
  transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
  transition-timing-function: ${TRANSITION_EASE};
  transition-duration: 150ms;
}
.studio-resize-handle__icon:hover {
  color: var(--muted-foreground);
}

/* --- Control panel --- */
.studio-controls__group > * + *,
.studio-controls__list > * + * {
  margin-top: var(--space-3, 0.75rem);
}
.studio-controls__heading {
  font-size: var(--text-label-size, 0.75rem);
  line-height: var(--text-label-line-height, 1rem);
  font-weight: 600;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.studio-control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.studio-control-row--toggle {
  height: 2.25rem;
}
.studio-control-row__label {
  font-size: var(--text-body-size, 0.875rem);
  line-height: var(--text-body-line-height, 1.25rem);
  color: var(--muted-foreground);
  white-space: nowrap;
}
.studio-control-row__label--clickable {
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}

/* --- Switch --- */
.studio-switch {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  width: 2.25rem;
  height: 1.25rem;
  border: 2px solid transparent;
  border-radius: 9999px;
  cursor: pointer;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
  transition-timing-function: ${TRANSITION_EASE};
  transition-duration: 150ms;
}
.studio-switch[data-state=checked] {
  background-color: var(--primary, var(--foreground));
}
.studio-switch[data-state=unchecked] {
  background-color: var(--input, color-mix(in oklab, var(--foreground) 15%, transparent));
}
.studio-switch:focus-visible {
  outline: 2px solid transparent;
  outline-offset: 2px;
  box-shadow:
    0 0 0 2px var(--background),
    0 0 0 4px var(--ring, color-mix(in oklab, var(--foreground) 50%, transparent)),
    0 1px 2px 0 rgb(0 0 0 / 0.05);
}
.studio-switch:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.studio-switch__thumb {
  display: block;
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  background-color: var(--background);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  pointer-events: none;
  transition-property: transform;
  transition-timing-function: ${TRANSITION_EASE};
  transition-duration: 150ms;
}
.studio-switch__thumb[data-state=unchecked] { transform: translateX(0); }
.studio-switch__thumb[data-state=checked]:where([dir=ltr], [dir=ltr] *) { transform: translateX(1rem); }
.studio-switch__thumb[data-state=checked]:where([dir=rtl], [dir=rtl] *) { transform: translateX(-1rem); }

/* --- Dropdown menu ---
   Content and items paint from --foreground / --background rather than the
   popover tokens: a third-party theme may leave --popover-foreground equal to
   --popover, and the menu has to stay readable over any of them. */
.studio-menu {
  min-width: 8rem;
  max-height: var(--radix-dropdown-menu-content-available-height);
  overflow-x: hidden;
  overflow-y: auto;
  padding: var(--space-1, 0.25rem);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, calc(0.5rem - 2px));
  background-color: var(--background, hsl(0 0% 100%));
  color: var(--foreground, hsl(0 0% 0%));
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  transform-origin: var(--radix-dropdown-menu-content-transform-origin);
  /* Above the panel wherever it is portaled, and clickable inside the
     portal container, which itself takes no pointer events. */
  z-index: 99999;
  pointer-events: auto;
}
.studio-menu__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2, 0.5rem);
  padding: 0.375rem var(--space-2, 0.5rem);
  border-radius: var(--radius-sm, calc(0.5rem - 4px));
  font-size: var(--text-body-size, 0.875rem);
  line-height: var(--text-body-line-height, 1.25rem);
  cursor: default;
  -webkit-user-select: none;
  user-select: none;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
  transition-timing-function: ${TRANSITION_EASE};
  transition-duration: 150ms;
}
.studio-menu__item:focus {
  background-color: color-mix(in oklab, var(--foreground) 10%, transparent);
  color: var(--foreground);
}
.studio-menu__item[data-disabled] {
  pointer-events: none;
  opacity: 0.5;
}
.studio-menu__item > svg {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}
.studio-menu__item--inset {
  padding-left: 2rem;
}

/* --- Dropdown menu enter and exit ---
   Radix keeps the menu mounted after close and waits for \`animationend\`
   before unmounting it. Both rules name keyframes defined right here, so the
   exit animation always runs and the closed menu always unmounts. */
@keyframes frontx-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes frontx-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes frontx-zoom-in { from { transform: scale(0.95); } to { transform: scale(1); } }
@keyframes frontx-zoom-out { from { transform: scale(1); } to { transform: scale(0.95); } }
.studio-menu[data-state=open] { animation: frontx-fade-in 150ms ease-out, frontx-zoom-in 150ms ease-out; }
.studio-menu[data-state=closed] { animation: frontx-fade-out 100ms ease-in, frontx-zoom-out 100ms ease-in; animation-fill-mode: forwards; }
`;

/**
 * Inject studio styles into the document head (idempotent).
 * Returns a cleanup function that removes the style element.
 */
export function injectStudioStyles(): () => void {
  if (typeof document === 'undefined') return () => { };

  let styleEl = document.getElementById(STUDIO_STYLE_ID) as HTMLStyleElement | null;
  if (styleEl) return () => { };

  styleEl = document.createElement('style');
  styleEl.id = STUDIO_STYLE_ID;
  styleEl.textContent = STUDIO_CSS;
  document.head.appendChild(styleEl);

  return () => {
    styleEl?.remove();
  };
}
