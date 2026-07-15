import { describe, it, expect } from "vitest";
import { isAdmin } from "@/lib/rbac";

describe("isAdmin", () => {
  it("is true only for the exact 'admin' role", () => {
    expect(isAdmin("admin")).toBe(true);
    for (const r of ["ketoan", "viewer", "", null, undefined]) {
      expect(isAdmin(r as string | null)).toBe(false);
    }
  });
});
