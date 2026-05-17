import type { DetailRow, SubtotalRow } from "@/lib/cong-no-vt/balance-report-service";

interface Props {
  rows: DetailRow[];
  subtotals: SubtotalRow[];
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
  | "openingTt"
  | "phatSinhTt"
  | "daTraTt"
  | "cuoiKyTt"
  | "openingHd"
  | "phatSinhHd"
  | "daTraHd"
  | "cuoiKyHd";

interface ColDef {
  id: ColId;
  header: string;
}

// 4 field headers, shown once under each of the TT / HĐ group headers.
const FIELD_HEADERS = ["Đầu kỳ", "Phát sinh", "Đã trả", "Cuối kỳ"] as const;

const COLS: ColDef[] = [
  { id: "openingTt", header: "Đầu kỳ" },
  { id: "phatSinhTt", header: "Phát sinh" },
  { id: "daTraTt", header: "Đã trả" },
  { id: "cuoiKyTt", header: "Cuối kỳ" },
  { id: "openingHd", header: "Đầu kỳ" },
  { id: "phatSinhHd", header: "Phát sinh" },
  { id: "daTraHd", header: "Đã trả" },
  { id: "cuoiKyHd", header: "Cuối kỳ" },
];

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
  groupSpan,
}: {
  label: string;
  sub: SubtotalRow;
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
      {COLS.map((c) => (
        <td key={c.id} className="px-3 py-1.5 border text-right tabular-nums">
          {fmt(getVal(sub, c.id))}
        </td>
      ))}
    </tr>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function DetailReportTable({ rows, subtotals, partyLabel }: Props) {
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
      <table className="w-full text-sm border-collapse min-w-[980px]">
        <thead>
          <tr className="bg-muted text-xs font-semibold uppercase tracking-wide">
            <th
              rowSpan={2}
              className="px-3 py-2 border sticky left-0 bg-muted z-10 min-w-[140px] text-left"
            >
              Chủ thể
            </th>
            <th rowSpan={2} className="px-3 py-2 border min-w-[160px] text-left">
              {partyLabel}
            </th>
            <th rowSpan={2} className="px-3 py-2 border min-w-[160px] text-left">
              Công trình
            </th>
            <th colSpan={4} className="px-3 py-2 border text-center">
              Thực tế (TT)
            </th>
            <th colSpan={4} className="px-3 py-2 border text-center">
              Hóa đơn (HĐ)
            </th>
          </tr>
          <tr className="bg-muted text-xs font-semibold uppercase tracking-wide">
            {FIELD_HEADERS.map((h) => (
              <th key={`tt-${h}`} className="px-3 py-2 border text-right min-w-[110px]">
                {h}
              </th>
            ))}
            {FIELD_HEADERS.map((h) => (
              <th key={`hd-${h}`} className="px-3 py-2 border text-right min-w-[110px]">
                {h}
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

            return eg.partyGroups
              .map((pg, pgIdx) => {
                const partyKey = `${eg.entityId}:${pg.partyId}`;
                const partySub = findEntityPartySubtotal(subtotals, eg.entityId, pg.partyId);
                const partyRowSpan = pg.detailRows.length + 1; // +1 for subtotal row

                return [
                  ...pg.detailRows.map((row, rowIdx) => {
                    const isFirstOfEntity = pgIdx === 0 && rowIdx === 0;
                    const isFirstOfParty = rowIdx === 0;
                    return (
                      <tr
                        key={`${partyKey}:${row.projectId ?? "null"}`}
                        className="hover:bg-muted/30"
                      >
                        {isFirstOfEntity && (
                          <td
                            rowSpan={entityRowSpan}
                            className="px-3 py-2 border align-top font-medium sticky left-0 bg-background z-10"
                          >
                            {eg.entityName}
                          </td>
                        )}
                        {isFirstOfParty && (
                          <td rowSpan={partyRowSpan} className="px-3 py-2 border align-top">
                            {pg.partyName}
                          </td>
                        )}
                        <td className="px-3 py-2 border text-muted-foreground">
                          {row.projectName ?? <span className="italic opacity-50">—</span>}
                        </td>
                        {COLS.map((c) => (
                          <td
                            key={c.id}
                            className="px-3 py-2 border text-right tabular-nums"
                          >
                            {fmt(getVal(row, c.id))}
                          </td>
                        ))}
                      </tr>
                    );
                  }),
                  partySub ? (
                    <SubtotalTr
                      key={`sub-ep-${partyKey}`}
                      label={`Tổng ${pg.partyName}`}
                      sub={partySub}
                      groupSpan={1} // project col only (entity + party already spanned)
                    />
                  ) : null,
                ];
              })
              .flat()
              .concat(
                entitySub ? (
                  <SubtotalTr
                    key={`sub-e-${eg.entityId}`}
                    label={`Tổng ${eg.entityName}`}
                    sub={entitySub}
                    groupSpan={2} // party + project cols
                  />
                ) : null
              )
              .filter(Boolean);
          })}
        </tbody>
      </table>
    </div>
  );
}
