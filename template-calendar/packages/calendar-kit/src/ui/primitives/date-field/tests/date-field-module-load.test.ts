import { afterEach, expect as assert, it, vi } from "vitest";

// Loads the date field's import graph while the file is collected. The test below resets the
// module registry and imports again, which then only re-evaluates the modules; the cold
// transform (the ui-kit calendar alone is about 1.5s) would otherwise count against the test
// timeout and miss it when the whole suite runs in parallel.
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
