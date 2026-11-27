/**
 * Dev-server handling for the runner: bounded readiness polling against the
 * app URL, and optional spawning of the server command. Bounded by contract
 * - the design skill's verify reference treats open-ended waits as a hung agent, so
 * every wait here has a deadline and a named failure.
 */
import { spawn } from 'node:child_process';

/**
 * Poll `url` until it answers any HTTP status, or the deadline passes, or
 * `ended()` says the server command that should answer it has ended.
 *
 * @param {string} url
 * @param {{timeoutMs?: number, intervalMs?: number, fetchImpl?: typeof fetch,
 *   ended?: () => string | undefined}} [options]
 * @returns {Promise<void>} rejects with a named error on timeout or end
 */
export async function waitForUrl(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no attempt made';
  for (;;) {
    try {
      await fetchImpl(url, { signal: AbortSignal.timeout(Math.min(intervalMs * 2, 5_000)) });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    const ended = options.ended?.();
    if (ended !== undefined) {
      throw new Error(`the server command ${ended} before ${url} answered (${lastError})`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`app URL never became reachable within ${timeoutMs}ms: ${url} (${lastError})`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * One quick reachability probe, for deciding whether a server already holds
 * the URL before --start-server spawns a second one. A second server on an
 * occupied port dies instantly (or binds elsewhere) while the sweep silently
 * measures whatever was already listening, possibly another project: the
 * runner refuses to start then, rather than report on a server it did not
 * start.
 *
 * @param {string} url
 * @param {{timeoutMs?: number, fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<boolean>}
 */
export async function isUrlReachable(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    await fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 1_500) });
    return true;
  } catch {
    return false;
  }
}

const TAIL_BYTES = 8192;
const TAIL_LINES = 40;
/** How long settled() waits for the streams to drain after the command ended. */
const OUTPUT_GRACE_MS = 300;

/**
 * Start the dev-server command in its own process group so stop() can take
 * down the whole tree (npm run spawns children).
 *
 * Its stdout and stderr are always read, so the server never blocks on a full
 * pipe, but only the last TAIL_BYTES bytes it wrote are kept: output() gives
 * the last TAIL_LINES lines of those, for a start that failed to say why.
 * ended() names how the command ended once it has (its exit code or signal),
 * so a wait can stop at once instead of sitting out its deadline. It is set on
 * 'exit', not on 'close': a background child of the command (`vite &`) can
 * hold the pipes long after the command itself is gone. settled() then gives
 * the streams a short bounded grace to drain before output() is read.
 *
 * @param {string} command shell command, e.g. "npm run dev:all"
 * @param {{cwd?: string}} [options]
 * @returns {{stop: () => void, ended: () => string | undefined, output: () => string,
 *   settled: () => Promise<void>}}
 */
export function startServer(command, options = {}) {
  const child = spawn(command, {
    shell: true,
    cwd: options.cwd ?? process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let tail = Buffer.alloc(0);
  const keep = (chunk) => {
    tail = Buffer.concat([tail, chunk]);
    if (tail.length > TAIL_BYTES) tail = tail.subarray(tail.length - TAIL_BYTES);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  /** @type {string | undefined} */
  let ended;
  child.on('error', (error) => {
    ended ??= `could not be started (${error.message})`;
  });
  child.on('exit', (code, signal) => {
    ended ??= signal ? `was ended by ${signal}` : `exited with code ${code}`;
  });
  // 'close' comes once every holder of the pipes is gone and they are drained.
  const closed = new Promise((resolve) => child.on('close', resolve));
  return {
    ended: () => ended,
    settled: () =>
      new Promise((resolve) => {
        const timer = setTimeout(resolve, OUTPUT_GRACE_MS);
        timer.unref();
        closed.then(() => {
          clearTimeout(timer);
          resolve(undefined);
        });
      }),
    output: () => {
      // Skip a UTF-8 sequence the byte cut split, then keep the last lines.
      // The bound is on the bytes kept: decoding invalid UTF-8 replaces each
      // bad byte with U+FFFD, so the printed text may be longer than they are.
      let start = 0;
      while (start < tail.length && (tail[start] & 0xc0) === 0x80) start += 1;
      const lines = tail.subarray(start).toString('utf8').replace(/\n$/, '').split('\n');
      return lines.slice(-TAIL_LINES).join('\n');
    },
    stop: () => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        try {
          child.kill('SIGTERM');
        } catch {
          /* already gone */
        }
      }
    },
  };
}
