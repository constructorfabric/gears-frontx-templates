/**
 * EventBus - Central event emitter for domain communication
 *
 * Implements Observable pattern for loose coupling between domains.
 * Based on RxJS Subject pattern but lightweight with zero dependencies.
 *
 * Type Safety: EventPayloadMap ensures emit/on use correct payload per event.
 */

import type {
  EventPayloadMap,
  EventHandler,
  Subscription,
  EventBus as IEventBus,
} from './types';

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function')
    && value !== null
    && typeof (value as { then?: unknown }).then === 'function'
  );
}

function logSubscriberError(eventType: PropertyKey, error: unknown): void {
  console.error(`[Gears FrontX] A ${String(eventType)} subscriber threw`, error);
}

/**
 * EventBus Implementation
 *
 * A lightweight, type-safe event emitter that enables loose coupling
 * between application domains through the publish-subscribe pattern.
 *
 * @example
 * ```typescript
 * // Emit an event
 * eventBus.emit('chat/threads/selected', { threadId: '123' });
 *
 * // Subscribe to an event
 * const subscription = eventBus.on('chat/threads/selected', ({ threadId }) => {
 *   console.log('Thread selected:', threadId);
 * });
 *
 * // Unsubscribe
 * subscription.unsubscribe();
 * ```
 */
class EventBusImpl<TEvents extends EventPayloadMap = EventPayloadMap> implements IEventBus<TEvents> {
  private handlers: Map<string, Set<EventHandler<unknown>>> = new Map();

  /**
   * Emit an event with payload.
   * Type-safe: payload must match event type in EventPayloadMap.
   * Payload is optional for void events.
   * Every handler runs even when an earlier one throws: each error is logged
   * and emit never rethrows, so one failing subscriber cannot skip the rest
   * or fail the emitter. A handler that returns a promise is not awaited; its
   * rejection is logged the same way, so it never becomes unhandled.
   */
  emit<K extends keyof TEvents>(
    eventType: K,
    ...args: TEvents[K] extends void ? [] : [TEvents[K]]
  ): void {
    const handlers = this.handlers.get(eventType as string);
    if (handlers) {
      const payload = args[0];
      handlers.forEach((handler) => {
        try {
          const result: unknown = handler(payload);
          if (isThenable(result)) {
            result.then(undefined, (error: unknown) => {
              logSubscriberError(eventType, error);
            });
          }
        } catch (error) {
          logSubscriberError(eventType, error);
        }
      });
    }
  }

  /**
   * Subscribe to an event.
   * Type-safe: handler receives correct payload type for event.
   * Returns subscription object with unsubscribe method.
   */
  on<K extends keyof TEvents>(
    eventType: K,
    handler: EventHandler<TEvents[K]>
  ): Subscription {
    const key = eventType as string;
    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Set());
    }

    // Cast is safe because we control the payload type at emit time
    this.handlers.get(key)!.add(handler as EventHandler<unknown>);

    return {
      unsubscribe: (): void => {
        const handlers = this.handlers.get(key);
        if (handlers) {
          handlers.delete(handler as EventHandler<unknown>);
          if (handlers.size === 0) {
            this.handlers.delete(key);
          }
        }
      },
    };
  }

  /**
   * Subscribe to event, but only fire once then auto-unsubscribe.
   * Type-safe: handler receives correct payload type for event.
   * The subscription is removed before the handler runs, so a handler that
   * throws still fires only once.
   */
  once<K extends keyof TEvents>(
    eventType: K,
    handler: EventHandler<TEvents[K]>
  ): Subscription {
    // Returns the handler's result so emit can log an async rejection.
    const wrappedHandler = (payload: TEvents[K]): void => {
      subscription.unsubscribe();
      return handler(payload);
    };

    const subscription = this.on(eventType, wrappedHandler);
    return subscription;
  }

  /**
   * Remove all handlers for an event type.
   */
  clear(eventType: string): void {
    this.handlers.delete(eventType);
  }

  /**
   * Remove all event handlers.
   */
  clearAll(): void {
    this.handlers.clear();
  }
}

/**
 * Singleton EventBus instance.
 * Use this instance throughout the application for event communication.
 */
export const eventBus: IEventBus<EventPayloadMap> = new EventBusImpl<EventPayloadMap>();

/**
 * Export the class for testing purposes.
 * @internal
 */
export { EventBusImpl };
