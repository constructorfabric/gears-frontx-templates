import { describe, expect as assert, it } from "vitest";

import { toAsciiDigits } from "../digits";

describe(toAsciiDigits, () => {
  it("maps localized digits to ASCII", () => {
    assert(toAsciiDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    assert(toAsciiDigits("۱۴:۳۰")).toBe("14:30");
  });

  it("keeps back-to-back mathematical digit styles apart", () => {
    assert(toAsciiDigits("𝟘𝟝")).toBe("05");
    assert(toAsciiDigits("𝟶𝟿")).toBe("09");
  });
});
