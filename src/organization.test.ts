import { describe, expect, it } from "vitest";
import { formatOrganizationLabel, pickDefaultOrganization } from "./organization.js";

describe("pickDefaultOrganization", () => {
  it("uses the first organization like the SaaS dashboard", () => {
    const picked = pickDefaultOrganization([
      { id: "org_primary", name: "Primary" },
      { id: "org_secondary", name: "Secondary" },
    ]);

    expect(picked).toEqual({
      id: "org_primary",
      name: "Primary",
      slug: undefined,
    });
  });

  it("returns undefined when no organizations exist", () => {
    expect(pickDefaultOrganization([])).toBeUndefined();
  });
});

describe("formatOrganizationLabel", () => {
  it("includes the name when available", () => {
    expect(formatOrganizationLabel({ id: "org_1", name: "Acme" })).toBe("Acme (org_1)");
  });
});
