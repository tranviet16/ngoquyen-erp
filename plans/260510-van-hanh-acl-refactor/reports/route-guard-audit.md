# Route Guard Audit

Generated: 2026-05-10 14:52:29

Scanned: `app/(app)/` (layout.tsx + page.tsx)

> **Protection model:** a file is protected if its own layout or any
> ancestor layout in `app/(app)/` contains `requireModuleAccess(`
> or `requireRole(`. Pages inherit protection from their layout.

## Summary

| Metric | Count |
|--------|-------|
| Total files scanned | 83 |
| Protected (own or ancestor guard) | 83 |
| **Unprotected** | **0** |

## Unprotected Files (0)

_All (app) route files are protected by a layout guard._

## Protected Files (83)

| File | Type | Guard Source |
|------|------|-------------|
| `admin/import/[runId]/page.tsx` | page | `admin/import/layout.tsx` |
| `admin/import/layout.tsx` | layout | `admin/import/layout.tsx` |
| `admin/import/page.tsx` | page | `admin/import/layout.tsx` |
| `admin/nguoi-dung/layout.tsx` | layout | `admin/nguoi-dung/layout.tsx` |
| `admin/nguoi-dung/page.tsx` | page | `admin/nguoi-dung/layout.tsx` |
| `admin/permissions/layout.tsx` | layout | `admin/permissions/layout.tsx` |
| `admin/permissions/modules/page.tsx` | page | `admin/permissions/layout.tsx` |
| `admin/permissions/page.tsx` | page | `admin/permissions/layout.tsx` |
| `admin/permissions/projects/page.tsx` | page | `admin/permissions/layout.tsx` |
| `admin/phong-ban/layout.tsx` | layout | `admin/phong-ban/layout.tsx` |
| `admin/phong-ban/page.tsx` | page | `admin/phong-ban/layout.tsx` |
| `cong-no-nc/bao-cao-thang/page.tsx` | page | `cong-no-nc/layout.tsx` |
| `cong-no-nc/chi-tiet/page.tsx` | page | `cong-no-nc/layout.tsx` |
| `cong-no-nc/layout.tsx` | layout | `cong-no-nc/layout.tsx` |
| `cong-no-nc/nhap-lieu/page.tsx` | page | `cong-no-nc/layout.tsx` |
| `cong-no-nc/page.tsx` | page | `cong-no-nc/layout.tsx` |
| `cong-no-nc/so-du-ban-dau/page.tsx` | page | `cong-no-nc/layout.tsx` |
| `cong-no-vt/bao-cao-thang/page.tsx` | page | `cong-no-vt/layout.tsx` |
| `cong-no-vt/chi-tiet/page.tsx` | page | `cong-no-vt/layout.tsx` |
| `cong-no-vt/layout.tsx` | layout | `cong-no-vt/layout.tsx` |
| `cong-no-vt/nhap-lieu/page.tsx` | page | `cong-no-vt/layout.tsx` |
| `cong-no-vt/page.tsx` | page | `cong-no-vt/layout.tsx` |
| `cong-no-vt/so-du-ban-dau/page.tsx` | page | `cong-no-vt/layout.tsx` |
| `dashboard/layout.tsx` | layout | `dashboard/layout.tsx` |
| `dashboard/page.tsx` | page | `dashboard/layout.tsx` |
| `du-an/[id]/cai-dat/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/[id]/cong-no/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/[id]/dinh-muc/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/[id]/dong-tien-3-ben/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/[id]/du-toan-dieu-chinh/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/[id]/du-toan/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/[id]/giao-dich/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/[id]/hop-dong/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/[id]/layout.tsx` | layout | `du-an/[id]/layout.tsx` |
| `du-an/[id]/nghiem-thu/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/[id]/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/[id]/phat-sinh/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/[id]/tien-do/page.tsx` | page | `du-an/[id]/layout.tsx` |
| `du-an/layout.tsx` | layout | `du-an/layout.tsx` |
| `du-an/page.tsx` | page | `du-an/layout.tsx` |
| `layout.tsx` | layout | `layout.tsx` |
| `master-data/contractors/page.tsx` | page | `master-data/layout.tsx` |
| `master-data/entities/page.tsx` | page | `master-data/layout.tsx` |
| `master-data/items/page.tsx` | page | `master-data/layout.tsx` |
| `master-data/layout.tsx` | layout | `master-data/layout.tsx` |
| `master-data/page.tsx` | page | `master-data/layout.tsx` |
| `master-data/projects/[id]/page.tsx` | page | `master-data/layout.tsx` |
| `master-data/projects/page.tsx` | page | `master-data/layout.tsx` |
| `master-data/suppliers/page.tsx` | page | `master-data/layout.tsx` |
| `sl-dt/bao-cao-dt/page.tsx` | page | `sl-dt/layout.tsx` |
| `sl-dt/bao-cao-sl/page.tsx` | page | `sl-dt/layout.tsx` |
| `sl-dt/cau-hinh/page.tsx` | page | `sl-dt/layout.tsx` |
| `sl-dt/chi-tieu/page.tsx` | page | `sl-dt/layout.tsx` |
| `sl-dt/layout.tsx` | layout | `sl-dt/layout.tsx` |
| `sl-dt/nhap-thang-moi/page.tsx` | page | `sl-dt/layout.tsx` |
| `sl-dt/page.tsx` | page | `sl-dt/layout.tsx` |
| `sl-dt/tien-do-nop-tien/page.tsx` | page | `sl-dt/layout.tsx` |
| `sl-dt/tien-do-xd/page.tsx` | page | `sl-dt/layout.tsx` |
| `tai-chinh/bao-cao-thanh-khoan/page.tsx` | page | `tai-chinh/layout.tsx` |
| `tai-chinh/layout.tsx` | layout | `tai-chinh/layout.tsx` |
| `tai-chinh/nhat-ky/page.tsx` | page | `tai-chinh/layout.tsx` |
| `tai-chinh/page.tsx` | page | `tai-chinh/layout.tsx` |
| `tai-chinh/phai-thu-tra/page.tsx` | page | `tai-chinh/layout.tsx` |
| `tai-chinh/phan-loai-chi-phi/page.tsx` | page | `tai-chinh/layout.tsx` |
| `tai-chinh/phan-loai-giao-dich/page.tsx` | page | `tai-chinh/layout.tsx` |
| `tai-chinh/vay/[id]/page.tsx` | page | `tai-chinh/layout.tsx` |
| `tai-chinh/vay/page.tsx` | page | `tai-chinh/layout.tsx` |
| `thong-bao/layout.tsx` | layout | `thong-bao/layout.tsx` |
| `thong-bao/page.tsx` | page | `thong-bao/layout.tsx` |
| `van-hanh/cong-viec/layout.tsx` | layout | `van-hanh/cong-viec/layout.tsx` |
| `van-hanh/cong-viec/page.tsx` | page | `van-hanh/cong-viec/layout.tsx` |
| `van-hanh/hieu-suat/page.tsx` | page | `van-hanh/hieu-suat/page.tsx` |
| `van-hanh/layout.tsx` | layout | `layout.tsx` |
| `van-hanh/phieu-phoi-hop/[id]/page.tsx` | page | `van-hanh/phieu-phoi-hop/layout.tsx` |
| `van-hanh/phieu-phoi-hop/layout.tsx` | layout | `van-hanh/phieu-phoi-hop/layout.tsx` |
| `van-hanh/phieu-phoi-hop/page.tsx` | page | `van-hanh/phieu-phoi-hop/layout.tsx` |
| `van-hanh/phieu-phoi-hop/tao-moi/page.tsx` | page | `van-hanh/phieu-phoi-hop/layout.tsx` |
| `vat-tu-ncc/[supplierId]/doi-chieu/page.tsx` | page | `vat-tu-ncc/layout.tsx` |
| `vat-tu-ncc/[supplierId]/layout.tsx` | layout | `vat-tu-ncc/layout.tsx` |
| `vat-tu-ncc/[supplierId]/ngay/page.tsx` | page | `vat-tu-ncc/layout.tsx` |
| `vat-tu-ncc/[supplierId]/thang/page.tsx` | page | `vat-tu-ncc/layout.tsx` |
| `vat-tu-ncc/layout.tsx` | layout | `vat-tu-ncc/layout.tsx` |
| `vat-tu-ncc/page.tsx` | page | `vat-tu-ncc/layout.tsx` |