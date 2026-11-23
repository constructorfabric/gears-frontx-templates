
import { describe, expect as assert, it } from "vitest";

import { flattenDocLinks } from "../build-plugin";

describe("docs", () => {
  it("flatten repo-relative doc links for the flat dist/docs folder", () => {
    assert(
      flattenDocLinks(
        "[a](../../docs/i18n.md#per-component-overrides) [b](theming.md) [c](https://x.dev/a.md) [d](#top)"
      )
    ).toBe(
      "[a](i18n.md#per-component-overrides) [b](theming.md) [c](https://x.dev/a.md) [d](#top)"
    );
  });
});
