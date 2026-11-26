/**
 * App-level Slices
 *
 * The mock slice the framework registers at the app level.
 *
 * State access: Components use `useAppSelector` hook from @gears-frontx/react.
 */

import mockReducer, {
  mockSlice,
  mockActions,
  setMockEnabled,
} from './mockSlice';

// ============================================================================
// Slice Exports
// ============================================================================

export {
  // Mock slice (app-level)
  mockSlice,
  mockActions,
  mockReducer,
  // Individual actions - mock
  setMockEnabled,
};
