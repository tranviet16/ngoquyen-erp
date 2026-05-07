import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import type { Readable } from "node:stream";

export interface FileStore {
  putFile(rel: string, body: Buffer): Promise<{ size: number }>;
  getStream(rel: string): Readable;
  deleteFile(rel: string): Promise<void>;
  exists(rel: string): Promise<boolean>;
}

function sanitizeRel(rel: string): string {
  if (!rel) throw new Error("Empty path");
  // Reject control chars, leading slash, drive letters, traversal segments.
  if (/[\x00-\x1f]/.test(rel)) throw new Error("Invalid path: control chars");
  if (rel.startsWith("/") || rel.startsWith("\\")) {
    throw new Error("Invalid path: must be relative");
  }
  if (/^[a-zA-Z]:/.test(rel)) throw new Error("Invalid path: drive letter");
  const norm = normalize(rel).replaceAll("\\", "/");
  if (norm.split("/").some((seg) => seg === "..")) {
    throw new Error("Invalid path: traversal");
  }
  return norm;
}

export class LocalDiskStore implements FileStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private resolveSafe(rel: string): string {
    const safe = sanitizeRel(rel);
    const full = resolve(this.root, safe);
    const rootWithSep = this.root.endsWith(sep) ? this.root : this.root + sep;
    if (full !== this.root && !full.startsWith(rootWithSep)) {
      throw new Error("Path escapes storage root");
    }
    return full;
  }

  async putFile(rel: string, body: Buffer): Promise<{ size: number }> {
    const full = this.resolveSafe(rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
    return { size: body.byteLength };
  }

  getStream(rel: string): Readable {
    const full = this.resolveSafe(rel);
    return createReadStream(full);
  }

  async deleteFile(rel: string): Promise<void> {
    const full = this.resolveSafe(rel);
    try {
      await unlink(full);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") throw err;
    }
  }

  async exists(rel: string): Promise<boolean> {
    const full = this.resolveSafe(rel);
    try {
      await stat(full);
      return true;
    } catch {
      return false;
    }
  }
}

export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\x00-\x1f]/g, "").replace(/[\\/:*?"<>|]/g, "_").trim();
  const out = cleaned || "file";
  return out.length > 200 ? out.slice(0, 200) : out;
}

export { join as joinStoragePath };
