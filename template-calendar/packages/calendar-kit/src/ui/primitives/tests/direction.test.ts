import { describe, expect, it } from "vitest";
import { resolveDirection } from "../direction";

describe("resolveDirection", () => {
  it("reads dir from the host when the node sits inside a shadow root", () => {
    const host = document.createElement("div");
    host.dir = "rtl";
    document.body.append(host);
    const inner = document.createElement("button");
    host.attachShadow({ mode: "open" }).append(inner);

    expect(resolveDirection(inner)).toBe("rtl");

    host.remove();
  });

  it("reads dir from an outer host across nested shadow roots", () => {
    const outer = document.createElement("div");
    outer.dir = "rtl";
    document.body.append(outer);
    const innerHost = document.createElement("div");
    outer.attachShadow({ mode: "open" }).append(innerHost);
    const target = document.createElement("button");
    innerHost.attachShadow({ mode: "open" }).append(target);

    expect(resolveDirection(target)).toBe("rtl");

    outer.remove();
  });
});
