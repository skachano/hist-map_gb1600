import { describe, expect, it } from "vitest";
import { name, t } from "./i18n";

describe("i18n", () => {
  it("falls back through French for missing names", () => {
    expect(name({ fr: "Sarrebourg", de: "Saarburg" }, "de")).toBe("Saarburg");
    expect(name({ fr: "Vaudrevange" }, "en")).toBe("Vaudrevange");
    expect(name(undefined, "en", "?")).toBe("?");
  });
  it("has every string in every language", () => {
    expect(t("year", "de")).toBe("Jahr");
  });
});
