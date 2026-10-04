# Live browser run — routing in the shell and demo-mfe

Manual verification procedure for [gears-frontx#638](https://github.com/constructorfabric/gears-frontx/issues/638): routing wired into `template-shell` and the demo MFE, driven end-to-end in a real browser. This is not a committed test harness — no Playwright suite lives in this repo. Verification runs through [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) instead, by direct decision: it drives the real browser over CDP and reads the actual `history` API and shadow-DOM output without adding a Playwright dependency or spec files to the templates repo. Each run's URL log goes into the PR description as a table, not into this directory.

Every occupant's address reaches it privately now, through the `mfes` runtime's occupant-value rendezvous — no shared property carries it. The shell's and every MFE's own injected `FrameworkRouter` (`@gears-frontx/framework`) owns agreement between the URL and the mounts for each routed domain: it observes that domain's own URL entries, translates a URL change into `mount_ext`/`unmount_ext` chains, and fans a settled mount/unmount out to `history.pushState`/`replaceState`. Everything below observes that from the browser: the URL bar, `history.length`, and a small recorder injected into the page.

## Composing and running the shell (L0–L1)

**Temporary note:** the FrontX ecosystem packages this depends on (`@gears-frontx/mfes`, `@gears-frontx/gts-plugin`, `@gears-frontx/routing`, `@gears-frontx/routing-tanstack`) are not yet published to the npm registry. Until they are, step L0 needs its `npm install` wired to locally built tarballs of those packages instead of the registry versions pinned in `package.json` — do not commit any tarball into the repo, and drop this note once the packages are published and a plain `npm install` resolves them.

**L0. Compose** (mirrors `main.yml`'s "Validate shell + overlay composition" job):

```bash
export COMPOSED="${TMPDIR:-/tmp}/frontx-638-composed"
cd /path/to/gears-frontx-templates
rm -rf "$COMPOSED" && mkdir -p "$COMPOSED"
tar -C template-shell --exclude=node_modules -cf - . | tar -C "$COMPOSED" -xf -
mkdir -p "$COMPOSED/src-app/mfe_packages"
tar -C template-mfe/src-app/mfe_packages --exclude=node_modules -cf - . | tar -C "$COMPOSED/src-app/mfe_packages" -xf -
find "$COMPOSED/src-app/mfe_packages" -not -path '*/node_modules/*' -name package-lock.json -delete
cd "$COMPOSED" && npm install
```

After editing template sources, re-sync into `$COMPOSED` and rebuild rather than re-composing from scratch: `npm run build:package && npm run build:packages` inside `$COMPOSED` (re-run `npm install` there too if a `package.json` changed).

**L1. Run** (shell on `http://localhost:5173`; remotes: demo-mfe `3001`, widgets-fixture-a `3201`, widgets-fixture-b `3202`, `_blank-mfe` `3099`) — start in the background:

```bash
cd "$COMPOSED" && FRONTX_INCLUDE_TEMPLATE_EXAMPLES=1 npm run dev:all
```

Readiness check:

```bash
curl -sf http://localhost:5173/ >/dev/null && for p in 3001 3201 3202; do curl -sf http://localhost:$p/assets/remoteEntry.js >/dev/null || echo "port $p not ready"; done
```

Stop the dev servers when done (they run as background child processes under `npm run dev:all`).

## Helpers

MFE content renders inside shadow roots, so reading state and clicking widgets goes through `evaluate_script` walking the shadow tree (or `take_snapshot` → `click` by uid). Screenshots, if taken for self-checking, stay local — never committed to this repo.

**URL/history recorder.** Installed via the `initScript` parameter of `navigate_page` so it attaches before the page's own scripts run on every new document — required to catch a cold deep link and a reload, which a script injected after load would miss. It logs to `sessionStorage`, so its log survives a reload. `new_page` cannot take an `initScript` (it opens on `about:blank`); instead call `navigate_page` with `{ type: 'url', url, initScript: RECORDER }` for the first real navigation, and `{ type: 'reload', initScript: RECORDER }` for reloads.

```js
// RECORDER (string passed as initScript)
(() => {
  const KEY = '__frontx638UrlLog';
  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
  const log = (kind) => { const entries = read(); entries.push({ kind, url: location.pathname + location.search, len: history.length, at: performance.now() }); sessionStorage.setItem(KEY, JSON.stringify(entries)); };
  log('document');
  for (const k of ['pushState', 'replaceState']) {
    const orig = history[k].bind(history);
    history[k] = (s, t, u) => { orig(s, t, u); log(k); };
  }
  addEventListener('popstate', () => log('pop'));
})();
```

```js
// readLog(): recorder entries so far
() => JSON.parse(sessionStorage.getItem('__frontx638UrlLog') ?? '[]')
// clearLog(): sessionStorage.removeItem('__frontx638UrlLog')
```

```js
// state(): URL, history length, widget facts — walks shadow roots
() => {
  const found = {};
  const walk = (root) => root.querySelectorAll('*').forEach((el) => {
    const id = el.getAttribute('data-testid');
    if (id) (found[id] ??= []).push(el.getAttribute('data-last-ping') ?? el.textContent?.trim().slice(0, 40));
    if (el.shadowRoot) walk(el.shadowRoot);
  });
  walk(document);
  return { url: location.pathname + location.search + location.hash, len: history.length,
           widgetInstances: (found['widget-a-instance'] ?? []).length, lastPing: found['widget-a-last-ping'] ?? [],
           fallback: !!found['screen-route-fallback'], notFound: !!found['widget-a-not-found'] };
}
```

```js
// clickTestId(id): finds a data-testid across shadow roots and clicks it
(id) => { const walk = (root) => { for (const el of root.querySelectorAll('*')) { if (el.getAttribute('data-testid') === id) return el; if (el.shadowRoot) { const f = walk(el.shadowRoot); if (f) return f; } } return null; };
          const el = walk(document); if (!el) return 'missing ' + id; el.click(); return 'clicked ' + id; }
```

Widget mount lines appear in the console (`list_console_messages`) as `[widget-a <id>] mount …` (alpha, beta) and `[widget-b <id>] mount …` (widget). Expect exactly one line per actual mount.

For each step below, capture `state()` before and after, `readLog()`, and record one row for the PR description: `step | URL before | URL after | len before → after | recorder entries | facts`.

## Steps

`W` = `screen.widgets-host.widgets`; `ALL` = `W=widget-alpha&W=widget-beta&W=widget` (order = extension registration order — record the actual order observed); `T` = an ISO ping timestamp; `DEEP` = `/?screen=widgets-host&W=widget-alpha;route;last-ping=2026-09-23T10:15:30.000Z`.

1. **Cold deep link.** `new_page` on `about:blank`; `navigate_page` `{ url: 'http://localhost:5173' + DEEP, initScript: RECORDER }`; `wait_for` "Widget A instance". Expect: `document`, then one `replaceState` adding beta and widget (no `pushState`); `history.length` unchanged. `widgetInstances === 2` (alpha, beta), alpha's `last-ping` restored, beta's empty; one mount line each for alpha, beta, widget.
2. **Menu → Hello World.** `new_page` on `about:blank`; `navigate_page` to `/`; click the Hello World menu item. Expect one `pushState` to `/?screen=hello-world`, `history.length` +1.
3. **Ping widget A from Hello World.** `clickTestId('hello-world-ping-widget-a')`; `wait_for` a non-empty `widget-a-last-ping`. Expect `pushState` (screen switch to Widgets Host) → `replaceState` (all three widgets) → `replaceState` (the ping value); `history.length` +1 overall (the ping's `replaceState` does not grow it); the DOM `last-ping` matches the URL value, format `YYYY-MM-DDTHH:MM:SS.sssZ`; one mount line per widget.
4. **Reload.** `navigate_page` `{ type: 'reload', initScript: RECORDER }`. Expect only `document` after the reload — no `pushState`/`replaceState` — full state restored (all three widgets, alpha's `last-ping` intact), `history.length` unchanged.
5. **Back ×2, Forward ×2.** Expect only `pop` entries, no push/replace. Back leads to `/?screen=hello-world` then `/` (Hello World stays rendered — the screen domain has no unmount). Forward retraces to `/?screen=hello-world` then back into Widgets Host, where all three widgets re-render (alpha's `last-ping` intact) with one fresh mount line per widget and no duplicates. `history.length` unchanged throughout.
6. **Mount Hello World from a widget, then Back.** `clickTestId('widget-a-mount-helloworld')` on alpha → `pushState` to `/?screen=hello-world` (the `W` keys drop, `history.length` +1). Back → returns to the prior Widgets Host URL via `pop`; widgets re-render, alpha's `last-ping` preserved.
7. **Sidebar/popup/overlay.** `navigate_page` to `…/?sidebar=nav&popup=dlg&overlay=ovl`. Expect no console errors and no `pushState`/`replaceState`.
8. **Unknown screen token.** `navigate_page` to `…/?screen=nope`. Expect `fallback === true`, `widgetInstances === 0`, no mount lines, no recorder entries beyond `document`.
9. **Unknown widget route.** `navigate_page` to `…/?screen=widgets-host&W=widget-alpha;route=/nope&…`. Expect `notFound === true`, `fallback === false`, no `pushState`.
10. **Screen change with foreign query keys.** `navigate_page` to `DEEP&utm_source=news`, then click the Hello World menu item. Expect the `W` keys to drop while `utm_source` is preserved on the resulting `/?screen=hello-world&utm_source=news`.

After the run, stop the dev servers (`TaskStop` on the background task, or kill the `npm run dev:all` process tree).

## Known observations

Both are expected and were confirmed across runs — do not treat either as a regression without new evidence:

- **Step 1 (cold deep link into Widgets Host) logs a cosmetic console error**, `[MfeRegistry] Actions chain failed | mount_ext`. It comes from React StrictMode's double-invoke of the shell's router dispatch racing the widgets domain's own registration in development; it does not affect the resulting DOM state or the recorder log.
- **Step 9 (unknown widget route) can log two `replaceState` calls instead of one.** One normalizes the invalid route inside the widget fixture, the other adds the remaining widgets from the router's own coalesced write; which one lands first varies between runs. The end state (`notFound === true`, `fallback === false`, no `pushState`) is unaffected.
- **Pressing Back while a newly selected screen is still mounting can drop the forward history entry it was leaving.** The settled-action reflection for the new screen's mount runs once that mount itself settles — asynchronously, on whatever tick that finishes — and if Back is pressed before it does, that late reflection still writes its entry on top of wherever Back landed, ahead of the entry Back moved away from. This is accepted as a known limitation for #638, not fixed here.

## Related

- [gears-frontx#638](https://github.com/constructorfabric/gears-frontx/issues/638)
- [CONTRIBUTING.md](../CONTRIBUTING.md)
