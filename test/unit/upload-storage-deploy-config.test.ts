import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

// Task attachments allow 25MB files (lib/task/attachment-service.ts MAX_ATTACHMENT_BYTES).
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function toBytes(size: string | number | undefined): number {
  if (typeof size === "number") return size;
  const match = /^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/i.exec(size ?? "");
  if (!match) throw new Error(`Unrecognised size: ${size}`);
  const unit = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[match[2].toLowerCase() as "b"];
  return Number(match[1]) * unit;
}

describe("upload body limits", () => {
  it("lets proxy buffer a full attachment upload instead of truncating it", () => {
    const experimental = nextConfig.experimental ?? {};
    const proxyLimit = toBytes(experimental.proxyClientMaxBodySize as string | number | undefined);
    const actionLimit = toBytes(experimental.serverActions?.bodySizeLimit as string | undefined);

    expect(actionLimit).toBeGreaterThanOrEqual(MAX_ATTACHMENT_BYTES);
    // Above the action limit, so an oversized body is rejected by the action, never cut short.
    expect(proxyLimit).toBeGreaterThan(actionLimit);
  });
});

describe("attachment storage in container deployments", () => {
  for (const file of ["docker-compose.erp-3001.yml", "docker-compose.prod.yml"]) {
    it(`${file} mounts a host directory at UPLOAD_DIR`, () => {
      const compose = readFileSync(join(process.cwd(), "docker", file), "utf8");

      expect(compose).toMatch(/^\s+UPLOAD_DIR: \/data\/uploads$/m);
      expect(compose).toMatch(/^\s+- [A-Za-z]:\/[^\s:]+\/uploads:\/data\/uploads$/m);
    });
  }
});
