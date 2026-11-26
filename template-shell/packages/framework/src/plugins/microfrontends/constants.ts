/**
 * MFE host plugin constants (Framework L2)
 *
 * @packageDocumentation
 */

// ============================================================================
// MFE Event Names
// ============================================================================

/** MFE event names (registration events only) */
export const MfeEvents = {
  RegisterExtensionRequested: 'mfe/registerExtensionRequested',
  UnregisterExtensionRequested: 'mfe/unregisterExtensionRequested',
} as const;
