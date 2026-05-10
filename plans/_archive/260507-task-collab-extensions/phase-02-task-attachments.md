---
phase: 2
title: "Task Attachments"
status: pending
priority: P2
effort: "1d"
dependencies: [1]
---

# Phase 02: Task Attachments

## Overview
File uploads on each task. Local-disk storage today, S3/R2-ready interface for tomorrow. 25MB cap, MIME allowlist (pdf/jpg/png/xlsx/docx/zip). Anyone who can view the task can upload; uploader or dept leader can delete.

## Architecture

```
client (TaskDetailDrawer)
  └─ AttachmentList
       ├─ AttachmentItem (icon + name + size + download/delete)
       └─ AttachmentDropzone (drag-drop or click)
              ↓ FormData server action
         lib/task/attachment-service.ts
              ↓ lib/storage/local-disk.ts (interface)
         disk: ${UPLOAD_DIR}/task-attachments/{taskId}/{uuid}-{name}
              ↓ prisma
         TaskAttachment row (path, mime, size, uploaderId)

Download path:
  GET /api/tasks/[id]/attachments/[attId]
   → service checks canViewTask → streams file via getStream()
```

## Storage interface

`lib/storage/local-disk.ts`:

```ts
export interface FileStore {
  putFile(rel: string, body: Buffer | Readable): Promise<{ size: number }>;
  getStream(rel: string): Readable;
  deleteFile(rel: string): Promise<void>;
  exists(rel: string): Promise<boolean>;
}
```

Default impl: `LocalDiskStore` reading `process.env.UPLOAD_DIR ?? "./uploads"`. Sanitize `rel` against path traversal (no `..`, no leading `/`). When swapping to S3/R2: implement `S3Store` with same interface; only `lib/storage/index.ts` factory changes.

## Schema

```prisma
model TaskAttachment {
  id         Int      @id @default(autoincrement())
  taskId     Int
  uploaderId String
  filename   String   // original user-facing name
  storedPath String   // relative path in store, e.g. "task-attachments/12/abc-uuid-report.pdf"
  mimeType   String
  sizeBytes  Int
  createdAt  DateTime @default(now())

  task     Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  uploader User @relation("TaskAttachmentUploader", fields: [uploaderId], references: [id])

  @@index([taskId, createdAt])
  @@map("task_attachments")
}
```

Inverse relations: `Task.attachments TaskAttachment[]`, `User.taskAttachments TaskAttachment[] @relation("TaskAttachmentUploader")`.

Migration: `{ts}_add_task_attachments`.

## RBAC matrix

| Action | Admin | Leader (same dept) | Uploader | Other viewer |
|--------|-------|--------------------|----------|--------------|
| List | ✓ | ✓ | ✓ | ✓ (if can view task) |
| Upload | ✓ | ✓ | — | ✓ (if can view task) |
| Download | ✓ | ✓ | ✓ | ✓ (if can view task) |
| Delete | ✓ | ✓ | ✓ | ✗ |

## Validation

- `sizeBytes <= 25 * 1024 * 1024`
- `mimeType in ALLOWED_MIME` — `["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"]`
- Filename: strip path components, max 200 chars, replace control chars

## Related Code Files

**Create**
- `lib/storage/local-disk.ts` — `LocalDiskStore` impl
- `lib/storage/index.ts` — factory returning the configured store
- `lib/task/attachment-service.ts` — `listAttachments`, `uploadAttachment`, `deleteAttachment`, `getAttachmentForDownload`
- `lib/task/attachment-rbac.ts` — `canDeleteAttachment`
- `app/api/tasks/[id]/attachments/[attId]/route.ts` — GET handler streaming the file
- `app/(app)/cong-viec/attachments-actions.ts` — upload + delete server actions
- `components/cong-viec/attachment-list.tsx` — list with download links + delete button
- `components/cong-viec/attachment-dropzone.tsx` — drag-drop + file input
- `prisma/migrations/{ts}_add_task_attachments/migration.sql`

**Modify**
- `prisma/schema.prisma` — `TaskAttachment` model + inverse relations
- `lib/env.ts` — add `UPLOAD_DIR` (optional, default `./uploads`)
- `next.config.ts` — already has `bodySizeLimit: "25mb"` from earlier commit; verify
- `.gitignore` — add `uploads/`
- `components/cong-viec/task-detail-drawer.tsx` — mount `<AttachmentList />` + `<AttachmentDropzone />`

## Implementation Steps

1. `lib/storage/local-disk.ts`: implement `LocalDiskStore` with `putFile` (mkdir -p + writeFile), `getStream` (createReadStream), `deleteFile` (unlink, ignore ENOENT), `exists` (stat). Sanitize paths.
2. `lib/storage/index.ts`: export `const store: FileStore = new LocalDiskStore(env.UPLOAD_DIR ?? "./uploads")`.
3. Schema + migration. `prisma generate`.
4. RBAC: `lib/task/attachment-rbac.ts` — `canDeleteAttachment(att, ctx, role, task)` mirrors comment delete pattern.
5. Service: `lib/task/attachment-service.ts`
   - `uploadAttachment(taskId, file: File)`: validate size+mime → generate uuid → relPath = `task-attachments/${taskId}/${uuid}-${safeName}` → `store.putFile(relPath, buffer)` → `prisma.taskAttachment.create({...})` in single tx; if DB write fails, `store.deleteFile` to avoid orphan files.
   - `deleteAttachment(id)`: load + RBAC check → `store.deleteFile` → `prisma.taskAttachment.delete`. Order matters: file first; if file delete fails (e.g. already gone), still delete row.
   - `getAttachmentForDownload(id)`: load + view check → return `{ stream, filename, mimeType, sizeBytes }`.
6. API route `app/api/tasks/[id]/attachments/[attId]/route.ts`: GET handler, `runtime = "nodejs"`, returns `new Response(stream, { headers })` with `Content-Disposition: attachment; filename="..."` (RFC 5987 encode). Auth gate via `auth.api.getSession`.
7. Server actions: `attachments-actions.ts` — `uploadAction(formData)` and `deleteAction(id)`. `revalidatePath('/cong-viec')`.
8. UI:
   - Dropzone: hidden `<input type="file" multiple>` + drag handlers; on drop, validate client-side first (size/mime), then submit one upload per file with a per-file progress toast.
   - List: file icon based on mime, human-readable size, download link to API route, delete button (gated).
9. Mount in task drawer below `<CommentList />`.
10. Smoke: extend `scripts/smoke-plan-bc.ts` — upload pdf via service → list → assert appears → download via raw fetch (with cookie) → assert bytes match → delete → assert file removed from disk + row gone.

## Success Criteria

- [ ] Upload 24MB pdf succeeds; 26MB rejected with clear error
- [ ] Disallowed mime (`.exe`, `.html`) rejected
- [ ] Download serves correct bytes with original filename in `Content-Disposition`
- [ ] Path traversal attempt (filename `../../etc/passwd`) is sanitized — file stored under taskId folder regardless
- [ ] Delete removes both row and file; orphan file is also cleanable via service
- [ ] Cascading task delete removes attachment rows (file cleanup is best-effort via DB trigger or cron — accept orphan files for now)

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Path traversal via filename | High if not sanitized | UUID prefix + filename sanitization (no `..`, no `/`); store path is server-controlled |
| Disk fills up | Med | Per-task cap (e.g. 100 files / 200MB) — defer enforcement to monitoring |
| Orphan files after task delete | Low | Schedule a weekly cron (`scripts/cleanup-orphan-attachments.ts`) — defer |
| MIME spoofing (claim image/png, actual exe) | Low | Real fix needs magic-byte sniffing (`file-type` lib) — defer; allowlist + size cap is acceptable for internal ERP |
| Concurrent upload of same filename | Low | UUID prefix prevents collision |
| Volume mount missing in prod | High | Document `UPLOAD_DIR` requirement in deployment-guide; warn at boot if path unwritable |

## Out of scope

- Magic-byte MIME validation (defer)
- Image thumbnails / preview (defer — link is enough)
- Antivirus scanning (defer)
- S3/R2 implementation (interface ready, swap later)
