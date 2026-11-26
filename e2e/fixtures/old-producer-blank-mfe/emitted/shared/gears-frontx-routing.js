// node_modules/@gears-frontx/routing/dist/index.js
var REENTRANT_ROUND_LIMIT = 100;
function reportRoutingDefect(message, cause) {
  const prefixed = `[@gears-frontx/routing] ${message}`;
  if (cause === void 0) {
    console.error(prefixed);
  } else {
    console.error(prefixed, cause);
  }
}
var RoutingError = class _RoutingError extends Error {
  code;
  /** Set only for `invalid-shell-subroute` / `invalid-foreign-segment` /
   * `invalid-domain-key` / `invalid-extension-token`, and
   * for `replaced-old-extension-absent`, where it is the old extension
   * token no entry under `domainKey` carries. */
  value;
  /** Set for `invalid-param-name` / `duplicate-param-name`, and for
   * `invalid-domain-key` / `invalid-extension-token` only when thrown by
   * grammar serialize (FEATURE §3, Grammar Serialize, step 2.1), naming the
   * offending entry. */
  entry;
  /** Set only for `duplicate-extension`. */
  entries;
  /** Set for `reordered-not-permutation` and
   * `replaced-old-extension-absent`. */
  domainKey;
  /** Set only for `reordered-not-permutation`. */
  reordered;
  /** Set only for `reentrant-round-limit-exceeded` — the bound that was
   * reached, so a consumer reading this error need not know the constant to
   * report it. */
  limit;
  constructor(code, message, extra) {
    super(message);
    this.name = "RoutingError";
    this.code = code;
    this.value = extra?.value;
    this.entry = extra?.entry;
    this.entries = extra?.entries;
    this.domainKey = extra?.domainKey;
    this.reordered = extra?.reordered;
    this.limit = extra?.limit;
  }
  /**
   * A `shellSubroute` argument given to grammar serialize contains `?`, `#`,
   * or `&` — a grammar delimiter that would otherwise reparse into a
   * different, corrupted structure the instant the written URL is read back
   * (FEATURE §3, Grammar Serialize, step 0).
   */
  static invalidShellSubroute(value) {
    return new _RoutingError(
      "invalid-shell-subroute",
      `Invalid shell subroute (contains "?", "#", or "&"): "${value}"`,
      { value }
    );
  }
  /**
   * A `foreignSegments` entry given to grammar serialize contains `&` or
   * `#` — the same reparse hazard `invalidShellSubroute` guards against, for
   * the other input a caller building a `SerializeInput` by hand controls
   * directly: an embedded `&` splits it into an entry-or-foreign-segment
   * position it never had, and an embedded `#` moves everything after it
   * out of the query string and into the fragment (FEATURE §3, Grammar
   * Serialize, step 1).
   */
  static invalidForeignSegment(value) {
    return new _RoutingError(
      "invalid-foreign-segment",
      `Invalid foreign segment (contains "&" or "#"): "${value}"`,
      { value }
    );
  }
  /**
   * A `domainKey` argument failed the `domain-key` production (ADR 0003,
   * "Tokens"). `entry` is set only when this is thrown by grammar serialize,
   * which names the offending entry, not merely its `domainKey` value
   * (FEATURE §3, Grammar Serialize, step 2.1).
   */
  static invalidDomainKey(value, entry) {
    return new _RoutingError("invalid-domain-key", `Invalid domain key: "${value}"`, {
      value,
      entry
    });
  }
  /**
   * An `extension` argument failed the `name` alphabet. `entry` is set only
   * when this is thrown by grammar serialize (FEATURE §3, Grammar
   * Serialize, step 2.1; see `invalidDomainKey`).
   */
  static invalidExtensionToken(value, entry) {
    return new _RoutingError(
      "invalid-extension-token",
      `Invalid extension token: "${value}"`,
      { value, entry }
    );
  }
  /**
   * A serialize-input entry carried a param whose own `name` is the empty
   * string. `param-name = 1*( pchar-safe | pct-encoded )` (ADR 0003,
   * "Tokens") requires at least one character — unlike `param-value`, which
   * the identical production allows empty — so this is not this package's
   * own added restriction, only the grammar's own rule enforced at write
   * time, the third case of the same reparse-hazard family
   * `invalidShellSubroute` and `invalidForeignSegment` guard against: an
   * unvalidated empty name would serialize to a bare `;=value` segment that
   * reparses as a malformed entry, dropped whole, the instant the written
   * URL is read back (FEATURE §3, Grammar Serialize, step 2.2).
   */
  static invalidParamName(entry) {
    return new _RoutingError(
      "invalid-param-name",
      `Entry "${entry.domainKey}=${entry.extension}" carries a param with an empty name`,
      { entry }
    );
  }
  /** A serialize-input entry carried two params of the identical `name`. */
  static duplicateParamName(entry) {
    return new _RoutingError(
      "duplicate-param-name",
      `Entry "${entry.domainKey}=${entry.extension}" carries a duplicate param name`,
      { entry }
    );
  }
  /**
   * A serialize-input list carried two entries sharing the identical
   * `domainKey` and `extension` — reached either by a caller building that
   * list directly, or by the URL back-projection helper, whose delta named
   * a token the current location already carries under that domain key.
   */
  static duplicateExtension(entries) {
    return new _RoutingError(
      "duplicate-extension",
      `Duplicate entry "${entries[0].domainKey}=${entries[0].extension}"`,
      { entries }
    );
  }
  /**
   * A back-projection call's own `reordered` list is not exactly a
   * permutation of `domainKey`'s own entries surviving the delta's other
   * operations — missing a survivor, naming an extra token, or naming one
   * twice.
   */
  static reorderedNotPermutation(domainKey, reordered) {
    return new _RoutingError(
      "reordered-not-permutation",
      `"${domainKey}" back-projection reordered list is not a permutation of its surviving entries: [${reordered.join(", ")}]`,
      { domainKey, reordered }
    );
  }
  /**
   * A back-projection call's own `replaced` pair named an `oldExtension`
   * that no entry under `domainKey` currently carries. `replaced` exists to
   * stand a new entry at an old entry's *own position*; with no such entry
   * there is no such position, so the operation the pair asks for cannot be
   * performed at all. Appending the new entry instead would silently turn
   * the pair into an `added` and put it at the end of the full list — the
   * entry order `replaced` was introduced to stop producing.
   *
   * `domainKey` and `value` together say exactly what is missing: there is
   * no entry `value` under `domainKey`. That is what a consumer acts on —
   * re-read the live entry list, recompute the delta against it, and call
   * again naming the operation that list actually admits (an `added` for a
   * position that does not yet exist).
   */
  static replacedOldExtensionAbsent(domainKey, oldExtension) {
    return new _RoutingError(
      "replaced-old-extension-absent",
      `"${domainKey}" back-projection replaced pair names old extension "${oldExtension}", which no entry under that domain key currently carries \u2014 there is no position to stand the new entry at`,
      { domainKey, value: oldExtension }
    );
  }
  /**
   * `resolveNavigationHistory` was called with no adapter override in a
   * realm carrying no `window` at all (an SSR render, most commonly) — the
   * default `HistoryAdapter` has no browser API to construct itself over.
   * Thrown instead of letting a raw `ReferenceError: window is not defined`
   * surface from deep inside that construction, so an SSR caller gets a
   * recognizable, `instanceof RoutingError` failure naming the actual cause
   * instead of an unrelated-looking crash.
   */
  static noNavigationHistoryInRealm() {
    return new _RoutingError(
      "no-navigation-history-in-realm",
      "resolveNavigationHistory() was called with no adapter override in a realm with no `window` \u2014 pass an explicit HistoryAdapter (an SSR-safe one, or a test double) instead of relying on the default browser adapter."
    );
  }
  /**
   * A re-entrancy drain ran `limit` consecutive rounds without the queue
   * ever emptying — a callback that navigates every single time it is
   * notified, feeding the drain a fresh round for each one it completes.
   *
   * Thrown rather than reported and swallowed, because the alternative is
   * the behaviour this bound exists to end: the drain is a loop, not a
   * recursion, so an unbounded one produces no stack overflow and no error
   * of any kind — the realm simply stops making progress, indefinitely,
   * with nothing to see. `site` names which drain reached the bound so the
   * consumer knows which of its own callbacks to look at.
   */
  static reentrantRoundLimitExceeded(site, limit) {
    return new _RoutingError(
      "reentrant-round-limit-exceeded",
      `${site}: ${String(limit)} consecutive deferred rounds ran without the queue emptying \u2014 a callback is triggering a new round every time it is notified. The queue was abandoned to end the loop.`,
      { limit }
    );
  }
};
var NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
var validateName = (candidate) => NAME_PATTERN.test(candidate);
var deriveExtensionToken = (route) => {
  if (route === void 0) {
    return void 0;
  }
  const candidate = route.startsWith("/") ? route.slice(1) : route;
  if (validateName(candidate)) {
    return candidate;
  }
  return void 0;
};
var namesEqual = (a, b) => a === b;
var RAW_CHAR = /^[A-Za-z0-9\-_.~/:@,!'()*?]$/;
var ENCODE_SPECIAL = {
  ";": "%3B",
  "=": "%3D",
  "&": "%26",
  "#": "%23",
  "%": "%25",
  "+": "%2B",
  " ": "%20"
};
var HEX_PAIR = /^[0-9a-fA-F]{2}$/;
var UTF8_ENCODER = new TextEncoder();
var UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
function encodePercent(value) {
  let out = "";
  for (const char of value) {
    const special = ENCODE_SPECIAL[char];
    if (special !== void 0) {
      out += special;
      continue;
    }
    if (char.length === 1 && RAW_CHAR.test(char)) {
      out += char;
      continue;
    }
    for (const byte of UTF8_ENCODER.encode(char)) {
      out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}
function decodePercent(raw) {
  let out = "";
  let bytes = [];
  const flushBytes = () => {
    if (bytes.length === 0) {
      return true;
    }
    try {
      out += UTF8_DECODER.decode(Uint8Array.from(bytes));
      return true;
    } catch {
      return false;
    } finally {
      bytes = [];
    }
  };
  let i = 0;
  while (i < raw.length) {
    const char = raw[i];
    if (char === "%") {
      const hex = raw.slice(i + 1, i + 3);
      if (!HEX_PAIR.test(hex)) {
        return null;
      }
      bytes.push(parseInt(hex, 16));
      i += 3;
      continue;
    }
    if (!flushBytes()) {
      return null;
    }
    out += char;
    i += 1;
  }
  if (!flushBytes()) {
    return null;
  }
  return out;
}
var parseGrammar = (input) => {
  let shellSubroute;
  let search;
  let hash;
  if (typeof input === "string") {
    const hashIndex = input.indexOf("#");
    const beforeHash = hashIndex === -1 ? input : input.slice(0, hashIndex);
    hash = hashIndex === -1 ? void 0 : input.slice(hashIndex + 1);
    const queryIndex = beforeHash.indexOf("?");
    if (queryIndex === -1) {
      shellSubroute = beforeHash;
      search = "";
    } else {
      shellSubroute = beforeHash.slice(0, queryIndex);
      search = beforeHash.slice(queryIndex + 1);
    }
  } else {
    shellSubroute = input.shellSubroute;
    search = input.search;
    hash = input.hash;
    if (search.startsWith("?")) {
      reportRoutingDefect(
        'a query string was given to the grammar parser with its leading "?" still attached; a HistoryAdapter reports `search` without it (the shape `window.location.search` carries, minus the delimiter). Parsing continued on the stripped value.'
      );
      search = search.slice(1);
    }
    if (hash?.startsWith("#") === true) {
      reportRoutingDefect(
        'a fragment was given to the grammar parser with its leading "#" still attached; a HistoryAdapter reports `hash` without it. Parsing continued on the stripped value.'
      );
      hash = hash.slice(1);
    }
  }
  if (hash === "") {
    hash = void 0;
  }
  if (search === "") {
    return { shellSubroute, hash, entries: [], foreignSegments: [], warnings: [] };
  }
  const entries = [];
  const foreignSegments = [];
  const warnings = [];
  const rawEntries = search.split("&");
  for (const rawEntry of rawEntries) {
    if (rawEntry === "") {
      continue;
    }
    const [head, ...paramSegments] = rawEntry.split(";");
    const headEquals = head.indexOf("=");
    const candidateDomainKey = headEquals === -1 ? "" : head.slice(0, headEquals);
    const candidateExtension = headEquals === -1 ? "" : head.slice(headEquals + 1);
    if (headEquals === -1 || !validateName(candidateDomainKey)) {
      foreignSegments.push(rawEntry);
      continue;
    }
    if (!validateName(candidateExtension)) {
      const isEntryCandidate = paramSegments.length > 0;
      if (isEntryCandidate) {
        warnings.push({ code: "malformed-entry", rawEntry });
      }
      foreignSegments.push(rawEntry);
      continue;
    }
    const domainKey = candidateDomainKey;
    const extension = candidateExtension;
    if (entries.some((entry) => entry.domainKey === domainKey && entry.extension === extension)) {
      warnings.push({ code: "duplicate-extension", rawEntry });
      continue;
    }
    const params = [];
    let entryAbandoned = false;
    const warningsBeforeThisEntry = warnings.length;
    for (const segment of paramSegments) {
      const segmentEquals = segment.indexOf("=");
      const rawName = segmentEquals === -1 ? segment : segment.slice(0, segmentEquals);
      const rawValue = segmentEquals === -1 ? "" : segment.slice(segmentEquals + 1);
      const decodedName = decodePercent(rawName);
      const decodedValue = decodePercent(rawValue);
      const escapeBroken = decodedName === null || decodedValue === null;
      const nameEmpty = decodedName === "";
      if (escapeBroken || nameEmpty) {
        entryAbandoned = true;
        break;
      }
      const existingIndex = params.findIndex((param) => param.name === decodedName);
      if (existingIndex !== -1) {
        params[existingIndex] = { name: decodedName, value: decodedValue };
        warnings.push({ code: "duplicate-parameter", rawEntry });
      } else {
        params.push({ name: decodedName, value: decodedValue });
      }
    }
    if (entryAbandoned) {
      warnings.length = warningsBeforeThisEntry;
      warnings.push({ code: "malformed-entry", rawEntry });
      foreignSegments.push(rawEntry);
      continue;
    }
    entries.push({ domainKey, extension, params });
  }
  return { shellSubroute, hash, entries, foreignSegments, warnings };
};
var serializeGrammar = (input) => {
  const { shellSubroute, hash, entries } = input;
  const foreignSegments = input.foreignSegments ?? [];
  if (/[?#&]/.test(shellSubroute)) {
    throw RoutingError.invalidShellSubroute(shellSubroute);
  }
  for (const segment of foreignSegments) {
    if (/[&#]/.test(segment)) {
      throw RoutingError.invalidForeignSegment(segment);
    }
  }
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!validateName(entry.domainKey)) {
      throw RoutingError.invalidDomainKey(entry.domainKey, entry);
    }
    if (!validateName(entry.extension)) {
      throw RoutingError.invalidExtensionToken(entry.extension, entry);
    }
    for (const param of entry.params) {
      if (param.name === "") {
        throw RoutingError.invalidParamName(entry);
      }
    }
    const seenParamNames = /* @__PURE__ */ new Set();
    for (const param of entry.params) {
      if (seenParamNames.has(param.name)) {
        throw RoutingError.duplicateParamName(entry);
      }
      seenParamNames.add(param.name);
    }
    for (let j = 0; j < i; j += 1) {
      const earlier = entries[j];
      if (earlier.domainKey === entry.domainKey && earlier.extension === entry.extension) {
        throw RoutingError.duplicateExtension([earlier, entry]);
      }
    }
  }
  const entryTexts = entries.map((entry) => {
    let text = `${entry.domainKey}=${entry.extension}`;
    for (const param of entry.params) {
      text += `;${encodePercent(param.name)}`;
      if (param.value !== "") {
        text += `=${encodePercent(param.value)}`;
      }
    }
    return text;
  });
  const joinedEntries = entryTexts.join("&");
  const joined = [joinedEntries, ...foreignSegments].filter((part) => part !== "").join("&");
  if (entries.length === 0 && foreignSegments.length === 0) {
    return hash !== void 0 && hash !== "" ? `${shellSubroute}#${hash}` : shellSubroute;
  }
  return hash !== void 0 && hash !== "" ? `${shellSubroute}?${joined}#${hash}` : `${shellSubroute}?${joined}`;
};
function toOwnOriginLocation(path) {
  return path.startsWith("//") ? `${window.location.origin}${path}` : path;
}
function readWindowLocation() {
  return {
    path: window.location.pathname,
    search: window.location.search.startsWith("?") ? window.location.search.slice(1) : window.location.search,
    hash: window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash
  };
}
function createWindowHistoryAdapter() {
  return {
    getLocation: readWindowLocation,
    pushState(path, state) {
      window.history.pushState(state, "", toOwnOriginLocation(path));
    },
    replaceState(path, state) {
      window.history.replaceState(state, "", toOwnOriginLocation(path));
    },
    getState() {
      return window.history.state;
    },
    go(delta) {
      window.history.go(delta);
    },
    onPop(listener) {
      window.addEventListener("popstate", listener);
      return () => {
        window.removeEventListener("popstate", listener);
      };
    }
  };
}
var FanOutDispatcher = class {
  live = /* @__PURE__ */ new Set();
  dispatching = false;
  pending = [];
  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch:p2:inst-add-subscriber
  subscribe(callback) {
    const token = { callback };
    this.live.add(token);
    return () => {
      this.live.delete(token);
    };
  }
  /**
   * Dispatches one round for `notification`. A round triggered while another
   * is already in progress — a subscriber that navigates from inside its own
   * callback — is deferred to run after the in-progress round finishes,
   * never folded into it (step 4.4, reentrant navigation). Deferral is
   * bounded: a subscriber that queues a fresh round from every round it
   * receives is a feedback loop, not a cascade, and the drain below stops
   * and throws rather than serving it forever (step 4.4.2).
   */
  dispatch(notification) {
    if (this.dispatching) {
      this.pending.push(notification);
      return;
    }
    this.dispatching = true;
    try {
      this.runRound(notification);
      let drained = 0;
      while (this.pending.length > 0) {
        if (drained >= REENTRANT_ROUND_LIMIT) {
          this.pending.length = 0;
          throw RoutingError.reentrantRoundLimitExceeded(
            "navigation fan-out dispatch",
            REENTRANT_ROUND_LIMIT
          );
        }
        drained += 1;
        const next = this.pending.shift();
        if (next !== void 0) {
          this.runRound(next);
        }
      }
    } finally {
      this.dispatching = false;
    }
  }
  // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch:p2:inst-dispatch-round
  runRound(notification) {
    const snapshot = Array.from(this.live);
    for (const token of snapshot) {
      if (!this.live.has(token)) {
        continue;
      }
      try {
        token.callback(notification);
      } catch (error) {
        reportRoutingDefect("a navigation subscriber threw during a fan-out round", error);
      }
    }
  }
  // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch:p2:inst-dispatch-round
};
var POSITION_STATE_KEY = "@gears-frontx/routing";
function isPositionState(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { position } = value;
  return typeof position === "number" && Number.isSafeInteger(position) && position >= 0;
}
function readPosition(rawState) {
  if (typeof rawState !== "object" || rawState === null) {
    return void 0;
  }
  const namespaced = rawState[POSITION_STATE_KEY];
  return isPositionState(namespaced) ? namespaced.position : void 0;
}
function writePosition(rawState, position) {
  const base = typeof rawState === "object" && rawState !== null ? rawState : {};
  return { ...base, [POSITION_STATE_KEY]: { position } };
}
function readInitialPosition(adapter) {
  return readPosition(adapter.getState()) ?? 0;
}
function createNavigationHistory(adapter) {
  const dispatcher = new FanOutDispatcher();
  let position = readInitialPosition(adapter);
  function currentLocation() {
    return { ...adapter.getLocation(), position };
  }
  adapter.onPop(() => {
    position = readPosition(adapter.getState()) ?? 0;
    dispatcher.dispatch({ location: currentLocation(), kind: "history" });
  });
  return {
    // @cpt-begin:cpt-frontx-flow-routing-navigation-substrate-imperative-navigation:p1:inst-branch-immediate
    get location() {
      return currentLocation();
    },
    // @cpt-end:cpt-frontx-flow-routing-navigation-substrate-imperative-navigation:p1:inst-branch-immediate
    // @cpt-begin:cpt-frontx-flow-routing-navigation-substrate-imperative-navigation:p1:inst-branch-subscribe
    // @cpt-begin:cpt-frontx-flow-routing-navigation-substrate-imperative-navigation:p1:inst-subscribe
    subscribe(subscriber) {
      return dispatcher.subscribe(subscriber);
    },
    // @cpt-end:cpt-frontx-flow-routing-navigation-substrate-imperative-navigation:p1:inst-subscribe
    // @cpt-end:cpt-frontx-flow-routing-navigation-substrate-imperative-navigation:p1:inst-branch-subscribe
    // @cpt-begin:cpt-frontx-flow-routing-navigation-substrate-imperative-navigation:p1:inst-immediate-call
    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch:p2:inst-when-own-navigation-call
    // @cpt-begin:cpt-frontx-algo-routing-navigation-substrate-position-tracking:p2:inst-on-own-write
    push(path) {
      const nextPosition = position + 1;
      adapter.pushState(path, writePosition(void 0, nextPosition));
      position = nextPosition;
      dispatcher.dispatch({ location: currentLocation(), kind: "push" });
    },
    replace(path) {
      adapter.replaceState(path, writePosition(adapter.getState(), position));
      dispatcher.dispatch({ location: currentLocation(), kind: "replace" });
    },
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-position-tracking:p2:inst-on-own-write
    // @cpt-end:cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch:p2:inst-when-own-navigation-call
    // `go` is deliberately not dispatched here — it is observed only through
    // the `onPop` registration above, asynchronously, once the adapter's own
    // move actually lands (§1.5, Contract commitment; §3, step 3 rationale).
    // Its own destination position is restored there too, from the
    // browser's own persisted per-entry state, not adjusted by `delta` here.
    go(delta) {
      adapter.go(delta);
    }
    // @cpt-end:cpt-frontx-flow-routing-navigation-substrate-imperative-navigation:p1:inst-immediate-call
  };
}
var NAVIGATION_HISTORY_KEY = /* @__PURE__ */ Symbol.for("@gears-frontx/routing/navigation-history/v1");
function resolveNavigationHistory(createAdapter = createWindowHistoryAdapter) {
  const realm = globalThis;
  const existing = realm[NAVIGATION_HISTORY_KEY];
  if (existing === void 0) {
    if (createAdapter === createWindowHistoryAdapter && typeof window === "undefined") {
      throw RoutingError.noNavigationHistoryInRealm();
    }
    const instance = createNavigationHistory(createAdapter());
    realm[NAVIGATION_HISTORY_KEY] = instance;
    return instance;
  }
  return existing;
}
function validateBackProjectionInput(domainKey, delta) {
  if (!validateName(domainKey)) {
    throw RoutingError.invalidDomainKey(domainKey);
  }
  for (const clearedKey of delta.clearedDomainKeys ?? []) {
    if (!validateName(clearedKey)) {
      throw RoutingError.invalidDomainKey(clearedKey);
    }
  }
  for (const added of delta.added ?? []) {
    if (!validateName(added.extension)) {
      throw RoutingError.invalidExtensionToken(added.extension);
    }
  }
  for (const removed of delta.removed ?? []) {
    if (!validateName(removed)) {
      throw RoutingError.invalidExtensionToken(removed);
    }
  }
  for (const pair of delta.payloadChanged ?? []) {
    if (!validateName(pair.extension)) {
      throw RoutingError.invalidExtensionToken(pair.extension);
    }
  }
  for (const pair of delta.replaced ?? []) {
    if (!validateName(pair.oldExtension)) {
      throw RoutingError.invalidExtensionToken(pair.oldExtension);
    }
    if (!validateName(pair.entry.extension)) {
      throw RoutingError.invalidExtensionToken(pair.entry.extension);
    }
  }
  for (const token of delta.reordered ?? []) {
    if (!validateName(token)) {
      throw RoutingError.invalidExtensionToken(token);
    }
  }
}
function createBackProjectEntries(history) {
  return (domainKey, delta, verb) => {
    validateBackProjectionInput(domainKey, delta);
    runBackProjection(history, domainKey, delta, verb);
  };
}
function runBackProjection(history, domainKey, delta, verb) {
  const location = history.location;
  const parsed = parseGrammar({
    shellSubroute: location.path,
    search: location.search,
    hash: location.hash
  });
  const removedTokens = new Set(delta.removed ?? []);
  const replacedByOldExtension = new Map(
    (delta.replaced ?? []).map((pair) => [pair.oldExtension, pair.entry])
  );
  const payloadByExtension = new Map(
    (delta.payloadChanged ?? []).map((pair) => [pair.extension, pair.params])
  );
  const ownIndices = [];
  parsed.entries.forEach((entry, index) => {
    if (entry.domainKey === domainKey) {
      ownIndices.push(index);
    }
  });
  const ownExtensions = new Set(ownIndices.map((index) => parsed.entries[index].extension));
  for (const oldExtension of replacedByOldExtension.keys()) {
    if (!ownExtensions.has(oldExtension)) {
      throw RoutingError.replacedOldExtensionAbsent(domainKey, oldExtension);
    }
  }
  const transformedByIndex = /* @__PURE__ */ new Map();
  for (const index of ownIndices) {
    const entry = parsed.entries[index];
    const extension = entry.extension;
    const replacement = replacedByOldExtension.get(extension);
    if (replacement !== void 0) {
      transformedByIndex.set(index, {
        domainKey,
        extension: replacement.extension,
        params: replacement.params
      });
      continue;
    }
    if (removedTokens.has(extension)) {
      transformedByIndex.set(index, null);
      continue;
    }
    const changedParams = payloadByExtension.get(extension);
    if (changedParams !== void 0) {
      transformedByIndex.set(index, { domainKey, extension, params: changedParams });
      continue;
    }
    transformedByIndex.set(index, entry);
  }
  if (delta.reordered !== void 0) {
    const survivingIndices = ownIndices.filter((index) => transformedByIndex.get(index) !== null);
    const survivorByCurrentExtension = /* @__PURE__ */ new Map();
    for (const index of survivingIndices) {
      const survivor = transformedByIndex.get(index);
      if (survivor !== void 0 && survivor !== null) {
        survivorByCurrentExtension.set(parsed.entries[index].extension, survivor);
      }
    }
    const reorderedTokenSet = new Set(delta.reordered);
    const isPermutation = delta.reordered.length === survivorByCurrentExtension.size && reorderedTokenSet.size === survivorByCurrentExtension.size && delta.reordered.every((token) => survivorByCurrentExtension.has(token));
    if (!isPermutation) {
      throw RoutingError.reorderedNotPermutation(domainKey, delta.reordered);
    }
    const newOrder = delta.reordered.map((token) => survivorByCurrentExtension.get(token));
    survivingIndices.forEach((index, position) => {
      transformedByIndex.set(index, newOrder[position]);
    });
  }
  const clearedDomainKeys = new Set((delta.clearedDomainKeys ?? []).filter((key) => key !== domainKey));
  const composed = [];
  parsed.entries.forEach((entry, index) => {
    if (transformedByIndex.has(index)) {
      const transformed = transformedByIndex.get(index);
      if (transformed !== null && transformed !== void 0) {
        composed.push(transformed);
      }
      return;
    }
    if (clearedDomainKeys.has(entry.domainKey)) {
      return;
    }
    composed.push(entry);
  });
  for (const added of delta.added ?? []) {
    composed.push({ domainKey, extension: added.extension, params: added.params });
  }
  const serialized = serializeGrammar({
    shellSubroute: parsed.shellSubroute,
    hash: parsed.hash,
    entries: composed,
    // A foreign query segment — an OAuth `code`/`state`, an analytics
    // `utm_*` parameter — is never this helper's own business to touch; it
    // passes straight through, unchanged, from parse to this single write.
    foreignSegments: parsed.foreignSegments
  });
  history[verb](serialized);
  return;
}
var resolveEntries = (domainKey, entries, source) => {
  const filtered = entries.filter((entry) => entry.domainKey === domainKey);
  const registrations = source.getRegistrations();
  const resolved = filtered.map((entry) => {
    const registration = registrations.find(
      (candidate) => namesEqual(candidate.extension, entry.extension)
    );
    if (registration !== void 0) {
      return {
        extension: entry.extension,
        params: entry.params,
        resolution: { resolved: true, routeOwner: registration.routeOwner }
      };
    }
    return {
      extension: entry.extension,
      params: entry.params,
      resolution: { resolved: false }
    };
  });
  return resolved;
};
function validateRegistrations(registrations) {
  for (const registration of registrations) {
    if (!validateName(registration.extension)) {
      throw RoutingError.invalidExtensionToken(registration.extension);
    }
  }
}
function validateDomainKey(domainKey) {
  if (!validateName(domainKey)) {
    throw RoutingError.invalidDomainKey(domainKey);
  }
}
function resolveCurrentEntries(history, domainKey, source) {
  const location = history.location;
  const parsed = parseGrammar({
    shellSubroute: location.path,
    search: location.search,
    hash: location.hash
  });
  const registrations = source.getRegistrations().map((registration) => ({ ...registration }));
  validateRegistrations(registrations);
  return resolveEntries(domainKey, parsed.entries, { getRegistrations: () => registrations });
}
function paramsEqual(a, b) {
  return a.length === b.length && a.every((p, i) => p.name === b[i].name && p.value === b[i].value);
}
function computeDiff(previous, current) {
  const previousByExtension = new Map(previous.map((entry) => [entry.extension, entry]));
  const currentByExtension = new Map(current.map((entry) => [entry.extension, entry]));
  const added = [];
  const payloadChanged = [];
  for (const entry of current) {
    const before = previousByExtension.get(entry.extension);
    if (before === void 0) {
      added.push(entry.extension);
    } else if (!paramsEqual(before.params, entry.params)) {
      payloadChanged.push(entry.extension);
    }
  }
  const removed = [];
  for (const entry of previous) {
    if (!currentByExtension.has(entry.extension)) {
      removed.push(entry.extension);
    }
  }
  const previousCommonOrder = previous.filter((entry) => currentByExtension.has(entry.extension)).map((entry) => entry.extension);
  const currentCommonOrder = current.filter((entry) => previousByExtension.has(entry.extension)).map((entry) => entry.extension);
  const reordered = previousCommonOrder.length !== currentCommonOrder.length || previousCommonOrder.some((token, index) => token !== currentCommonOrder[index]);
  const unresolved = current.filter((entry) => !entry.resolution.resolved).map((entry) => entry.extension);
  return { added, removed, payloadChanged, reordered, unresolved };
}
function diffIsEmpty(diff) {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.payloadChanged.length === 0 && !diff.reordered;
}
function createObserverBoundTo(history) {
  return (domainKey, source, onTransition) => {
    validateDomainKey(domainKey);
    let previous = resolveCurrentEntries(history, domainKey, source);
    let released = false;
    function reresolveAndReport(cause) {
      const current = resolveCurrentEntries(history, domainKey, source);
      const diff = computeDiff(previous, current);
      if (diffIsEmpty(diff)) {
        previous = current;
      } else {
        onTransition({ domainKey, cause, entries: current, diff });
        previous = current;
      }
    }
    const unsubscribeFanout = history.subscribe((notification) => {
      reresolveAndReport(notification.kind);
    });
    try {
      onTransition({
        domainKey,
        cause: "initial",
        entries: previous,
        diff: {
          added: previous.map((entry) => entry.extension),
          removed: [],
          payloadChanged: [],
          reordered: false,
          unresolved: previous.filter((entry) => !entry.resolution.resolved).map((entry) => entry.extension)
        }
      });
    } catch (error) {
      unsubscribeFanout();
      throw error;
    }
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      unsubscribeFanout();
      return;
    };
    return release;
  };
}
function createRouteSignal(history) {
  return {
    backProjectEntries: createBackProjectEntries(history),
    createObserver: createObserverBoundTo(history)
  };
}
var SLOT_VERSION = 1;
var ROUTED_DOMAIN_ROUTES_KEY = /* @__PURE__ */ Symbol.for("@gears-frontx/routing/routed-domain-routes/v1");
var NESTED_DOMAIN_KEYS_KEY = /* @__PURE__ */ Symbol.for("@gears-frontx/routing/nested-domain-keys/v1");
var PAGE_LOAD_KEY = /* @__PURE__ */ Symbol.for("@gears-frontx/routing/page-load/v1");
function hasFunctions(value, names) {
  return names.every((name) => typeof value[name] === "function");
}
function resolveSlot(key, members, create) {
  const realm = globalThis;
  const existing = realm[key];
  if (typeof existing === "object" && existing !== null && existing.v === SLOT_VERSION && hasFunctions(existing, members)) {
    return existing;
  }
  const holder = create();
  if (existing !== void 0) {
    reportRoutingDefect(`the realm slot ${String(key)} holds a value this copy does not recognize; this copy keeps its own`);
    return holder;
  }
  Object.defineProperty(realm, key, { value: holder, writable: false, configurable: false, enumerable: false });
  return holder;
}
function createRoutedDomainRoutes() {
  const holders = /* @__PURE__ */ new Map();
  const heldRoute = (route) => [...holders.keys()].find((candidate) => namesEqual(candidate, route));
  return Object.freeze({
    v: SLOT_VERSION,
    holderOf: (route) => {
      const held = heldRoute(route);
      return held === void 0 ? void 0 : holders.get(held);
    },
    hold: (route, holder) => {
      holders.set(heldRoute(route) ?? route, holder);
    },
    release: (route, ownerId) => {
      const held = heldRoute(route);
      if (held !== void 0 && holders.get(held)?.ownerId === ownerId) {
        holders.delete(held);
      }
    }
  });
}
function sharedRoutedDomainRoutes() {
  return resolveSlot(ROUTED_DOMAIN_ROUTES_KEY, ["holderOf", "hold", "release"], createRoutedDomainRoutes);
}
function createNestedDomainKeys() {
  const records = [];
  const recordOf = (owner) => records.find(
    (record) => namesEqual(record.owner.domainKey, owner.domainKey) && namesEqual(record.owner.extension, owner.extension)
  );
  return Object.freeze({
    v: SLOT_VERSION,
    add: (owner, domainKey) => {
      const record = recordOf(owner);
      if (record === void 0) {
        records.push({ owner: { domainKey: owner.domainKey, extension: owner.extension }, keys: /* @__PURE__ */ new Set([domainKey]) });
        return;
      }
      record.keys.add(domainKey);
    },
    remove: (owner, domainKey) => {
      const record = recordOf(owner);
      if (record === void 0) return;
      record.keys.delete(domainKey);
      if (record.keys.size === 0) records.splice(records.indexOf(record), 1);
    },
    keysOf: (owner) => [...recordOf(owner)?.keys ?? []],
    keysUnder: (domainKey) => records.filter((record) => namesEqual(record.owner.domainKey, domainKey)).flatMap((record) => [...record.keys])
  });
}
function sharedNestedDomainKeys() {
  return resolveSlot(NESTED_DOMAIN_KEYS_KEY, ["add", "remove", "keysOf", "keysUnder"], createNestedDomainKeys);
}
function createPageLoad() {
  let cleared = false;
  let ended = false;
  let kept;
  const written = [];
  const sameAddress = (a, domainKey, extension) => namesEqual(a.domainKey, domainKey) && namesEqual(a.extension, extension);
  return Object.freeze({
    beginLoad: (entries) => {
      if (cleared) return false;
      cleared = true;
      kept = ended ? void 0 : [...entries];
      return true;
    },
    isKept: () => kept !== void 0,
    keptEntriesOf: (domainKey) => (kept ?? []).filter((entry) => namesEqual(entry.domainKey, domainKey)),
    unwrittenParamsOf: (domainKey, extension) => {
      if (written.some((address) => sameAddress(address, domainKey, extension))) return void 0;
      const entry = (kept ?? []).find((candidate) => sameAddress(candidate, domainKey, extension));
      return entry !== void 0 && entry.params.length > 0 ? entry.params : void 0;
    },
    markWritten: (domainKey, extension) => {
      if (kept !== void 0) written.push({ domainKey, extension });
    },
    discard: () => {
      kept = void 0;
      if (!cleared) ended = true;
    }
  });
}
function createPageLoads() {
  const byHistory = /* @__PURE__ */ new WeakMap();
  return Object.freeze({
    v: SLOT_VERSION,
    of: (history) => {
      let load = byHistory.get(history);
      if (load === void 0) {
        load = createPageLoad();
        byHistory.set(history, load);
      }
      return load;
    }
  });
}
function sharedPageLoads() {
  return resolveSlot(PAGE_LOAD_KEY, ["of"], createPageLoads);
}
var PREFIX = "[@gears-frontx/routing]";
function isOccupantValue(value) {
  if (typeof value !== "object" || value === null) return false;
  const { domainKey, extension } = value;
  return typeof domainKey === "string" && typeof extension === "string" && validateName(domainKey) && validateName(extension);
}
function parseLocation(history) {
  const { path, search, hash } = history.location;
  return parseGrammar({ shellSubroute: path, search, hash });
}
var FrontXRouter = class {
  executor;
  typeSystem;
  /** The reader of the runtime's own occupant value; set only once navigation is supplied, so it stays unset in the shell runtime. */
  readOccupantValue;
  /** Resolved on first use, so the router can be built in a realm with no `window`. */
  cachedHistory;
  cachedSignal;
  domains = /* @__PURE__ */ new Map();
  routedRoutes = sharedRoutedDomainRoutes();
  nestedDomainKeys = sharedNestedDomainKeys();
  pageLoads = sharedPageLoads();
  /** This instance's identity in the routed-domain routes, compared by reference only. */
  ownerId = /* @__PURE__ */ Symbol("@gears-frontx/routing router");
  // ------------------------------------------------------------------
  // Members the runtime calls (FEATURE §1.5, Router members)
  // ------------------------------------------------------------------
  connect(executor, typeSystem) {
    this.executor = executor;
    this.typeSystem = typeSystem;
  }
  registerDomain(domainId, route, declaresUnmount) {
    if (!validateName(route)) {
      throw new Error(`${PREFIX} domain "${domainId}" declares the route "${route}", which is not a valid name`);
    }
    if (this.routedRoutes.holderOf(route) !== void 0) {
      throw new Error(`${PREFIX} the route "${route}" is already held by another routed domain live in the page`);
    }
    this.routedRoutes.hold(route, { domainId, ownerId: this.ownerId });
    const state = {
      domainId,
      domainKey: route,
      declaresUnmount,
      extensions: /* @__PURE__ */ new Map(),
      release: void 0,
      lastCommand: [],
      initialObserved: false,
      recordedUnder: void 0,
      pendingWrite: void 0,
      pendingTarget: [],
      pendingVerb: void 0
    };
    this.domains.set(domainId, state);
    const occupantValue = this.ownOccupantValue();
    if (occupantValue !== void 0) {
      this.recordNestedDomain(state, occupantValue);
    }
  }
  registerExtension(extensionId, domainId, route) {
    const state = this.domains.get(domainId);
    if (state === void 0) {
      return;
    }
    const name = deriveExtensionToken(route);
    if (name === void 0) {
      throw new Error(
        `${PREFIX} extension "${extensionId}" declares the route ${JSON.stringify(route)}, which yields no valid name in routed domain "${domainId}"`
      );
    }
    if ([...state.extensions.values()].some((held) => namesEqual(held, name))) {
      throw new Error(`${PREFIX} the name "${name}" is already held by another extension of routed domain "${domainId}"`);
    }
    state.extensions.set(extensionId, name);
  }
  releaseDomain(domainId) {
    const state = this.domains.get(domainId);
    if (state === void 0) return;
    this.releaseObserver(state);
    this.cancelPendingWrite(state);
    this.domains.delete(domainId);
    this.routedRoutes.release(state.domainKey, this.ownerId);
    this.recordNestedDomain(state, void 0);
  }
  releaseExtension(extensionId) {
    const state = [...this.domains.values()].find((candidate) => candidate.extensions.has(extensionId));
    if (state === void 0) return;
    const name = state.extensions.get(extensionId);
    state.extensions.delete(extensionId);
    state.lastCommand = state.lastCommand.filter((id) => id !== extensionId);
    if (name !== void 0) {
      state.pendingTarget = state.pendingTarget.filter((held) => !namesEqual(held, name));
    }
  }
  startDomain(domainId) {
    const state = this.domains.get(domainId);
    if (state === void 0 || state.release !== void 0) return;
    state.release = this.signal().createObserver(
      state.domainKey,
      this.extensionsSource(state),
      (transition) => this.onTransition(state, transition)
    );
  }
  stopDomain(domainId) {
    const state = this.domains.get(domainId);
    if (state === void 0) return;
    this.releaseObserver(state);
    state.initialObserved = false;
    state.lastCommand = [];
    this.cancelPendingWrite(state);
  }
  /**
   * The runtime's command: the domain's URL entries must show exactly the
   * extensions `extensionIds`, written with `verb` (FEATURE §2, flow step 7).
   */
  reflect(domainId, extensionIds, verb) {
    if (verb === "push") {
      this.discardInitialRoute();
    }
    const state = this.domains.get(domainId);
    if (state === void 0) return;
    state.lastCommand = [...extensionIds];
    if (state.release === void 0) {
      return;
    }
    this.writeEntries(state, this.namesOf(state, extensionIds), verb);
  }
  assignOccupantValue(domainId, extensionId) {
    const state = this.domains.get(domainId);
    const name = state?.extensions.get(extensionId);
    if (state === void 0 || name === void 0) {
      return void 0;
    }
    return { domainKey: state.domainKey, extension: name };
  }
  supplyNavigation(readOccupantValue) {
    this.readOccupantValue = readOccupantValue;
    const occupantValue = this.ownOccupantValue();
    for (const state of this.domains.values()) {
      this.recordNestedDomain(state, occupantValue);
    }
  }
  // ------------------------------------------------------------------
  // Engine-provider read (FEATURE §1.5) — not a member of the abstract router
  // ------------------------------------------------------------------
  /**
   * The runtime's own entry address: the occupant value once validated in a
   * routed extension's runtime; `undefined` in the shell runtime, whose router
   * has never been supplied navigation. An extension runtime supplied navigation
   * without an occupant value has no access to the router, so this throws.
   */
  ownEntryAddress() {
    if (this.readOccupantValue === void 0) {
      return void 0;
    }
    const occupantValue = this.ownOccupantValue();
    if (occupantValue === void 0) {
      throw new Error(`${PREFIX} this extension runtime has no occupant value, so it has no access to the router`);
    }
    return occupantValue;
  }
  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------
  /** The runtime's own occupant value read through the kept reader, or `undefined` when there is none; never throws. */
  ownOccupantValue() {
    const value = this.readOccupantValue?.();
    return isOccupantValue(value) ? { domainKey: value.domainKey, extension: value.extension } : void 0;
  }
  /** Records the domain's key under `occupantValue` in the nested-domain record, removing it from the occupant value it is recorded under, if any. */
  recordNestedDomain(state, occupantValue) {
    if (state.recordedUnder !== void 0) {
      this.nestedDomainKeys.remove(state.recordedUnder, state.domainKey);
    }
    state.recordedUnder = occupantValue;
    if (occupantValue !== void 0) {
      this.nestedDomainKeys.add(occupantValue, state.domainKey);
    }
  }
  history() {
    if (this.cachedHistory === void 0) {
      const history = resolveNavigationHistory();
      history.subscribe((notification) => {
        if (notification.kind === "history") {
          this.pageLoads.of(history).discard();
          for (const state of this.domains.values()) {
            this.cancelPendingWrite(state);
          }
        }
      });
      this.cachedHistory = history;
    }
    return this.cachedHistory;
  }
  pageLoad() {
    return this.pageLoads.of(this.history());
  }
  signal() {
    if (this.cachedSignal === void 0) {
      this.cachedSignal = createRouteSignal(this.history());
    }
    return this.cachedSignal;
  }
  /** Discards the page load's initial route; a realm with no navigation history has no page load to discard. */
  discardInitialRoute() {
    let history;
    try {
      history = this.history();
    } catch (error) {
      if (error instanceof RoutingError && error.code === "no-navigation-history-in-realm") {
        return;
      }
      throw error;
    }
    this.pageLoads.of(history).discard();
  }
  releaseObserver(state) {
    const release = state.release;
    if (release === void 0) return;
    state.release = void 0;
    release();
  }
  extensionsSource(state) {
    return {
      getRegistrations: () => [...state.extensions].map(([id, name]) => ({ extension: name, routeOwner: id }))
    };
  }
  /** The names of the given extension ids admitted in the domain, in the given order, without repeats. */
  namesOf(state, extensionIds) {
    const names = [];
    for (const id of extensionIds) {
      const name = state.extensions.get(id);
      if (name !== void 0 && !names.some((held) => namesEqual(held, name))) {
        names.push(name);
      }
    }
    return names;
  }
  extensionIdOf(state, name) {
    for (const [id, held] of state.extensions) {
      if (namesEqual(held, name)) return id;
    }
    return void 0;
  }
  send(domainId, type, subject) {
    if (this.executor === void 0) {
      throw new Error(`${PREFIX} the router sends a chain only once connect() has handed it an executor`);
    }
    this.executor.executeActionsChain({ action: { type, target: domainId, payload: { subject, history: "none" } } });
  }
  requireTypeSystem() {
    if (this.typeSystem === void 0) {
      throw new Error(`${PREFIX} the router sends a chain only once connect() has handed it a type system`);
    }
    return this.typeSystem;
  }
  /**
   * A domain's transition: for a page load (`initial`) or a back or forward
   * step (`history`), the `unmount_ext` and `mount_ext` chains, then the
   * page load's one clear or the write after a back or forward step; a
   * written navigation (`push`, `replace`) sends nothing.
   */
  onTransition(state, observed) {
    const firstTransition = !state.initialObserved;
    state.initialObserved = true;
    let transition = observed;
    let clearAfterDispatch = false;
    if (observed.cause === "initial") {
      const pageLoad = this.pageLoad();
      clearAfterDispatch = pageLoad.beginLoad(parseLocation(this.history()).entries);
      if (!clearAfterDispatch && pageLoad.isKept()) {
        transition = this.fromInitialRoute(state, observed, pageLoad);
      }
    }
    const dispatching = transition.cause === "initial" || transition.cause === "history";
    try {
      if (dispatching) {
        this.dispatch(state, transition);
      }
    } finally {
      if (clearAfterDispatch) {
        this.clearEntries();
      }
    }
    if (!firstTransition) {
      const unresolved = transition.diff.added.filter(
        (name) => transition.entries.some((entry) => namesEqual(entry.extension, name) && !entry.resolution.resolved)
      );
      if (unresolved.length > 0) {
        reportRoutingDefect(
          `routed domain "${state.domainId}" has no admitted extension for ${unresolved.map((name) => `"${name}"`).join(", ")}`
        );
      }
    }
    if (transition.cause === "history") {
      this.writeAfterUserChange(state, transition);
    }
  }
  /** The chains of an `initial` or `history` transition: removals first, then arrivals in URL order, each its own chain. */
  dispatch(state, transition) {
    for (const name of transition.diff.removed) {
      if (!state.declaresUnmount) {
        break;
      }
      const departing = this.extensionIdOf(state, name);
      if (departing !== void 0) {
        this.send(state.domainId, this.requireTypeSystem().resolveUnmountExtActionId(), departing);
      }
    }
    const arrived = transition.diff.added;
    for (const entry of transition.entries) {
      if (entry.resolution.resolved && arrived.some((name) => namesEqual(name, entry.extension))) {
        this.send(state.domainId, this.requireTypeSystem().resolveMountExtActionId(), entry.resolution.routeOwner);
      }
    }
  }
  /** The page load's one clear: every entry leaves the URL in one `replace`; the pathname, the hash and every foreign segment stay. */
  clearEntries() {
    const history = this.history();
    const parsed = parseLocation(history);
    if (parsed.entries.length === 0) return;
    history.replace(
      serializeGrammar({
        shellSubroute: parsed.shellSubroute,
        hash: parsed.hash,
        entries: [],
        foreignSegments: parsed.foreignSegments
      })
    );
  }
  /** The domain's first resolution taken from the kept initial route, resolved against the extensions the domain knows. */
  fromInitialRoute(state, observed, pageLoad) {
    const entries = pageLoad.keptEntriesOf(state.domainKey).map((entry) => {
      const owner = this.extensionIdOf(state, entry.extension);
      return {
        extension: entry.extension,
        params: entry.params,
        resolution: owner === void 0 ? { resolved: false } : { resolved: true, routeOwner: owner }
      };
    });
    return {
      domainKey: observed.domainKey,
      cause: "initial",
      entries,
      diff: {
        added: entries.map((entry) => entry.extension),
        removed: [],
        payloadChanged: [],
        reordered: false,
        unresolved: entries.filter((entry) => !entry.resolution.resolved).map((entry) => entry.extension)
      }
    };
  }
  /** The write after dispatching for a back or forward step, always with `replace`. */
  writeAfterUserChange(state, transition) {
    let target = transition.entries.filter((entry) => entry.resolution.resolved).map((entry) => entry.extension);
    if (!state.declaresUnmount && target.length === 0) {
      target = this.namesOf(state, state.lastCommand);
    }
    this.writeEntries(state, target, "replace");
  }
  /**
   * Makes the domain's URL entries show exactly `target`, with `verb`, in one
   * write composed against the live URL (FEATURE §2, flow steps 7.3 to 7.6).
   */
  writeEntries(state, target, verb) {
    const delta = this.compose(state, target);
    if (delta === void 0) {
      this.cancelPendingWrite(state);
      return;
    }
    const enclosing = this.ownOccupantValue();
    if (enclosing !== void 0 && !this.enclosingPresent(enclosing)) {
      state.pendingTarget = target;
      state.pendingVerb = state.pendingVerb === "replace" || verb === "replace" ? "replace" : "push";
      if (state.pendingWrite === void 0) {
        state.pendingWrite = this.history().subscribe(() => {
          if (!this.enclosingPresent(enclosing)) return;
          const pendingTarget = state.pendingTarget;
          const pendingVerb = state.pendingVerb ?? verb;
          this.cancelPendingWrite(state);
          const pendingDelta = this.compose(state, pendingTarget);
          if (pendingDelta !== void 0) {
            this.backProject(state, pendingDelta, pendingVerb);
          }
        });
      }
      return;
    }
    this.cancelPendingWrite(state);
    this.backProject(state, delta, verb);
  }
  /** One back-projection call for the domain; marks each written extension in the page load. */
  backProject(state, delta, verb) {
    this.signal().backProjectEntries(state.domainKey, delta, verb);
    const pageLoad = this.pageLoad();
    for (const entry of [...delta.added ?? [], ...(delta.replaced ?? []).map((pair) => pair.entry)]) {
      pageLoad.markWritten(state.domainKey, entry.extension);
    }
  }
  /**
   * The delta that makes the domain's live entries show exactly `target`, or
   * `undefined` when they already do. Exactly one dropped and one new name is
   * a `replaced` operation; otherwise the dropped names are removed and the
   * new ones appended in `target` order. Kept entries are left unnamed, so
   * they keep their position and parameters. Every domain nested beneath a
   * dropped extension, transitively, is named in `clearedDomainKeys`.
   */
  compose(state, target) {
    const live = this.liveNamesOf(state.domainKey);
    const dropped = live.filter(
      (name, index) => !target.some((kept) => namesEqual(kept, name)) && live.findIndex((other) => namesEqual(other, name)) === index
    );
    const added = target.filter((name) => !live.some((held) => namesEqual(held, name)));
    if (dropped.length === 0 && added.length === 0) return void 0;
    const clearedDomainKeys = this.nestedDomainKeysBeneath(state.domainKey, dropped);
    const pageLoad = this.pageLoad();
    const initialParams = (name) => pageLoad.unwrittenParamsOf(state.domainKey, name) ?? [];
    if (dropped.length === 1 && added.length === 1) {
      return {
        replaced: [{ oldExtension: dropped[0], entry: { extension: added[0], params: initialParams(added[0]) } }],
        clearedDomainKeys
      };
    }
    return {
      added: added.map((extension) => ({ extension, params: initialParams(extension) })),
      removed: dropped,
      clearedDomainKeys
    };
  }
  /**
   * Every domain key nested beneath the dropped extensions of the domain
   * `domainKey`, to any depth: the keys recorded under each dropped
   * extension's occupant value, then the keys recorded under every occupant
   * value of each collected key, and so on. A key collected once is never
   * collected again, so the walk ends.
   */
  nestedDomainKeysBeneath(domainKey, dropped) {
    const collected = [];
    const frontier = [];
    const collect = (key) => {
      if (collected.some((held) => namesEqual(held, key))) return;
      collected.push(key);
      frontier.push(key);
    };
    for (const extension of dropped) {
      this.nestedDomainKeys.keysOf({ domainKey, extension }).forEach(collect);
    }
    for (let key = frontier.pop(); key !== void 0; key = frontier.pop()) {
      this.nestedDomainKeys.keysUnder(key).forEach(collect);
    }
    return collected;
  }
  cancelPendingWrite(state) {
    state.pendingWrite?.();
    state.pendingWrite = void 0;
    state.pendingTarget = [];
    state.pendingVerb = void 0;
  }
  /** The names the live URL carries under `domainKey`, read afresh on every call. */
  liveNamesOf(domainKey) {
    return parseLocation(this.history()).entries.filter((entry) => namesEqual(entry.domainKey, domainKey)).map((entry) => entry.extension);
  }
  /** Whether the URL carries the entry of the extension that hosts this runtime's domains. */
  enclosingPresent(enclosing) {
    return parseLocation(this.history()).entries.some(
      (entry) => namesEqual(entry.domainKey, enclosing.domainKey) && namesEqual(entry.extension, enclosing.extension)
    );
  }
};
var router = new FrontXRouter();
var ActionsChainExecutor = class {
};
var RouterTypeSystem = class {
};
function resolveNavigationHistory2() {
  return resolveNavigationHistory();
}
export {
  ActionsChainExecutor,
  RouterTypeSystem,
  createRouteSignal,
  namesEqual,
  parseGrammar,
  resolveNavigationHistory2 as resolveNavigationHistory,
  router,
  serializeGrammar
};
