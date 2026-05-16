/**
 * Endpoint load tests — ON-DEMAND / nightly ONLY, never on PR CI.
 *
 * Requires a running app (`npm run dev` on the load target). When no server is
 * reachable the whole suite SKIPS (not fails) — load tests are not part of the
 * fast PR pipeline. Run with: `npm run test:load` after starting the app.
 *
 * Each target asserts zero non-2xx responses and p95 latency under the ceiling
 * recorded in `baseline.json`. Ceilings start generous; tighten once a stable
 * baseline is observed over several runs.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { runLoad, serverReachable } from "./autocannon-runner";
import baseline from "../baseline.json";

const BASE_URL = process.env.LOAD_BASE_URL ?? "http://localhost:3000";

let reachable = false;
beforeAll(async () => {
  reachable = await serverReachable(BASE_URL);
});

const targets = Object.keys(baseline.load).filter((k) => k !== "_comment");

describe.skipIf(!process.env.RUN_LOAD)("endpoint load (on-demand)", () => {
  for (const path of targets) {
    it(`${path} — p95 under ceiling, zero non-2xx`, async () => {
      if (!reachable) {
        console.warn(`[load] ${BASE_URL} unreachable — skipping ${path}`);
        return;
      }
      const ceiling = (baseline.load as Record<string, number | string>)[path] as number;
      const r = await runLoad(`${BASE_URL}${path}`, { connections: 10, duration: 15 });
      expect(r.non2xx, `${path} returned ${r.non2xx} non-2xx responses`).toBe(0);
      expect(r.p95, `${path} p95 ${r.p95}ms exceeds ${ceiling}ms`).toBeLessThanOrEqual(ceiling);
    }, 30_000);
  }
});
