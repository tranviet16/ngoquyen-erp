import { cache } from "react";
import { prisma } from "../prisma";
import { MODULE_KEYS, type ModuleKey } from "./modules";

export const MODULE_AVAILABILITY_STATUSES = ["ready", "development"] as const;
export type ModuleAvailabilityStatus =
  (typeof MODULE_AVAILABILITY_STATUSES)[number];

export type ModuleAvailabilityMap = Readonly<
  Record<ModuleKey, ModuleAvailabilityStatus>
>;

const MODULE_KEY_SET = new Set<string>(MODULE_KEYS);

function developmentDefaults(): Record<ModuleKey, ModuleAvailabilityStatus> {
  return Object.fromEntries(
    MODULE_KEYS.map((moduleKey) => [moduleKey, "development"]),
  ) as Record<ModuleKey, ModuleAvailabilityStatus>;
}

function isModuleKey(value: string): value is ModuleKey {
  return MODULE_KEY_SET.has(value);
}

function isAvailabilityStatus(value: string): value is ModuleAvailabilityStatus {
  return (MODULE_AVAILABILITY_STATUSES as readonly string[]).includes(value);
}

/** Loads all rollout statuses in one request-cached query. */
export const loadModuleAvailabilityMap = cache(
  async (): Promise<ModuleAvailabilityMap> => {
    const availability = developmentDefaults();

    try {
      const rows = await prisma.moduleAvailability.findMany({
        select: { moduleKey: true, status: true },
      });
      let invalidCount = 0;

      for (const row of rows) {
        if (!isModuleKey(row.moduleKey) || !isAvailabilityStatus(row.status)) {
          invalidCount++;
          continue;
        }
        availability[row.moduleKey] = row.status;
      }

      const missingCount = MODULE_KEYS.reduce(
        (count, moduleKey) =>
          rows.some((row) => row.moduleKey === moduleKey) ? count : count + 1,
        0,
      );
      if (invalidCount > 0 || missingCount > 0) {
        console.error("[acl.module-availability] Invalid availability data; failing closed", {
          invalidCount,
          missingCount,
        });
      }
    } catch {
      console.error(
        "[acl.module-availability] Availability query failed; failing closed",
      );
    }

    return Object.freeze(availability);
  },
);

export async function getModuleAvailability(
  moduleKey: ModuleKey,
): Promise<ModuleAvailabilityStatus> {
  const availability = await loadModuleAvailabilityMap();
  return availability[moduleKey];
}

export async function isModuleReleased(moduleKey: ModuleKey): Promise<boolean> {
  return (await getModuleAvailability(moduleKey)) === "ready";
}

export async function isModuleInDevelopment(
  moduleKey: ModuleKey,
): Promise<boolean> {
  return !(await isModuleReleased(moduleKey));
}

export async function assertModuleReleased(moduleKey: ModuleKey): Promise<void> {
  if (!(await isModuleReleased(moduleKey))) {
    throw new Error(`Module "${moduleKey}" is in development`);
  }
}
