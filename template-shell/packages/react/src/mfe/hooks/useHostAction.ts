/**
 * useHostAction Hook - Host action requests
 *
 * Returns a callback to request host actions via the bridge.
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-use-host-action:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-mfe-context-guard:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-mfe-hooks:p1

import { useCallback } from 'react';
import { useMfeContext } from '../MfeContext';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for requesting host actions.
 *
 * Returns a callback function that sends an actions chain to the host.
 * Must be used within a MfeProvider (i.e., inside an MFE component).
 *
 * NOTE: This hook provides the interface. Bridge executeActionsChain() delegates to the registry.
 *
 * @param actionTypeId - Type ID of the action to request
 * @returns Callback function to request the action with payload
 *
 * @example
 * ```tsx
 * function MyMfeComponent() {
 *   const requestNavigation = useHostAction('gts.frontx.mfes.comm.action.v1~myapp.navigate.v1');
 *
 *   const handleClick = () => {
 *     requestNavigation({ path: '/dashboard' });
 *   };
 *
 *   return <button onClick={handleClick}>Navigate</button>;
 * }
 * ```
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-use-host-action:p1:inst-call-host-action
// @cpt-begin:cpt-frontx-dod-react-bindings-mfe-hooks:p1:inst-call-host-action
export function useHostAction<TPayload extends Record<string, unknown> = Record<string, unknown>>(
  actionTypeId: string
): (payload?: TPayload) => void {
  // @cpt-begin:cpt-frontx-flow-react-bindings-use-host-action:p1:inst-read-bridge-for-action
  // @cpt-begin:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-mfe-context
  // Enforce MfeProvider context requirement
  const { bridge } = useMfeContext(); // Throws if not in MfeProvider
  // @cpt-end:cpt-frontx-flow-react-bindings-use-host-action:p1:inst-read-bridge-for-action
  // @cpt-end:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-mfe-context

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-host-action:p1:inst-return-action-callback
  return useCallback((payload?: TPayload) => {
    // Construct an ActionsChain with the action
    // With the constraint, TPayload extends Record<string, unknown>,
    // so this is a safe widening from specific to general
    const chain = {
      action: {
        type: actionTypeId,
        target: bridge.extDomainId,
        payload: payload as Record<string, unknown> | undefined,
      },
    };

    const logFailure = (error: unknown): void => {
      console.error(
        `[useHostAction] Failed to send action '${actionTypeId}':`,
        error
      );
    };

    // @cpt-begin:cpt-frontx-flow-react-bindings-use-host-action:p1:inst-log-action-error
    // Send the chain to the host. `executeActionsChain` is typed as
    // Promise<void>, but this package cannot import the template lib's
    // `dispatchChain` (packages/react sits below src-app in the
    // state/i18n -> framework -> react layer chain, template-shell/.dependency-cruiser.cjs),
    // so it mirrors dispatchChain's semantics locally: after #648 the bridge
    // may throw synchronously, resolve to a non-promise, or return a promise
    // that rejects. All three are logged the same way, none escapes into React.
    try {
      const result: unknown = bridge.executeActionsChain(chain);
      const isThenable =
        typeof result === 'object' &&
        result !== null &&
        typeof (result as { then?: unknown }).then === 'function';
      if (isThenable) {
        Promise.resolve(result as PromiseLike<void>).catch(logFailure);
      }
    } catch (error) {
      logFailure(error);
    }
    // @cpt-end:cpt-frontx-flow-react-bindings-use-host-action:p1:inst-log-action-error
  }, [actionTypeId, bridge]);
  // @cpt-end:cpt-frontx-flow-react-bindings-use-host-action:p1:inst-return-action-callback
}
// @cpt-end:cpt-frontx-flow-react-bindings-use-host-action:p1:inst-call-host-action
// @cpt-end:cpt-frontx-dod-react-bindings-mfe-hooks:p1:inst-call-host-action
