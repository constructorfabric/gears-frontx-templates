import { describe, expect, it } from "vitest";

import pkg from "../package.json";

const exportsMap: Record<string, unknown> = pkg.exports;

const DOCUMENTED_ENTRIES = [
  ".",
  "./core",
  "./react",
  "./i18n",
  "./grid",
  "./week-grid",
  "./day-grid",
  "./month-grid",
  "./agenda-view",
  "./calendar-toolbar",
  "./event-card",
  "./event-detail-panel",
  "./create-event",
  "./conflict-indicator",
  "./availability-grid",
  "./calendar-side-panel",
  "./month-navigator",
  "./search-results",
  "./time-zone-list",
  "./world-clocks",
  "./calendar-list",
  "./recurrence-scope-dialog",
  "./package.json",
  "./theme.css",
  "./reset.css",
  "./themes/example.css",
];

const INTERNAL_PATHS = [
  "./src/*",
  "./chunks/*",
  "./__test-utils__/*",
  "./core/*",
  "./react/*",
  "./ui/*",
  "./docs/*",
  "./i18n/*",
  "./styles/*",
];

describe("calendar-kit export map", () => {
  it("lists every documented entry with a target", () => {
    for (const entry of DOCUMENTED_ENTRIES) {
      expect(exportsMap[entry], entry).toBeTruthy();
    }
  });

  it("blocks internal paths with null or leaves them absent", () => {
    for (const path of INTERNAL_PATHS) {
      expect(exportsMap[path] ?? null, path).toBeNull();
    }
  });

  it("has no catch-all wildcard that would expose dist internals", () => {
    expect(exportsMap).not.toHaveProperty("./*");
  });
});
