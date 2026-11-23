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

/**
 * Start the dev-server command in its own process group so stop() can take
 * down the whole tree (npm run spawns children).
 *
 * Its stdout and stderr are always read, so the server never blocks on a full
 * pipe, but only their last TAIL_BYTES are kept: output() gives the last
 * TAIL_LINES lines of that, for a start that failed to say why. ended() names
 * how the command ended once it has (its exit code or signal), so a wait can
 * stop at once instead of sitting out its deadline.
 *
 * @param {string} command shell command, e.g. "npm run dev:all"
 * @param {{cwd?: string}} [options]
 * @returns {{stop: () => void, ended: () => string | undefined, output: () => string}}
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
  // 'close' comes after the streams are drained, so output() is complete.
  child.on('close', (code, signal) => {
    ended ??= signal ? `was ended by ${signal}` : `exited with code ${code}`;
  });
  return {
    ended: () => ended,
    output: () => {
      // Skip a UTF-8 sequence the byte cut split, then keep the last lines.
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
