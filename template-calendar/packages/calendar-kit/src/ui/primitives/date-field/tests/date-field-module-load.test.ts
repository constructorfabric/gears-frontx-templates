import { afterEach, expect as assert, it, vi } from "vitest";

// Loads the import graph at collection time; the test below re-imports, which only re-evaluates.
// Without this, the cold transform (~1.5s) would count against the test timeout in parallel runs.
import "../date-field";

afterEach(() => {
  vi.unstubAllGlobals();
});

// The package root is imported where there is no DOM (SSR, dev mock servers), so loading the
// module must not construct DOM objects.
it("loads without DOMRect", async () => {
  vi.resetModules();
  vi.stubGlobal("DOMRect", undefined);

  await assert(import("../date-field")).resolves.toHaveProperty("DateField");
});
