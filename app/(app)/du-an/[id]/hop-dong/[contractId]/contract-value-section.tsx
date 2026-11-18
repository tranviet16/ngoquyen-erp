/**
 * Phần 2 "Giá trị": hai thẻ DT / TT của hợp đồng, giá trị HĐ ghi ở thông tin dự án (hợp đồng CĐT) và
 * các băng: nhóm gộp nhiều hợp đồng, lệch giá trị dự án.
 */
import Link from "next/link";
import { formatNumber } from "@/lib/utils/format";
import type { ContractFigures } from "@/lib/du-an/contract-detail/types";

function ValueCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value == null ? <span className="text-muted-foreground">Chưa nhập</span> : formatNumber(value)}</div>
    </div>
  );
}

interface Props {
  projectId: number;
  valueDt: string | null;
  valueTt: string | null;
  figures: ContractFigures;
  partyLabel: string;
  groupMembers: { id: number; docName: string }[];
}

export function ContractValueSection({ projectId, valueDt, valueTt, figures, partyLabel, groupMembers }: Props) {
  const g = figures.group;
  const cdt = figures.partyKind === "cdt" ? figures.cdt : null;
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Giá trị hợp đồng</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <ValueCard label="Giá trị theo DT" value={valueDt} />
        <ValueCard label="Giá trị theo TT" value={valueTt} />
        {cdt && <ValueCard label="Giá trị HĐ ghi ở thông tin dự án" value={cdt.projectContractValue} />}
      </div>
      {cdt?.projectValueMismatch && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Giá trị HĐ ở thông tin dự án ({formatNumber(cdt.projectContractValue)}) lệch tổng giá trị DT của các hợp đồng CĐT ({formatNumber(cdt.cdtContractsValueDt)}).
        </div>
      )}
      {g.contractIds.length >= 2 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Công trình có {g.contractIds.length} hợp đồng với {partyLabel}:{" "}
          {groupMembers.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ", "}
              <Link className="underline" href={`/du-an/${projectId}/hop-dong/${m.id}`}>{m.docName}</Link>
            </span>
          ))}
          . Số liệu bên dưới gộp chung {g.contractIds.length} hợp đồng và so với tổng giá trị: DT {formatNumber(g.valueDt.sum)}, TT {formatNumber(g.valueTt.sum)}.
        </div>
      )}
    </section>
  );
}
