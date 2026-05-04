import { createHash } from "crypto";

/**
 * Compute SHA-256 hash of a buffer (hex string).
 * Used for idempotency: if same file hash already committed, warn admin.
 */
export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
