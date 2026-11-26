/**
 * The string-checked reader the lifecycle uses to put the shell's kit scope on
 * the shadow host. It keeps the same path and exports as _blank-mfe's copy, so
 * a package scaffolded from either template reads the host theme the same way,
 * and demo-mfe's screens read the theme through useBridgeProperty.
 */

import type { ChildMfeBridge } from '@gears-frontx/react/mfe';

/**
 * The theme identifier assumed while the host has not published its theme
 * property yet. `kitThemeScopeFor` resolves it to the light scope.
 */
export const DEFAULT_THEME_ID = 'default';

/**
 * The bridge's current value of a string shared property, or the fallback when
 * the host has not published one or published a non-string value.
 *
 * @param bridge - ChildMfeBridge instance
 * @param property - Shared property id (e.g. FRONTX_SHARED_PROPERTY_THEME)
 * @param fallback - Value used while the property carries no string
 */
export function readBridgeProperty(bridge: ChildMfeBridge, property: string, fallback: string): string {
  const current = bridge.getProperty(property);
  return current && typeof current.value === 'string' ? current.value : fallback;
}
