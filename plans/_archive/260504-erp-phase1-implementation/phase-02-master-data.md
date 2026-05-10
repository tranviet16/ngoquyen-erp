---
phase: 2
title: "Master Data (Entities, Suppliers, Contractors, Projects, Items)"
status: completed
priority: P1
effort: "1w"
dependencies: [1]
---

# Phase 2: Master Data

## Overview
CRUD đầy đủ cho 6 bảng master làm nền tảng cho mọi module nghiệp vụ. UI form chuẩn (không grid).

## Requirements
**Functional:**
- CRUD: `entities`, `suppliers`, `contractors`, `projects`, `project_categories`, `items`
- Search + filter + pagination cho list view
- Soft delete (`deleted_at`) thay vì hard delete (giữ FK toàn vẹn cho lịch sử)
- Mỗi bản ghi master có nút "Xem nơi đang dùng" (sẽ implement sau khi có module)

**Non-functional:**
- Form validation Zod cả client + server
- Unique constraint trên code/name có ý nghĩa

## Architecture
**Schema** (thêm vào `prisma/schema.prisma`):
```prisma
model Entity {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  type      String   // "company" | "person"
  note      String?
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Supplier {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  taxCode   String?
  phone     String?
  address   String?
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Contractor {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  leader    String?
  contact   String?
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Project {
  id              Int      @id @default(autoincrement())
  code            String   @unique
  name            String
  ownerInvestor   String?
  contractValue   Decimal? @db.Decimal(18,2)
  startDate       DateTime?
  endDate         DateTime?
  status          String   @default("active")
  categories      ProjectCategory[]
  deletedAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model ProjectCategory {
  id         Int     @id @default(autoincrement())
  projectId  Int
  code       String  // vd "1. Chuẩn Bị Mặt Bằng"
  name       String
  sortOrder  Int     @default(0)
  project    Project @relation(fields: [projectId], references: [id])
  deletedAt  DateTime?
  @@unique([projectId, code])
}

model Item {
  id        Int      @id @default(autoincrement())
  code      String   @unique          // vd "MON-001"
  name      String
  unit      String                    // ĐVT
  type      String                    // "material" | "labor" | "machine"
  note      String?
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**UI:** Mỗi master = 1 trang `/master-data/{slug}` với layout:
- Header: tên + nút "Thêm mới"
- Search bar + filter
- Table list (shadcn Table, không cần AG Grid)
- Form dialog (shadcn Dialog) cho create/edit

## Related Code Files
**Create:**
- `app/(app)/master-data/page.tsx` (hub liệt kê 6 master)
- `app/(app)/master-data/entities/page.tsx`, `[id]/edit/page.tsx`
- `app/(app)/master-data/suppliers/page.tsx`, `[id]/edit/page.tsx`
- `app/(app)/master-data/contractors/page.tsx`, `[id]/edit/page.tsx`
- `app/(app)/master-data/projects/page.tsx`, `[id]/edit/page.tsx`, `[id]/categories/page.tsx`
- `app/(app)/master-data/items/page.tsx`, `[id]/edit/page.tsx`
- `lib/master-data/{entity,supplier,contractor,project,item}-service.ts` (server actions, Zod schema)
- `components/master-data/{entity,supplier,...}-form.tsx`
- `components/data-table.tsx` (shared list component)
- `prisma/seed-master.ts` (seed sample data từ Cài Đặt sheets)

**Modify:**
- `prisma/schema.prisma`

## Implementation Steps
1. Mở rộng `prisma/schema.prisma` với 6 model trên
2. `prisma migrate dev --name add-master-data`
3. Tạo `lib/master-data/*-service.ts` với server actions: `list`, `create`, `update`, `softDelete`
4. Zod schema chung trong từng service
5. Build shared `<DataTable>` component
6. Build từng trang master (list + dialog form)
7. Seed script từ sheet "Cài Đặt" của các Excel (Suppliers, Items, Categories...)
8. Test CRUD từng master qua UI + verify audit log có ghi
9. RBAC: chỉ `admin` được xóa, `ketoan` + `admin` được tạo/sửa, các role khác chỉ xem

## Success Criteria
- [ ] CRUD 6 master qua UI, không lỗi
- [ ] Soft delete giữ data (record vẫn query được khi `includeDeleted: true`)
- [ ] Unique constraint hoạt động (test tạo trùng tên)
- [ ] Seed import được ≥30 supplier, ≥10 project, ≥50 item từ Excel hiện tại
- [ ] Audit log ghi đầy đủ
- [ ] RBAC enforce đúng

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Tên NCC trong Excel viết khác nhau ("Quang Minh" vs "QM cát gạch") | Seed script log conflict; user merge thủ công sau |
| ProjectCategory phụ thuộc Project → seed phải đúng thứ tự | Seed `projects` trước rồi `categories` |
| Item code trùng giữa các Excel | Generate unique prefix theo nhóm nếu phát hiện |
