// Probe used by the dist-import gate: import the built package under Vitest/jsdom.
import { describe, expect, it } from "vitest";

const isModuleExports = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

describe("dist runtime import", () => {
  it("imports the built package and its family entries", async () => {
    const root: unknown = await import("../dist/index.js");
    if (!isModuleExports(root)) {
      throw new Error(
        "Expected the built root entry to export a module object"
      );
    }
    expect(Object.keys(root).length).toBeGreaterThan(50);
    await Promise.all(
      [
        "create-event",
        "event-detail-panel",
        "week-grid",
        "month-grid",
        "world-clocks",
        "i18n",
      ].map(async (entry) => {
        const moduleExports: unknown = await import(`../dist/${entry}.js`);
        if (!isModuleExports(moduleExports)) {
          throw new Error(`Expected ${entry} to export a module object`);
        }
        expect(Object.keys(moduleExports).length).toBeGreaterThan(0);
      })
    );
  });
});
