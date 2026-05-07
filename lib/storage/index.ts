import { LocalDiskStore, type FileStore } from "./local-disk";

declare global {
  // eslint-disable-next-line no-var
  var __nq_file_store: FileStore | undefined;
}

const root = process.env.UPLOAD_DIR ?? "./uploads";

export const store: FileStore = globalThis.__nq_file_store ?? new LocalDiskStore(root);
if (!globalThis.__nq_file_store) globalThis.__nq_file_store = store;

export type { FileStore } from "./local-disk";
export { safeFilename } from "./local-disk";
