/**
 * `StepRunner` — runs one step as its own child process with stdin closed,
 * streams output to a log file, and resolves a result shaped exactly
 * `{step, command, exitCode, durationMs, log}` (with an extra `reason` field
 * when the runner killed the child). A step that fails is never retried: the
 * runner spawns its command exactly once.
 *
 * Two kill paths cover the two failure modes the phase contract names:
 *
 * - **timeout** — the process exceeds the hard `timeoutMs` limit (15 minutes
 *   by default). The runner sends SIGKILL and resolves with `exitCode: null`,
 *   `reason: 'timeout'`.
 * - **hung** — the child wrote no new log output AND its process tree
 *   accumulated no CPU time for `hangMs` (5 minutes by default). Sampled by
 *   polling the log file size and the child's CPU time (`ps -o time=` walked
 *   across the child's descendants; `process.cpuUsage` is not usable for
 *   child processes). The runner sends SIGKILL and resolves with
 *   `exitCode: null`, `reason: 'hung'`. This replaces the old
 *   completion-marker mechanism, which killed any build a few seconds after
 *   Vite's "✓ built in …" line even though the unit-producer's `closeBundle`
 *   work (shared units, minutes on a cold cache) runs AFTER that line and
 *   writes nothing further to stdout — so every build was killed. CPU-based
 *   hang detection lets that work run as long as the process tree is busy.
 *
 * The result's `exitCode` is the process exit status when it exited on its
 * own, or `null` when the runner killed it. `reason` is set only on kill
 * paths. The orchestrator treats any `exitCode !== 0` (including `null`) as
 * a failed step.
 *
 * Core logic is exported for unit tests; only `scripts/verify-dev.mjs`
 * constructs a StepRunner with real defaults.
 */
import { spawn, execFile } from 'node:child_process';
import { createWriteStream, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** 15 minutes — the per-step limit. */
export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
/** Idle window: no log output AND no CPU time across the child's process tree for this long ⇒ hung. */
export const DEFAULT_HANG_MS = 5 * 60 * 1000;
/** How often the hang watcher re-samples log size and CPU time. */
export const DEFAULT_POLL_MS = 1000;

export class StepRunner {
  /**
   * @param {{
   *   logDir: string;
   *   timeoutMs?: number;
   *   hangMs?: number;
   *   pollMs?: number;
   *   spawnFn?: typeof spawn;
   *   now?: () => number;
   *   mkdirFn?: (dir: string) => void;
   *   cpuSampler?: (pid: number) => Promise<number>;
   *   logSizeFn?: (logPath: string) => number;
   * }} opts
   */
  constructor({
    logDir,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    hangMs = DEFAULT_HANG_MS,
    pollMs = DEFAULT_POLL_MS,
    spawnFn = spawn,
    now = () => Date.now(),
    mkdirFn = (dir) => mkdirSync(dir, { recursive: true }),
    cpuSampler = defaultCpuSampler,
    logSizeFn = defaultLogSize,
  } = {}) {
    if (!logDir) throw new Error('StepRunner: logDir is required');
    this.logDir = logDir;
    this.timeoutMs = timeoutMs;
    this.hangMs = hangMs;
    this.pollMs = pollMs;
    this.spawnFn = spawnFn;
    this.now = now;
    this.mkdirFn = mkdirFn;
    this.cpuSampler = cpuSampler;
    this.logSizeFn = logSizeFn;
  }

  /**
   * Run a single step. The command is spawned exactly once with stdin closed;
   * stdout and stderr are streamed to a log file under {@link logDir}.
   *
   * @param {{
   *   step: string;
   *   command: string[];
   *   cwd?: string;
   *   env?: Record<string, string>;
   * }} desc
   * @returns {Promise<{ step: string; command: string; exitCode: number | null; durationMs: number; log: string; reason?: string }>}
   */
  run(desc) {
    this.mkdirFn(this.logDir);
    const logPath = path.join(this.logDir, `${sanitize(desc.step)}.log`);
    const startedAt = this.now();
    /** @type {{ step: string; command: string; exitCode: number | null; durationMs: number; log: string; reason?: string }} */
    const result = { step: desc.step, command: desc.command.join(' '), exitCode: null, durationMs: 0, log: logPath };
    const out = createWriteStream(logPath);
    const child = this.spawnFn(desc.command[0], desc.command.slice(1), {
      cwd: desc.cwd,
      env: { ...process.env, ...(desc.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(out);
    child.stderr.pipe(out);

    return new Promise((resolve) => {
      let settled = false;
      /** @type {NodeJS.Timeout | undefined} */
      let timeoutTimer;
      /** @type {NodeJS.Timeout | undefined} */
      let hangTimer;
      /** @type {NodeJS.Timeout | undefined} */
      let pollTimer;
      let lastLogSize = -1;
      let lastCpu = -1;

      const finish = (exitCode, reason) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (hangTimer) clearTimeout(hangTimer);
        if (pollTimer) clearTimeout(pollTimer);
        out.end();
        result.exitCode = exitCode;
        result.durationMs = this.now() - startedAt;
        if (reason) result.reason = reason;
        resolve(result);
      };

      const killChild = () => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already dead */
        }
      };

      // Hard timeout: the 15-minute limit. SIGKILL, resolve null
      // with reason 'timeout'.
      timeoutTimer = setTimeout(() => {
        killChild();
        finish(null, 'timeout');
      }, this.timeoutMs);

      // Hang detection: reset the timer whenever the child makes progress
      // (new log output OR CPU time advances across its process tree). If
      // the timer fires, the child is hung — SIGKILL, resolve null with
      // reason 'hung'.
      const resetHang = () => {
        if (hangTimer) clearTimeout(hangTimer);
        hangTimer = setTimeout(() => {
          killChild();
          finish(null, 'hung');
        }, this.hangMs);
      };
      resetHang();

      const poll = async () => {
        if (settled) return;
        let progressed = false;
        const size = this.logSizeFn(logPath);
        if (size !== lastLogSize) {
          progressed = true;
          lastLogSize = size;
        }
        if (child.pid !== undefined) {
          try {
            const cpu = await this.cpuSampler(child.pid);
            if (cpu > lastCpu) {
              progressed = true;
              lastCpu = cpu;
            }
          } catch {
            /* sampler failure — don't treat as progress, don't crash the runner */
          }
        }
        if (progressed) resetHang();
        if (!settled) pollTimer = setTimeout(poll, this.pollMs);
      };
      pollTimer = setTimeout(poll, this.pollMs);

      child.on('exit', (code, signal) => {
        if (settled) return;
        // signal set ⇒ we killed it (timeout/hung). Resolve null in that case.
        finish(signal ? null : code);
      });
      child.on('error', () => {
        if (!settled) finish(1);
      });
    });
  }
}

/**
 * Default CPU sampler: walks the child's process tree (the child and all its
 * descendants) and sums their cumulative CPU time as reported by `ps`
 * (`process.cpuUsage` is not usable for child processes). Returns a number
 * of seconds (fractional on platforms where `ps -o time=` reports them).
 *
 * Exported so unit tests can assert it returns a finite number for a real
 * process tree; the StepRunner constructor accepts an injectable `cpuSampler`
 * so deterministic tests don't depend on `ps` resolution.
 *
 * @param {number} pid
 * @returns {Promise<number>}
 */
export async function defaultCpuSampler(pid) {
  return new Promise((resolve) => {
    execFile('ps', ['-A', '-o', 'pid=,ppid=,time='], (err, stdout) => {
      if (err || !stdout) return resolve(0);
      /** @type {Map<number, number[]>} */
      const children = new Map();
      /** @type {Map<number, number>} */
      const cputime = new Map();
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length < 3) continue;
        const p = Number(parts[0]);
        const pp = Number(parts[1]);
        const t = parsePsTime(parts[2]);
        if (!Number.isFinite(p)) continue;
        cputime.set(p, t);
        if (!children.has(pp)) children.set(pp, []);
        children.get(pp).push(p);
      }
      resolve(sumTree(pid, children, cputime));
    });
  });
}

/**
 * @param {number} root
 * @param {Map<number, number[]>} children
 * @param {Map<number, number>} cputime
 * @returns {number}
 */
function sumTree(root, children, cputime) {
  let total = cputime.get(root) ?? 0;
  for (const c of (children.get(root) ?? [])) {
    total += sumTree(c, children, cputime);
  }
  return total;
}

/**
 * Parse `ps -o time=` output. Formats covered: `M:SS.CC` (macOS),
 * `MM:SS`, `HH:MM:SS`. Each colon-separated segment multiplies the
 * accumulated value by 60, so any consistent format compares correctly
 * across polls. Unparseable input collapses to 0.
 *
 * @param {string} s
 * @returns {number}
 */
function parsePsTime(s) {
  const parts = s.split(':');
  let total = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n)) return 0;
    total = total * 60 + n;
  }
  return total;
}

/**
 * @param {string} logPath
 * @returns {number} current log file size, or 0 if it isn't readable yet.
 */
function defaultLogSize(logPath) {
  try {
    return statSync(logPath).size;
  } catch {
    return 0;
  }
}

/**
 * @param {string} name
 * @returns {string} filesystem-safe log file stem.
 */
function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}
