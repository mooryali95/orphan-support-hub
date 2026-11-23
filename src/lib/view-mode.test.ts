import { describe, expect, it } from "vitest";
import { availableModes, canPledgeIn, modeOfPath, resolveMode } from "./view-mode";

describe("view modes", () => {
  it("an admin defaults to the admin mode and can switch to supporter", () => {
    const modes = availableModes({ roles: ["admin", "sponsor"] });
    expect(modes).toEqual(["admin", "supporter"]);
    expect(resolveMode(null, modes)).toBe("admin");
    expect(resolveMode("supporter", modes)).toBe("supporter");
  });

  it("a plain sponsor only has the supporter mode, whatever is stored", () => {
    const modes = availableModes({ roles: ["sponsor"] });
    expect(modes).toEqual(["supporter"]);
    expect(resolveMode("admin", modes)).toBe("supporter");
  });

  it("workspace relations add their modes", () => {
    const modes = availableModes({
      roles: ["sponsor"],
      workspaces: {
        supervisor: true,
        offices: [{ id: "o", name: "O" }],
        donor_entities: [],
        translator_locales: [{ code: "fr" }],
      },
    });
    expect(modes).toEqual(["supervisor", "office", "translator", "supporter"]);
  });

  it("maps role pages to their mode and leaves shared pages alone", () => {
    expect(modeOfPath("/admin")).toBe("admin");
    expect(modeOfPath("/dashboard")).toBe("supporter");
    expect(modeOfPath("/office/123")).toBe("office");
    expect(modeOfPath("/account")).toBeNull();
    expect(modeOfPath("/settings/notifications")).toBeNull();
  });

  it("personal support is recorded from the supporter mode only", () => {
    expect(canPledgeIn("supporter")).toBe(true);
    expect(canPledgeIn("admin")).toBe(false);
  });
});
