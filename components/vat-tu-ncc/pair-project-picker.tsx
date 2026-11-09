"use client";

/**
 * Ngữ cảnh cặp NCC × công trình cho các trang `/vat-tu-ncc/[supplierId]/*`.
 *
 *  - `SupplierPairNav`: thanh tab + thanh ngữ cảnh "NCC × Công trình". Đọc `?projectId=` bằng
 *    `useSearchParams` (layout không nhận searchParams) và giữ tham số khi đổi tab. Đổi công trình
 *    ở trang chi tiết kỳ đối chiếu thì quay về danh sách kỳ của công trình mới (kỳ thuộc một cặp).
 *  - `PairProjectPicker`: bộ chọn công trình khi tab theo cặp thiếu `?projectId=`.
 *
 * `revalidatePath` theo NCC vẫn áp dụng vì tham số query không đổi path.
 */

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseProjectIdParam } from "./project-id-param";

export interface PairProjectOption {
  id: number;
  code: string;
  name: string;
}

export interface SupplierTab {
  /** Đoạn sau `/vat-tu-ncc/[supplierId]`, ví dụ "/chot-ky". */
  href: string;
  label: string;
}

const projectLabel = (p: PairProjectOption) => `${p.code} — ${p.name}`;

const selectClass = "h-8 rounded-md border border-input bg-transparent px-2 text-sm";

// ─── Thanh tab + ngữ cảnh ─────────────────────────────────────────────────────

interface NavProps {
  supplierId: number;
  supplierName: string;
  tabs: SupplierTab[];
  /** Công trình NCC đã có hoạt động vật tư — xếp đầu danh sách chọn. */
  supplierProjects: PairProjectOption[];
  /** Mọi công trình đang hoạt động — để chọn cặp mới. */
  allProjects: PairProjectOption[];
}

export function SupplierPairNav({ supplierId, supplierName, tabs, supplierProjects, allProjects }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = parseProjectIdParam(searchParams.get("projectId"));
  const basePath = `/vat-tu-ncc/${supplierId}`;
  const query = projectId != null ? `?projectId=${projectId}` : "";

  const knownIds = new Set(supplierProjects.map((p) => p.id));
  const otherProjects = allProjects.filter((p) => !knownIds.has(p.id));
  const current =
    projectId == null ? null : (supplierProjects.find((p) => p.id === projectId) ?? allProjects.find((p) => p.id === projectId));

  function changeProject(next: number | null) {
    // Kỳ đối chiếu thuộc đúng một cặp → đổi công trình ở trang chi tiết thì về danh sách kỳ.
    const onReconDetail = /\/doi-chieu\/\d+\/?$/.test(pathname);
    const targetPath = onReconDetail ? `${basePath}/doi-chieu` : pathname;
    const params = onReconDetail ? new URLSearchParams() : new URLSearchParams(searchParams.toString());
    if (next == null) params.delete("projectId");
    else params.set("projectId", String(next));
    const qs = params.toString();
    router.push(qs ? `${targetPath}?${qs}` : targetPath);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="text-muted-foreground">NCC × Công trình:</span>
        <span className="font-medium">{supplierName}</span>
        <span className="text-muted-foreground">×</span>
        <select
          aria-label="Công trình"
          className={cn(selectClass, "max-w-xs")}
          value={projectId ?? ""}
          onChange={(e) => changeProject(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Tất cả công trình</option>
          {supplierProjects.length > 0 && (
            <optgroup label="Đã có hoạt động với NCC">
              {supplierProjects.map((p) => (
                <option key={p.id} value={p.id}>{projectLabel(p)}</option>
              ))}
            </optgroup>
          )}
          {otherProjects.length > 0 && (
            <optgroup label="Công trình khác">
              {otherProjects.map((p) => (
                <option key={p.id} value={p.id}>{projectLabel(p)}</option>
              ))}
            </optgroup>
          )}
          {projectId != null && !current && <option value={projectId}>Công trình #{projectId}</option>}
        </select>
        {projectId == null && (
          <span className="text-xs text-muted-foreground">
            Chốt kỳ, đối chiếu, thanh toán làm theo từng công trình — chọn công trình để tiếp tục.
          </span>
        )}
        {current && (
          <Link href={`/vat-tu-ncc/cong-trinh/${current.id}`} className="ml-auto text-xs text-primary hover:underline">
            Các NCC của công trình này →
          </Link>
        )}
      </div>

      <div className="border-b overflow-x-auto">
        <nav className="flex gap-0 min-w-max">
          {tabs.map((tab) => {
            const href = `${basePath}${tab.href}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={tab.href}
                href={`${href}${query}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-primary hover:text-primary",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/** Bản tĩnh của thanh tab (không đọc query) — fallback khi `useSearchParams` đang treo. */
export function SupplierTabsFallback({ supplierId, tabs }: { supplierId: number; tabs: SupplierTab[] }) {
  return (
    <div className="border-b overflow-x-auto">
      <nav className="flex gap-0 min-w-max">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={`/vat-tu-ncc/${supplierId}${tab.href}`}
            className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground whitespace-nowrap"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

// ─── Bộ chọn công trình khi thiếu ?projectId= ────────────────────────────────

interface PickerProps {
  supplierId: number;
  /** Đoạn đường dẫn tab dưới `/vat-tu-ncc/[supplierId]/`, ví dụ "chot-ky". */
  tab: string;
  supplierProjects: PairProjectOption[];
  allProjects: PairProjectOption[];
}

export function PairProjectPicker({ supplierId, tab, supplierProjects, allProjects }: PickerProps) {
  const router = useRouter();
  const knownIds = new Set(supplierProjects.map((p) => p.id));
  const otherProjects = allProjects.filter((p) => !knownIds.has(p.id));
  const [other, setOther] = useState("");
  const hrefFor = (projectId: number) => `/vat-tu-ncc/${supplierId}/${tab}?projectId=${projectId}`;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Công nợ vật tư theo dõi theo từng NCC × công trình. Chọn công trình để tiếp tục.
      </p>
      {supplierProjects.length === 0 ? (
        <p className="rounded-md border px-3 py-4 text-sm text-muted-foreground">
          NCC chưa có phiếu, giao dịch hay kỳ đối chiếu ở công trình nào. Thêm phiếu ở tab &quot;Vật tư ngày&quot; trước,
          hoặc chọn công trình bên dưới.
        </p>
      ) : (
        <ul className="divide-y rounded-md border text-sm" aria-label="Công trình của NCC">
          {supplierProjects.map((p) => (
            <li key={p.id}>
              <Link href={hrefFor(p.id)} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50">
                <span className="font-medium">{p.code}</span>
                <span className="text-muted-foreground">{p.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {otherProjects.length > 0 && (
        <form
          className="flex flex-wrap items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (other) router.push(hrefFor(Number(other)));
          }}
        >
          <label htmlFor="pair-project-other" className="text-muted-foreground">
            Công trình khác:
          </label>
          <select
            id="pair-project-other"
            className={cn(selectClass, "max-w-xs")}
            value={other}
            onChange={(e) => setOther(e.target.value)}
          >
            <option value="">— Chọn công trình —</option>
            {otherProjects.map((p) => (
              <option key={p.id} value={p.id}>{projectLabel(p)}</option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline" disabled={!other}>
            Mở
          </Button>
        </form>
      )}
    </div>
  );
}
