---
phase: 4
title: Patch actions per resource
status: completed
priority: P2
effort: 1d
dependencies:
  - 2
  - 3
---

# Phase 4: Patch actions per resource

## Overview

Cài patch server action cho mỗi resource (entity, supplier, contractor, item, project, du-an, vay) để hỗ trợ inline-edit. Mỗi action whitelist field cho phép sửa (theo phân loại "safe" trong brainstorm); validate Zod; `requireRole`; audit qua middleware Prisma.

## Requirements

- Functional:
  - `patchEntity(id, patch)`, `patchSupplier`, `patchContractor`, `patchItem`, `patchProject`, `patchDuAn`, `patchLoan` (tên đúng theo convention dự án).
  - Whitelist field per resource — field ngoài whitelist → throw.
  - Validate qua Zod schema riêng (`patchEntitySchema` ...).
  - RBAC: dùng vai trò hiện có (ketoan cho phần lớn; admin cho field nhạy cảm như `isActive` của entity?). Quyết định per resource trong impl.
  - Wire vào `<DataTable>` qua `onCellEdit` prop ở client component mỗi trang.
- Non-functional:
  - Reuse audit middleware Prisma (đã capture diff tự động).
  - Trả về row sau update để client reconcile.

## Architecture

Pattern per resource:
```
lib/master-data/<resource>/actions.ts:
  const PATCH_WHITELIST = ["name", "code", "note", "isActive"] as const;

  const patchEntitySchema = z.object({
    name: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    note: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  });

  export async function patchEntity(id: number, patch: Record<string, unknown>) {
    const role = await getSessionRole();
    requireRole(role, "ketoan");

    const keys = Object.keys(patch);
    for (const k of keys) {
      if (!PATCH_WHITELIST.includes(k)) {
        throw new Error(`Field ${k} không được phép inline edit`);
      }
    }

    const data = patchEntitySchema.parse(patch);
    const updated = await prisma.entity.update({ where: { id }, data });
    revalidatePath("/master-data/entities");
    return updated;
  }
```

Inline-edit field allow theo phân loại brainstorm:

| Resource | Inline fields (safe) |
|---|---|
| Entity | name, code, taxCode, address, phone, email, note, isActive |
| Supplier | name, taxCode, phone, email, address, note, isActive |
| Contractor | name, taxCode, phone, note, isActive |
| Item | name, code, unit, unitPrice, vatPct, note, isActive |
| Project | name, code, note, status (enum), isActive |
| DuAn | (kiểm cấu trúc, có thể thêm name, code, status) |
| Loan | (kiểm — có thể chỉ note, status; số tiền nên qua form) |

KHÔNG inline: FK (entityId, projectId), Date nghiệp vụ (startDate, dueDate), audit (createdAt, deletedAt, createdBy).

## Related Code Files

- Create per resource: `lib/master-data/<resource>/actions.ts` (hoặc mở rộng file existing).
- Modify per resource: `*-client.tsx` — pass `onCellEdit={patchXxx}`.
- Modify per resource: `table-spec.ts` (Phase 3) — đánh dấu `editable: true` cho field whitelist.

## Implementation Steps

1. Audit field hiện có per resource — quyết định inline list cuối cùng (đối chiếu schema Prisma + form hiện có).

2. Per resource, tạo `actions.ts`:
   - Define `PATCH_WHITELIST` constant.
   - Define Zod schema.
   - Define `patchXxx(id, patch)` action.
   - `revalidatePath` đúng path list của resource.

3. Per resource, update `table-spec.ts`:
   - Thêm `editable: true, editKind: "text" | "number" | "boolean" | "select"` cho cột inline.
   - `editOptions` cho select kind.

4. Per `*-client.tsx`:
   - Import `patchXxx`.
   - Wrapper async (rowId, key, value) => `patchXxx(rowId, { [key]: value })`.
   - Pass vào `<DataTable onCellEdit>`.

5. Unit tests cho mỗi `patchXxx`:
   - Reject field ngoài whitelist.
   - Reject Zod fail (empty name, invalid email).
   - RBAC reject (role thiếu quyền).
   - Happy path: update + return row.

6. Manual test:
   - Dblclick cell → input → Enter → save → refresh hiện giá trị mới.
   - Cell readonly (FK, audit) không trigger edit.
   - Filter sau edit vẫn nhất quán.

7. `npx tsc --noEmit && npm run lint && npx vitest run`.

## Success Criteria

- [ ] 7 patch actions tồn tại, có whitelist + Zod + RBAC.
- [ ] Test reject field ngoài whitelist pass.
- [ ] Inline-edit hoạt động trên ≥3 resource end-to-end.
- [ ] Audit log có entry cho mỗi inline patch (verify qua psql).
- [ ] FK/date/audit fields không có ô edit.
- [ ] `vitest run` xanh.

## Risk Assessment

- **Patch ghi đè field nhạy cảm**: whitelist là gate chính. Code review kỹ.
- **Audit middleware miss inline patch**: middleware hiện capture `prisma.X.update` → tự động cover. Verify trong test.
- **Race với router.refresh()**: optimistic UI ở Phase 2 đã handle; verify dirty count → beforeunload warning.
- **Conflict với form modal Sửa hiện có**: form vẫn dùng cùng schema validate (set toàn bộ field). Patch chỉ là partial. OK nếu cả 2 đi qua Prisma update → audit đúng.
- **Field validation cross-resource (vd tên trùng)**: Zod chỉ validate format. Constraint DB (unique) sẽ throw P2002 → catch và toast.
