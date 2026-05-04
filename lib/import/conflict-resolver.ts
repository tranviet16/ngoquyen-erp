import { prisma } from "@/lib/prisma";
import type { ConflictItem } from "./adapters/adapter-types";

/**
 * Simple fuzzy match: lower-case token overlap score (0..1).
 * Good enough for Vietnamese names with minor spelling differences.
 */
function tokenOverlap(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\s+/));
  const tokB = new Set(b.toLowerCase().split(/\s+/));
  let hits = 0;
  for (const t of tokA) if (tokB.has(t)) hits++;
  const denom = Math.max(tokA.size, tokB.size);
  return denom === 0 ? 0 : hits / denom;
}

function rank<T extends { name: string }>(
  sourceName: string,
  candidates: T[]
): { item: T; score: number }[] {
  return candidates
    .map((c) => ({ item: c, score: tokenOverlap(sourceName, c.name) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** Find supplier candidates for a given raw name from Excel */
export async function resolveSupplier(sourceName: string): Promise<ConflictItem> {
  const all = await prisma.supplier.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const ranked = rank(sourceName, all);
  return {
    sourceName,
    entityType: "supplier",
    candidates: ranked.map((r) => ({ id: r.item.id, name: r.item.name, score: r.score })),
  };
}

/** Find contractor candidates */
export async function resolveContractor(sourceName: string): Promise<ConflictItem> {
  const all = await prisma.contractor.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const ranked = rank(sourceName, all);
  return {
    sourceName,
    entityType: "contractor",
    candidates: ranked.map((r) => ({ id: r.item.id, name: r.item.name, score: r.score })),
  };
}

/** Find item candidates */
export async function resolveItem(sourceName: string): Promise<ConflictItem> {
  const all = await prisma.item.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const ranked = rank(sourceName, all);
  return {
    sourceName,
    entityType: "item",
    candidates: ranked.map((r) => ({ id: r.item.id, name: r.item.name, score: r.score })),
  };
}

/** Find project candidates */
export async function resolveProject(sourceName: string): Promise<ConflictItem> {
  const all = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const ranked = rank(sourceName, all);
  return {
    sourceName,
    entityType: "project",
    candidates: ranked.map((r) => ({ id: r.item.id, name: r.item.name, score: r.score })),
  };
}

/** Find entity (chủ thể) candidates */
export async function resolveEntity(sourceName: string): Promise<ConflictItem> {
  const all = await prisma.entity.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const ranked = rank(sourceName, all);
  return {
    sourceName,
    entityType: "entity",
    candidates: ranked.map((r) => ({ id: r.item.id, name: r.item.name, score: r.score })),
  };
}
