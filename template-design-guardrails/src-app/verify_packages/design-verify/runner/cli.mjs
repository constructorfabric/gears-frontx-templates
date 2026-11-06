#!/usr/bin/env node
/**
 * design-verify runner - one command that turns the dev-only runtime
 * design-defect checker into repeatable evidence: drive the app in headless
 * Chrome across a routes x themes x widths matrix, call
 * `window.__frontxDesignDefects()` in every state, and emit findings.json
 * plus screenshots on a stable naming convention.
 *
 * This replaces the ad-hoc CDP scripts agents previously authored per run
 * (the guardrails pilot wrote and re-ran /tmp/verify.mjs + /tmp/shots.mjs
 * from scratch - minutes of throwaway harness work every time). The runner
 * is the owned form of that harness; the design skill's ban on
 * improvised browser automation stands, and this is the sanctioned path.
 *
 * Invocation (from the shell project root):
 *   npm run verify:ui --workspace=@gears-frontx/design-verify -- \
 *     --routes /login,/tasks --widths 1440,768,320 --themes light,dark
 *
 * Every finding carries the gate the frontx-design skill's
 * rules/render-check.json gives its rule id, and a finding the per-screen
 * waiver file covers moves to its state's waived list (runner/waivers.mjs).
 *
 * See --help (runner/config.mjs USAGE) for every flag. Exit codes: 0 ran
 * (findings are advisory), 1 findings + --fail-on-findings, 2 environment
 * failure, an input the run cannot honour (a bad flag, baseline or waiver
 * file, a missing skill rule file) or a requested screenshot that could not
 * be produced - an unverified state is never reported as a pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs, expandMatrix, resolvePaths, resolveServerCwd, shotName, USAGE } from './config.mjs';
import { CdpSession, newTarget } from './cdp.mjs';
import { findChrome, launchChrome } from './chrome.mjs';
import { isUrlReachable, waitForUrl, startServer } from './server.mjs';
import {
  buildReport,
  diffReports,
  exitCode,
  gateLookup,
  splitSweep,
  summaryLines,
  waiveStates,
} from './report.mjs';
import { ContractError, designMdParser, projectRoot, readSkillJson } from './skill.mjs';
import { contrastPairs, contrastState, ContrastInputError, probeExpression } from './contrast.mjs';
import { coversRendered, loadWaivers, waiverReport, WaiverError } from './waivers.mjs';

const SWEEP_LINE = /\[design-defects\]/;
const VERIFY_PKG_FAILURE = /\[verify-packages\].*(none installed|failed to load)/;

/** @param {string} base @param {string} route */
function joinUrl(base, route) {
  return `${base.replace(/\/$/, '')}/${route.replace(/^\//, '')}`;
}

/**
 * Menu-mode activation: click the sidebar item with this label, then wait
 * for a screen to actually mount (an open shadow root appearing). Shells
 * that mount screens on menu action render only the empty shell for a
 * deep-linked URL - sweeping that measures nothing while reporting clean.
 *
 * @param {import('./cdp.mjs').CdpSession} session
 * @param {string} label
 * @param {number} timeoutMs
 * @returns {Promise<string | undefined>} error message, or undefined on success
 */
async function activateMenu(session, label, timeoutMs) {
  const click = await session.evaluate(
    `(() => {
      const wanted = ${JSON.stringify(label)}.trim().toLowerCase();
      const el = Array.from(document.querySelectorAll('li,button,a'))
        .find((e) => e.textContent.trim().toLowerCase() === wanted);
      if (!el) return 'not-found';
      (el.querySelector('button,a') ?? el).click();
      return 'clicked';
    })()`,
  );
  if (click.error !== undefined || click.value !== 'clicked') {
    return `menu item "${label}" could not be clicked: ${click.error ?? click.value}`;
  }
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const mounted = await session.evaluate(
      `Array.from(document.querySelectorAll('*')).some((e) => e.shadowRoot)`,
    );
    if (mounted.value === true) return undefined;
    if (Date.now() >= deadline) {
      return `menu item "${label}" was clicked but no screen mounted within ${timeoutMs}ms`;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.config.help) {
    console.log(USAGE);
    return 0;
  }
  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) console.error(`design-verify: ${error}`);
    console.error('run with --help for usage');
    return 2;
  }
  const root = projectRoot();
  const config = resolvePaths(parsed.config, root);
  const mode = config.menus.length > 0 ? 'menu' : 'route';

  // The gate of every rule id and the waiver file, before any sweeping: a
  // waiver the run cannot honour fails now, not after minutes of work.
  // The DESIGN.md pairs too, so a broken DESIGN.md fails before any browser work.
  let gateFor;
  let waivers;
  let contrastSpec;
  /** @type {import('./contrast.mjs').ContrastPair[] | undefined} */
  let pairs;
  let parser;
  try {
    const registry = readSkillJson('rules/quality-gates.json');
    const renderCheck = readSkillJson('rules/render-check.json');
    gateFor = gateLookup(renderCheck);
    waivers = loadWaivers(config.waivers || undefined, root, registry);
    if (config.designMd) {
      contrastSpec = renderCheck.designMdContrast;
      parser = await designMdParser();
      pairs = contrastPairs(parser.readDesignMd(config.designMd).front, contrastSpec);
    }
  } catch (error) {
    const known =
      error instanceof ContractError ||
      error instanceof WaiverError ||
      error instanceof ContrastInputError ||
      (parser !== undefined && error instanceof parser.InputError);
    if (!known) throw error;
    console.error(`design-verify: ${error.message}`);
    return 2;
  }
  const coversState = coversRendered(mode);
  const probedThemes = new Set();

  // Read the baseline up front: a bad path should fail before minutes of
  // sweeping, not after.
  let baselineReport;
  if (config.baseline) {
    try {
      baselineReport = JSON.parse(fs.readFileSync(config.baseline, 'utf8'));
    } catch (error) {
      console.error(
        `design-verify: --baseline ${config.baseline} could not be read: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return 2;
    }
  }

  const cleanups = [];
  try {
    if (config.startServer) {
      if (await isUrlReachable(config.url)) {
        // A second server on an occupied port dies (or binds elsewhere) while
        // the sweep would silently measure the incumbent - attach explicitly.
        console.log(
          `design-verify: ${config.url} is already reachable - attaching to the running server instead of starting "${config.startServer}"`,
        );
      } else {
        const serverCwd = resolveServerCwd(config);
        console.log(`design-verify: starting dev server: ${config.startServer} (in ${serverCwd})`);
        const server = startServer(config.startServer, { cwd: serverCwd });
        cleanups.push(server.stop);
      }
    }
    console.log(`design-verify: waiting for ${config.url} (max ${config.serverTimeoutMs}ms)`);
    await waitForUrl(config.url, { timeoutMs: config.serverTimeoutMs });

    let endpoint = config.cdpUrl;
    if (!endpoint) {
      const execPath = findChrome({ chromePath: config.chromePath });
      console.log(`design-verify: launching headless Chrome: ${execPath}`);
      const chrome = await launchChrome(execPath);
      cleanups.push(chrome.stop);
      endpoint = chrome.endpoint;
    }
    const session = new CdpSession(await newTarget(endpoint));
    cleanups.push(() => session.close());
    await session.connect();

    fs.mkdirSync(config.outDir, { recursive: true });
    const menuMode = config.menus.length > 0;
    const states = [];
    let currentKey = '';
    for (const state of expandMatrix({ ...config, routes: menuMode ? config.menus : config.routes })) {
      const { route, theme, width } = state;
      const pageKey = JSON.stringify([route, theme]);
      /** @type {StateRecord} */
      const record = { route, theme, width };

      // A route/theme change reloads the page; width changes reuse it.
      if (pageKey !== currentKey) {
        const beforeNav = session.consoleLines.length;
        await session.navigate(menuMode ? config.url : joinUrl(config.url, route));
        // Theme restore reads localStorage on mount, so set it on the app's
        // origin and reload for it to take effect (the checker re-sweeps).
        await session.waitForConsoleLine(SWEEP_LINE, beforeNav, config.sweepTimeoutMs);
        const set = await session.evaluate(
          `localStorage.setItem(${JSON.stringify(config.themeKey)}, JSON.stringify(${JSON.stringify(theme)}))`,
        );
        if (set.error) {
          record.environmentError = `could not set theme: ${set.error}`;
          states.push(record);
          continue;
        }
        const beforeReload = session.consoleLines.length;
        await session.send('Page.reload', { ignoreCache: false });
        const sweepLine = await session.waitForConsoleLine(
          SWEEP_LINE,
          beforeReload,
          config.sweepTimeoutMs,
        );
        const failure = session.consoleLines
          .slice(beforeReload)
          .find((line) => VERIFY_PKG_FAILURE.test(line));
        if (failure) {
          record.environmentError = failure;
          states.push(record);
          continue;
        }
        if (!sweepLine) {
          console.warn(
            `design-verify: no [design-defects] line within ${config.sweepTimeoutMs}ms ` +
              `at ${route} (${theme}) - attempting on-demand sweep anyway`,
          );
        }
        // Tokens are page-wide: probe the DESIGN.md pairs once per theme, on
        // the first page that theme loads.
        if (pairs && !probedThemes.has(theme)) {
          probedThemes.add(theme);
          await session.setWidth(width);
          await new Promise((r) => setTimeout(r, config.settleMs));
          const probe = await session.evaluate(probeExpression(pairs));
          const contrast = contrastState({ theme, width, pairs, probe, spec: contrastSpec, gateFor });
          states.push(contrast);
          console.log(
            `design-verify: DESIGN.md contrast ${theme} - ` +
              (contrast.environmentError
                ? `ENVIRONMENT: ${contrast.environmentError}`
                : `${contrast.contrast.length} pair(s) measured, ${contrast.findings.length} below threshold` +
                  (contrast.needsReview.length > 0 ? `, ${contrast.needsReview.length} needing review` : '')),
          );
        }
        if (menuMode) {
          const activationError = await activateMenu(session, route, config.sweepTimeoutMs);
          if (activationError) {
            record.environmentError = activationError;
            states.push(record);
            continue;
          }
          await new Promise((r) => setTimeout(r, config.settleMs));
        }
        currentKey = pageKey;
      }

      await session.setWidth(width);
      await new Promise((r) => setTimeout(r, config.settleMs));
      const before = session.consoleLines.length;
      const sweep = await session.evaluate('window.__frontxDesignDefects()', {
        awaitPromise: true,
      });
      if (sweep.error !== undefined) {
        record.environmentError = /is not a function|undefined/.test(sweep.error)
          ? `window.__frontxDesignDefects is unavailable - is the design-verify package installed and the app in dev mode? (${sweep.error})`
          : `sweep threw: ${sweep.error}`;
      } else if (!Array.isArray(sweep.value)) {
        record.environmentError = `sweep returned a non-array: ${JSON.stringify(sweep.value)}`;
      } else {
        Object.assign(record, splitSweep(sweep.value, gateFor));
        waiveStates([record], waivers.waivers, coversState);
      }
      record.consoleLines = session.consoleLines.slice(before);

      if (config.screenshots) {
        try {
          const file = shotName(route, theme, width);
          fs.writeFileSync(
            path.join(config.outDir, file),
            Buffer.from(await session.screenshot(), 'base64'),
          );
          record.screenshot = file;
        } catch (error) {
          record.screenshotError = error instanceof Error ? error.message : String(error);
        }
      }
      states.push(record);
      const count = record.findings?.length;
      const undecided = record.needsReview?.length ?? 0;
      const waivedCount = record.waived?.length ?? 0;
      console.log(
        `design-verify: ${route} ${theme} ${width}px - ` +
          (record.environmentError
            ? `ENVIRONMENT: ${record.environmentError}`
            : count === 0 && undecided === 0
              ? 'clean'
              : `${count} finding(s)` + (undecided > 0 ? `, ${undecided} needing review` : '')) +
          (waivedCount > 0 ? `, ${waivedCount} waived` : '') +
          (record.screenshotError ? ` - SCREENSHOT FAILED: ${record.screenshotError}` : ''),
      );
    }

    // A theme whose every page failed to load was never probed: say so
    // rather than leave its pairs out of the report.
    for (const theme of pairs ? config.themes : []) {
      if (probedThemes.has(theme)) continue;
      states.push({
        check: 'design-md-contrast',
        route: 'DESIGN.md',
        theme,
        width: config.widths[0],
        environmentError: 'contrast not measured: no page of this theme loaded',
      });
    }

    const report = buildReport(
      { baseUrl: config.url, themeKey: config.themeKey, waivers: waiverReport(waivers, mode) },
      states,
    );
    const diff = baselineReport ? diffReports(baselineReport, report) : undefined;
    if (diff) report.baselineComparison = { baseline: config.baseline, ...diff };
    const reportPath = path.join(config.outDir, 'findings.json');
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    for (const line of summaryLines(report, diff)) console.log(line);
    console.log(`design-verify: report written to ${reportPath}`);
    return exitCode(report, config, diff);
  } finally {
    for (const cleanup of cleanups.reverse()) cleanup();
  }
}

/**
 * @typedef {{route: string, theme: string, width: number,
 *   findings?: Array<{id?: string, detail?: string, target?: string}>,
 *   needsReview?: Array<{id?: string, detail?: string, target?: string}>,
 *   environmentError?: string, screenshot?: string, screenshotError?: string,
 *   consoleLines?: string[]}} StateRecord
 */

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`design-verify: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  },
);
