"use client";

import { useState } from "react";
import type {
  CrossCutoverView,
  CutoverReviewPayload,
  DeliverySummaryView,
  DiagnosticRowView,
  OpenRoundView,
  PaymentMatchView,
  PickupView,
} from "@/lib/import/adapters/vat-tu-chuyen-doi/review-payload-types";
import { AckBox, DataTable, fmt, moneyColumn, Section, type Column, type DraftProps } from "./cutover-review-ui";

const vn = (iso: string) => iso.split("-").reverse().join("/");

const pickupColumns: Column<PickupView>[] = [
  { key: "src", label: "Dòng", accessor: (r) => r.sourceKey },
  { key: "date", label: "Ngày", kind: "date", accessor: (r) => r.date, render: (r) => vn(r.date) },
  { key: "pair", label: "NCC × công trình", accessor: (r) => `${r.supplierName} × ${r.projectName}` },
  moneyColumn("amount", "Tổng TT", (r) => r.amount),
  {
    key: "match",
    label: "Phiếu",
    accessor: (r) => (r.match ? 1 : 0),
    render: (r) =>
      r.match ? (
        <span>{r.match.source === "erp" ? "ERP" : "gói"} · {vn(r.match.date)} · {r.match.label}</span>
      ) : (
        <span className="text-red-700 dark:text-red-300">chưa ghép — bổ sung phiếu</span>
      ),
  },
];

const paymentColumns: Column<PaymentMatchView>[] = [
  { key: "src", label: "Dòng", accessor: (r) => r.sourceKey },
  { key: "date", label: "Ngày", kind: "date", accessor: (r) => r.date, render: (r) => vn(r.date) },
  { key: "pair", label: "NCC × công trình", accessor: (r) => `${r.supplierName} × ${r.projectName}` },
  moneyColumn("amount", "Số tiền", (r) => r.amount),
  {
    key: "match",
    label: "Thanh toán ERP",
    accessor: (r) => (r.match ? 1 : 0),
    render: (r) => (r.match ? `bỏ — khớp #${r.match.ledgerId} ngày ${vn(r.match.date)} (${r.match.label})` : "ghi thanh_toan trong kỳ mở"),
  },
];

type RoundItem = OpenRoundView["items"][number];

const roundItemColumns: Column<RoundItem>[] = [
  { key: "item", label: "Dòng", kind: "number", accessor: (r) => r.itemId, render: (r) => `#${r.itemId}` },
  { key: "pair", label: "NCC × công trình", accessor: (r) => `${r.supplierName} × ${r.projectName ?? "chưa có công trình"}` },
  moneyColumn("deNghi", "Số đề nghị", (r) => r.soDeNghi),
  moneyColumn("duyet", "Số duyệt", (r) => r.soDuyet),
];

/** Một đợt còn mở: xác nhận "chưa chi, chưa có trong Nhập Liệu"; trùng "Trả Nợ" thì quyết định trước. */
function OpenRoundCard({ round, ...draftProps }: DraftProps & { round: OpenRoundView }) {
  const { draft, setValue, editable } = draftProps;
  const decisionKey = round.decisionKey;
  const value = decisionKey ? draft[decisionKey] : undefined;
  return (
    <div className="border rounded p-3 space-y-2">
      <div className="font-medium">
        Đợt #{round.roundId} ({round.round}, {round.status}) — tổng {fmt(round.total)}
      </div>
      <DataTable rows={round.items} columns={roundItemColumns} rowKey={(r) => String(r.itemId)} maxHeight="max-h-60" />
      {round.matches.length > 0 && decisionKey && (
        <div className="space-y-1">
          <div className="text-red-700 dark:text-red-300">
            Trùng số tiền với &quot;Trả Nợ&quot; của Nhập Liệu:{" "}
            {round.matches.map((m) => `${m.sourceKey} ${vn(m.date)} ${fmt(m.amount)} (dòng #${m.itemId})`).join("; ")}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(["drop-nl", "keep"] as const).map((v) => (
              <label key={v} className="inline-flex items-center gap-1">
                <input type="radio" name={decisionKey} checked={value === v} disabled={!editable} onChange={() => setValue(decisionKey, v)} />
                {v === "drop-nl" ? "Bỏ dòng Nhập Liệu (khoản chi vào sổ khi đóng đợt)" : "Giữ cả hai (là hai khoản khác nhau)"}
              </label>
            ))}
          </div>
        </div>
      )}
      <AckBox code={round.ackCode} {...draftProps} label={`Đợt #${round.roundId} chưa chi và chưa có trong Nhập Liệu`} />
    </div>
  );
}

function CrossCutoverRow({ row, ...draftProps }: DraftProps & { row: CrossCutoverView }) {
  const { draft, setValue, editable } = draftProps;
  const value = draft[row.decisionKey];
  return (
    <div className="border rounded p-2 space-y-1">
      <div>
        &quot;Trả Nợ&quot; {row.sourceKey} ngày {vn(row.nlDate)} {fmt(row.amount)} ({row.supplierName} × {row.projectName}) trùng thanh toán từ đợt
        #{row.ledgerId} ngày {vn(row.ledgerDate)}.
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {(["drop", "keep"] as const).map((v) => (
          <label key={v} className="inline-flex items-center gap-1">
            <input type="radio" name={row.decisionKey} checked={value === v} disabled={!editable} onChange={() => setValue(row.decisionKey, v)} />
            {v === "drop" ? "Bỏ dòng Nhập Liệu" : "Giữ cả hai"}
          </label>
        ))}
        {value === "keep" && <AckBox code={row.ackCode} {...draftProps} />}
      </div>
    </div>
  );
}

export function PostCutoverSection({ post, ...draftProps }: DraftProps & { post: CutoverReviewPayload["postCutover"] }) {
  return (
    <Section title="8. Sau mốc 26/10/2026">
      <p className="text-muted-foreground">
        &quot;Lấy Hàng&quot; sau mốc không bao giờ ghi sổ — mỗi dòng phải ghép được một phiếu (cùng NCC × công trình, ± 3 ngày, ± 1 đồng; phiếu chưa giá
        theo số phiếu trong ngày). &quot;Trả Nợ&quot; sau mốc trùng thanh toán ERP thì bỏ, không trùng thì ghi.
      </p>
      <h3 className="font-medium">&quot;Lấy Hàng&quot; ↔ phiếu ({post.pickups.filter((p) => p.match).length}/{post.pickups.length})</h3>
      <DataTable rows={post.pickups} columns={pickupColumns} rowKey={(r) => r.sourceKey} />
      <h3 className="font-medium">&quot;Trả Nợ&quot; ↔ thanh toán ERP ({post.payments.length})</h3>
      <DataTable rows={post.payments} columns={paymentColumns} rowKey={(r) => r.sourceKey} empty="Không có dòng Trả Nợ sau mốc." />
      <h3 className="font-medium">Đợt thanh toán vật tư còn mở ({post.openRounds.length})</h3>
      <p className="text-muted-foreground">
        Đợt đóng sau go-live ghi thanh toán theo ngày đóng. Xác nhận từng đợt là chưa chi và chưa có trong Nhập Liệu; đợt có dòng trùng số tiền với
        &quot;Trả Nợ&quot; phải chọn bỏ dòng Nhập Liệu hoặc giữ cả hai trước.
      </p>
      {post.openRounds.length === 0 ? (
        <p className="text-muted-foreground">Không có đợt vật tư còn mở.</p>
      ) : (
        post.openRounds.map((round) => <OpenRoundCard key={round.roundId} round={round} {...draftProps} />)
      )}
      <h3 className="font-medium">Khớp chéo mốc ({post.crossCutover.length})</h3>
      {post.crossCutover.length === 0 ? (
        <p className="text-muted-foreground">Không có.</p>
      ) : (
        post.crossCutover.map((row) => <CrossCutoverRow key={row.decisionKey} row={row} {...draftProps} />)
      )}
    </Section>
  );
}

export function DiagnosticSection({ rows }: { rows: DiagnosticRowView[] | null }) {
  const [onlyDiff, setOnlyDiff] = useState(true);
  if (!rows) return null;
  const shown = onlyDiff ? rows.filter((r) => Math.abs(r.diff) > 1 || r.unpricedDeliveries > 0) : rows;
  const columns: Column<DiagnosticRowView>[] = [
    { key: "pair", label: "NCC × công trình", accessor: (r) => `${r.supplierName} × ${r.projectName}` },
    { key: "month", label: "Tháng", accessor: (r) => r.month },
    moneyColumn("delivery", "Σ phiếu có giá", (r) => r.deliveryAmount),
    moneyColumn("ledger", "Σ TT lay_hang", (r) => r.ledgerLayHang),
    moneyColumn("diff", "Chênh", (r) => r.diff),
    { key: "unpriced", label: "Phiếu chưa giá", kind: "number", align: "right", accessor: (r) => r.unpricedDeliveries },
  ];
  return (
    <Section title="9. Chẩn đoán cặp × tháng (không chặn)" count={rows.length} open={false}>
      <p className="text-muted-foreground">
        So Σ thành tiền phiếu lịch sử với Σ TT lay_hang của Nhập Liệu theo tháng. Khối gộp nhiều công trình không có tiểu mục gán hết phiếu về công
        trình theo thư mục nên có thể lệch — chỉ để soát, không chặn ghi.
      </p>
      <label className="inline-flex items-center gap-1">
        <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Chỉ tháng lệch
      </label>
      <DataTable rows={shown} columns={columns} rowKey={(r) => `${r.pairKey}-${r.month}`} />
    </Section>
  );
}

export function DeliveriesSection({ rows, ...draftProps }: DraftProps & { rows: DeliverySummaryView[] }) {
  const columns: Column<DeliverySummaryView>[] = [
    { key: "pair", label: "NCC × công trình", accessor: (r) => `${r.supplierName} × ${r.projectName}` },
    { key: "bp", label: "Tới mốc có giá", kind: "number", align: "right", accessor: (r) => r.beforePriced },
    { key: "bu", label: "Tới mốc chưa giá", kind: "number", align: "right", accessor: (r) => r.beforeUnpriced },
    { key: "ap", label: "Sau mốc có giá", kind: "number", align: "right", accessor: (r) => r.afterPriced },
    { key: "au", label: "Sau mốc chưa giá", kind: "number", align: "right", accessor: (r) => r.afterUnpriced },
    { key: "dup", label: "Gộp do trùng", kind: "number", align: "right", accessor: (r) => r.duplicatesMerged },
    { key: "erp", label: "Đã có ở ERP", kind: "number", align: "right", accessor: (r) => r.alreadyInErp },
    {
      key: "money",
      label: "Ghi chú",
      accessor: (r) => (r.noMoney ? 0 : 1),
      render: (r) =>
        r.noMoney ? (
          <div className="space-y-1">
            <span className="text-amber-700 dark:text-amber-300">phiếu tới mốc ở cặp không có tiền — kiểm ánh xạ</span>
            {r.ackCode && <AckBox code={r.ackCode} {...draftProps} />}
          </div>
        ) : null,
    },
  ];
  return (
    <Section title="10. Phiếu sẽ nhập theo cặp" count={rows.length} open={false}>
      <p className="text-muted-foreground">Phiếu tới mốc là bản ghi khối lượng (không gắn sổ, không sinh event); phiếu sau mốc sinh event khi chốt kỳ ERP.</p>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.pairKey} />
    </Section>
  );
}

export function NewMasterSection({ data }: { data: CutoverReviewPayload["newMaster"] }) {
  const total = data.entities.length + data.suppliers.length + data.projects.length + data.items.length;
  return (
    <Section title="11. Danh mục sẽ tạo mới" count={total} open={false}>
      {total === 0 && <p className="text-muted-foreground">Không tạo mới danh mục nào.</p>}
      {data.entities.length > 0 && <p>Chủ thể: {data.entities.join("; ")}</p>}
      {data.suppliers.length > 0 && <p>NCC: {data.suppliers.join("; ")}</p>}
      {data.projects.length > 0 && <p>Công trình: {data.projects.map((p) => `${p.name} (${p.entityName ?? "chưa có Chủ thể"})`).join("; ")}</p>}
      {data.items.length > 0 && (
        <p>
          Vật tư ({data.items.length}): {data.items.map((i) => `${i.name} [${i.unit}${i.type === "machine" ? ", máy" : ""}]`).join("; ")}
        </p>
      )}
    </Section>
  );
}
