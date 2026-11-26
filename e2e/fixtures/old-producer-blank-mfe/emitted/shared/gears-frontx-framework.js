// ../../../../template-shell/packages/framework/dist/chunk-ZOW5X566.js
import { createSlice } from "@gears-frontx/state";
import { createSlice as createSlice2 } from "@gears-frontx/state";
import { createSlice as createSlice3 } from "@gears-frontx/state";
import { createSlice as createSlice4 } from "@gears-frontx/state";
import { createSlice as createSlice5 } from "@gears-frontx/state";
import { createSlice as createSlice6 } from "@gears-frontx/state";
import { createSlice as createSlice7 } from "@gears-frontx/state";
import { createSlice as createSlice8 } from "@gears-frontx/state";
import { combineReducers } from "@reduxjs/toolkit";
import {
  RestPlugin,
  RestProtocol
} from "@gears-frontx/api";
import { eventBus } from "@gears-frontx/state";
import { eventBus as eventBus2, getStore } from "@gears-frontx/state";
import { apiRegistry, isMockPlugin } from "@gears-frontx/api";
import { eventBus as eventBus3, getStore as getStore2 } from "@gears-frontx/state";
import {
  peekSharedFetchCache,
  releaseSharedFetchCache,
  retainSharedFetchCache
} from "@gears-frontx/api";

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/subscribable.js
var Subscribable = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Set();
    this.subscribe = this.subscribe.bind(this);
  }
  subscribe(listener) {
    this.listeners.add(listener);
    this.onSubscribe();
    return () => {
      this.listeners.delete(listener);
      this.onUnsubscribe();
    };
  }
  hasListeners() {
    return this.listeners.size > 0;
  }
  onSubscribe() {
  }
  onUnsubscribe() {
  }
};

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/focusManager.js
var FocusManager = class extends Subscribable {
  #focused;
  #cleanup;
  #setup;
  constructor() {
    super();
    this.#setup = (onFocus) => {
      if (typeof window !== "undefined" && window.addEventListener) {
        const listener = () => onFocus();
        window.addEventListener("visibilitychange", listener, false);
        return () => {
          window.removeEventListener("visibilitychange", listener);
        };
      }
      return;
    };
  }
  onSubscribe() {
    if (!this.#cleanup) {
      this.setEventListener(this.#setup);
    }
  }
  onUnsubscribe() {
    if (!this.hasListeners()) {
      this.#cleanup?.();
      this.#cleanup = void 0;
    }
  }
  setEventListener(setup) {
    this.#setup = setup;
    this.#cleanup?.();
    this.#cleanup = setup((focused) => {
      if (typeof focused === "boolean") {
        this.setFocused(focused);
      } else {
        this.onFocus();
      }
    });
  }
  setFocused(focused) {
    const changed = this.#focused !== focused;
    if (changed) {
      this.#focused = focused;
      this.onFocus();
    }
  }
  onFocus() {
    const isFocused = this.isFocused();
    this.listeners.forEach((listener) => {
      listener(isFocused);
    });
  }
  isFocused() {
    if (typeof this.#focused === "boolean") {
      return this.#focused;
    }
    return globalThis.document?.visibilityState !== "hidden";
  }
};
var focusManager = new FocusManager();

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/timeoutManager.js
var defaultTimeoutProvider = {
  // We need the wrapper function syntax below instead of direct references to
  // global setTimeout etc.
  //
  // BAD: `setTimeout: setTimeout`
  // GOOD: `setTimeout: (cb, delay) => setTimeout(cb, delay)`
  //
  // If we use direct references here, then anything that wants to spy on or
  // replace the global setTimeout (like tests) won't work since we'll already
  // have a hard reference to the original implementation at the time when this
  // file was imported.
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timeoutId) => clearTimeout(timeoutId),
  setInterval: (callback, delay) => setInterval(callback, delay),
  clearInterval: (intervalId) => clearInterval(intervalId)
};
var TimeoutManager = class {
  // We cannot have TimeoutManager<T> as we must instantiate it with a concrete
  // type at app boot; and if we leave that type, then any new timer provider
  // would need to support the default provider's concrete timer ID, which is
  // infeasible across environments.
  //
  // We settle for type safety for the TimeoutProvider type, and accept that
  // this class is unsafe internally to allow for extension.
  #provider = defaultTimeoutProvider;
  #providerCalled = false;
  setTimeoutProvider(provider) {
    if (false) {
      if (this.#providerCalled && provider !== this.#provider) {
        console.error(
          `[timeoutManager]: Switching provider after calls to previous provider might result in unexpected behavior.`,
          { previous: this.#provider, provider }
        );
      }
    }
    this.#provider = provider;
    if (false) {
      this.#providerCalled = false;
    }
  }
  setTimeout(callback, delay) {
    if (false) {
      this.#providerCalled = true;
    }
    return this.#provider.setTimeout(callback, delay);
  }
  clearTimeout(timeoutId) {
    this.#provider.clearTimeout(timeoutId);
  }
  setInterval(callback, delay) {
    if (false) {
      this.#providerCalled = true;
    }
    return this.#provider.setInterval(callback, delay);
  }
  clearInterval(intervalId) {
    this.#provider.clearInterval(intervalId);
  }
};
var timeoutManager = new TimeoutManager();
function systemSetTimeoutZero(callback) {
  setTimeout(callback, 0);
}

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/utils.js
var isServer = typeof window === "undefined" || "Deno" in globalThis;
function noop() {
}
function functionalUpdate(updater, input) {
  return typeof updater === "function" ? updater(input) : updater;
}
function isValidTimeout(value) {
  return typeof value === "number" && value >= 0 && value !== Infinity;
}
function timeUntilStale(updatedAt, staleTime) {
  return Math.max(updatedAt + (staleTime || 0) - Date.now(), 0);
}
function resolveStaleTime(staleTime, query) {
  return typeof staleTime === "function" ? staleTime(query) : staleTime;
}
function resolveQueryBoolean(option, query) {
  return typeof option === "function" ? option(query) : option;
}
function matchQuery(filters, query) {
  const {
    type = "all",
    exact,
    fetchStatus,
    predicate,
    queryKey,
    stale
  } = filters;
  if (queryKey) {
    if (exact) {
      if (query.queryHash !== hashQueryKeyByOptions(queryKey, query.options)) {
        return false;
      }
    } else if (!partialMatchKey(query.queryKey, queryKey)) {
      return false;
    }
  }
  if (type !== "all") {
    const isActive = query.isActive();
    if (type === "active" && !isActive) {
      return false;
    }
    if (type === "inactive" && isActive) {
      return false;
    }
  }
  if (typeof stale === "boolean" && query.isStale() !== stale) {
    return false;
  }
  if (fetchStatus && fetchStatus !== query.state.fetchStatus) {
    return false;
  }
  if (predicate && !predicate(query)) {
    return false;
  }
  return true;
}
function matchMutation(filters, mutation) {
  const { exact, status, predicate, mutationKey } = filters;
  if (mutationKey) {
    if (!mutation.options.mutationKey) {
      return false;
    }
    if (exact) {
      if (hashKey(mutation.options.mutationKey) !== hashKey(mutationKey)) {
        return false;
      }
    } else if (!partialMatchKey(mutation.options.mutationKey, mutationKey)) {
      return false;
    }
  }
  if (status && mutation.state.status !== status) {
    return false;
  }
  if (predicate && !predicate(mutation)) {
    return false;
  }
  return true;
}
function hashQueryKeyByOptions(queryKey, options) {
  const hashFn = options?.queryKeyHashFn || hashKey;
  return hashFn(queryKey);
}
function hashKey(queryKey) {
  return JSON.stringify(
    queryKey,
    (_, val) => isPlainObject(val) ? Object.keys(val).sort().reduce((result, key) => {
      result[key] = val[key];
      return result;
    }, {}) : val
  );
}
function partialMatchKey(a, b) {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < b.length; i++) {
        if (!partialMatchKey(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }
    const bKeys = Object.keys(b);
    for (const key of bKeys) {
      if (!partialMatchKey(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}
var hasOwn = Object.prototype.hasOwnProperty;
function replaceEqualDeep(a, b, depth = 0) {
  if (a === b) {
    return a;
  }
  if (depth > 500) return b;
  const array = isPlainArray(a) && isPlainArray(b);
  if (!array && !(isPlainObject(a) && isPlainObject(b))) return b;
  const aItems = array ? a : Object.keys(a);
  const aSize = aItems.length;
  const bItems = array ? b : Object.keys(b);
  const bSize = bItems.length;
  const copy = array ? new Array(bSize) : {};
  let equalItems = 0;
  for (let i = 0; i < bSize; i++) {
    const key = array ? i : bItems[i];
    const aItem = a[key];
    const bItem = b[key];
    if (aItem === bItem) {
      copy[key] = aItem;
      if (array ? i < aSize : hasOwn.call(a, key)) equalItems++;
      continue;
    }
    if (aItem === null || bItem === null || typeof aItem !== "object" || typeof bItem !== "object") {
      copy[key] = bItem;
      continue;
    }
    const v = replaceEqualDeep(aItem, bItem, depth + 1);
    copy[key] = v;
    if (v === aItem) equalItems++;
  }
  return aSize === bSize && equalItems === aSize ? a : copy;
}
function isPlainArray(value) {
  return Array.isArray(value) && value.length === Object.keys(value).length;
}
function isPlainObject(o) {
  if (!hasObjectPrototype(o)) {
    return false;
  }
  const ctor = o.constructor;
  if (ctor === void 0) {
    return true;
  }
  const prot = ctor.prototype;
  if (!hasObjectPrototype(prot)) {
    return false;
  }
  if (!prot.hasOwnProperty("isPrototypeOf")) {
    return false;
  }
  if (Object.getPrototypeOf(o) !== Object.prototype) {
    return false;
  }
  return true;
}
function hasObjectPrototype(o) {
  return Object.prototype.toString.call(o) === "[object Object]";
}
function sleep(timeout) {
  return new Promise((resolve) => {
    timeoutManager.setTimeout(resolve, timeout);
  });
}
function replaceData(prevData, data, options) {
  if (typeof options.structuralSharing === "function") {
    return options.structuralSharing(prevData, data);
  } else if (options.structuralSharing !== false) {
    if (false) {
      try {
        return replaceEqualDeep(prevData, data);
      } catch (error) {
        console.error(
          `Structural sharing requires data to be JSON serializable. To fix this, turn off structuralSharing or return JSON-serializable data from your queryFn. [${options.queryHash}]: ${error}`
        );
        throw error;
      }
    }
    return replaceEqualDeep(prevData, data);
  }
  return data;
}
function addToEnd(items, item, max = 0) {
  const newItems = [...items, item];
  return max && newItems.length > max ? newItems.slice(1) : newItems;
}
function addToStart(items, item, max = 0) {
  const newItems = [item, ...items];
  return max && newItems.length > max ? newItems.slice(0, -1) : newItems;
}
var skipToken = /* @__PURE__ */ Symbol();
function ensureQueryFn(options, fetchOptions) {
  if (false) {
    if (options.queryFn === skipToken) {
      console.error(
        `Attempted to invoke queryFn when set to skipToken. This is likely a configuration error. Query hash: '${options.queryHash}'`
      );
    }
  }
  if (!options.queryFn && fetchOptions?.initialPromise) {
    return () => fetchOptions.initialPromise;
  }
  if (!options.queryFn || options.queryFn === skipToken) {
    return () => Promise.reject(new Error(`Missing queryFn: '${options.queryHash}'`));
  }
  return options.queryFn;
}
function addConsumeAwareSignal(object, getSignal, onCancelled) {
  let consumed = false;
  let signal;
  Object.defineProperty(object, "signal", {
    enumerable: true,
    get: () => {
      signal ??= getSignal();
      if (consumed) {
        return signal;
      }
      consumed = true;
      if (signal.aborted) {
        onCancelled();
      } else {
        signal.addEventListener("abort", onCancelled, { once: true });
      }
      return signal;
    }
  });
  return object;
}

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/environmentManager.js
var environmentManager = /* @__PURE__ */ (() => {
  let isServerFn = () => isServer;
  return {
    /**
     * Returns whether the current runtime should be treated as a server environment.
     */
    isServer() {
      return isServerFn();
    },
    /**
     * Overrides the server check globally.
     */
    setIsServer(isServerValue) {
      isServerFn = isServerValue;
    }
  };
})();

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/thenable.js
function pendingThenable() {
  let resolve;
  let reject;
  const thenable = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  thenable.status = "pending";
  thenable.catch(() => {
  });
  function finalize(data) {
    Object.assign(thenable, data);
    delete thenable.resolve;
    delete thenable.reject;
  }
  thenable.resolve = (value) => {
    finalize({
      status: "fulfilled",
      value
    });
    resolve(value);
  };
  thenable.reject = (reason) => {
    finalize({
      status: "rejected",
      reason
    });
    reject(reason);
  };
  return thenable;
}

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/notifyManager.js
var defaultScheduler = systemSetTimeoutZero;
function createNotifyManager() {
  let queue = [];
  let transactions = 0;
  let notifyFn = (callback) => {
    callback();
  };
  let batchNotifyFn = (callback) => {
    callback();
  };
  let scheduleFn = defaultScheduler;
  const schedule = (callback) => {
    if (transactions) {
      queue.push(callback);
    } else {
      scheduleFn(() => {
        notifyFn(callback);
      });
    }
  };
  const flush = () => {
    const originalQueue = queue;
    queue = [];
    if (originalQueue.length) {
      scheduleFn(() => {
        batchNotifyFn(() => {
          originalQueue.forEach((callback) => {
            notifyFn(callback);
          });
        });
      });
    }
  };
  return {
    batch: (callback) => {
      let result;
      transactions++;
      try {
        result = callback();
      } finally {
        transactions--;
        if (!transactions) {
          flush();
        }
      }
      return result;
    },
    /**
     * All calls to the wrapped function will be batched.
     */
    batchCalls: (callback) => {
      return (...args) => {
        schedule(() => {
          callback(...args);
        });
      };
    },
    schedule,
    /**
     * Use this method to set a custom notify function.
     * This can be used to for example wrap notifications with `React.act` while running tests.
     */
    setNotifyFunction: (fn) => {
      notifyFn = fn;
    },
    /**
     * Use this method to set a custom function to batch notifications together into a single tick.
     * By default React Query will use the batch function provided by ReactDOM or React Native.
     */
    setBatchNotifyFunction: (fn) => {
      batchNotifyFn = fn;
    },
    setScheduler: (fn) => {
      scheduleFn = fn;
    }
  };
}
var notifyManager = createNotifyManager();

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/onlineManager.js
var OnlineManager = class extends Subscribable {
  #online = true;
  #cleanup;
  #setup;
  constructor() {
    super();
    this.#setup = (onOnline) => {
      if (typeof window !== "undefined" && window.addEventListener) {
        const onlineListener = () => onOnline(true);
        const offlineListener = () => onOnline(false);
        window.addEventListener("online", onlineListener, false);
        window.addEventListener("offline", offlineListener, false);
        return () => {
          window.removeEventListener("online", onlineListener);
          window.removeEventListener("offline", offlineListener);
        };
      }
      return;
    };
  }
  onSubscribe() {
    if (!this.#cleanup) {
      this.setEventListener(this.#setup);
    }
  }
  onUnsubscribe() {
    if (!this.hasListeners()) {
      this.#cleanup?.();
      this.#cleanup = void 0;
    }
  }
  setEventListener(setup) {
    this.#setup = setup;
    this.#cleanup?.();
    this.#cleanup = setup(this.setOnline.bind(this));
  }
  setOnline(online) {
    const changed = this.#online !== online;
    if (changed) {
      this.#online = online;
      this.listeners.forEach((listener) => {
        listener(online);
      });
    }
  }
  isOnline() {
    return this.#online;
  }
};
var onlineManager = new OnlineManager();

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/retryer.js
function defaultRetryDelay(failureCount) {
  return Math.min(1e3 * 2 ** failureCount, 3e4);
}
function canFetch(networkMode) {
  return (networkMode ?? "online") === "online" ? onlineManager.isOnline() : true;
}
var CancelledError = class extends Error {
  constructor(options) {
    super("CancelledError");
    this.revert = options?.revert;
    this.silent = options?.silent;
  }
};
function createRetryer(config) {
  let isRetryCancelled = false;
  let failureCount = 0;
  let continueFn;
  const thenable = pendingThenable();
  const isResolved = () => thenable.status !== "pending";
  const cancel = (cancelOptions) => {
    if (!isResolved()) {
      const error = new CancelledError(cancelOptions);
      reject(error);
      config.onCancel?.(error);
    }
  };
  const cancelRetry = () => {
    isRetryCancelled = true;
  };
  const continueRetry = () => {
    isRetryCancelled = false;
  };
  const canContinue = () => focusManager.isFocused() && (config.networkMode === "always" || onlineManager.isOnline()) && config.canRun();
  const canStart = () => canFetch(config.networkMode) && config.canRun();
  const resolve = (value) => {
    if (!isResolved()) {
      continueFn?.();
      thenable.resolve(value);
    }
  };
  const reject = (value) => {
    if (!isResolved()) {
      continueFn?.();
      thenable.reject(value);
    }
  };
  const pause = () => {
    return new Promise((continueResolve) => {
      continueFn = (value) => {
        if (isResolved() || canContinue()) {
          continueResolve(value);
        }
      };
      config.onPause?.();
    }).then(() => {
      continueFn = void 0;
      if (!isResolved()) {
        config.onContinue?.();
      }
    });
  };
  const run = () => {
    if (isResolved()) {
      return;
    }
    let promiseOrValue;
    const initialPromise = failureCount === 0 ? config.initialPromise : void 0;
    try {
      promiseOrValue = initialPromise ?? config.fn();
    } catch (error) {
      promiseOrValue = Promise.reject(error);
    }
    Promise.resolve(promiseOrValue).then(resolve).catch((error) => {
      if (isResolved()) {
        return;
      }
      const retry = config.retry ?? (environmentManager.isServer() ? 0 : 3);
      const retryDelay = config.retryDelay ?? defaultRetryDelay;
      const delay = typeof retryDelay === "function" ? retryDelay(failureCount, error) : retryDelay;
      const shouldRetry = retry === true || typeof retry === "number" && failureCount < retry || typeof retry === "function" && retry(failureCount, error);
      if (isRetryCancelled || !shouldRetry) {
        reject(error);
        return;
      }
      failureCount++;
      config.onFail?.(failureCount, error);
      sleep(delay).then(() => {
        return canContinue() ? void 0 : pause();
      }).then(() => {
        if (isRetryCancelled) {
          reject(error);
        } else {
          run();
        }
      });
    });
  };
  return {
    promise: thenable,
    status: () => thenable.status,
    cancel,
    continue: () => {
      continueFn?.();
      return thenable;
    },
    cancelRetry,
    continueRetry,
    canStart,
    start: () => {
      if (canStart()) {
        run();
      } else {
        pause().then(run);
      }
      return thenable;
    }
  };
}

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/removable.js
var Removable = class {
  #gcTimeout;
  destroy() {
    this.clearGcTimeout();
  }
  scheduleGc() {
    this.clearGcTimeout();
    if (isValidTimeout(this.gcTime)) {
      this.#gcTimeout = timeoutManager.setTimeout(() => {
        this.optionalRemove();
      }, this.gcTime);
    }
  }
  updateGcTime(newGcTime) {
    this.gcTime = Math.max(
      this.gcTime || 0,
      newGcTime ?? (environmentManager.isServer() ? Infinity : 5 * 60 * 1e3)
    );
  }
  clearGcTimeout() {
    if (this.#gcTimeout !== void 0) {
      timeoutManager.clearTimeout(this.#gcTimeout);
      this.#gcTimeout = void 0;
    }
  }
};

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/infiniteQueryBehavior.js
function infiniteQueryBehavior(pages) {
  return {
    onFetch: (context, query) => {
      const options = context.options;
      const direction = context.fetchOptions?.meta?.fetchMore?.direction;
      const oldPages = context.state.data?.pages || [];
      const oldPageParams = context.state.data?.pageParams || [];
      let result = { pages: [], pageParams: [] };
      let currentPage = 0;
      const fetchFn = async () => {
        let cancelled = false;
        const addSignalProperty = (object) => {
          addConsumeAwareSignal(
            object,
            () => context.signal,
            () => cancelled = true
          );
        };
        const queryFn = ensureQueryFn(context.options, context.fetchOptions);
        const fetchPage = async (data, param, previous) => {
          if (cancelled) {
            return Promise.reject(context.signal.reason);
          }
          if (param == null && data.pages.length) {
            return Promise.resolve(data);
          }
          const createQueryFnContext = () => {
            const queryFnContext2 = {
              client: context.client,
              queryKey: context.queryKey,
              pageParam: param,
              direction: previous ? "backward" : "forward",
              meta: context.options.meta
            };
            addSignalProperty(queryFnContext2);
            return queryFnContext2;
          };
          const queryFnContext = createQueryFnContext();
          const page = await queryFn(queryFnContext);
          const { maxPages } = context.options;
          const addTo = previous ? addToStart : addToEnd;
          return {
            pages: addTo(data.pages, page, maxPages),
            pageParams: addTo(data.pageParams, param, maxPages)
          };
        };
        if (direction && oldPages.length) {
          const previous = direction === "backward";
          const pageParamFn = previous ? getPreviousPageParam : getNextPageParam;
          const oldData = {
            pages: oldPages,
            pageParams: oldPageParams
          };
          const param = pageParamFn(options, oldData);
          result = await fetchPage(oldData, param, previous);
        } else {
          const remainingPages = pages ?? oldPages.length;
          do {
            const param = currentPage === 0 ? oldPageParams[0] ?? options.initialPageParam : getNextPageParam(options, result);
            if (currentPage > 0 && param == null) {
              break;
            }
            result = await fetchPage(result, param);
            currentPage++;
          } while (currentPage < remainingPages);
        }
        return result;
      };
      if (context.options.persister) {
        context.fetchFn = () => {
          return context.options.persister?.(
            fetchFn,
            {
              client: context.client,
              queryKey: context.queryKey,
              meta: context.options.meta,
              signal: context.signal
            },
            query
          );
        };
      } else {
        context.fetchFn = fetchFn;
      }
    }
  };
}
function getNextPageParam(options, { pages, pageParams }) {
  const lastIndex = pages.length - 1;
  return pages.length > 0 ? options.getNextPageParam(
    pages[lastIndex],
    pages,
    pageParams[lastIndex],
    pageParams
  ) : void 0;
}
function getPreviousPageParam(options, { pages, pageParams }) {
  return pages.length > 0 ? options.getPreviousPageParam?.(pages[0], pages, pageParams[0], pageParams) : void 0;
}

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/query.js
var Query = class extends Removable {
  #queryType;
  #initialState;
  #revertState;
  #cache;
  #client;
  #retryer;
  #defaultOptions;
  #abortSignalConsumed;
  constructor(config) {
    super();
    this.#abortSignalConsumed = false;
    this.#defaultOptions = config.defaultOptions;
    this.setOptions(config.options);
    this.observers = [];
    this.#client = config.client;
    this.#cache = this.#client.getQueryCache();
    this.queryKey = config.queryKey;
    this.queryHash = config.queryHash;
    this.#initialState = getDefaultState(this.options);
    this.state = config.state ?? this.#initialState;
    this.scheduleGc();
  }
  get meta() {
    return this.options.meta;
  }
  get queryType() {
    return this.#queryType;
  }
  get promise() {
    return this.#retryer?.promise;
  }
  setOptions(options) {
    this.options = { ...this.#defaultOptions, ...options };
    if (options?._type) {
      this.#queryType = options._type;
    }
    this.updateGcTime(this.options.gcTime);
    if (this.state && this.state.data === void 0) {
      const defaultState = getDefaultState(this.options);
      if (defaultState.data !== void 0) {
        this.setState(
          successState(defaultState.data, defaultState.dataUpdatedAt)
        );
        this.#initialState = defaultState;
      }
    }
  }
  optionalRemove() {
    if (!this.observers.length && this.state.fetchStatus === "idle") {
      this.#cache.remove(this);
    }
  }
  setData(newData, options) {
    const data = replaceData(this.state.data, newData, this.options);
    this.#dispatch({
      data,
      type: "success",
      dataUpdatedAt: options?.updatedAt,
      manual: options?.manual
    });
    return data;
  }
  setState(state) {
    this.#dispatch({ type: "setState", state });
  }
  cancel(options) {
    const promise = this.#retryer?.promise;
    this.#retryer?.cancel(options);
    return promise ? promise.then(noop).catch(noop) : Promise.resolve();
  }
  destroy() {
    super.destroy();
    this.cancel({ silent: true });
  }
  get resetState() {
    return this.#initialState;
  }
  reset() {
    this.destroy();
    this.setState(this.resetState);
  }
  isActive() {
    return this.observers.some(
      (observer) => resolveQueryBoolean(observer.options.enabled, this) !== false
    );
  }
  isDisabled() {
    if (this.getObserversCount() > 0) {
      return !this.isActive();
    }
    return this.options.queryFn === skipToken || !this.isFetched();
  }
  isFetched() {
    return this.state.dataUpdateCount + this.state.errorUpdateCount > 0;
  }
  isStatic() {
    if (this.getObserversCount() > 0) {
      return this.observers.some(
        (observer) => resolveStaleTime(observer.options.staleTime, this) === "static"
      );
    }
    return false;
  }
  isStale() {
    if (this.getObserversCount() > 0) {
      return this.observers.some(
        (observer) => observer.getCurrentResult().isStale
      );
    }
    return this.state.data === void 0 || this.state.isInvalidated;
  }
  isStaleByTime(staleTime = 0) {
    if (this.state.data === void 0) {
      return true;
    }
    if (staleTime === "static") {
      return false;
    }
    if (this.state.isInvalidated) {
      return true;
    }
    return !timeUntilStale(this.state.dataUpdatedAt, staleTime);
  }
  onFocus() {
    const observer = this.observers.find((x) => x.shouldFetchOnWindowFocus());
    observer?.refetch({ cancelRefetch: false });
    this.#retryer?.continue();
  }
  onOnline() {
    const observer = this.observers.find((x) => x.shouldFetchOnReconnect());
    observer?.refetch({ cancelRefetch: false });
    this.#retryer?.continue();
  }
  addObserver(observer) {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
      this.clearGcTimeout();
      this.#cache.notify({ type: "observerAdded", query: this, observer });
    }
  }
  removeObserver(observer) {
    if (this.observers.includes(observer)) {
      this.observers = this.observers.filter((x) => x !== observer);
      if (!this.observers.length) {
        if (this.#retryer) {
          if (this.#abortSignalConsumed || this.#isInitialPausedFetch()) {
            this.#retryer.cancel({ revert: true });
          } else {
            this.#retryer.cancelRetry();
          }
        }
        this.scheduleGc();
      }
      this.#cache.notify({ type: "observerRemoved", query: this, observer });
    }
  }
  getObserversCount() {
    return this.observers.length;
  }
  #isInitialPausedFetch() {
    return this.state.fetchStatus === "paused" && this.state.status === "pending";
  }
  invalidate() {
    if (!this.state.isInvalidated) {
      this.#dispatch({ type: "invalidate" });
    }
  }
  async fetch(options, fetchOptions) {
    if (this.state.fetchStatus !== "idle" && // If the promise in the retryer is already rejected, we have to definitely
    // re-start the fetch; there is a chance that the query is still in a
    // pending state when that happens
    this.#retryer?.status() !== "rejected") {
      if (this.state.data !== void 0 && fetchOptions?.cancelRefetch) {
        this.cancel({ silent: true });
      } else if (this.#retryer) {
        this.#retryer.continueRetry();
        return this.#retryer.promise;
      }
    }
    if (options) {
      this.setOptions(options);
    }
    if (!this.options.queryFn) {
      const observer = this.observers.find((x) => x.options.queryFn);
      if (observer) {
        this.setOptions(observer.options);
      }
    }
    if (false) {
      if (!Array.isArray(this.options.queryKey)) {
        console.error(
          `As of v4, queryKey needs to be an Array. If you are using a string like 'repoData', please change it to an Array, e.g. ['repoData']`
        );
      }
    }
    const abortController = new AbortController();
    const addSignalProperty = (object) => {
      Object.defineProperty(object, "signal", {
        enumerable: true,
        get: () => {
          this.#abortSignalConsumed = true;
          return abortController.signal;
        }
      });
    };
    const fetchFn = () => {
      const queryFn = ensureQueryFn(this.options, fetchOptions);
      const createQueryFnContext = () => {
        const queryFnContext2 = {
          client: this.#client,
          queryKey: this.queryKey,
          meta: this.meta
        };
        addSignalProperty(queryFnContext2);
        return queryFnContext2;
      };
      const queryFnContext = createQueryFnContext();
      this.#abortSignalConsumed = false;
      if (this.options.persister) {
        return this.options.persister(
          queryFn,
          queryFnContext,
          this
        );
      }
      return queryFn(queryFnContext);
    };
    const createFetchContext = () => {
      const context2 = {
        fetchOptions,
        options: this.options,
        queryKey: this.queryKey,
        client: this.#client,
        state: this.state,
        fetchFn
      };
      addSignalProperty(context2);
      return context2;
    };
    const context = createFetchContext();
    const behavior = this.#queryType === "infinite" ? infiniteQueryBehavior(
      this.options.pages
    ) : this.options.behavior;
    behavior?.onFetch(context, this);
    this.#revertState = this.state;
    if (this.state.fetchStatus === "idle" || this.state.fetchMeta !== context.fetchOptions?.meta) {
      this.#dispatch({ type: "fetch", meta: context.fetchOptions?.meta });
    }
    this.#retryer = createRetryer({
      initialPromise: fetchOptions?.initialPromise,
      fn: context.fetchFn,
      onCancel: (error) => {
        if (error instanceof CancelledError && error.revert) {
          this.setState({
            ...this.#revertState,
            fetchStatus: "idle"
          });
        }
        abortController.abort();
      },
      onFail: (failureCount, error) => {
        this.#dispatch({ type: "failed", failureCount, error });
      },
      onPause: () => {
        this.#dispatch({ type: "pause" });
      },
      onContinue: () => {
        this.#dispatch({ type: "continue" });
      },
      retry: context.options.retry,
      retryDelay: context.options.retryDelay,
      networkMode: context.options.networkMode,
      canRun: () => true
    });
    try {
      const data = await this.#retryer.start();
      if (data === void 0) {
        if (false) {
          console.error(
            `Query data cannot be undefined. Please make sure to return a value other than undefined from your query function. Affected query key: ${this.queryHash}`
          );
        }
        throw new Error(`${this.queryHash} data is undefined`);
      }
      this.setData(data);
      this.#cache.config.onSuccess?.(data, this);
      this.#cache.config.onSettled?.(
        data,
        this.state.error,
        this
      );
      return data;
    } catch (error) {
      if (error instanceof CancelledError) {
        if (error.silent) {
          return this.#retryer.promise;
        } else if (error.revert) {
          if (this.state.data === void 0) {
            throw error;
          }
          return this.state.data;
        }
      }
      this.#dispatch({
        type: "error",
        error
      });
      this.#cache.config.onError?.(
        error,
        this
      );
      this.#cache.config.onSettled?.(
        this.state.data,
        error,
        this
      );
      throw error;
    } finally {
      this.scheduleGc();
    }
  }
  #dispatch(action) {
    const reducer = (state) => {
      switch (action.type) {
        case "failed":
          return {
            ...state,
            fetchFailureCount: action.failureCount,
            fetchFailureReason: action.error
          };
        case "pause":
          return {
            ...state,
            fetchStatus: "paused"
          };
        case "continue":
          return {
            ...state,
            fetchStatus: "fetching"
          };
        case "fetch":
          return {
            ...state,
            ...fetchState(state.data, this.options),
            fetchMeta: action.meta ?? null
          };
        case "success":
          const newState = {
            ...state,
            ...successState(action.data, action.dataUpdatedAt),
            dataUpdateCount: state.dataUpdateCount + 1,
            ...!action.manual && {
              fetchStatus: "idle",
              fetchFailureCount: 0,
              fetchFailureReason: null
            }
          };
          this.#revertState = action.manual ? newState : void 0;
          return newState;
        case "error":
          const error = action.error;
          return {
            ...state,
            error,
            errorUpdateCount: state.errorUpdateCount + 1,
            errorUpdatedAt: Date.now(),
            fetchFailureCount: state.fetchFailureCount + 1,
            fetchFailureReason: error,
            fetchStatus: "idle",
            status: "error",
            // flag existing data as invalidated if we get a background error
            // note that "no data" always means stale so we can set unconditionally here
            isInvalidated: true
          };
        case "invalidate":
          return {
            ...state,
            isInvalidated: true
          };
        case "setState":
          return {
            ...state,
            ...action.state
          };
      }
    };
    this.state = reducer(this.state);
    notifyManager.batch(() => {
      this.observers.forEach((observer) => {
        observer.onQueryUpdate();
      });
      this.#cache.notify({ query: this, type: "updated", action });
    });
  }
};
function fetchState(data, options) {
  return {
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchStatus: canFetch(options.networkMode) ? "fetching" : "paused",
    ...data === void 0 && {
      error: null,
      status: "pending"
    }
  };
}
function successState(data, dataUpdatedAt) {
  return {
    data,
    dataUpdatedAt: dataUpdatedAt ?? Date.now(),
    error: null,
    isInvalidated: false,
    status: "success"
  };
}
function getDefaultState(options) {
  const data = typeof options.initialData === "function" ? options.initialData() : options.initialData;
  const hasData = data !== void 0;
  const initialDataUpdatedAt = hasData ? typeof options.initialDataUpdatedAt === "function" ? options.initialDataUpdatedAt() : options.initialDataUpdatedAt : 0;
  return {
    data,
    dataUpdateCount: 0,
    dataUpdatedAt: hasData ? initialDataUpdatedAt ?? Date.now() : 0,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    isInvalidated: false,
    status: hasData ? "success" : "pending",
    fetchStatus: "idle"
  };
}

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/mutation.js
var Mutation = class extends Removable {
  #client;
  #observers;
  #mutationCache;
  #retryer;
  constructor(config) {
    super();
    this.#client = config.client;
    this.mutationId = config.mutationId;
    this.#mutationCache = config.mutationCache;
    this.#observers = [];
    this.state = config.state || getDefaultState2();
    this.setOptions(config.options);
    this.scheduleGc();
  }
  setOptions(options) {
    this.options = options;
    this.updateGcTime(this.options.gcTime);
  }
  get meta() {
    return this.options.meta;
  }
  addObserver(observer) {
    if (!this.#observers.includes(observer)) {
      this.#observers.push(observer);
      this.clearGcTimeout();
      this.#mutationCache.notify({
        type: "observerAdded",
        mutation: this,
        observer
      });
    }
  }
  removeObserver(observer) {
    this.#observers = this.#observers.filter((x) => x !== observer);
    this.scheduleGc();
    this.#mutationCache.notify({
      type: "observerRemoved",
      mutation: this,
      observer
    });
  }
  optionalRemove() {
    if (!this.#observers.length) {
      if (this.state.status === "pending") {
        this.scheduleGc();
      } else {
        this.#mutationCache.remove(this);
      }
    }
  }
  continue() {
    return this.#retryer?.continue() ?? // continuing a mutation assumes that variables are set, mutation must have been dehydrated before
    this.execute(this.state.variables);
  }
  async execute(variables) {
    const onContinue = () => {
      this.#dispatch({ type: "continue" });
    };
    const mutationFnContext = {
      client: this.#client,
      meta: this.options.meta,
      mutationKey: this.options.mutationKey
    };
    this.#retryer = createRetryer({
      fn: () => {
        if (!this.options.mutationFn) {
          return Promise.reject(new Error("No mutationFn found"));
        }
        return this.options.mutationFn(variables, mutationFnContext);
      },
      onFail: (failureCount, error) => {
        this.#dispatch({ type: "failed", failureCount, error });
      },
      onPause: () => {
        this.#dispatch({ type: "pause" });
      },
      onContinue,
      retry: this.options.retry ?? 0,
      retryDelay: this.options.retryDelay,
      networkMode: this.options.networkMode,
      canRun: () => this.#mutationCache.canRun(this)
    });
    const restored = this.state.status === "pending";
    const isPaused = !this.#retryer.canStart();
    try {
      if (restored) {
        onContinue();
      } else {
        this.#dispatch({ type: "pending", variables, isPaused });
        if (this.#mutationCache.config.onMutate) {
          await this.#mutationCache.config.onMutate(
            variables,
            this,
            mutationFnContext
          );
        }
        const context = await this.options.onMutate?.(
          variables,
          mutationFnContext
        );
        if (context !== this.state.context) {
          this.#dispatch({
            type: "pending",
            context,
            variables,
            isPaused
          });
        }
      }
      const data = await this.#retryer.start();
      await this.#mutationCache.config.onSuccess?.(
        data,
        variables,
        this.state.context,
        this,
        mutationFnContext
      );
      await this.options.onSuccess?.(
        data,
        variables,
        this.state.context,
        mutationFnContext
      );
      await this.#mutationCache.config.onSettled?.(
        data,
        null,
        this.state.variables,
        this.state.context,
        this,
        mutationFnContext
      );
      await this.options.onSettled?.(
        data,
        null,
        variables,
        this.state.context,
        mutationFnContext
      );
      this.#dispatch({ type: "success", data });
      return data;
    } catch (error) {
      try {
        await this.#mutationCache.config.onError?.(
          error,
          variables,
          this.state.context,
          this,
          mutationFnContext
        );
      } catch (e) {
        void Promise.reject(e);
      }
      try {
        await this.options.onError?.(
          error,
          variables,
          this.state.context,
          mutationFnContext
        );
      } catch (e) {
        void Promise.reject(e);
      }
      try {
        await this.#mutationCache.config.onSettled?.(
          void 0,
          error,
          this.state.variables,
          this.state.context,
          this,
          mutationFnContext
        );
      } catch (e) {
        void Promise.reject(e);
      }
      try {
        await this.options.onSettled?.(
          void 0,
          error,
          variables,
          this.state.context,
          mutationFnContext
        );
      } catch (e) {
        void Promise.reject(e);
      }
      this.#dispatch({ type: "error", error });
      throw error;
    } finally {
      this.#mutationCache.runNext(this);
    }
  }
  #dispatch(action) {
    const reducer = (state) => {
      switch (action.type) {
        case "failed":
          return {
            ...state,
            failureCount: action.failureCount,
            failureReason: action.error
          };
        case "pause":
          return {
            ...state,
            isPaused: true
          };
        case "continue":
          return {
            ...state,
            isPaused: false
          };
        case "pending":
          return {
            ...state,
            context: action.context,
            data: void 0,
            failureCount: 0,
            failureReason: null,
            error: null,
            isPaused: action.isPaused,
            status: "pending",
            variables: action.variables,
            submittedAt: Date.now()
          };
        case "success":
          return {
            ...state,
            data: action.data,
            failureCount: 0,
            failureReason: null,
            error: null,
            status: "success",
            isPaused: false
          };
        case "error":
          return {
            ...state,
            data: void 0,
            error: action.error,
            failureCount: state.failureCount + 1,
            failureReason: action.error,
            isPaused: false,
            status: "error"
          };
      }
    };
    this.state = reducer(this.state);
    notifyManager.batch(() => {
      this.#observers.forEach((observer) => {
        observer.onMutationUpdate(action);
      });
      this.#mutationCache.notify({
        mutation: this,
        type: "updated",
        action
      });
    });
  }
};
function getDefaultState2() {
  return {
    context: void 0,
    data: void 0,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    status: "idle",
    variables: void 0,
    submittedAt: 0
  };
}

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/mutationCache.js
var MutationCache = class extends Subscribable {
  constructor(config = {}) {
    super();
    this.config = config;
    this.#mutations = /* @__PURE__ */ new Set();
    this.#scopes = /* @__PURE__ */ new Map();
    this.#mutationId = 0;
  }
  #mutations;
  #scopes;
  #mutationId;
  build(client, options, state) {
    const mutation = new Mutation({
      client,
      mutationCache: this,
      mutationId: ++this.#mutationId,
      options: client.defaultMutationOptions(options),
      state
    });
    this.add(mutation);
    return mutation;
  }
  add(mutation) {
    this.#mutations.add(mutation);
    const scope = scopeFor(mutation);
    if (typeof scope === "string") {
      const scopedMutations = this.#scopes.get(scope);
      if (scopedMutations) {
        scopedMutations.push(mutation);
      } else {
        this.#scopes.set(scope, [mutation]);
      }
    }
    this.notify({ type: "added", mutation });
  }
  remove(mutation) {
    if (this.#mutations.delete(mutation)) {
      const scope = scopeFor(mutation);
      if (typeof scope === "string") {
        const scopedMutations = this.#scopes.get(scope);
        if (scopedMutations) {
          if (scopedMutations.length > 1) {
            const index = scopedMutations.indexOf(mutation);
            if (index !== -1) {
              scopedMutations.splice(index, 1);
            }
          } else if (scopedMutations[0] === mutation) {
            this.#scopes.delete(scope);
          }
        }
      }
    }
    this.notify({ type: "removed", mutation });
  }
  canRun(mutation) {
    const scope = scopeFor(mutation);
    if (typeof scope === "string") {
      const mutationsWithSameScope = this.#scopes.get(scope);
      const firstPendingMutation = mutationsWithSameScope?.find(
        (m) => m.state.status === "pending"
      );
      return !firstPendingMutation || firstPendingMutation === mutation;
    } else {
      return true;
    }
  }
  runNext(mutation) {
    const scope = scopeFor(mutation);
    if (typeof scope === "string") {
      const foundMutation = this.#scopes.get(scope)?.find((m) => m !== mutation && m.state.isPaused);
      return foundMutation?.continue() ?? Promise.resolve();
    } else {
      return Promise.resolve();
    }
  }
  clear() {
    notifyManager.batch(() => {
      this.#mutations.forEach((mutation) => {
        this.notify({ type: "removed", mutation });
      });
      this.#mutations.clear();
      this.#scopes.clear();
    });
  }
  getAll() {
    return Array.from(this.#mutations);
  }
  find(filters) {
    const defaultedFilters = { exact: true, ...filters };
    return this.getAll().find(
      (mutation) => matchMutation(defaultedFilters, mutation)
    );
  }
  findAll(filters = {}) {
    return this.getAll().filter((mutation) => matchMutation(filters, mutation));
  }
  notify(event) {
    notifyManager.batch(() => {
      this.listeners.forEach((listener) => {
        listener(event);
      });
    });
  }
  resumePausedMutations() {
    const pausedMutations = this.getAll().filter((x) => x.state.isPaused);
    return notifyManager.batch(
      () => Promise.all(
        pausedMutations.map((mutation) => mutation.continue().catch(noop))
      )
    );
  }
};
function scopeFor(mutation) {
  return mutation.options.scope?.id;
}

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/queryCache.js
var QueryCache = class extends Subscribable {
  constructor(config = {}) {
    super();
    this.config = config;
    this.#queries = /* @__PURE__ */ new Map();
  }
  #queries;
  build(client, options, state) {
    const queryKey = options.queryKey;
    const queryHash = options.queryHash ?? hashQueryKeyByOptions(queryKey, options);
    let query = this.get(queryHash);
    if (!query) {
      query = new Query({
        client,
        queryKey,
        queryHash,
        options: client.defaultQueryOptions(options),
        state,
        defaultOptions: client.getQueryDefaults(queryKey)
      });
      this.add(query);
    }
    return query;
  }
  add(query) {
    if (!this.#queries.has(query.queryHash)) {
      this.#queries.set(query.queryHash, query);
      this.notify({
        type: "added",
        query
      });
    }
  }
  remove(query) {
    const queryInMap = this.#queries.get(query.queryHash);
    if (queryInMap) {
      query.destroy();
      if (queryInMap === query) {
        this.#queries.delete(query.queryHash);
      }
      this.notify({ type: "removed", query });
    }
  }
  clear() {
    notifyManager.batch(() => {
      this.getAll().forEach((query) => {
        this.remove(query);
      });
    });
  }
  get(queryHash) {
    return this.#queries.get(queryHash);
  }
  getAll() {
    return [...this.#queries.values()];
  }
  find(filters) {
    const defaultedFilters = { exact: true, ...filters };
    return this.getAll().find(
      (query) => matchQuery(defaultedFilters, query)
    );
  }
  findAll(filters = {}) {
    const queries = this.getAll();
    return Object.keys(filters).length > 0 ? queries.filter((query) => matchQuery(filters, query)) : queries;
  }
  notify(event) {
    notifyManager.batch(() => {
      this.listeners.forEach((listener) => {
        listener(event);
      });
    });
  }
  onFocus() {
    notifyManager.batch(() => {
      this.getAll().forEach((query) => {
        query.onFocus();
      });
    });
  }
  onOnline() {
    notifyManager.batch(() => {
      this.getAll().forEach((query) => {
        query.onOnline();
      });
    });
  }
};

// ../../../../template-shell/node_modules/@tanstack/query-core/build/modern/queryClient.js
var QueryClient = class {
  #queryCache;
  #mutationCache;
  #defaultOptions;
  #queryDefaults;
  #mutationDefaults;
  #mountCount;
  #unsubscribeFocus;
  #unsubscribeOnline;
  constructor(config = {}) {
    this.#queryCache = config.queryCache || new QueryCache();
    this.#mutationCache = config.mutationCache || new MutationCache();
    this.#defaultOptions = config.defaultOptions || {};
    this.#queryDefaults = /* @__PURE__ */ new Map();
    this.#mutationDefaults = /* @__PURE__ */ new Map();
    this.#mountCount = 0;
  }
  mount() {
    this.#mountCount++;
    if (this.#mountCount !== 1) return;
    this.#unsubscribeFocus = focusManager.subscribe(async (focused) => {
      if (focused) {
        await this.resumePausedMutations();
        this.#queryCache.onFocus();
      }
    });
    this.#unsubscribeOnline = onlineManager.subscribe(async (online) => {
      if (online) {
        await this.resumePausedMutations();
        this.#queryCache.onOnline();
      }
    });
  }
  unmount() {
    this.#mountCount--;
    if (this.#mountCount !== 0) return;
    this.#unsubscribeFocus?.();
    this.#unsubscribeFocus = void 0;
    this.#unsubscribeOnline?.();
    this.#unsubscribeOnline = void 0;
  }
  isFetching(filters) {
    return this.#queryCache.findAll({ ...filters, fetchStatus: "fetching" }).length;
  }
  isMutating(filters) {
    return this.#mutationCache.findAll({ ...filters, status: "pending" }).length;
  }
  /**
   * Imperative (non-reactive) way to retrieve data for a QueryKey.
   * Should only be used in callbacks or functions where reading the latest data is necessary, e.g. for optimistic updates.
   *
   * Hint: Do not use this function inside a component, because it won't receive updates.
   * Use `useQuery` to create a `QueryObserver` that subscribes to changes.
   */
  getQueryData(queryKey) {
    const options = this.defaultQueryOptions({ queryKey });
    return this.#queryCache.get(options.queryHash)?.state.data;
  }
  ensureQueryData(options) {
    const defaultedOptions = this.defaultQueryOptions(options);
    const query = this.#queryCache.build(this, defaultedOptions);
    const cachedData = query.state.data;
    if (cachedData === void 0) {
      return this.fetchQuery(options);
    }
    if (options.revalidateIfStale && query.isStaleByTime(resolveStaleTime(defaultedOptions.staleTime, query))) {
      void this.prefetchQuery(defaultedOptions);
    }
    return Promise.resolve(cachedData);
  }
  getQueriesData(filters) {
    return this.#queryCache.findAll(filters).map(({ queryKey, state }) => {
      const data = state.data;
      return [queryKey, data];
    });
  }
  setQueryData(queryKey, updater, options) {
    const defaultedOptions = this.defaultQueryOptions({ queryKey });
    const query = this.#queryCache.get(
      defaultedOptions.queryHash
    );
    const prevData = query?.state.data;
    const data = functionalUpdate(updater, prevData);
    if (data === void 0) {
      return void 0;
    }
    return this.#queryCache.build(this, defaultedOptions).setData(data, { ...options, manual: true });
  }
  setQueriesData(filters, updater, options) {
    return notifyManager.batch(
      () => this.#queryCache.findAll(filters).map(({ queryKey }) => [
        queryKey,
        this.setQueryData(queryKey, updater, options)
      ])
    );
  }
  getQueryState(queryKey) {
    const options = this.defaultQueryOptions({ queryKey });
    return this.#queryCache.get(
      options.queryHash
    )?.state;
  }
  removeQueries(filters) {
    const queryCache2 = this.#queryCache;
    notifyManager.batch(() => {
      queryCache2.findAll(filters).forEach((query) => {
        queryCache2.remove(query);
      });
    });
  }
  resetQueries(filters, options) {
    const queryCache2 = this.#queryCache;
    return notifyManager.batch(() => {
      queryCache2.findAll(filters).forEach((query) => {
        query.reset();
      });
      return this.refetchQueries(
        {
          type: "active",
          ...filters
        },
        options
      );
    });
  }
  cancelQueries(filters, cancelOptions = {}) {
    const defaultedCancelOptions = { revert: true, ...cancelOptions };
    const promises = notifyManager.batch(
      () => this.#queryCache.findAll(filters).map((query) => query.cancel(defaultedCancelOptions))
    );
    return Promise.all(promises).then(noop).catch(noop);
  }
  invalidateQueries(filters, options = {}) {
    return notifyManager.batch(() => {
      this.#queryCache.findAll(filters).forEach((query) => {
        query.invalidate();
      });
      if (filters?.refetchType === "none") {
        return Promise.resolve();
      }
      return this.refetchQueries(
        {
          ...filters,
          type: filters?.refetchType ?? filters?.type ?? "active"
        },
        options
      );
    });
  }
  refetchQueries(filters, options = {}) {
    const fetchOptions = {
      ...options,
      cancelRefetch: options.cancelRefetch ?? true
    };
    const promises = notifyManager.batch(
      () => this.#queryCache.findAll(filters).filter((query) => !query.isDisabled() && !query.isStatic()).map((query) => {
        let promise = query.fetch(void 0, fetchOptions);
        if (!fetchOptions.throwOnError) {
          promise = promise.catch(noop);
        }
        return query.state.fetchStatus === "paused" ? Promise.resolve() : promise;
      })
    );
    return Promise.all(promises).then(noop);
  }
  fetchQuery(options) {
    const defaultedOptions = this.defaultQueryOptions(options);
    if (defaultedOptions.retry === void 0) {
      defaultedOptions.retry = false;
    }
    const query = this.#queryCache.build(this, defaultedOptions);
    return query.isStaleByTime(
      resolveStaleTime(defaultedOptions.staleTime, query)
    ) ? query.fetch(defaultedOptions) : Promise.resolve(query.state.data);
  }
  prefetchQuery(options) {
    return this.fetchQuery(options).then(noop).catch(noop);
  }
  fetchInfiniteQuery(options) {
    options._type = "infinite";
    return this.fetchQuery(options);
  }
  prefetchInfiniteQuery(options) {
    return this.fetchInfiniteQuery(options).then(noop).catch(noop);
  }
  ensureInfiniteQueryData(options) {
    options._type = "infinite";
    return this.ensureQueryData(options);
  }
  resumePausedMutations() {
    if (onlineManager.isOnline()) {
      return this.#mutationCache.resumePausedMutations();
    }
    return Promise.resolve();
  }
  getQueryCache() {
    return this.#queryCache;
  }
  getMutationCache() {
    return this.#mutationCache;
  }
  getDefaultOptions() {
    return this.#defaultOptions;
  }
  setDefaultOptions(options) {
    this.#defaultOptions = options;
  }
  setQueryDefaults(queryKey, options) {
    this.#queryDefaults.set(hashKey(queryKey), {
      queryKey,
      defaultOptions: options
    });
  }
  getQueryDefaults(queryKey) {
    const defaults = [...this.#queryDefaults.values()];
    const result = {};
    defaults.forEach((queryDefault) => {
      if (partialMatchKey(queryKey, queryDefault.queryKey)) {
        Object.assign(result, queryDefault.defaultOptions);
      }
    });
    return result;
  }
  setMutationDefaults(mutationKey, options) {
    this.#mutationDefaults.set(hashKey(mutationKey), {
      mutationKey,
      defaultOptions: options
    });
  }
  getMutationDefaults(mutationKey) {
    const defaults = [...this.#mutationDefaults.values()];
    const result = {};
    defaults.forEach((queryDefault) => {
      if (partialMatchKey(mutationKey, queryDefault.mutationKey)) {
        Object.assign(result, queryDefault.defaultOptions);
      }
    });
    return result;
  }
  defaultQueryOptions(options) {
    if (options._defaulted) {
      return options;
    }
    const defaultedOptions = {
      ...this.#defaultOptions.queries,
      ...this.getQueryDefaults(options.queryKey),
      ...options,
      _defaulted: true
    };
    if (!defaultedOptions.queryHash) {
      defaultedOptions.queryHash = hashQueryKeyByOptions(
        defaultedOptions.queryKey,
        defaultedOptions
      );
    }
    if (defaultedOptions.refetchOnReconnect === void 0) {
      defaultedOptions.refetchOnReconnect = defaultedOptions.networkMode !== "always";
    }
    if (defaultedOptions.throwOnError === void 0) {
      defaultedOptions.throwOnError = !!defaultedOptions.suspense;
    }
    if (!defaultedOptions.networkMode && defaultedOptions.persister) {
      defaultedOptions.networkMode = "offlineFirst";
    }
    if (defaultedOptions.queryFn === skipToken) {
      defaultedOptions.enabled = false;
    }
    return defaultedOptions;
  }
  defaultMutationOptions(options) {
    if (options?._defaulted) {
      return options;
    }
    return {
      ...this.#defaultOptions.mutations,
      ...options?.mutationKey && this.getMutationDefaults(options.mutationKey),
      ...options,
      _defaulted: true
    };
  }
  clear() {
    this.#queryCache.clear();
    this.#mutationCache.clear();
  }
};

// ../../../../template-shell/packages/framework/dist/chunk-ZOW5X566.js
import { eventBus as eventBus4, getStore as getStore3 } from "@gears-frontx/state";
import {
  ExtensionDomainImplementationFactory,
  ExtensionDomainImplementation,
  ActionHandler
} from "@gears-frontx/mfes";
var SLICE_KEY = "layout/header";
var initialState = {
  user: null,
  loading: false
};
var { slice, setUser, setLoading, clearUser } = createSlice({
  name: SLICE_KEY,
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
      state.loading = false;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    clearUser: (state) => {
      state.user = null;
      state.loading = false;
    }
  }
});
var headerSlice = slice;
var headerActions = { setUser, setLoading, clearUser };
var headerSlice_default = slice.reducer;
var SLICE_KEY2 = "layout/footer";
var initialState2 = {
  visible: true
};
var { slice: slice2, setFooterVisible, setFooterConfig, ...restActions } = createSlice2({
  name: SLICE_KEY2,
  initialState: initialState2,
  reducers: {
    setFooterVisible: (state, action) => {
      state.visible = action.payload;
    },
    setFooterConfig: (state, action) => {
      return { ...state, ...action.payload };
    }
  }
});
var footerSlice = slice2;
var footerActions = { setFooterVisible, setFooterConfig, ...restActions };
var footerSlice_default = slice2.reducer;
var SLICE_KEY3 = "layout/menu";
var initialState3 = {
  collapsed: false,
  items: [],
  visible: true
};
var { slice: slice3, toggleMenu, setMenuCollapsed, setMenuItems, setMenuVisible, setMenuConfig } = createSlice3({
  name: SLICE_KEY3,
  initialState: initialState3,
  reducers: {
    toggleMenu: (state) => {
      state.collapsed = !state.collapsed;
    },
    setMenuCollapsed: (state, action) => {
      state.collapsed = action.payload;
    },
    setMenuItems: (state, action) => {
      state.items = action.payload;
    },
    setMenuVisible: (state, action) => {
      state.visible = action.payload;
    },
    setMenuConfig: (state, action) => {
      return { ...state, ...action.payload };
    }
  }
});
var menuSlice = slice3;
var menuActions = { toggleMenu, setMenuCollapsed, setMenuItems, setMenuVisible, setMenuConfig };
var menuSlice_default = slice3.reducer;
var SLICE_KEY4 = "layout/sidebar";
var initialState4 = {
  collapsed: false,
  position: "left",
  title: null,
  content: null,
  visible: false,
  width: 256
};
var {
  slice: slice4,
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarContent,
  setSidebarVisible,
  setSidebarWidth,
  setSidebarConfig
} = createSlice4({
  name: SLICE_KEY4,
  initialState: initialState4,
  reducers: {
    toggleSidebar: (state) => {
      state.collapsed = !state.collapsed;
    },
    setSidebarCollapsed: (state, action) => {
      state.collapsed = action.payload;
    },
    setSidebarPosition: (state, action) => {
      state.position = action.payload;
    },
    setSidebarTitle: (state, action) => {
      state.title = action.payload;
    },
    setSidebarContent: (state, action) => {
      state.content = action.payload;
    },
    setSidebarVisible: (state, action) => {
      state.visible = action.payload;
    },
    setSidebarWidth: (state, action) => {
      state.width = action.payload;
    },
    setSidebarConfig: (state, action) => {
      return { ...state, ...action.payload };
    }
  }
});
var sidebarSlice = slice4;
var sidebarActions = {
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarContent,
  setSidebarVisible,
  setSidebarWidth,
  setSidebarConfig
};
var sidebarSlice_default = slice4.reducer;
var SLICE_KEY5 = "layout/popup";
var initialState5 = {
  stack: []
};
var { slice: slice5, openPopup, closePopup, closeTopPopup, closeAllPopups } = createSlice5({
  name: SLICE_KEY5,
  initialState: initialState5,
  reducers: {
    openPopup: (state, action) => {
      const zIndex = 1e3 + state.stack.length * 10;
      state.stack.push({ ...action.payload, zIndex });
    },
    closePopup: (state, action) => {
      state.stack = state.stack.filter((popup) => popup.id !== action.payload);
    },
    closeTopPopup: (state) => {
      state.stack.pop();
    },
    closeAllPopups: (state) => {
      state.stack = [];
    }
  }
});
var popupSlice = slice5;
var popupActions = { openPopup, closePopup, closeTopPopup, closeAllPopups };
var popupSlice_default = slice5.reducer;
var SLICE_KEY6 = "layout/overlay";
var initialState6 = {
  visible: false
};
var { slice: slice6, showOverlay, hideOverlay, setOverlayVisible } = createSlice6({
  name: SLICE_KEY6,
  initialState: initialState6,
  reducers: {
    showOverlay: (state) => {
      state.visible = true;
    },
    hideOverlay: (state) => {
      state.visible = false;
    },
    setOverlayVisible: (state, action) => {
      state.visible = action.payload;
    }
  }
});
var overlaySlice = slice6;
var overlayActions = { showOverlay, hideOverlay, setOverlayVisible };
var overlaySlice_default = slice6.reducer;
var SLICE_KEY7 = "app/tenant";
var initialState7 = {
  tenant: null,
  loading: false
};
var { slice: slice7, setTenant, setTenantLoading, clearTenant } = createSlice7({
  name: SLICE_KEY7,
  initialState: initialState7,
  reducers: {
    setTenant: (state, action) => {
      state.tenant = action.payload;
      state.loading = false;
    },
    setTenantLoading: (state, action) => {
      state.loading = action.payload;
    },
    clearTenant: (state) => {
      state.tenant = null;
      state.loading = false;
    }
  }
});
var tenantSlice = slice7;
var tenantActions = { setTenant, setTenantLoading, clearTenant };
var tenantSlice_default = slice7.reducer;
var SLICE_KEY8 = "mock";
var initialState8 = {
  enabled: false
};
var { slice: slice8, setMockEnabled } = createSlice8({
  name: SLICE_KEY8,
  initialState: initialState8,
  reducers: {
    setMockEnabled: (state, action) => {
      state.enabled = action.payload;
    }
  }
});
var mockSlice = slice8;
var mockActions = { setMockEnabled };
var mockSlice_default = slice8.reducer;
var LAYOUT_SLICE_NAME = "layout";
var TENANT_SLICE_NAME = "app/tenant";
var layoutDomainReducers = {
  header: headerSlice_default,
  footer: footerSlice_default,
  menu: menuSlice_default,
  sidebar: sidebarSlice_default,
  popup: popupSlice_default,
  overlay: overlaySlice_default
};
var layoutReducer = combineReducers(layoutDomainReducers);
var AuthEvents = {
  /**
   * The session ended, or may have, so session-bound state is dropped.
   * Emitted when `app.auth.logout()` finishes, whether the provider resolved
   * or rejected (the user meant to leave), and when the provider reports no
   * session on its own: its `subscribe` stream reports `unauthenticated`, or
   * a refresh (`app.auth.refresh()` or the 401 retry) resolves to no
   * session, unless the last known state was already signed out. A report of
   * no session while signed in is never dropped for arriving out of order.
   */
  LoggedOut: "auth/loggedOut",
  /**
   * A session began, possibly for another account, so session-bound state is
   * dropped. Emitted when `app.auth.login()` resolves without a redirect (a
   * redirect has no session yet), when `app.auth.handleCallback()` resolves,
   * and when the provider reports a session on its own that is not
   * positively the one already known: its `subscribe` stream or a refresh
   * reports `authenticated` after a signed-out or unknown state, or lands on
   * an identity whose `getIdentity().sub` differs from the last known one.
   *
   * The plugin fails closed: an extra clear costs a refetch, a missed one
   * shows one account's data to another. The same `sub` means the same data
   * owner, so new credentials or claims for the same account do not clear. A
   * provider without `getIdentity` signals state transitions only. For a
   * provider with it, an unknown identity counts as a change: a lookup that
   * rejects, resolves without a `sub` or takes longer than 5 seconds
   * (`SESSION_CHECK_TIMEOUT_MS`) during an authenticated session emits this
   * event, and so does a refresh that rejects while signed in. It clears once
   * per unknown identity: while the identity stays unknown, further failed
   * lookups and rejected refreshes emit nothing, until a state transition, a
   * login, callback or logout, or a lookup that finds a known identity (which
   * emits once more). A refresh that resolves while another session check is
   * still running is not checked and counts as an unknown identity. On init the
   * plugin reads `checkAuth()` and `getIdentity()` (same timeout) to set the
   * baseline without emitting, a signed-out result included; provider
   * reports wait for it, and when the read fails the first report emits.
   * After a clear for a session start, a report that arrives before that
   * clear's identity lookup lands emits this event again, since the account
   * may have switched in between; a provider echo of a login that arrives
   * after the call ended therefore clears once more, by design.
   */
  LoggedIn: "auth/loggedIn",
  /**
   * The provider reported that a signed-in session goes on (a state event or
   * a refresh), and the plugin is checking its identity with `getIdentity()`,
   * which may take up to 5 seconds. Session-bound work started before this
   * point may belong to a session the check is about to replace, so the
   * query cache moves its scope generation: mutation callbacks started
   * earlier stop writing to the cache. Nothing is cleared; if the check finds
   * another identity, `LoggedIn` follows. Not emitted for a provider without
   * `getIdentity`.
   */
  SessionCheck: "auth/sessionCheck"
};
function buildCapabilities(provider) {
  return {
    hasGetIdentity: typeof provider.getIdentity === "function",
    hasGetPermissions: typeof provider.getPermissions === "function",
    hasCanAccess: typeof provider.canAccess === "function",
    hasCanAccessMany: typeof provider.canAccessMany === "function",
    hasEvaluateAccess: typeof provider.evaluateAccess === "function",
    hasEvaluateMany: typeof provider.evaluateMany === "function",
    hasRefresh: typeof provider.refresh === "function",
    hasSubscribe: typeof provider.subscribe === "function"
  };
}
function classifyAbortReason(signal) {
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === "TimeoutError") return "timeout";
  return "aborted";
}
function isAccessDecision(value) {
  return value === "allow" || value === "deny";
}
function normalizeDecision(value) {
  return value === "allow" ? "allow" : "deny";
}
function isPlainObject2(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function isAccessReason(value) {
  return typeof value === "string";
}
function isAccessJsonValue(value, seen = /* @__PURE__ */ new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return value.every((entry) => isAccessJsonValue(entry, seen));
  }
  if (isPlainObject2(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.values(value).every((entry) => isAccessJsonValue(entry, seen));
  }
  return false;
}
function isAccessConstraint(value) {
  return isPlainObject2(value) && Object.values(value).every((entry) => isAccessJsonValue(entry));
}
function isAccessConstraints(value) {
  return Array.isArray(value) && value.every((entry) => isAccessConstraint(entry));
}
function isAccessMeta(value) {
  return isPlainObject2(value) && Object.values(value).every((entry) => isAccessJsonValue(entry));
}
function normalizeEvaluation(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { decision: "deny", reason: "provider_error" };
  }
  const maybeEvaluation = value;
  if (!isAccessDecision(maybeEvaluation.decision)) {
    return { decision: "deny", reason: "provider_error" };
  }
  if (maybeEvaluation.constraints !== void 0 && !isAccessConstraints(maybeEvaluation.constraints)) {
    return { decision: "deny", reason: "provider_error" };
  }
  if (maybeEvaluation.reason !== void 0 && !isAccessReason(maybeEvaluation.reason)) {
    return { decision: "deny", reason: "provider_error" };
  }
  if (maybeEvaluation.meta !== void 0 && !isAccessMeta(maybeEvaluation.meta)) {
    return { decision: "deny", reason: "provider_error" };
  }
  const normalized = { decision: maybeEvaluation.decision };
  if (maybeEvaluation.constraints !== void 0) {
    normalized.constraints = maybeEvaluation.constraints;
  }
  if (maybeEvaluation.reason !== void 0) {
    normalized.reason = maybeEvaluation.reason;
  }
  if (maybeEvaluation.meta !== void 0) {
    normalized.meta = maybeEvaluation.meta;
  }
  return normalized;
}
async function safeCanAccess(provider, caps, query, ctx) {
  if (!query.action || !query.resource) return "deny";
  if (!caps.hasCanAccess) return "deny";
  let session;
  try {
    session = await provider.getSession(ctx);
  } catch {
    return "deny";
  }
  if (session === null) return "deny";
  try {
    return normalizeDecision(await provider.canAccess?.(query, ctx));
  } catch {
    return "deny";
  }
}
async function safeEvaluateAccess(provider, caps, query, ctx) {
  if (!query.action || !query.resource) {
    return { decision: "deny", reason: "malformed" };
  }
  if (!caps.hasEvaluateAccess) {
    return { decision: "deny", reason: "unsupported" };
  }
  let session;
  try {
    session = await provider.getSession(ctx);
  } catch {
    return { decision: "deny", reason: "unauthenticated" };
  }
  if (session === null) {
    return { decision: "deny", reason: "unauthenticated" };
  }
  try {
    return normalizeEvaluation(await provider.evaluateAccess?.(query, ctx));
  } catch {
    const signal = ctx?.signal;
    if (signal?.aborted) {
      return { decision: "deny", reason: classifyAbortReason(signal) };
    }
    return { decision: "deny", reason: "provider_error" };
  }
}
async function safeCanAccessMany(provider, caps, queries, ctx) {
  if (queries.length === 0) return [];
  if (queries.some((query) => !query.action || !query.resource)) {
    const decisions = [];
    for (const query of queries) {
      decisions.push(await safeCanAccess(provider, caps, query, ctx));
    }
    return decisions;
  }
  if (caps.hasCanAccessMany) {
    let session;
    try {
      session = await provider.getSession(ctx);
    } catch {
      return queries.map(() => "deny");
    }
    if (session === null) return queries.map(() => "deny");
    try {
      const decisions = await provider.canAccessMany?.(queries, ctx);
      if (!Array.isArray(decisions) || decisions.length !== queries.length) {
        return queries.map(() => "deny");
      }
      return decisions.map((decision) => normalizeDecision(decision));
    } catch {
      return queries.map(() => "deny");
    }
  }
  const results = [];
  for (const query of queries) {
    results.push(await safeCanAccess(provider, caps, query, ctx));
  }
  return results;
}
async function safeEvaluateMany(provider, caps, queries, ctx) {
  if (queries.length === 0) return [];
  if (queries.some((query) => !query.action || !query.resource)) {
    const evaluations = [];
    for (const query of queries) {
      evaluations.push(await safeEvaluateAccess(provider, caps, query, ctx));
    }
    return evaluations;
  }
  if (caps.hasEvaluateMany) {
    let session;
    try {
      session = await provider.getSession(ctx);
    } catch {
      return queries.map(() => ({ decision: "deny", reason: "unauthenticated" }));
    }
    if (session === null) {
      return queries.map(() => ({ decision: "deny", reason: "unauthenticated" }));
    }
    try {
      const evaluations = await provider.evaluateMany?.(queries, ctx);
      if (!Array.isArray(evaluations) || evaluations.length !== queries.length) {
        return queries.map(() => ({ decision: "deny", reason: "provider_error" }));
      }
      return evaluations.map((evaluation) => normalizeEvaluation(evaluation));
    } catch {
      const signal = ctx?.signal;
      if (signal?.aborted) {
        const reason = classifyAbortReason(signal);
        return queries.map(() => ({ decision: "deny", reason }));
      }
      return queries.map(() => ({ decision: "deny", reason: "provider_error" }));
    }
  }
  const results = [];
  for (const query of queries) {
    results.push(await safeEvaluateAccess(provider, caps, query, ctx));
  }
  return results;
}
function isSupportedAuthTransportMethod(method) {
  return method === "GET" || method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH" || method === "HEAD" || method === "OPTIONS";
}
function toAuthTransportRequest(request) {
  if (!isSupportedAuthTransportMethod(request.method)) return null;
  let body;
  if (typeof request.body === "string") {
    body = request.body;
  } else if (request.body !== void 0) {
    try {
      body = JSON.stringify(request.body);
    } catch {
      body = void 0;
    }
  }
  return {
    url: request.url,
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal
  };
}
function isRelativeUrl(url) {
  return url.startsWith("/") && !url.startsWith("//");
}
function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
function getRuntimeOrigin() {
  const maybeLocation = globalThis.location;
  if (!maybeLocation?.origin || maybeLocation.origin === "null") return null;
  return maybeLocation.origin;
}
function shouldIncludeCredentials(url, allowedOrigins) {
  if (isRelativeUrl(url)) return true;
  const origin = getOrigin(url);
  if (!origin) return false;
  const runtimeOrigin = getRuntimeOrigin();
  if (runtimeOrigin && origin === runtimeOrigin) return true;
  if (!allowedOrigins || allowedOrigins.length === 0) return false;
  return allowedOrigins.includes(origin);
}
var MAX_REFRESHES_WITHOUT_SUCCESS = 2;
var REFRESH_BACKOFF_MS = 3e4;
var AuthRestPlugin = class extends RestPlugin {
  constructor(config, trackRefresh) {
    super();
    this.config = config;
    this.trackRefresh = trackRefresh;
  }
  config;
  trackRefresh;
  /** Shared in-flight refresh; deduplicates concurrent 401 refresh calls. Reset as soon as the refresh settles. */
  flight = null;
  /** Refreshes started since the last 2xx response, and when the last one started. */
  refreshesWithoutSuccess = 0;
  lastRefreshAt = 0;
  async onRequest(ctx) {
    const session = await this.config.provider.getSession({ signal: ctx.signal });
    if (!session) return ctx;
    if (session.kind === "cookie") {
      if (!shouldIncludeCredentials(ctx.url, this.config.frontxApi?.allowedCookieOrigins)) return ctx;
      const next = { ...ctx, withCredentials: true };
      const csrfHeaderName = this.config.frontxApi?.csrfHeaderName;
      if (csrfHeaderName && session.csrfToken) {
        return {
          ...next,
          headers: {
            ...next.headers,
            [csrfHeaderName]: session.csrfToken
          }
        };
      }
      return next;
    }
    if (session.kind === "bearer" && session.token) {
      return {
        ...ctx,
        headers: {
          ...ctx.headers,
          Authorization: `Bearer ${session.token}`
        }
      };
    }
    return ctx;
  }
  onResponse(ctx) {
    if (ctx.status >= 200 && ctx.status < 300) this.refreshesWithoutSuccess = 0;
    return ctx;
  }
  /**
   * A server that keeps answering 401 to a refreshed session would otherwise
   * refresh on every request it gets: after `MAX_REFRESHES_WITHOUT_SUCCESS`
   * refreshes with no 2xx response, a 401 fails without refreshing until
   * `REFRESH_BACKOFF_MS` pass or a request succeeds.
   */
  refreshExhausted() {
    if (this.refreshesWithoutSuccess < MAX_REFRESHES_WITHOUT_SUCCESS) return false;
    if (Date.now() - this.lastRefreshAt < REFRESH_BACKOFF_MS) return true;
    this.refreshesWithoutSuccess = 0;
    return false;
  }
  async onError(ctx) {
    const requestForHook = toAuthTransportRequest(ctx.request);
    if (requestForHook) {
      this.config.provider.onTransportError?.({
        request: requestForHook,
        error: ctx.error,
        status: ctx.response?.status
      });
    }
    if (ctx.response?.status !== 401) return ctx.error;
    if (ctx.retryCount !== 0) return ctx.error;
    if (!this.config.provider.refresh) return ctx.error;
    if (!this.flight && this.refreshExhausted()) return ctx.error;
    const flight = this.flight ?? this.startRefresh();
    let refreshed;
    try {
      refreshed = await flight.refresh;
    } catch {
      await flight.reported;
      return ctx.error;
    }
    await flight.reported;
    if (!refreshed) return ctx.error;
    if (refreshed.kind === "bearer") {
      if (!refreshed.token) return ctx.error;
      return ctx.retry({
        headers: { Authorization: `Bearer ${refreshed.token}` }
      });
    }
    if (refreshed.kind === "cookie") {
      return ctx.retry();
    }
    return ctx.error;
  }
  startRefresh() {
    this.refreshesWithoutSuccess += 1;
    this.lastRefreshAt = Date.now();
    const report = this.trackRefresh?.();
    const refresh = this.config.provider.refresh();
    const flight = {
      refresh,
      reported: refresh.then(
        (session) => report?.({ session }),
        (rejected) => report?.({ rejected })
      )
    };
    const reset = () => {
      if (this.flight === flight) this.flight = null;
    };
    void refresh.then(reset, reset);
    this.flight = flight;
    return flight;
  }
};
function frontxApiTransport() {
  return (args) => {
    const restPlugin = new AuthRestPlugin(
      {
        provider: args.provider,
        frontxApi: {
          allowedCookieOrigins: args.allowedCookieOrigins,
          csrfHeaderName: args.csrfHeaderName
        }
      },
      args.trackRefresh
    );
    args.addRestPlugin(restPlugin);
    return {
      destroy: () => {
        args.removeRestPlugin(AuthRestPlugin);
      }
    };
  };
}
var SESSION_CHECK_TIMEOUT_MS = 5e3;
function createSessionTracker(provider, caps) {
  let authenticated;
  let identity = { kind: "unknown", cleared: false };
  let issued = 0;
  let applied = 0;
  let busy = 0;
  let suppressed;
  let stopped = false;
  let baseline = Promise.resolve();
  const checks = /* @__PURE__ */ new Set();
  const ticket = () => ++issued;
  function emit(event) {
    if (!stopped) eventBus.emit(event, {});
  }
  async function check(read) {
    let cancel = () => void 0;
    const bounded = new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("session check timed out")), SESSION_CHECK_TIMEOUT_MS);
      cancel = () => {
        clearTimeout(timer);
        reject(new Error("session check cancelled"));
      };
    });
    checks.add(cancel);
    try {
      return await Promise.race([Promise.resolve().then(read), bounded]);
    } catch {
      return null;
    } finally {
      cancel();
      checks.delete(cancel);
    }
  }
  async function lookupSub() {
    const found = await check(() => provider.getIdentity?.());
    return typeof found?.sub === "string" && found.sub !== "" ? found.sub : null;
  }
  function clearForUnknownIdentity() {
    if (identity.kind === "unknown" && identity.cleared) return;
    identity = { kind: "unknown", cleared: true };
    emit(AuthEvents.LoggedIn);
  }
  async function resolveIdentity(current) {
    if (!caps.hasGetIdentity) return;
    const sub = await lookupSub();
    if (stopped || current !== applied || authenticated !== true) return;
    const before = identity;
    if (sub === null) {
      if (before.kind === "fresh" && before.since === current) identity = { kind: "unknown", cleared: true };
      else clearForUnknownIdentity();
      return;
    }
    identity = { kind: "known", sub };
    const changed = before.kind === "unknown" || before.kind === "fresh" && before.since !== current || before.kind === "known" && before.sub !== sub;
    if (changed) emit(AuthEvents.LoggedIn);
  }
  async function observe(next, current = ticket(), fromRefresh = false) {
    const unchecked = fromRefresh && checks.size > 0;
    if (!unchecked) await baseline;
    if (stopped) return;
    if (current < applied && (next || authenticated !== true)) return;
    applied = Math.max(applied, current);
    if (busy > 0) {
      suppressed = next;
      return;
    }
    const previous = authenticated;
    authenticated = next;
    if (!next) {
      if (previous !== false) emit(AuthEvents.LoggedOut);
      return;
    }
    if (unchecked) {
      if (previous !== true) identity = { kind: "unknown", cleared: false };
      clearForUnknownIdentity();
      return;
    }
    if (previous !== true) {
      identity = { kind: "fresh", since: current };
      emit(AuthEvents.LoggedIn);
    } else if (caps.hasGetIdentity) {
      emit(AuthEvents.SessionCheck);
    }
    await resolveIdentity(current);
  }
  function refreshFailed() {
    if (stopped || busy > 0 || authenticated !== true) return;
    clearForUnknownIdentity();
  }
  async function establish() {
    const current = ticket();
    const result = await check(() => provider.checkAuth());
    const sub = result?.authenticated === true ? await lookupSub() : null;
    if (stopped || applied > current) return;
    applied = current;
    authenticated = result === null ? void 0 : result?.authenticated === true;
    identity = sub === null ? { kind: "unknown", cleared: false } : { kind: "known", sub };
  }
  return {
    ticket,
    observe,
    refreshFailed,
    establish() {
      baseline = establish();
      return baseline;
    },
    begin() {
      busy += 1;
    },
    end(target) {
      busy -= 1;
      if (stopped) return;
      if (target !== null) {
        authenticated = target;
        suppressed = void 0;
        const current = applied = ticket();
        identity = { kind: "fresh", since: current };
        emit(target ? AuthEvents.LoggedIn : AuthEvents.LoggedOut);
        if (target) void resolveIdentity(current);
        return;
      }
      if (busy === 0 && suppressed !== void 0) {
        const replay = suppressed;
        suppressed = void 0;
        void observe(replay);
      }
    },
    stop() {
      stopped = true;
      for (const cancel of checks) cancel();
    }
  };
}
function auth(config) {
  const transport = config.transport ?? frontxApiTransport();
  let binding = null;
  const caps = buildCapabilities(config.provider);
  const session = createSessionTracker(config.provider, caps);
  let unsubscribe = null;
  const refresh = config.provider.refresh?.bind(config.provider);
  return {
    name: "auth",
    provides: {
      app: {
        auth: {
          provider: config.provider,
          capabilities: caps,
          getSession: (ctx) => config.provider.getSession(ctx),
          checkAuth: (ctx) => config.provider.checkAuth(ctx),
          logout: async (ctx) => {
            session.begin();
            try {
              return await config.provider.logout(ctx);
            } finally {
              session.end(false);
            }
          },
          login: config.provider.login ? async (input, ctx) => {
            session.begin();
            let target = null;
            try {
              const transition = await config.provider.login(input, ctx);
              if (transition.type !== "redirect") target = true;
              return transition;
            } finally {
              session.end(target);
            }
          } : void 0,
          handleCallback: config.provider.handleCallback ? async (input, ctx) => {
            session.begin();
            let target = null;
            try {
              const transition = await config.provider.handleCallback(input, ctx);
              target = true;
              return transition;
            } finally {
              session.end(target);
            }
          } : void 0,
          refresh: refresh ? async (ctx) => {
            const current = session.ticket();
            let refreshed;
            try {
              refreshed = await refresh(ctx);
            } catch (error) {
              session.refreshFailed();
              throw error;
            }
            await session.observe(refreshed !== null, current, true);
            return refreshed;
          } : void 0,
          getIdentity: config.provider.getIdentity?.bind(config.provider),
          getPermissions: config.provider.getPermissions?.bind(config.provider),
          canAccess: (query, ctx) => safeCanAccess(config.provider, caps, query, ctx),
          canAccessMany: (queries, ctx) => safeCanAccessMany(config.provider, caps, queries, ctx),
          evaluateAccess: (query, ctx) => safeEvaluateAccess(config.provider, caps, query, ctx),
          evaluateMany: (queries, ctx) => safeEvaluateMany(config.provider, caps, queries, ctx),
          subscribe: config.provider.subscribe?.bind(config.provider)
        }
      }
    },
    onInit(app) {
      binding = transport({
        provider: config.provider,
        allowedCookieOrigins: config.frontxApi?.allowedCookieOrigins,
        csrfHeaderName: config.frontxApi?.csrfHeaderName,
        addRestPlugin: (plugin) => app.apiRegistry.plugins.add(RestProtocol, plugin),
        removeRestPlugin: (pluginClass) => app.apiRegistry.plugins.remove(RestProtocol, pluginClass),
        trackRefresh: () => {
          const current = session.ticket();
          return async (outcome) => {
            if ("rejected" in outcome) session.refreshFailed();
            else await session.observe(outcome.session !== null, current, true);
          };
        }
      });
      void session.establish();
      unsubscribe = config.provider.subscribe?.((event) => {
        if (event.state === "authenticated" || event.state === "unauthenticated") {
          void session.observe(event.state === "authenticated");
        }
      }) ?? null;
    },
    onDestroy(_app) {
      unsubscribe?.();
      unsubscribe = null;
      session.stop();
      binding?.destroy();
      binding = null;
      const providerDestroyResult = config.provider.destroy?.();
      if (providerDestroyResult && typeof providerDestroyResult === "object" && "catch" in providerDestroyResult) {
        void providerDestroyResult.catch(() => void 0);
      }
    }
  };
}
function hasPluginManagement(protocol) {
  return "plugins" in protocol && typeof protocol.plugins === "object";
}
var MockEvents = {
  Toggle: "mock/toggle"
};
function syncMockPlugins(enabled) {
  for (const service of apiRegistry.getAll()) {
    const registeredPlugins = service.getPlugins();
    for (const [protocol, plugins] of registeredPlugins) {
      if (!hasPluginManagement(protocol)) continue;
      for (const plugin of plugins) {
        if (isMockPlugin(plugin)) {
          if (enabled) {
            const existingPlugins = protocol.plugins.getAll();
            if (!existingPlugins.includes(plugin)) {
              protocol.plugins.add(plugin);
            }
          } else {
            protocol.plugins.remove(plugin);
          }
        }
      }
    }
  }
}
function initMockEffects() {
  const store = getStore();
  const unsubscribe = eventBus2.on(MockEvents.Toggle, (payload) => {
    store.dispatch(setMockEnabled(payload.enabled));
    syncMockPlugins(payload.enabled);
  });
  const currentState = store.getState();
  if ("mock" in currentState && currentState.mock && typeof currentState.mock === "object" && "enabled" in currentState.mock) {
    syncMockPlugins(currentState.mock.enabled);
  }
  return () => {
    unsubscribe.unsubscribe();
  };
}
function toggleMockMode(enabled) {
  eventBus2.emit(MockEvents.Toggle, { enabled });
}
var TenantEvents = {
  Changed: "app/tenant/changed",
  Cleared: "app/tenant/cleared"
};
function initTenantEffects() {
  const store = getStore2();
  const subChanged = eventBus3.on(TenantEvents.Changed, (payload) => {
    store.dispatch(setTenant(payload.tenant));
  });
  const subCleared = eventBus3.on(TenantEvents.Cleared, () => {
    store.dispatch(clearTenant());
  });
  return () => {
    subChanged.unsubscribe();
    subCleared.unsubscribe();
  };
}
var QUERY_CACHE_RUNTIME_CHANGED_EVENT = "cache/runtime/changed";
var SHARED_QUERY_CLIENT_SYMBOL = /* @__PURE__ */ Symbol.for("frontx:query-cache:shared-client");
var SHARED_QUERY_CLIENT_RETAINERS_SYMBOL = /* @__PURE__ */ Symbol.for("frontx:query-cache:shared-client-retainers");
var SHARED_QUERY_CLIENT_CONFIG_SYMBOL = /* @__PURE__ */ Symbol.for("frontx:query-cache:shared-client-config");
var SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL = /* @__PURE__ */ Symbol.for(
  "frontx:query-cache:shared-client-teardown-token"
);
var QUERY_CLIENT_BROADCAST_TARGET_SYMBOL = /* @__PURE__ */ Symbol.for("frontx:query-cache:broadcast-target");
var QUERY_CLIENT_BROADCAST_COUNTER_SYMBOL = /* @__PURE__ */ Symbol.for("frontx:query-cache:broadcast-counter");
var QUERY_CLIENT_SCOPE_GENERATION_SYMBOL = /* @__PURE__ */ Symbol.for("frontx:query-cache:scope-generation");
var QUERY_CLIENT_DROPPED_WRITE_GENERATION_SYMBOL = /* @__PURE__ */ Symbol.for("frontx:query-cache:dropped-write-generation");
var APP_QUERY_CLIENT_SYMBOL = /* @__PURE__ */ Symbol.for("frontx:query-cache:app-client");
var APP_QUERY_CLIENT_RESOLVER_SYMBOL = /* @__PURE__ */ Symbol.for("frontx:query-cache:app-client-resolver");
var APP_QUERY_CLIENT_ACTIVATOR_SYMBOL = /* @__PURE__ */ Symbol.for("frontx:query-cache:app-client-activator");
var DUPLICATE_PLUGIN_CLEANUP_SYMBOL = /* @__PURE__ */ Symbol.for("frontx:plugin:duplicate-cleanup");
var cacheEffectsByClient = /* @__PURE__ */ new WeakMap();
var hostClearEffectsByClient = /* @__PURE__ */ new WeakMap();
var cacheScopeByClient = /* @__PURE__ */ new WeakMap();
function finalizeCacheEffectsEntry(entries, queryClient, entry) {
  if (entry.disposed) {
    return;
  }
  entry.disposed = true;
  entry.cleanup();
  entries.delete(queryClient);
}
function readQueryCacheScopeGeneration(queryClient) {
  return queryClient[QUERY_CLIENT_SCOPE_GENERATION_SYMBOL] ?? 0;
}
function recordQueryCacheScopeWriteDropped(queryClient, startGeneration) {
  const client = queryClient;
  client[QUERY_CLIENT_DROPPED_WRITE_GENERATION_SYMBOL] = Math.max(
    client[QUERY_CLIENT_DROPPED_WRITE_GENERATION_SYMBOL] ?? -1,
    startGeneration
  );
}
function readLatestDroppedWriteGeneration(queryClient) {
  return queryClient[QUERY_CLIENT_DROPPED_WRITE_GENERATION_SYMBOL] ?? -1;
}
function bumpQueryCacheScopeGeneration(queryClient) {
  queryClient[QUERY_CLIENT_SCOPE_GENERATION_SYMBOL] = readQueryCacheScopeGeneration(queryClient) + 1;
}
function emitSharedQueryClientRuntimeChanged(available) {
  eventBus4.emit(QUERY_CACHE_RUNTIME_CHANGED_EVENT, { available });
}
function subscribeQueryCacheRuntimeChanged(listener) {
  return eventBus4.on(QUERY_CACHE_RUNTIME_CHANGED_EVENT, () => {
    listener();
  });
}
function resolveQueryCacheConfig(config) {
  return {
    staleTime: config?.staleTime ?? 3e4,
    gcTime: config?.gcTime ?? 3e5,
    refetchOnWindowFocus: config?.refetchOnWindowFocus ?? true
  };
}
function isSameQueryCacheConfig(left, right) {
  return left.staleTime === right.staleTime && left.gcTime === right.gcTime && left.refetchOnWindowFocus === right.refetchOnWindowFocus;
}
function resolveSharedQueryClientRetainers(host) {
  const retainers = host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL];
  if (typeof retainers !== "number" || !Number.isFinite(retainers) || retainers < 0) {
    return 0;
  }
  return retainers;
}
function resolveSharedQueryClientTeardownToken(host) {
  const token = host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL];
  if (typeof token !== "number" || !Number.isInteger(token) || token < 0) {
    return 0;
  }
  return token;
}
function ensureQueryClientBroadcastTarget(queryClient) {
  const clientWithMetadata = queryClient;
  const existingTarget = clientWithMetadata[QUERY_CLIENT_BROADCAST_TARGET_SYMBOL];
  if (typeof existingTarget === "string" && existingTarget.length > 0) {
    return existingTarget;
  }
  const host = globalThis;
  const nextCounter = (host[QUERY_CLIENT_BROADCAST_COUNTER_SYMBOL] ?? 0) + 1;
  host[QUERY_CLIENT_BROADCAST_COUNTER_SYMBOL] = nextCounter;
  const broadcastTarget = `query-cache-${nextCounter}`;
  clientWithMetadata[QUERY_CLIENT_BROADCAST_TARGET_SYMBOL] = broadcastTarget;
  return broadcastTarget;
}
function attachQueryClientToApp(app, queryClient) {
  app[APP_QUERY_CLIENT_SYMBOL] = queryClient;
}
function detachQueryClientFromApp(app, queryClient) {
  const clientApp = app;
  if (clientApp[APP_QUERY_CLIENT_SYMBOL] === queryClient) {
    delete clientApp[APP_QUERY_CLIENT_SYMBOL];
  }
}
function attachQueryClientResolverToApp(app, resolver) {
  app[APP_QUERY_CLIENT_RESOLVER_SYMBOL] = resolver;
}
function detachQueryClientResolverFromApp(app) {
  delete app[APP_QUERY_CLIENT_RESOLVER_SYMBOL];
}
function attachQueryClientActivatorToApp(app, activator) {
  app[APP_QUERY_CLIENT_ACTIVATOR_SYMBOL] = activator;
}
function detachQueryClientActivatorFromApp(app) {
  delete app[APP_QUERY_CLIENT_ACTIVATOR_SYMBOL];
}
function createSharedQueryClient(config) {
  const resolvedConfig = resolveQueryCacheConfig(config);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: resolvedConfig.staleTime,
        gcTime: resolvedConfig.gcTime,
        retry: 0,
        refetchOnWindowFocus: resolvedConfig.refetchOnWindowFocus
      }
    }
  });
  ensureQueryClientBroadcastTarget(queryClient);
  const host = globalThis;
  host[SHARED_QUERY_CLIENT_CONFIG_SYMBOL] = resolvedConfig;
  return queryClient;
}
function getSharedQueryClient(config) {
  const host = globalThis;
  const existingClient = host[SHARED_QUERY_CLIENT_SYMBOL];
  const resolvedConfig = resolveQueryCacheConfig(config);
  if (!existingClient) {
    const createdClient = createSharedQueryClient(config);
    host[SHARED_QUERY_CLIENT_SYMBOL] = createdClient;
    return createdClient;
  }
  const existingConfig = host[SHARED_QUERY_CLIENT_CONFIG_SYMBOL];
  if (existingConfig && !isSameQueryCacheConfig(existingConfig, resolvedConfig)) {
    throw new Error(
      "[Gears FrontX] queryCache() received a config that conflicts with the existing shared QueryClient."
    );
  }
  ensureQueryClientBroadcastTarget(existingClient);
  return existingClient;
}
function peekSharedQueryClient() {
  return globalThis[SHARED_QUERY_CLIENT_SYMBOL];
}
function retainSharedQueryClient(config) {
  const host = globalThis;
  const queryClient = getSharedQueryClient(config);
  const retainers = resolveSharedQueryClientRetainers(host);
  host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL] = retainers + 1;
  if (retainers === 0) {
    host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL] = resolveSharedQueryClientTeardownToken(host) + 1;
  }
  emitSharedQueryClientRuntimeChanged(true);
  return queryClient;
}
function retainExistingSharedQueryClient() {
  const host = globalThis;
  const queryClient = host[SHARED_QUERY_CLIENT_SYMBOL];
  if (!queryClient) {
    throw new Error(
      "[Gears FrontX] queryCacheShared() requires an existing host queryCache() runtime."
    );
  }
  ensureQueryClientBroadcastTarget(queryClient);
  const retainers = resolveSharedQueryClientRetainers(host);
  host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL] = retainers + 1;
  if (retainers === 0) {
    host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL] = resolveSharedQueryClientTeardownToken(host) + 1;
  }
  return queryClient;
}
function releaseSharedQueryClient() {
  const host = globalThis;
  const retainers = resolveSharedQueryClientRetainers(host);
  if (retainers === 0) {
    return { released: false, isLastRetainer: false, teardownToken: 0 };
  }
  if (retainers === 1) {
    const teardownToken = resolveSharedQueryClientTeardownToken(host) + 1;
    host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL] = 0;
    host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL] = teardownToken;
    return { released: true, isLastRetainer: true, teardownToken };
  }
  host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL] = retainers - 1;
  return { released: true, isLastRetainer: false, teardownToken: 0 };
}
function finalizeReleasedSharedQueryClient(queryClient, teardownToken) {
  const host = globalThis;
  if (host[SHARED_QUERY_CLIENT_SYMBOL] !== queryClient) {
    return false;
  }
  if (resolveSharedQueryClientRetainers(host) !== 0) {
    return false;
  }
  if (resolveSharedQueryClientTeardownToken(host) !== teardownToken) {
    return false;
  }
  queryClient.clear();
  delete host[SHARED_QUERY_CLIENT_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_CONFIG_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL];
  emitSharedQueryClientRuntimeChanged(false);
  return true;
}
function resetSharedQueryClient() {
  const host = globalThis;
  const client = host[SHARED_QUERY_CLIENT_SYMBOL];
  if (client) {
    for (const entries of [cacheEffectsByClient, hostClearEffectsByClient]) {
      const cacheEffects = entries.get(client);
      if (cacheEffects) {
        finalizeCacheEffectsEntry(entries, client, cacheEffects);
      }
    }
    client.clear();
  }
  delete host[SHARED_QUERY_CLIENT_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_CONFIG_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL];
  emitSharedQueryClientRuntimeChanged(false);
}
function isNonEmptyQueryCacheKey(queryKey) {
  return Array.isArray(queryKey) && queryKey.length > 0;
}
function isLocalBroadcast(queryClient, payload) {
  if (payload === null || typeof payload !== "object") {
    return false;
  }
  const candidate = payload;
  return candidate.source === ensureQueryClientBroadcastTarget(queryClient);
}
function invalidateSharedFetchCache(cache, filters) {
  if (!cache) {
    return;
  }
  if (filters.exact === false) {
    cache.invalidateMany?.({
      key: filters.queryKey,
      exact: false
    });
    if (!cache.invalidateMany) {
      cache.clear();
    }
    return;
  }
  cache.invalidate(filters.queryKey);
}
function toScopedInvalidateFilters(payload) {
  if (payload === null || typeof payload !== "object") {
    return null;
  }
  const candidate = payload;
  if (!isNonEmptyQueryCacheKey(candidate.queryKey)) {
    return null;
  }
  return {
    queryKey: candidate.queryKey,
    ...candidate.exact === void 0 ? {} : { exact: candidate.exact },
    ...candidate.refetchType === void 0 ? {} : { refetchType: candidate.refetchType }
  };
}
function toScopedCacheSetPayload(payload) {
  if (payload === null || typeof payload !== "object") {
    return null;
  }
  const candidate = payload;
  if (!isNonEmptyQueryCacheKey(candidate.queryKey)) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(candidate, "dataOrUpdater")) {
    return null;
  }
  return {
    queryKey: candidate.queryKey,
    dataOrUpdater: candidate.dataOrUpdater,
    ...typeof candidate.source === "string" ? { source: candidate.source } : {}
  };
}
function toScopedCacheRemovePayload(payload) {
  if (payload === null || typeof payload !== "object") {
    return null;
  }
  const candidate = payload;
  if (!isNonEmptyQueryCacheKey(candidate.queryKey)) {
    return null;
  }
  return {
    queryKey: candidate.queryKey,
    ...typeof candidate.source === "string" ? { source: candidate.source } : {}
  };
}
async function cancelQueriesForTeardown(queryClient) {
  let cancelError;
  try {
    await queryClient.cancelQueries();
  } catch (error) {
    cancelError = error;
  }
  if (cancelError) {
    throw cancelError;
  }
}
function runQueryTeardown(queryClient, callbacks, failureMessage) {
  void cancelQueriesForTeardown(queryClient).then(() => {
    callbacks.onSuccess?.();
  }).catch((error) => {
    callbacks.onFailure?.();
    console.error(failureMessage, error);
  }).finally(() => {
    callbacks.onSettled?.();
  });
}
function readStoreSlice(key) {
  const state = getStore3().getState();
  if (state === null || typeof state !== "object" || !(key in state)) {
    return void 0;
  }
  return state[key];
}
function readMockEnabled() {
  const mockState = readStoreSlice("mock");
  return mockState !== null && typeof mockState === "object" && "enabled" in mockState && mockState.enabled === true;
}
function readTenantId() {
  const tenantState = readStoreSlice(TENANT_SLICE_NAME);
  if (tenantState === null || typeof tenantState !== "object" || !("tenant" in tenantState)) {
    return null;
  }
  const tenant = tenantState.tenant;
  return tenant !== null && typeof tenant === "object" && "id" in tenant && typeof tenant.id === "string" ? tenant.id : null;
}
function clearForScopeChange(queryClient) {
  queryClient.cancelQueries().catch((error) => {
    console.error("[Gears FrontX] Failed to cancel queries after a mock, tenant or session change", error);
  });
  queryClient.getQueryCache().getAll().forEach((query) => {
    query.reset();
  });
  queryClient.clear();
  peekSharedFetchCache()?.clear();
}
function createHeldBackMutations(queryClient) {
  const mutationCache = queryClient.getMutationCache();
  const held = /* @__PURE__ */ new Set();
  let unwatch = null;
  let generationAtHold = 0;
  let owed = false;
  let releases = 0;
  const stopWatching = () => {
    if (readLatestDroppedWriteGeneration(queryClient) >= generationAtHold) owed = true;
    held.clear();
    unwatch?.();
    unwatch = null;
  };
  const refresh = async () => {
    const startedAt = releases;
    await queryClient.cancelQueries();
    if (releases !== startedAt) return;
    if (held.size > 0) {
      owed = true;
      return;
    }
    peekSharedFetchCache()?.clear();
    queryClient.removeQueries({ predicate: (query) => query.getObserversCount() === 0 });
    await queryClient.invalidateQueries();
  };
  const refreshIfSettled = () => {
    held.forEach((mutation) => {
      if (mutation.state.status !== "pending") held.delete(mutation);
    });
    if (held.size > 0) return;
    stopWatching();
    if (!owed) return;
    owed = false;
    refresh().catch((error) => {
      console.error("[Gears FrontX] Failed to refresh queries after a session check", error);
    });
  };
  return {
    hold() {
      mutationCache.getAll().forEach((mutation) => {
        if (mutation.state.status === "pending") held.add(mutation);
      });
      if (held.size === 0 || unwatch) return;
      generationAtHold = readQueryCacheScopeGeneration(queryClient);
      unwatch = mutationCache.subscribe(refreshIfSettled);
    },
    release() {
      releases += 1;
      stopWatching();
      owed = false;
    }
  };
}
function createCacheScopeTracking(queryClient) {
  const scope = {
    mockEnabled: readMockEnabled(),
    tenantId: readTenantId(),
    stale: false
  };
  cacheScopeByClient.set(queryClient, scope);
  const heldBack = createHeldBackMutations(queryClient);
  const onScopeChanged = () => {
    heldBack.release();
    bumpQueryCacheScopeGeneration(queryClient);
    if (hostClearEffectsByClient.has(queryClient)) {
      clearForScopeChange(queryClient);
    } else {
      scope.stale = true;
    }
  };
  const subscriptions = [
    eventBus4.on(MockEvents.Toggle, (payload) => {
      if (payload.enabled === scope.mockEnabled) {
        return;
      }
      scope.mockEnabled = payload.enabled;
      onScopeChanged();
    }),
    eventBus4.on(TenantEvents.Changed, (payload) => {
      if (payload.tenant.id === scope.tenantId) {
        return;
      }
      scope.tenantId = payload.tenant.id;
      onScopeChanged();
    }),
    eventBus4.on(TenantEvents.Cleared, () => {
      if (scope.tenantId === null) {
        return;
      }
      scope.tenantId = null;
      onScopeChanged();
    }),
    eventBus4.on(AuthEvents.LoggedOut, onScopeChanged),
    eventBus4.on(AuthEvents.LoggedIn, onScopeChanged),
    // The session may be about to change: earlier work stops writing, nothing is cleared. The
    // mutations it stopped get a refresh once they settle.
    eventBus4.on(AuthEvents.SessionCheck, () => {
      heldBack.hold();
      bumpQueryCacheScopeGeneration(queryClient);
    })
  ];
  return () => {
    heldBack.release();
    subscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    cacheScopeByClient.delete(queryClient);
  };
}
function createHostClearEffects(queryClient) {
  const scope = cacheScopeByClient.get(queryClient);
  if (scope?.stale) {
    scope.stale = false;
    clearForScopeChange(queryClient);
  }
  return () => {
  };
}
function createCacheEffects(queryClient) {
  const releaseCacheScopeTracking = createCacheScopeTracking(queryClient);
  const invalidateSub = eventBus4.on("cache/invalidate", (payload) => {
    const filters = toScopedInvalidateFilters(payload);
    if (!filters) {
      return;
    }
    if (!isLocalBroadcast(queryClient, payload)) {
      void queryClient.invalidateQueries(filters);
    }
    invalidateSharedFetchCache(peekSharedFetchCache(), filters);
  });
  const setSub = eventBus4.on("cache/set", (payload) => {
    const cacheSetPayload = toScopedCacheSetPayload(payload);
    if (!cacheSetPayload) {
      return;
    }
    if (!isLocalBroadcast(queryClient, cacheSetPayload)) {
      queryClient.setQueryData(cacheSetPayload.queryKey, cacheSetPayload.dataOrUpdater);
    }
    peekSharedFetchCache()?.invalidate(cacheSetPayload.queryKey);
  });
  const removeSub = eventBus4.on("cache/remove", (payload) => {
    const cacheRemovePayload = toScopedCacheRemovePayload(payload);
    if (!cacheRemovePayload) {
      return;
    }
    if (!isLocalBroadcast(queryClient, cacheRemovePayload)) {
      queryClient.removeQueries({ queryKey: cacheRemovePayload.queryKey });
    }
    peekSharedFetchCache()?.invalidate(cacheRemovePayload.queryKey);
  });
  return () => {
    invalidateSub.unsubscribe();
    setSub.unsubscribe();
    removeSub.unsubscribe();
    releaseCacheScopeTracking();
  };
}
function retainPerClientEffects(entries, queryClient, create) {
  let entry = entries.get(queryClient);
  if (entry) {
    entry.retainers += 1;
  } else {
    entry = {
      retainers: 1,
      cleanup: create(queryClient),
      disposed: false
    };
    entries.set(queryClient, entry);
  }
  const retained = entry;
  return () => {
    if (retained.disposed) {
      return;
    }
    retained.retainers -= 1;
    if (retained.retainers === 0) {
      finalizeCacheEffectsEntry(entries, queryClient, retained);
    }
  };
}
function retainCacheEffects(queryClient) {
  return retainPerClientEffects(cacheEffectsByClient, queryClient, createCacheEffects);
}
function retainHostClearEffects(queryClient) {
  return retainPerClientEffects(hostClearEffectsByClient, queryClient, createHostClearEffects);
}
function queryCache(config) {
  let queryClient;
  let cleanup = null;
  let sharedFetchCacheRetained = false;
  let sharedRetainerReleased = false;
  function releasePluginRetainer() {
    if (!queryClient || sharedRetainerReleased) {
      return { released: false, isLastRetainer: false, teardownToken: 0 };
    }
    sharedRetainerReleased = true;
    const release = releaseSharedQueryClient();
    return {
      released: release.released,
      isLastRetainer: release.isLastRetainer,
      teardownToken: release.teardownToken
    };
  }
  function releasePluginSharedFetchCacheRetainer() {
    if (!sharedFetchCacheRetained) {
      return;
    }
    sharedFetchCacheRetained = false;
    releaseSharedFetchCache();
  }
  const plugin = {
    name: "queryCache",
    [DUPLICATE_PLUGIN_CLEANUP_SYMBOL]() {
      const { released } = releasePluginRetainer();
      if (!released) {
        return;
      }
      releasePluginSharedFetchCacheRetainer();
    },
    onInit(app) {
      if (!queryClient) {
        queryClient = retainSharedQueryClient(config);
        retainSharedFetchCache();
        sharedFetchCacheRetained = true;
        const releaseCacheEffects = retainCacheEffects(queryClient);
        const releaseHostClearEffects = retainHostClearEffects(queryClient);
        cleanup = () => {
          releaseHostClearEffects();
          releaseCacheEffects();
        };
      }
      attachQueryClientToApp(app, queryClient);
    },
    onDestroy(app) {
      if (queryClient) {
        detachQueryClientFromApp(app, queryClient);
      }
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      const { released, isLastRetainer, teardownToken } = releasePluginRetainer();
      if (!released) {
        return;
      }
      const sharedQueryClient = queryClient;
      if (!sharedQueryClient) {
        return;
      }
      const isLastSharedRetainer = isLastRetainer;
      if (isLastSharedRetainer) {
        runQueryTeardown(
          sharedQueryClient,
          {
            onSettled: () => {
              finalizeReleasedSharedQueryClient(sharedQueryClient, teardownToken);
              releasePluginSharedFetchCacheRetainer();
            }
          },
          "[Gears FrontX] Failed to destroy query cache runtime"
        );
        return;
      }
      releasePluginSharedFetchCacheRetainer();
    }
  };
  return plugin;
}
function queryCacheShared() {
  let queryClient;
  let cleanup = null;
  let sharedFetchCacheRetained = false;
  let sharedRetainerReleased = false;
  function ensureSharedQueryClient(app) {
    if (queryClient) {
      attachQueryClientToApp(app, queryClient);
      return queryClient;
    }
    if (!peekSharedQueryClient()) {
      return void 0;
    }
    queryClient = retainExistingSharedQueryClient();
    attachQueryClientToApp(app, queryClient);
    if (!sharedFetchCacheRetained) {
      retainSharedFetchCache();
      sharedFetchCacheRetained = true;
    }
    cleanup = retainCacheEffects(queryClient);
    return queryClient;
  }
  function releasePluginRetainer() {
    if (!queryClient || sharedRetainerReleased) {
      return { released: false, isLastRetainer: false, teardownToken: 0 };
    }
    sharedRetainerReleased = true;
    const release = releaseSharedQueryClient();
    return {
      released: release.released,
      isLastRetainer: release.isLastRetainer,
      teardownToken: release.teardownToken
    };
  }
  function releasePluginSharedFetchCacheRetainer() {
    if (!sharedFetchCacheRetained) {
      return;
    }
    sharedFetchCacheRetained = false;
    releaseSharedFetchCache();
  }
  const plugin = {
    name: "queryCacheShared",
    [DUPLICATE_PLUGIN_CLEANUP_SYMBOL]() {
      const { released } = releasePluginRetainer();
      if (!released) {
        return;
      }
      releasePluginSharedFetchCacheRetainer();
    },
    onInit(app) {
      attachQueryClientResolverToApp(app, () => app[APP_QUERY_CLIENT_SYMBOL]);
      attachQueryClientActivatorToApp(app, () => ensureSharedQueryClient(app));
      ensureSharedQueryClient(app);
    },
    onDestroy(app) {
      detachQueryClientResolverFromApp(app);
      detachQueryClientActivatorFromApp(app);
      if (queryClient) {
        detachQueryClientFromApp(app, queryClient);
      }
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      const { released, isLastRetainer, teardownToken } = releasePluginRetainer();
      if (!released) {
        return;
      }
      const isLastSharedRetainer = isLastRetainer;
      if (isLastSharedRetainer) {
        const sharedQueryClient = queryClient;
        if (!sharedQueryClient) {
          return;
        }
        runQueryTeardown(
          sharedQueryClient,
          {
            onSettled: () => {
              finalizeReleasedSharedQueryClient(sharedQueryClient, teardownToken);
              releasePluginSharedFetchCacheRetainer();
            }
          },
          "[Gears FrontX] Failed to destroy shared query cache runtime"
        );
        return;
      }
      releasePluginSharedFetchCacheRetainer();
    }
  };
  return plugin;
}
var TestDomainImpl = class extends ExtensionDomainImplementation {
  _strategies;
  constructor(strategies) {
    super();
    this._strategies = strategies;
  }
  getMountStrategies() {
    return this._strategies;
  }
};
var TestContainerProvider = class extends ExtensionDomainImplementationFactory {
  mockContainer = typeof document !== "undefined" ? document.createElement("div") : {};
  _pending = null;
  constructor(_container) {
    super();
    if (_container) this.mockContainer = _container;
  }
  prepareForDomain(declaration, createStrategy) {
    this._pending = { declaration, createStrategy };
    return this;
  }
  build(ctx) {
    const pending = this._pending;
    this._pending = null;
    if (!pending) {
      throw new Error("TestContainerProvider.build called without prepareForDomain");
    }
    const actions2 = pending.declaration.actions ?? [];
    const container = this.mockContainer;
    const hooks = {
      create: () => container,
      destroy: () => void 0
    };
    const strategy = pending.createStrategy(ctx, hooks);
    const mountExtActionId = ctx.typeSystem.resolveMountExtActionId();
    const unmountExtActionId = ctx.typeSystem.resolveUnmountExtActionId();
    const unmount = strategy.unmount?.bind(strategy);
    if (actions2.includes(unmountExtActionId) && !unmount) {
      throw new Error(
        `TestContainerProvider: domain '${pending.declaration.id}' lists ${unmountExtActionId} but its mount strategy has no unmount`
      );
    }
    if (actions2.includes(mountExtActionId)) {
      ctx.registerHandler(
        mountExtActionId,
        ActionHandler.fromFunction((_t, p) => strategy.mount(p))
      );
    }
    if (unmount && actions2.includes(unmountExtActionId)) {
      ctx.registerHandler(
        unmountExtActionId,
        ActionHandler.fromFunction((_t, p) => unmount(p))
      );
    }
    return new TestDomainImpl([strategy]);
  }
};

// ../../../../template-shell/packages/framework/dist/index.js
import { getStore as getStore4, registerSlice } from "@gears-frontx/state";
import { apiRegistry as apiRegistry2 } from "@gears-frontx/api";
import { eventBus as eventBus5 } from "@gears-frontx/state";
import { eventBus as eventBus22 } from "@gears-frontx/state";
import { eventBus as eventBus32 } from "@gears-frontx/state";
import { i18nRegistry as singletonI18nRegistry, Language } from "@gears-frontx/i18n";
import { router } from "@gears-frontx/routing";
import { createMfeRegistryFactory } from "@gears-frontx/mfes";
import { eventBus as eventBus6 } from "@gears-frontx/state";
import { createSlice as createSlice9 } from "@gears-frontx/state";
import { eventBus as eventBus42, getStore as getStore22 } from "@gears-frontx/state";
import { eventBus as eventBus52 } from "@gears-frontx/state";
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT
} from "@gears-frontx/gts-plugin";
import {
  FRONTX_ACTION_LOAD_EXT as FRONTX_ACTION_LOAD_EXT2,
  FRONTX_ACTION_MOUNT_EXT as FRONTX_ACTION_MOUNT_EXT2,
  FRONTX_ACTION_UNMOUNT_EXT as FRONTX_ACTION_UNMOUNT_EXT2
} from "@gears-frontx/gts-plugin";
import {
  FRONTX_ACTION_LOAD_EXT as FRONTX_ACTION_LOAD_EXT3,
  FRONTX_ACTION_MOUNT_EXT as FRONTX_ACTION_MOUNT_EXT3,
  FRONTX_ACTION_UNMOUNT_EXT as FRONTX_ACTION_UNMOUNT_EXT3
} from "@gears-frontx/gts-plugin";
import {
  ChildMfeBridge,
  ParentMfeBridge,
  MfeHandler,
  MfeBridgeFactory,
  ActionHandler as ActionHandler2,
  MfeRegistry,
  MfeRegistryFactory,
  ExtensionDomainImplementationFactory as ExtensionDomainImplementationFactory2,
  ExtensionDomainImplementation as ExtensionDomainImplementation2,
  ExtensionMounter,
  MountStrategy,
  ConcurrentMountStrategy,
  OptionalMountStrategy,
  ExclusiveMountStrategy
} from "@gears-frontx/mfes";
import { MfeHandlerMF } from "@gears-frontx/mfes";
import { gtsPlugin } from "@gears-frontx/gts-plugin";
import {
  createShadowRoot,
  injectCssVariables,
  extractGtsPackage
} from "@gears-frontx/mfes";
import { eventBus as eventBus8, createStore, getStore as getStore42, registerSlice as registerSlice2, hasSlice, createSlice as createSlice22 } from "@gears-frontx/state";
import { eventBus as eventBus7, getStore as getStore32 } from "@gears-frontx/state";
import {
  apiRegistry as apiRegistry22,
  BaseApiService,
  RestProtocol as RestProtocol2,
  RestEndpointProtocol,
  SseProtocol,
  SseStreamProtocol,
  ApiPluginBase,
  ApiPlugin,
  ApiProtocol,
  RestPlugin as RestPlugin2,
  RestPluginWithConfig,
  SsePlugin,
  SsePluginWithConfig,
  resetSharedFetchCache,
  isShortCircuit,
  isRestShortCircuit,
  isSseShortCircuit,
  MOCK_PLUGIN,
  isMockPlugin as isMockPlugin2
} from "@gears-frontx/api";
import { i18nRegistry, I18nRegistryImpl, createI18nRegistry, Language as Language2, SUPPORTED_LANGUAGES, getLanguageMetadata, TextDirection, LanguageDisplayMode } from "@gears-frontx/i18n";
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatRelative,
  formatNumber,
  formatPercent,
  formatCompact,
  formatCurrency,
  compareStrings,
  createCollator
} from "@gears-frontx/i18n";
import { I18nRegistryImpl as I18nRegistryImpl2 } from "@gears-frontx/i18n";
var DUPLICATE_PLUGIN_CLEANUP_SYMBOL2 = /* @__PURE__ */ Symbol.for(
  "frontx:plugin:duplicate-cleanup"
);
function isPluginFactory(value) {
  return typeof value === "function";
}
function resolvePlugin(plugin) {
  return isPluginFactory(plugin) ? plugin() : plugin;
}
function resolvePluginNameHint(plugin) {
  if (isPluginFactory(plugin)) {
    return plugin.name || void 0;
  }
  return plugin.name;
}
function cleanupSkippedDuplicatePlugin(plugin) {
  plugin[DUPLICATE_PLUGIN_CLEANUP_SYMBOL2]?.();
}
var buildState = "idle";
function assertBuildable() {
  if (buildState === "building") {
    throw new Error(
      "createFrontX().build() was called while another build is in progress. A runtime builds exactly one FrontX app."
    );
  }
  if (buildState === "built") {
    throw new Error(
      "A FrontX app has already been built in this runtime. A runtime builds exactly one app: create it once at module level and reuse it."
    );
  }
}
var FrontXAppBuilderImpl = class {
  plugins = [];
  config;
  constructor(config = {}) {
    this.config = {
      name: "Gears FrontX App",
      devMode: false,
      strictMode: false,
      ...config
    };
  }
  /**
   * Add a plugin to the application.
   * Also accepts an array of plugins (for preset support).
   */
  // @cpt-begin:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-1
  // @cpt-begin:cpt-frontx-state-framework-composition-builder:p1:inst-1
  use(plugin) {
    if (Array.isArray(plugin)) {
      plugin.forEach((p) => this.use(p));
      return this;
    }
    const pluginNameHint = resolvePluginNameHint(plugin);
    if (pluginNameHint && this.plugins.some((p) => p.name === pluginNameHint)) {
      if (!isPluginFactory(plugin)) {
        cleanupSkippedDuplicatePlugin(plugin);
      }
      if (this.config.devMode) {
        console.warn(
          `Plugin "${pluginNameHint}" is already registered. Skipping duplicate.`
        );
      }
      return this;
    }
    const resolved = resolvePlugin(plugin);
    if (this.plugins.some((p) => p.name === resolved.name)) {
      cleanupSkippedDuplicatePlugin(resolved);
      if (this.config.devMode) {
        console.warn(
          `Plugin "${resolved.name}" is already registered. Skipping duplicate.`
        );
      }
      return this;
    }
    this.plugins.push(resolved);
    return this;
  }
  // @cpt-end:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-1
  // @cpt-end:cpt-frontx-state-framework-composition-builder:p1:inst-1
  /**
   * Add multiple plugins at once.
   */
  useAll(plugins) {
    plugins.forEach((plugin) => this.use(plugin));
    return this;
  }
  /**
   * Build the application.
   */
  // @cpt-begin:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-2
  // @cpt-begin:cpt-frontx-state-framework-composition-builder:p1:inst-2
  build() {
    assertBuildable();
    buildState = "building";
    let created;
    try {
      created = this.createApp();
    } catch (error) {
      buildState = "idle";
      throw error;
    }
    buildState = "built";
    const { app, orderedPlugins } = created;
    orderedPlugins.forEach((plugin) => {
      if (plugin.onInit) {
        plugin.onInit(app);
      }
    });
    return app;
  }
  createApp() {
    const orderedPlugins = this.resolveDependencies();
    orderedPlugins.forEach((plugin) => {
      if (plugin.onRegister) {
        plugin.onRegister(this, plugin._configType);
      }
    });
    const aggregated = this.aggregateProvides(orderedPlugins);
    const store = this.createStoreWithSlices(aggregated.slices);
    aggregated.effects.forEach((initEffect) => {
      initEffect(store.dispatch);
    });
    const app = {
      config: this.config,
      store,
      themeRegistry: aggregated.registries.themeRegistry,
      apiRegistry: apiRegistry2,
      i18nRegistry: aggregated.registries.i18nRegistry,
      mfeRegistry: void 0,
      actions: aggregated.actions,
      destroy: () => this.destroyApp(orderedPlugins, app)
    };
    const mfeRegistryDescriptor = Object.getOwnPropertyDescriptor(
      aggregated.registries,
      "mfeRegistry"
    );
    if (mfeRegistryDescriptor) {
      Object.defineProperty(app, "mfeRegistry", mfeRegistryDescriptor);
    }
    for (const key of Object.keys(aggregated.app)) {
      if (key in app) {
        throw new Error(
          `Plugin app extension "${key}" conflicts with an existing app property.`
        );
      }
    }
    Object.assign(app, aggregated.app);
    return { app, orderedPlugins };
  }
  // @cpt-end:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-2
  // @cpt-end:cpt-frontx-state-framework-composition-builder:p1:inst-2
  /**
   * Resolve plugin dependencies using topological sort.
   */
  // @cpt-begin:cpt-frontx-algo-framework-composition-dep-resolution:p1:inst-1
  // @cpt-begin:cpt-frontx-flow-framework-composition-plugin-dependency:p1:inst-2
  resolveDependencies() {
    const resolved = [];
    const visited = /* @__PURE__ */ new Set();
    const visiting = /* @__PURE__ */ new Set();
    const visit = (plugin) => {
      if (visited.has(plugin.name)) return;
      if (visiting.has(plugin.name)) {
        throw new Error(
          `Circular dependency detected: ${plugin.name} depends on itself or creates a cycle.`
        );
      }
      visiting.add(plugin.name);
      if (plugin.dependencies) {
        for (const depName of plugin.dependencies) {
          const dep = this.plugins.find((p) => p.name === depName);
          if (!dep) {
            if (this.config.strictMode) {
              throw new Error(
                `Plugin "${plugin.name}" requires "${depName}" but it is not registered.
Add the missing plugin: .use(${depName}())`
              );
            } else {
              console.warn(
                `Plugin "${plugin.name}" requires "${depName}" but it is not registered. Some features may not work correctly.`
              );
              continue;
            }
          }
          visit(dep);
        }
      }
      visiting.delete(plugin.name);
      visited.add(plugin.name);
      resolved.push(plugin);
    };
    this.plugins.forEach(visit);
    return resolved;
  }
  // @cpt-end:cpt-frontx-algo-framework-composition-dep-resolution:p1:inst-1
  // @cpt-end:cpt-frontx-flow-framework-composition-plugin-dependency:p1:inst-2
  /**
   * Aggregate all provides from plugins.
   */
  // @cpt-begin:cpt-frontx-algo-framework-composition-provides-aggregation:p1:inst-1
  aggregateProvides(plugins) {
    const registries = {};
    const app = {};
    const slices = [];
    const effects2 = [];
    const actions2 = {};
    plugins.forEach((plugin) => {
      if (!plugin.provides) return;
      if (plugin.provides.registries) {
        Object.defineProperties(
          registries,
          Object.getOwnPropertyDescriptors(plugin.provides.registries)
        );
      }
      if (plugin.provides.app) {
        Object.assign(app, plugin.provides.app);
      }
      if (plugin.provides.slices) {
        slices.push(...plugin.provides.slices);
      }
      if (plugin.provides.effects) {
        effects2.push(...plugin.provides.effects);
      }
      if (plugin.provides.actions) {
        Object.assign(actions2, plugin.provides.actions);
      }
    });
    return { registries, app, slices, effects: effects2, actions: actions2 };
  }
  // @cpt-end:cpt-frontx-algo-framework-composition-provides-aggregation:p1:inst-1
  /**
   * Create store with all aggregated slices.
   */
  createStoreWithSlices(slices) {
    const store = getStore4();
    slices.forEach((slice22) => {
      registerSlice(slice22);
    });
    return store;
  }
  /**
   * Destroy the app and cleanup resources.
   */
  // @cpt-begin:cpt-frontx-flow-framework-composition-teardown:p2:inst-1
  destroyApp(plugins, app) {
    [...plugins].reverse().forEach((plugin) => {
      if (plugin.onDestroy) {
        plugin.onDestroy(app);
      }
    });
  }
  // @cpt-end:cpt-frontx-flow-framework-composition-teardown:p2:inst-1
};
function createFrontX(config) {
  return new FrontXAppBuilderImpl(config);
}
function createThemeRegistry() {
  const themes2 = /* @__PURE__ */ new Map();
  let currentThemeId = null;
  const subscribers = /* @__PURE__ */ new Set();
  let version = 0;
  function notifySubscribers() {
    version++;
    subscribers.forEach((callback) => {
      callback();
    });
  }
  function applyCSSVariables(variables) {
    if (typeof document === "undefined") return;
    const existing = document.getElementById("frontx-theme-vars");
    let styleEl;
    if (existing instanceof HTMLStyleElement) {
      styleEl = existing;
    } else {
      existing?.remove();
      styleEl = document.createElement("style");
      styleEl.id = "frontx-theme-vars";
      document.head.appendChild(styleEl);
    }
    const sheet = styleEl.sheet;
    if (!sheet) return;
    while (sheet.cssRules.length > 0) sheet.deleteRule(0);
    const parts = [];
    for (const [key, value] of Object.entries(variables)) {
      parts.push(`${key}: ${value}`);
    }
    if (parts.length === 0) return;
    sheet.insertRule(`:root:root { ${parts.join("; ")} }`, 0);
  }
  return {
    register(config) {
      if (themes2.has(config.id)) {
        console.warn(`Theme "${config.id}" is already registered. Skipping.`);
        return;
      }
      themes2.set(config.id, config);
      if (config.default && currentThemeId === null) {
        this.apply(config.id);
      }
    },
    get(id) {
      return themes2.get(id);
    },
    getAll() {
      return Array.from(themes2.values());
    },
    apply(id) {
      const config = themes2.get(id);
      if (!config) {
        console.warn(`Theme "${id}" not found. Cannot apply.`);
        return;
      }
      applyCSSVariables(config.variables);
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", config.appearance ?? "light");
      }
      currentThemeId = id;
      notifySubscribers();
    },
    getCurrent() {
      return currentThemeId ? themes2.get(currentThemeId) : void 0;
    },
    subscribe(callback) {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
    getVersion() {
      return version;
    }
  };
}
function changeTheme(payload) {
  eventBus5.emit("theme/changed", payload);
}
function themes() {
  const themeRegistry = createThemeRegistry();
  let themeChangedSubscription;
  return {
    name: "themes",
    dependencies: [],
    provides: {
      registries: {
        themeRegistry
      },
      actions: {
        changeTheme
      }
    },
    // @cpt-begin:cpt-frontx-flow-framework-composition-theme-propagation:p1:inst-2
    // @cpt-begin:cpt-frontx-dod-framework-composition-propagation:p1:inst-1
    onInit() {
      themeChangedSubscription = eventBus5.on("theme/changed", (payload) => {
        themeRegistry.apply(payload.themeId);
      });
      const themes2 = themeRegistry.getAll();
      if (themes2.length > 0) {
        themeRegistry.apply(themes2[0].id);
      }
    },
    onDestroy() {
      themeChangedSubscription?.unsubscribe();
      themeChangedSubscription = void 0;
    }
    // @cpt-end:cpt-frontx-flow-framework-composition-theme-propagation:p1:inst-2
    // @cpt-end:cpt-frontx-dod-framework-composition-propagation:p1:inst-1
  };
}
function showPopup(payload) {
  eventBus22.emit("layout/popup/requested", payload);
}
function hidePopup() {
  eventBus22.emit("layout/popup/hidden");
}
function showOverlay2(payload) {
  eventBus22.emit("layout/overlay/requested", payload);
}
function hideOverlay2() {
  eventBus22.emit("layout/overlay/hidden");
}
function toggleMenuCollapsed(payload) {
  eventBus22.emit("layout/menu/collapsed", payload);
}
function toggleSidebarCollapsed(payload) {
  eventBus22.emit("layout/sidebar/collapsed", payload);
}
function setHeaderVisible(_visible) {
}
function layout() {
  let subscriptions = [];
  return {
    name: "layout",
    dependencies: [],
    provides: {
      slices: [
        headerSlice,
        footerSlice,
        menuSlice,
        sidebarSlice,
        popupSlice,
        overlaySlice
      ],
      actions: {
        showPopup,
        hidePopup,
        showOverlay: showOverlay2,
        hideOverlay: hideOverlay2,
        toggleMenuCollapsed,
        toggleSidebarCollapsed,
        // Direct slice actions for backward compatibility
        setHeaderVisible,
        setFooterVisible: footerActions.setFooterVisible,
        setMenuCollapsed: menuActions.setMenuCollapsed,
        setSidebarCollapsed: sidebarActions.setSidebarCollapsed
      }
    },
    onInit(app) {
      const dispatch = app.store.dispatch;
      subscriptions.push(eventBus22.on("layout/popup/requested", (payload) => {
        dispatch(popupActions.openPopup({
          id: payload.id,
          title: payload.title ?? "",
          component: ""
          // Payload doesn't include component - this needs review
        }));
      }));
      subscriptions.push(eventBus22.on("layout/popup/hidden", () => {
        dispatch(popupActions.closeAllPopups());
      }));
      subscriptions.push(eventBus22.on("layout/overlay/requested", (_payload) => {
        dispatch(overlayActions.showOverlay());
      }));
      subscriptions.push(eventBus22.on("layout/overlay/hidden", () => {
        dispatch(overlayActions.hideOverlay());
      }));
      subscriptions.push(eventBus22.on("layout/menu/collapsed", (payload) => {
        dispatch(menuActions.setMenuCollapsed(payload.collapsed));
      }));
      subscriptions.push(eventBus22.on("layout/sidebar/collapsed", (payload) => {
        dispatch(sidebarActions.setSidebarCollapsed(payload.collapsed));
      }));
    },
    onDestroy() {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      subscriptions = [];
    }
  };
}
function setLanguage(payload) {
  eventBus32.emit("i18n/language/changed", payload);
}
function i18n() {
  const i18nRegistry2 = singletonI18nRegistry;
  let languageChangedSubscription;
  return {
    name: "i18n",
    dependencies: [],
    provides: {
      registries: {
        i18nRegistry: i18nRegistry2
      },
      actions: {
        setLanguage
      }
    },
    // @cpt-begin:cpt-frontx-flow-framework-composition-i18n-propagation:p1:inst-2
    // @cpt-begin:cpt-frontx-dod-framework-composition-propagation:p1:inst-2
    onInit() {
      languageChangedSubscription = eventBus32.on(
        "i18n/language/changed",
        async (payload) => {
          await i18nRegistry2.setLanguage(payload.language);
        }
      );
      i18nRegistry2.setLanguage(Language.English).catch((err) => {
        console.warn("[Gears FrontX] Failed to load initial translations:", err);
      });
    },
    onDestroy() {
      languageChangedSubscription?.unsubscribe();
      languageChangedSubscription = void 0;
    }
    // @cpt-end:cpt-frontx-flow-framework-composition-i18n-propagation:p1:inst-2
    // @cpt-end:cpt-frontx-dod-framework-composition-propagation:p1:inst-2
  };
}
function effects() {
  return {
    name: "effects",
    dependencies: [],
    onInit() {
    }
  };
}
function isDevEnvironment() {
  if (typeof window === "undefined") return false;
  const { hostname } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local");
}
function mock(config) {
  let cleanup = null;
  return {
    name: "mock",
    dependencies: ["effects"],
    provides: {
      slices: [mockSlice],
      actions: {
        toggleMockMode
      }
    },
    onInit() {
      cleanup = initMockEffects();
      const isDev = isDevEnvironment();
      const enabledByDefault = config?.enabledByDefault ?? isDev;
      if (enabledByDefault) {
        toggleMockMode(true);
      }
    },
    onDestroy() {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    }
  };
}
var mfeRegistryFactory = createMfeRegistryFactory();
var FRONTX_MFE_ENTRY_MF = "gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~";
var FRONTX_SCREEN_EXTENSION_TYPE = "gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~";
var FRONTX_SHARED_PROPERTY_THEME = "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~";
var FRONTX_SHARED_PROPERTY_LANGUAGE = "gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~";
var SLICE_KEY9 = "mfe";
var initialState9 = {
  registrationStates: {},
  errors: {}
};
var { slice: slice9, ...actions } = createSlice9({
  name: SLICE_KEY9,
  initialState: initialState9,
  reducers: {
    // Registration state reducers
    setExtensionRegistering: (state, action) => {
      state.registrationStates[action.payload.extensionId] = "registering";
    },
    setExtensionRegistered: (state, action) => {
      state.registrationStates[action.payload.extensionId] = "registered";
    },
    setExtensionUnregistered: (state, action) => {
      state.registrationStates[action.payload.extensionId] = "unregistered";
    },
    setExtensionError: (state, action) => {
      state.registrationStates[action.payload.extensionId] = "error";
      state.errors[action.payload.extensionId] = action.payload.error;
    }
  }
});
var mfeSlice = slice9;
var {
  setExtensionRegistering,
  setExtensionRegistered,
  setExtensionUnregistered,
  setExtensionError
} = actions;
function selectExtensionState(state, extensionId) {
  return state.mfe?.registrationStates[extensionId] ?? "unregistered";
}
function selectRegisteredExtensions(state) {
  const mfe = state.mfe;
  if (!mfe) return [];
  return Object.entries(mfe.registrationStates).filter(([_, regState]) => regState === "registered").map(([extensionId]) => extensionId);
}
function selectExtensionError(state, extensionId) {
  return state.mfe?.errors[extensionId];
}
var slice_default = slice9.reducer;
var FRONTX_POPUP_DOMAIN = "gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1";
var FRONTX_SIDEBAR_DOMAIN = "gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1";
var FRONTX_SCREEN_DOMAIN = "gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1";
var FRONTX_OVERLAY_DOMAIN = "gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.overlay.v1";
var MfeEvents = {
  RegisterExtensionRequested: "mfe/registerExtensionRequested",
  UnregisterExtensionRequested: "mfe/unregisterExtensionRequested"
};
function initMfeEffects(getRegistry) {
  const store = getStore22();
  const unsubscribers = [];
  const unsubRegisterExtension = eventBus42.on(MfeEvents.RegisterExtensionRequested, async (payload) => {
    const { extension } = payload;
    try {
      store.dispatch(setExtensionRegistering({ extensionId: extension.id }));
      await getRegistry().registerExtension(extension);
      store.dispatch(setExtensionRegistered({ extensionId: extension.id }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown registration error";
      store.dispatch(setExtensionError({ extensionId: extension.id, error: errorMessage }));
    }
  });
  unsubscribers.push(unsubRegisterExtension);
  const unsubUnregisterExtension = eventBus42.on(MfeEvents.UnregisterExtensionRequested, async (payload) => {
    const { extensionId } = payload;
    try {
      await getRegistry().unregisterExtension(extensionId);
      store.dispatch(setExtensionUnregistered({ extensionId }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown unregistration error";
      store.dispatch(setExtensionError({ extensionId, error: errorMessage }));
    }
  });
  unsubscribers.push(unsubUnregisterExtension);
  return () => {
    unsubscribers.forEach((unsub) => unsub.unsubscribe());
  };
}
var mfeRegistry = null;
var registryInitializer = null;
function setMfeRegistry(registry) {
  mfeRegistry = registry;
}
function bindMfeRegistryInitializer(initializer) {
  registryInitializer = initializer;
}
function requireRegistry() {
  if (mfeRegistry) return mfeRegistry;
  if (registryInitializer) return registryInitializer();
  throw new Error("MFE registry not initialized. The microfrontends plugin must be built before using lifecycle actions.");
}
function resolveDomainId(registry, extensionId) {
  const extension = registry.getExtension(extensionId);
  if (!extension) {
    throw new Error(`Extension '${extensionId}' is not registered. Register it before calling lifecycle actions.`);
  }
  return extension.domain;
}
function loadExtension(extensionId) {
  const registry = requireRegistry();
  const domainId = resolveDomainId(registry, extensionId);
  registry.executeActionsChain({
    action: {
      type: FRONTX_ACTION_LOAD_EXT,
      target: domainId,
      payload: { subject: extensionId }
    }
  });
}
function mountExtension(extensionId) {
  const registry = requireRegistry();
  const domainId = resolveDomainId(registry, extensionId);
  registry.executeActionsChain({
    action: {
      type: FRONTX_ACTION_MOUNT_EXT,
      target: domainId,
      payload: { subject: extensionId }
    }
  });
}
function unmountExtension(extensionId) {
  const registry = requireRegistry();
  const domainId = resolveDomainId(registry, extensionId);
  const domain = registry.getDomain(domainId);
  if (domain === void 0) {
    throw new Error(
      `MFE unmount failed: domain '${domainId}' is not registered (extension '${extensionId}'). Register the domain before unmounting.`
    );
  }
  const supportsUnmount = domain.actions.includes(FRONTX_ACTION_UNMOUNT_EXT);
  if (!supportsUnmount) {
    console.warn(
      `[MFE] Skipping unmount for ${extensionId}: domain '${domainId}' uses the Exclusive strategy and does not support ${FRONTX_ACTION_UNMOUNT_EXT}.`
    );
    return;
  }
  registry.executeActionsChain({
    action: {
      type: FRONTX_ACTION_UNMOUNT_EXT,
      target: domainId,
      payload: { subject: extensionId }
    }
  });
}
function registerExtension(extension) {
  eventBus52.emit(MfeEvents.RegisterExtensionRequested, { extension });
}
function unregisterExtension(extensionId) {
  eventBus52.emit(MfeEvents.UnregisterExtensionRequested, { extensionId });
}
var INIT_ONLY_LIFECYCLE_STAGES = [
  "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1"
];
var DEFAULT_LIFECYCLE_STAGES = [
  "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1",
  "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1",
  "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1",
  "gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1"
];
var screenDomain = {
  id: FRONTX_SCREEN_DOMAIN,
  route: "screen",
  actions: [FRONTX_ACTION_LOAD_EXT2, FRONTX_ACTION_MOUNT_EXT2],
  extensionsActions: [],
  sharedProperties: [
    FRONTX_SHARED_PROPERTY_THEME,
    FRONTX_SHARED_PROPERTY_LANGUAGE
  ],
  defaultActionTimeout: 3e4,
  lifecycleStages: [...INIT_ONLY_LIFECYCLE_STAGES],
  extensionsLifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  extensionsTypeId: FRONTX_SCREEN_EXTENSION_TYPE,
  lifecycle: void 0
};
var sidebarDomain = {
  id: FRONTX_SIDEBAR_DOMAIN,
  route: "sidebar",
  actions: [FRONTX_ACTION_LOAD_EXT2, FRONTX_ACTION_MOUNT_EXT2, FRONTX_ACTION_UNMOUNT_EXT2],
  extensionsActions: [],
  sharedProperties: [
    FRONTX_SHARED_PROPERTY_THEME,
    FRONTX_SHARED_PROPERTY_LANGUAGE
  ],
  defaultActionTimeout: 3e4,
  lifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  extensionsLifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  lifecycle: void 0
};
var popupDomain = {
  id: FRONTX_POPUP_DOMAIN,
  route: "popup",
  actions: [FRONTX_ACTION_LOAD_EXT2, FRONTX_ACTION_MOUNT_EXT2, FRONTX_ACTION_UNMOUNT_EXT2],
  extensionsActions: [],
  sharedProperties: [
    FRONTX_SHARED_PROPERTY_THEME,
    FRONTX_SHARED_PROPERTY_LANGUAGE
  ],
  defaultActionTimeout: 3e4,
  lifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  extensionsLifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  lifecycle: void 0
};
var overlayDomain = {
  id: FRONTX_OVERLAY_DOMAIN,
  route: "overlay",
  actions: [FRONTX_ACTION_LOAD_EXT2, FRONTX_ACTION_MOUNT_EXT2, FRONTX_ACTION_UNMOUNT_EXT2],
  extensionsActions: [],
  sharedProperties: [
    FRONTX_SHARED_PROPERTY_THEME,
    FRONTX_SHARED_PROPERTY_LANGUAGE
  ],
  defaultActionTimeout: 3e4,
  lifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  extensionsLifecycleStages: [...DEFAULT_LIFECYCLE_STAGES],
  lifecycle: void 0
};
function microfrontends(config) {
  let registry;
  let builtApp;
  const subscriptions = [];
  const applyCurrentState = (built, app) => {
    try {
      const theme = app.themeRegistry?.getCurrent();
      if (theme) {
        built.setTheme(theme.variables);
        built.updateSharedProperty(FRONTX_SHARED_PROPERTY_THEME, theme.id);
      }
      const language = app.i18nRegistry?.getLanguage();
      if (language) {
        built.updateSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, language);
      }
    } catch (error) {
      console.error("[Gears FrontX] Failed to apply current theme/language to the MFE registry", error);
    }
  };
  const initializeRegistry = () => {
    if (!registry) {
      const built = mfeRegistryFactory.build({ typeSystem: config.typeSystem, mfeHandlers: config.mfeHandlers, router });
      setMfeRegistry(built);
      registry = built;
      if (builtApp) {
        applyCurrentState(built, builtApp);
      }
    }
    return registry;
  };
  let effectsCleanup = null;
  return {
    name: "microfrontends",
    dependencies: [],
    provides: {
      registries: {
        // The MFE-enabled MfeRegistry (registerDomain(), registerExtension(), …)
        // as a getter: the first read builds it. Aggregation and app
        // construction copy it by property descriptor so it stays lazy.
        get mfeRegistry() {
          return initializeRegistry();
        }
      },
      slices: [mfeSlice],
      // NOTE: Effects are NOT initialized via provides.effects.
      // They are initialized in onInit to capture cleanup references.
      // The framework calls provides.effects at build step 5, then onInit at step 7.
      // We only initialize effects in onInit to avoid duplicate event listeners.
      actions: {
        loadExtension,
        mountExtension,
        unmountExtension,
        registerExtension,
        unregisterExtension
      }
    },
    onInit(app) {
      builtApp = app;
      bindMfeRegistryInitializer(initializeRegistry);
      effectsCleanup = initMfeEffects(initializeRegistry);
      subscriptions.push(
        eventBus6.on("theme/changed", (payload) => {
          if (!registry) return;
          try {
            const themeConfig = app.themeRegistry?.get(payload.themeId);
            if (themeConfig) {
              registry.setTheme(themeConfig.variables);
            }
            registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_THEME, payload.themeId);
          } catch (error) {
            console.error("[Gears FrontX] Failed to propagate theme to MFE domains", error);
            eventBus6.emit("theme/propagation/failed", { themeId: payload.themeId, error });
          }
        }),
        eventBus6.on("i18n/language/changed", (payload) => {
          if (!registry) return;
          try {
            registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, payload.language);
          } catch (error) {
            console.error("[Gears FrontX] Failed to propagate language to MFE domains", error);
            eventBus6.emit("i18n/propagation/failed", { language: payload.language, error });
          }
        })
      );
    },
    onDestroy() {
      if (effectsCleanup) {
        effectsCleanup();
        effectsCleanup = null;
      }
      subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    }
  };
}
function full(config) {
  const plugins = [
    effects(),
    themes(),
    layout(),
    i18n(),
    queryCache(),
    mock()
  ];
  if (config?.microfrontends) {
    plugins.push(microfrontends(config.microfrontends));
  }
  if (config?.auth) {
    plugins.push(auth(config.auth));
  }
  return plugins;
}
function minimal() {
  return [
    themes()
  ];
}
var presets = {
  full,
  minimal
};
function changeTenant(tenant) {
  eventBus7.emit(TenantEvents.Changed, { tenant });
}
function clearTenantAction() {
  eventBus7.emit(TenantEvents.Cleared, {});
}
function setTenantLoadingState(loading) {
  getStore32().dispatch(setTenantLoading(loading));
}
var ACCOUNTS_DOMAIN = "accounts";
var STATE_PATH_MAPPING = {
  // App state (moved to app slice)
  "uicore.app.user": "app.user",
  "uicore.app.tenant": "app.tenant",
  "uicore.app.language": "app.language",
  "uicore.app.translationsReady": "app.translationsReady",
  "uicore.app.loading": "app.loading",
  "uicore.app.error": "app.error",
  "uicore.app.useMockApi": "app.useMockApi",
  // Layout state (split into domains)
  "uicore.layout.theme": "app.theme",
  // Domain states (moved to layout.*)
  "uicore.header": "layout.header",
  "uicore.footer": "layout.footer",
  "uicore.menu": "layout.menu",
  "uicore.sidebar": "layout.sidebar",
  "uicore.popup": "layout.popup",
  "uicore.overlay": "layout.overlay"
};
var deprecationWarningsEnabled = true;
function setDeprecationWarnings(enabled) {
  deprecationWarningsEnabled = enabled;
}
function isDeprecationWarningsEnabled() {
  return deprecationWarningsEnabled;
}
function createLegacySelector(legacyPath, newSelector, migrationHint) {
  let hasWarned = false;
  return (state) => {
    if (deprecationWarningsEnabled && !hasWarned && false) {
      hasWarned = true;
      const newPath = STATE_PATH_MAPPING[legacyPath] ?? "unknown";
      const hint = migrationHint ?? `Use the new state path: ${newPath}`;
      console.warn(
        `[Gears FrontX Migration] Deprecated selector accessing "${legacyPath}". ${hint}`
      );
    }
    return newSelector(state);
  };
}
function getLayoutDomainState(state, domain) {
  return state.layout[domain];
}
function hasLegacyUicoreState(state) {
  return typeof state === "object" && state !== null && "uicore" in state && typeof state.uicore === "object";
}
function hasNewLayoutState(state) {
  return typeof state === "object" && state !== null && "layout" in state && typeof state.layout === "object";
}
export {
  ACCOUNTS_DOMAIN,
  ActionHandler2 as ActionHandler,
  ApiPlugin,
  ApiPluginBase,
  ApiProtocol,
  AuthEvents,
  BaseApiService,
  ChildMfeBridge,
  ConcurrentMountStrategy,
  ExclusiveMountStrategy,
  ExtensionDomainImplementation2 as ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory2 as ExtensionDomainImplementationFactory,
  ExtensionMounter,
  FRONTX_ACTION_LOAD_EXT3 as FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT3 as FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT3 as FRONTX_ACTION_UNMOUNT_EXT,
  FRONTX_MFE_ENTRY_MF,
  FRONTX_OVERLAY_DOMAIN,
  FRONTX_POPUP_DOMAIN,
  FRONTX_SCREEN_DOMAIN,
  FRONTX_SCREEN_EXTENSION_TYPE,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SIDEBAR_DOMAIN,
  I18nRegistryImpl2 as I18nRegistry,
  I18nRegistryImpl,
  LAYOUT_SLICE_NAME,
  Language2 as Language,
  LanguageDisplayMode,
  MOCK_PLUGIN,
  MfeBridgeFactory,
  MfeHandler,
  MfeHandlerMF,
  MfeRegistry,
  MfeRegistryFactory,
  MockEvents,
  MountStrategy,
  OptionalMountStrategy,
  ParentMfeBridge,
  RestEndpointProtocol,
  RestPlugin2 as RestPlugin,
  RestPluginWithConfig,
  RestProtocol2 as RestProtocol,
  STATE_PATH_MAPPING,
  SUPPORTED_LANGUAGES,
  SsePlugin,
  SsePluginWithConfig,
  SseProtocol,
  SseStreamProtocol,
  TENANT_SLICE_NAME,
  TenantEvents,
  TestContainerProvider,
  TextDirection,
  apiRegistry22 as apiRegistry,
  auth,
  changeTenant,
  clearTenant,
  clearTenantAction,
  clearUser,
  closeAllPopups,
  closePopup,
  closeTopPopup,
  compareStrings,
  createCollator,
  createFrontX,
  createI18nRegistry,
  createLegacySelector,
  createShadowRoot,
  createSlice22 as createSlice,
  createStore,
  createThemeRegistry,
  effects,
  eventBus8 as eventBus,
  extractGtsPackage,
  footerActions,
  footerSlice,
  formatCompact,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelative,
  formatTime,
  frontxApiTransport,
  full,
  getLanguageMetadata,
  getLayoutDomainState,
  getStore42 as getStore,
  gtsPlugin,
  hasLegacyUicoreState,
  hasNewLayoutState,
  hasSlice,
  headerActions,
  headerSlice,
  hideOverlay,
  i18n,
  i18nRegistry,
  initMockEffects,
  initTenantEffects,
  injectCssVariables,
  isDeprecationWarningsEnabled,
  isMockPlugin2 as isMockPlugin,
  isRestShortCircuit,
  isShortCircuit,
  isSseShortCircuit,
  layout,
  layoutDomainReducers,
  layoutReducer,
  loadExtension,
  menuActions,
  menuSlice,
  mfeRegistryFactory,
  microfrontends,
  minimal,
  mock,
  mockActions,
  mockSlice,
  mountExtension,
  openPopup,
  overlayActions,
  overlayDomain,
  overlaySlice,
  popupActions,
  popupDomain,
  popupSlice,
  presets,
  queryCache,
  queryCacheShared,
  readQueryCacheScopeGeneration,
  recordQueryCacheScopeWriteDropped,
  registerExtension,
  registerSlice2 as registerSlice,
  resetSharedFetchCache,
  resetSharedQueryClient,
  screenDomain,
  selectExtensionError,
  selectExtensionState,
  selectRegisteredExtensions,
  setDeprecationWarnings,
  setFooterConfig,
  setFooterVisible,
  setLoading as setHeaderLoading,
  setMenuCollapsed,
  setMenuConfig,
  setMenuItems,
  setMenuVisible,
  setMockEnabled,
  setOverlayVisible,
  setSidebarCollapsed,
  setSidebarConfig,
  setSidebarContent,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarVisible,
  setSidebarWidth,
  setTenant,
  setTenantLoading,
  setTenantLoadingState,
  setUser,
  showOverlay,
  sidebarActions,
  sidebarDomain,
  sidebarSlice,
  subscribeQueryCacheRuntimeChanged,
  tenantActions,
  tenantSlice_default as tenantReducer,
  tenantSlice,
  themes,
  toggleMenu,
  toggleMockMode,
  toggleSidebar,
  unmountExtension,
  unregisterExtension
};
