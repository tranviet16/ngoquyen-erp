import type { DetailRow, SubtotalRow, ViewMode } from "@/lib/cong-no-vt/balance-report-service";

interface Props {
  rows: DetailRow[];
  subtotals: SubtotalRow[];
  view: ViewMode;
  partyLabel: string;
}

// ─── Formatting ────────────────────────────────────────────────────────────────

function fmt(value: string): string {
  const n = parseInt(value, 10);
  if (isNaN(n)) return "0";
  return n.toLocaleString("vi-VN");
}

// ─── Subtotal lookup helpers ───────────────────────────────────────────────────

function findEntityPartySubtotal(
  subtotals: SubtotalRow[],
  entityId: number,
  partyId: number
): SubtotalRow | undefined {
  return subtotals.find(
    (s) => s.kind === "entity-party" && s.entityId === entityId && s.partyId === partyId
  );
}

function findEntitySubtotal(
  subtotals: SubtotalRow[],
  entityId: number
): SubtotalRow | undefined {
  return subtotals.find((s) => s.kind === "entity" && s.entityId === entityId);
}

// ─── Column definitions ────────────────────────────────────────────────────────

type ColId =
  | "phatSinhT"
  | "daTraT"
  | "noCuoiT"
  | "phatSinhCum"
  | "daTraCum"
  | "noCum";

interface ColDef {
  id: ColId;
  header: string;
}

const TRONG_THANG_COLS: ColDef[] = [
  { id: "phatSinhT", header: "Phát sinh T (đ)" },
  { id: "daTraT", header: "Đã trả T (đ)" },
  { id: "noCuoiT", header: "Nợ cuối T (đ)" },
];

const LUY_KE_COLS: ColDef[] = [
  { id: "phatSinhCum", header: "Phát sinh ∑ (đ)" },
  { id: "daTraCum", header: "Đã trả ∑ (đ)" },
  { id: "noCum", header: "Nợ ∑ (đ)" },
];

const CA_HAI_COLS: ColDef[] = [...TRONG_THANG_COLS, ...LUY_KE_COLS];

function getCols(view: ViewMode): ColDef[] {
  if (view === "trong-thang") return TRONG_THANG_COLS;
  if (view === "luy-ke") return LUY_KE_COLS;
  return CA_HAI_COLS;
}

function getVal(row: DetailRow | SubtotalRow, id: ColId): string {
  return row[id];
}

// ─── Build render structure ────────────────────────────────────────────────────

interface EntityGroup {
  entityId: number;
  entityName: string;
  partyGroups: PartyGroup[];
}

interface PartyGroup {
  partyId: number;
  partyName: string;
  detailRows: DetailRow[];
}

function buildGroups(rows: DetailRow[]): EntityGroup[] {
  const entityMap = new Map<number, EntityGroup>();
  const partyMap = new Map<string, PartyGroup>();

  for (const row of rows) {
    if (!entityMap.has(row.entityId)) {
      const eg: EntityGroup = {
        entityId: row.entityId,
        entityName: row.entityName,
        partyGroups: [],
      };
      entityMap.set(row.entityId, eg);
    }
    const eg = entityMap.get(row.entityId)!;

    const epKey = `${row.entityId}:${row.partyId}`;
    if (!partyMap.has(epKey)) {
      const pg: PartyGroup = { partyId: row.partyId, partyName: row.partyName, detailRows: [] };
      partyMap.set(epKey, pg);
      eg.partyGroups.push(pg);
    }
    partyMap.get(epKey)!.detailRows.push(row);
  }

  return [...entityMap.values()];
}

// ─── Subtotal row renderer ─────────────────────────────────────────────────────

function SubtotalTr({
  label,
  sub,
  cols,
  groupSpan,
}: {
  label: string;
  sub: SubtotalRow;
  cols: ColDef[];
  groupSpan: number;
}) {
  return (
    <tr className="bg-muted/60 font-semibold text-sm">
      <td
        colSpan={groupSpan}
        className="px-3 py-1.5 border text-left italic text-muted-foreground"
      >
        {label}
      </td>
      {cols.map((c) => (
        <td key={c.id} className="px-3 py-1.5 border text-right tabular-nums">
          {fmt(getVal(sub, c.id))}
        </td>
      ))}
    </tr>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function DetailReportTable({ rows, subtotals, view, partyLabel }: Props) {
  const cols = getCols(view);
  const groups = buildGroups(rows);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Không có dữ liệu phù hợp với bộ lọc hiện tại.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm border-collapse min-w-[700px]">
        <thead>
          <tr className="bg-muted text-left text-xs font-semibold uppercase tracking-wide">
            <th className="px-3 py-2 border sticky left-0 bg-muted z-10 min-w-[140px]">
              Chủ thể
            </th>
            <th className="px-3 py-2 border min-w-[160px]">{partyLabel}</th>
            <th className="px-3 py-2 border min-w-[160px]">Công trình</th>
            {cols.map((c) => (
              <th key={c.id} className="px-3 py-2 border text-right min-w-[120px]">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((eg) => {
            const entitySub = findEntitySubtotal(subtotals, eg.entityId);
            const entityRowSpan = eg.partyGroups.reduce(
              (sum, pg) => sum + pg.detailRows.length + 1, // +1 for entity-party subtotal
              1 // +1 for entity subtotal
            );

            return eg.partyGroups.map((pg, pgIdx) => {
              const partyKey = `${eg.entityId}:${pg.partyId}`;
              const partySub = findEntityPartySubtotal(subtotals, eg.entityId, pg.partyId);
              const partyRowSpan = pg.detailRows.length + 1; // +1 for subtotal row

              return [
                ...pg.detailRows.map((row, rowIdx) => {
                  const isFirstOfEntity = pgIdx === 0 && rowIdx === 0;
                  const isFirstOfParty = rowIdx === 0;
                  return (
                    <tr key={`${partyKey}:${row.projectId ?? "null"}`} className="hover:bg-muted/30">
                      {isFirstOfEntity && (
                        <td
                          rowSpan={entityRowSpan}
                          className="px-3 py-2 border align-top font-medium sticky left-0 bg-background z-10"
                        >
                          {eg.entityName}
                        </td>
                      )}
                      {isFirstOfParty && (
                        <td
                          rowSpan={partyRowSpan}
                          className="px-3 py-2 border align-top"
                        >
                          {pg.partyName}
                        </td>
                      )}
                      <td className="px-3 py-2 border text-muted-foreground">
                        {row.projectName ?? <span className="italic opacity-50">—</span>}
                      </td>
                      {cols.map((c) => (
                        <td key={c.id} className="px-3 py-2 border text-right tabular-nums">
                          {fmt(getVal(row, c.id))}
                        </td>
                      ))}
                    </tr>
                  );
                }),
                // Entity-party subtotal row
                partySub ? (
                  <SubtotalTr
                    key={`sub-ep-${partyKey}`}
                    label={`Tổng ${pg.partyName}`}
                    sub={partySub}
                    cols={cols}
                    groupSpan={1} // project col only (entity + party already spanned)
                  />
                ) : null,
              ];
            }).flat().concat(
              // Entity subtotal row after all party groups
              entitySub ? (
                <SubtotalTr
                  key={`sub-e-${eg.entityId}`}
                  label={`Tổng ${eg.entityName}`}
                  sub={entitySub}
                  cols={cols}
                  groupSpan={2} // party + project cols
                />
              ) : null
            ).filter(Boolean);
          })}
        </tbody>
      </table>
    </div>
  );
}
