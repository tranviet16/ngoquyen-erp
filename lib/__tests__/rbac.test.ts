import { describe, it, expect } from "vitest";
import { hasRole, requireRole, isAdmin, ALL_ROLES, type AppRole } from "@/lib/rbac";

// Hierarchy levels: admin 100 > ketoan 80 > chihuy_ct 60 > canbo_vt 40 > viewer 10
const LEVEL: Record<AppRole, number> = {
  admin: 100,
  ketoan: 80,
  chihuy_ct: 60,
  canbo_vt: 40,
  viewer: 10,
};

describe("hasRole", () => {
  it("grants access when the user's level meets or exceeds the required level", () => {
    for (const user of ALL_ROLES) {
      for (const required of ALL_ROLES) {
        expect(hasRole(user, required)).toBe(LEVEL[user] >= LEVEL[required]);
      }
    }
  });

  it("denies access for null / undefined / unknown roles", () => {
    expect(hasRole(null, "viewer")).toBe(false);
    expect(hasRole(undefined, "viewer")).toBe(false);
    expect(hasRole("superuser", "viewer")).toBe(false);
  });
});

describe("requireRole", () => {
  it("passes silently when the role is sufficient", () => {
    expect(() => requireRole("admin", "ketoan")).not.toThrow();
  });
  it("throws a Forbidden error when the role is insufficient", () => {
    expect(() => requireRole("viewer", "admin")).toThrow("Forbidden: requires role admin");
  });
});

describe("isAdmin", () => {
  it("is true only for the exact 'admin' role", () => {
    expect(isAdmin("admin")).toBe(true);
    for (const r of ["ketoan", "viewer", "", null, undefined]) {
      expect(isAdmin(r as string | null)).toBe(false);
    }
  });
});
