/**
 * Thin wrapper over `autocannon` for the load suite.
 *
 * autocannon is npm-native (no system binary, unlike k6 — KISS). `runLoad`
 * fires a short burst at one URL and returns the stats the assertions need.
 * Load tests are ON-DEMAND / nightly only — they are slow and noisy on shared
 * CI runners, so they must NOT run on every PR (see endpoints.load.test.ts).
 */
import autocannon from "autocannon";

export interface LoadResult {
  /** autocannon has no p95 bucket — p97_5 is the nearest, slightly stricter. */
  p95: number;
  p99: number;
  throughput: number;
  non2xx: number;
  total: number;
}

export interface LoadOpts {
  connections?: number;
  duration?: number;
  headers?: Record<string, string>;
}

export async function runLoad(url: string, opts: LoadOpts = {}): Promise<LoadResult> {
  const result = await autocannon({
    url,
    connections: opts.connections ?? 10,
    duration: opts.duration ?? 15,
    headers: opts.headers,
  });

  // autocannon counts 3xx separately; treat anything outside 2xx as non2xx.
  const non2xx = result.non2xx + (result["3xx"] ?? 0);
  const latency = result.latency as unknown as Record<string, number>;
  return {
    p95: latency.p97_5,
    p99: latency.p99,
    throughput: result.requests.average,
    non2xx,
    total: result.requests.total,
  };
}

/** True if a server is answering at `baseUrl` — load tests skip when false. */
export async function serverReachable(baseUrl: string): Promise<boolean> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2000);
    await fetch(baseUrl, { signal: ac.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}
