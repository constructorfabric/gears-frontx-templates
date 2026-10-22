import { describe, expect as assert, it } from "vitest";

import { getLocaleDirection } from "../direction";

describe(getLocaleDirection, () => {
  it.each(["ar_EG", "he_IL", "fa_IR", "ar-EG-u-nu-latn"])(
    "reads %s as right-to-left",
    (locale) => {
      assert(getLocaleDirection(locale)).toBe("rtl");
    }
  );

  it("reads left-to-right for an ordinary or unknown locale", () => {
    assert(getLocaleDirection("pt_BR")).toBe("ltr");
    assert(getLocaleDirection("not a locale")).toBe("ltr");
  });
});
