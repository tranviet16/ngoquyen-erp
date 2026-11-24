import { describe, expect, it, vi } from "vitest";
import { projectUsesBook, type BookPresenceDb } from "../book-presence";

function db(txCount: number, estCount: number) {
  const fake = {
    projectTransaction: { count: vi.fn(async () => txCount) },
    projectEstimate: { count: vi.fn(async () => estCount) },
  };
  return { fake, asDb: fake as unknown as BookPresenceDb };
}

describe("projectUsesBook", () => {
  it.each([
    ["a superseded or book-derived transaction", 1, 0],
    ["a superseded estimate", 0, 1],
    ["both", 2, 3],
  ])("is true with %s", async (_name, tx, est) => {
    expect(await projectUsesBook(db(tx, est).asDb, 4)).toBe(true);
  });

  it("is false when the project has no trace of the book", async () => {
    expect(await projectUsesBook(db(0, 0).asDb, 4)).toBe(false);
  });

  it("scopes both counts to the project with the import guard's exact conditions", async () => {
    const { fake, asDb } = db(0, 0);
    await projectUsesBook(asDb, 4);
    expect(fake.projectTransaction.count).toHaveBeenCalledWith({
      where: { projectId: 4, OR: [{ supersededByRunId: { not: null } }, { sourceInvoiceLineId: { not: null }, deletedAt: null }] },
    });
    expect(fake.projectEstimate.count).toHaveBeenCalledWith({ where: { projectId: 4, supersededByRunId: { not: null } } });
  });
});
