import path from 'node:path';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { StepRunner, defaultCpuSampler } from './StepRunner.mjs';

/** @type {string | undefined} */
let rootDir;

afterEach(() => {
  if (rootDir) rmSync(rootDir, { recursive: true, force: true });
  rootDir = undefined;
});

function makeRoot() {
  rootDir = mkdtempSync(path.join(tmpdir(), 'step-runner-'));
  return rootDir;
}

describe('StepRunner', () => {
  it('a step that exits 0 yields exitCode 0 with durationMs and log path recorded', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    const runner = new StepRunner({ logDir, timeoutMs: 5000 });
    const result = await runner.run({ step: 'exit-0', command: ['node', '-e', 'process.exit(0)'] });
    expect(result.step).toBe('exit-0');
    expect(result.command).toBe('node -e process.exit(0)');
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.log).toBe(path.join(logDir, 'exit-0.log'));
    expect(existsSync(result.log)).toBe(true);
  });

  it('a step that exits non-zero yields its exit code and is treated as failed', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    const runner = new StepRunner({ logDir, timeoutMs: 5000 });
    const result = await runner.run({ step: 'exit-2', command: ['node', '-e', 'process.exit(2)'] });
    expect(result.exitCode).toBe(2);
    expect(result.reason).toBeUndefined();
  });

  it('a step that does not exit by itself within the limit is killed with reason="timeout"', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    const runner = new StepRunner({ logDir, timeoutMs: 150, hangMs: 60_000, pollMs: 50 });
    const result = await runner.run({
      step: 'hangs',
      command: ['node', '-e', "setInterval(() => {}, 60000)"],
    });
    expect(result.exitCode).toBe(null);
    expect(result.reason).toBe('timeout');
    expect(result.durationMs).toBeGreaterThanOrEqual(100);
  });

  it('a step that prints "✓ built in 1s" then keeps producing output for longer than the old 5s grace window is NOT killed and reports its real exit code', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    // Short hangMs + short pollMs so the runner would kill a child that went
    // idle. The child keeps printing every 100ms for 6s (longer than the old
    // 5s completion-marker grace), so every poll sees new log bytes and the
    // hang timer never fires. Under the old completion-marker mechanism this
    // step would have been killed ~5s after "✓ built in 1s".
    const runner = new StepRunner({ logDir, timeoutMs: 30_000, hangMs: 1000, pollMs: 100 });
    const script = `
      console.log('✓ built in 1s');
      let i = 0;
      const t = setInterval(() => {
        console.log('tick ' + (++i));
        if (i >= 60) { clearInterval(t); process.exit(0); }
      }, 100);
    `;
    const result = await runner.run({ step: 'keeps-output', command: ['node', '-e', script] });
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBeUndefined();
    expect(readFileSync(result.log, 'utf-8')).toContain('✓ built in 1s');
    expect(readFileSync(result.log, 'utf-8')).toContain('tick 60');
  }, 15_000);

  it('a step that prints "✓ built in 1s" then keeps working via CPU (no output) for longer than the old 5s grace window is NOT killed', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    // Fake cpuSampler that reports accumulating CPU time on each call,
    // simulating a busy child (the unit-producer's closeBundle) without
    // depending on `ps` resolution in tests.
    let cpu = 0;
    const cpuSampler = async () => (cpu += 0.05);
    const runner = new StepRunner({ logDir, timeoutMs: 30_000, hangMs: 1000, pollMs: 100, cpuSampler });
    // Print the marker, then busy-loop for 6s with NO further output — the
    // exact shape of the bug: Vite prints "✓ built in …" then closeBundle
    // works in silence for minutes.
    const script = `
      console.log('✓ built in 1s');
      const end = Date.now() + 6000;
      while (Date.now() < end) { /* busy loop, no output */ }
      process.exit(0);
    `;
    const result = await runner.run({ step: 'keeps-cpu', command: ['node', '-e', script] });
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBeUndefined();
  }, 15_000);

  it('a step that prints a marker-like line and then goes idle (no output, no CPU) is killed as hung, not as a non-exit after the marker', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    const cpuSampler = async () => 0; // never advances
    const runner = new StepRunner({ logDir, timeoutMs: 5000, hangMs: 300, pollMs: 100, cpuSampler });
    const result = await runner.run({
      step: 'idle-after-marker',
      command: ['node', '-e', "console.log('BUILT OK'); setInterval(() => {}, 60000)"],
    });
    expect(result.exitCode).toBe(null);
    expect(result.reason).toBe('hung');
    expect(result.durationMs).toBeLessThan(2000);
    expect(readFileSync(result.log, 'utf-8')).toContain('BUILT OK');
  });

  it('a step that is idle from the start (no output, no CPU) is killed as hung with reason="hung"', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    const cpuSampler = async () => 0;
    const runner = new StepRunner({ logDir, timeoutMs: 5000, hangMs: 300, pollMs: 100, cpuSampler });
    const result = await runner.run({
      step: 'idle',
      command: ['node', '-e', "setInterval(() => {}, 60000)"],
    });
    expect(result.exitCode).toBe(null);
    expect(result.reason).toBe('hung');
    expect(result.durationMs).toBeLessThan(2000);
  });

  it('a step that prints a marker-like line and then exits 0 by itself is NOT killed', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    const runner = new StepRunner({ logDir, timeoutMs: 10_000, hangMs: 5000, pollMs: 100 });
    const result = await runner.run({
      step: 'exit-after-print',
      command: ['node', '-e', "console.log('BUILT OK'); process.exit(0)"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBeUndefined();
  });

  it('JSON shape for a natural exit is exactly {step, command, exitCode, durationMs, log} (no reason)', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    const runner = new StepRunner({ logDir, timeoutMs: 5000 });
    const result = await runner.run({ step: 'shape', command: ['node', '-e', 'process.exit(0)'] });
    expect(Object.keys(result).sort()).toEqual(['command', 'durationMs', 'exitCode', 'log', 'step']);
  });

  it('JSON shape for a killed step adds a reason field', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    const runner = new StepRunner({ logDir, timeoutMs: 150, hangMs: 60_000, pollMs: 50 });
    const result = await runner.run({ step: 'killed', command: ['node', '-e', "setInterval(() => {}, 60000)"] });
    expect(Object.keys(result).sort()).toEqual(['command', 'durationMs', 'exitCode', 'log', 'reason', 'step']);
    expect(result.reason).toBe('timeout');
  });

  it('a failed step is never retried (spawned exactly once)', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    let spawnCalls = 0;
    const spawnFn = (cmd, args, opts) => {
      spawnCalls++;
      return spawn(cmd, args, opts);
    };
    const runner = new StepRunner({ logDir, spawnFn, timeoutMs: 5000 });
    const result = await runner.run({ step: 'fail-once', command: ['node', '-e', 'process.exit(7)'] });
    expect(spawnCalls).toBe(1);
    expect(result.exitCode).toBe(7);
  });

  it('streams stdout and stderr to the log file', async () => {
    const root = makeRoot();
    const logDir = path.join(root, 'logs');
    const runner = new StepRunner({ logDir, timeoutMs: 5000 });
    const result = await runner.run({
      step: 'streams',
      command: ['node', '-e', "console.log('out line'); console.error('err line'); process.exit(0)"],
    });
    const content = readFileSync(result.log, 'utf-8');
    expect(content).toContain('out line');
    expect(content).toContain('err line');
  });

  it('defaultCpuSampler returns a finite, non-negative number for a real child process tree', async () => {
    const child = spawn('node', ['-e', "setInterval(() => { for (let i = 0; i < 100000; i++) { /* burn */ } }, 10); setTimeout(() => process.exit(0), 300);"]);
    try {
      await new Promise((r) => setTimeout(r, 80));
      expect(child.pid).toBeDefined();
      const cpu = await defaultCpuSampler(/** @type {number} */ (child.pid));
      expect(typeof cpu).toBe('number');
      expect(Number.isFinite(cpu)).toBe(true);
      expect(cpu).toBeGreaterThanOrEqual(0);
    } finally {
      try { child.kill('SIGKILL'); } catch { /* already dead */ }
    }
  });
});
