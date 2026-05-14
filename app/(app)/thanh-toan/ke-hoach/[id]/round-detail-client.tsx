"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  approveItemAction,
  bulkApproveAsRequestedAction,
  closeRoundAction,
  deleteItemAction,
  rejectItemAction,
  rejectRoundAction,
  submitRoundAction,
  upsertItemAction,
  refreshAllItemBalancesAction,
} from "../../actions";
import type { PaymentCategory, ProjectScope, RoundStatus } from "@/lib/payment/payment-service";
import { CATEGORY_LABEL } from "../round-list-client";

const STATUS_LABEL: Record<RoundStatus, string> = {
  draft: "Nháp",
  submitted: "Đã gửi",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  closed: "Đã đóng",
};

function fmt(n: unknown) {
  if (n === null || n === undefined) return "—";
  return Number(n as never).toLocaleString("vi-VN");
}

function isAdminRole(role: string | null) {
  return role === "admin";
}

interface Supplier {
  id: number;
  name: string;
}
interface Project {
  id: number;
  code: string;
  name: string;
}
type Decimalish = string | number | { toString(): string };

interface Item {
  id: number;
  supplierId: number;
  projectScope: string;
  projectId: number | null;
  category: string;
  congNo: Decimalish;
  luyKe: Decimalish;
  soDeNghi: Decimalish;
  soDuyet: Decimalish | null;
  approvedAt: Date | null;
  balancesRefreshedAt: Date | null;
  note: string | null;
  supplier: { id: number; name: string };
  project: { id: number; code: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
}
interface Round {
  id: number;
  month: string;
  sequence: number;
  status: string;
  note: string | null;
  createdBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  items: Item[];
}

interface Props {
  round: Round;
  suppliers: Supplier[];
  projects: Project[];
  currentUser: { id: string; role: string | null; isDirector: boolean };
}

export function RoundDetailClient({ round, suppliers, projects, currentUser }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const isAdmin = isAdminRole(currentUser.role);
  const isCreator = round.createdBy?.id === currentUser.id;
  const canEdit = round.status === "draft" && (isCreator || isAdmin);
  const canSubmit = canEdit && round.items.length > 0;
  const canApprove = round.status === "submitted" && (currentUser.isDirector || isAdmin);
  const canClose = round.status === "approved" && isAdmin;

  function onSubmitRound() {
    if (!confirm("Gửi đợt này lên duyệt?")) return;
    startTransition(async () => {
      try {
        await submitRoundAction(round.id);
        toast.success("Đã gửi");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  function onBulkApprove() {
    const remaining = round.items.filter((i) => !i.approvedAt).length;
    if (!confirm(`Duyệt tất cả ${remaining} dòng theo đề xuất?`)) return;
    startTransition(async () => {
      try {
        await bulkApproveAsRequestedAction(round.id);
        toast.success("Đã duyệt toàn bộ");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  function onRejectRound() {
    const reason = prompt("Lý do từ chối:");
    if (!reason) return;
    startTransition(async () => {
      try {
        await rejectRoundAction(round.id, reason);
        toast.success("Đã từ chối đợt");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  function onClose() {
    if (!confirm("Đóng đợt? Sau khi đóng không sửa được nữa.")) return;
    startTransition(async () => {
      try {
        await closeRoundAction(round.id);
        toast.success("Đã đóng đợt");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  function onRefreshAllBalances() {
    if (
      !confirm(
        "Cập nhật lại congNo/luyKe của tất cả items theo ledger hiện tại?"
      )
    )
      return;
    startTransition(async () => {
      try {
        await refreshAllItemBalancesAction(round.id);
        toast.success("Đã cập nhật số dư");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  // Table has: Loại | STT | NCC | Phạm vi | Công trình | Công nợ | Luỹ kế | Cập nhật | Số đề nghị | Số duyệt | Ghi chú | Actions
  // = 12 columns total
  const COL_COUNT = 12;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Đợt #{round.sequence} — Tháng {round.month}
        </h1>
        <StatusBadge status={round.status} label={STATUS_LABEL[round.status as RoundStatus]} />
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-md border bg-card p-3 text-sm md:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Người lập:</span>{" "}
          <strong>{round.createdBy?.name ?? "—"}</strong>
        </div>
        <div>
          <span className="text-muted-foreground">Người duyệt:</span>{" "}
          <strong>{round.approvedBy?.name ?? "—"}</strong>
        </div>
        <div>
          <span className="text-muted-foreground">Ghi chú:</span> {round.note ?? "—"}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canSubmit && (
          <Button onClick={onSubmitRound} disabled={pending}>
            Gửi duyệt
          </Button>
        )}
        {canApprove && (
          <>
            <Button onClick={onBulkApprove} disabled={pending}>
              Duyệt tất cả = đề xuất
            </Button>
            <Button variant="outline" onClick={onRejectRound} disabled={pending}>
              Từ chối đợt
            </Button>
          </>
        )}
        {canClose && (
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Đóng đợt
          </Button>
        )}
        {round.status === "draft" && (
          <Button variant="outline" onClick={onRefreshAllBalances} disabled={pending}>
            Cập nhật số dư
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase">
            <tr>
              <th className="sticky left-0 bg-muted/50 px-2 py-2 text-left">Loại</th>
              <th className="px-2 py-2 text-left">STT</th>
              <th className="px-2 py-2 text-left">NCC</th>
              <th className="px-2 py-2 text-left">Phạm vi</th>
              <th className="px-2 py-2 text-left">Công trình</th>
              <th className="px-2 py-2 text-right">Công nợ</th>
              <th className="px-2 py-2 text-right">Luỹ kế</th>
              <th className="px-2 py-2 text-left">Cập nhật SĐ</th>
              <th className="px-2 py-2 text-right">Số đề nghị</th>
              <th className="px-2 py-2 text-right">Số duyệt</th>
              <th className="px-2 py-2 text-left">Ghi chú</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {round.items.map((item, idx) => (
              <ItemRow
                key={item.id}
                idx={idx + 1}
                item={item}
                roundId={round.id}
                roundStatus={round.status}
                suppliers={suppliers}
                projects={projects}
                canEdit={canEdit}
                canApprove={canApprove}
                actorRole={currentUser.role}
              />
            ))}
            {round.items.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="px-2 py-4 text-center text-muted-foreground">
                  Chưa có dòng nào.
                </td>
              </tr>
            )}
            {canEdit && (
              <NewItemRow
                roundId={round.id}
                suppliers={suppliers}
                projects={projects}
                nextIdx={round.items.length + 1}
                actorRole={currentUser.role}
              />
            )}
          </tbody>
          <tfoot className="bg-muted/30 text-sm font-medium">
            <tr>
              <td colSpan={8} className="px-2 py-2 text-right">
                Tổng
              </td>
              <td className="px-2 py-2 text-right">
                {fmt(round.items.reduce((s, i) => s + Number(i.soDeNghi), 0))}
              </td>
              <td className="px-2 py-2 text-right">
                {fmt(round.items.reduce((s, i) => s + Number(i.soDuyet ?? 0), 0))}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ItemRow({
  idx,
  item,
  roundId,
  roundStatus,
  suppliers,
  projects,
  canEdit,
  canApprove,
  actorRole,
}: {
  idx: number;
  item: Item;
  roundId: number;
  roundStatus: string;
  suppliers: Supplier[];
  projects: Project[];
  canEdit: boolean;
  canApprove: boolean;
  actorRole: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const isAdmin = isAdminRole(actorRole);

  const [supplierId, setSupplierId] = useState(item.supplierId);
  const [projectScope, setProjectScope] = useState<ProjectScope>(item.projectScope as ProjectScope);
  const [projectId, setProjectId] = useState<number | null>(item.projectId);
  const [category, setCategory] = useState<PaymentCategory>(item.category as PaymentCategory);
  const [congNoInput, setCongNoInput] = useState(Number(item.congNo));
  const [luyKeInput, setLuyKeInput] = useState(Number(item.luyKe));
  const [soDeNghi, setSoDeNghi] = useState(Number(item.soDeNghi));
  const [note, setNote] = useState(item.note ?? "");
  const [override, setOverride] = useState(false);
  const [soDuyetInput, setSoDuyetInput] = useState<number>(
    item.soDuyet !== null ? Number(item.soDuyet) : Number(item.soDeNghi)
  );

  // pristine baseline — refresh re-syncs only if user hasn't edited
  const pristine = useRef({
    supplierId: item.supplierId,
    projectScope: item.projectScope,
    projectId: item.projectId,
    category: item.category,
    congNo: Number(item.congNo),
    luyKe: Number(item.luyKe),
    soDeNghi: Number(item.soDeNghi),
    note: item.note ?? "",
  });
  useEffect(() => {
    const p = pristine.current;
    const matches =
      supplierId === p.supplierId &&
      projectScope === p.projectScope &&
      projectId === p.projectId &&
      category === p.category &&
      congNoInput === p.congNo &&
      luyKeInput === p.luyKe &&
      soDeNghi === p.soDeNghi &&
      note === p.note;
    if (matches) {
      setSupplierId(item.supplierId);
      setProjectScope(item.projectScope as ProjectScope);
      setProjectId(item.projectId);
      setCategory(item.category as PaymentCategory);
      setCongNoInput(Number(item.congNo));
      setLuyKeInput(Number(item.luyKe));
      setSoDeNghi(Number(item.soDeNghi));
      setNote(item.note ?? "");
      pristine.current = {
        supplierId: item.supplierId,
        projectScope: item.projectScope,
        projectId: item.projectId,
        category: item.category,
        congNo: Number(item.congNo),
        luyKe: Number(item.luyKe),
        soDeNghi: Number(item.soDeNghi),
        note: item.note ?? "",
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    item.id,
    item.supplierId,
    item.projectScope,
    item.projectId,
    item.category,
    item.congNo,
    item.luyKe,
    item.soDeNghi,
    item.note,
  ]);

  function save() {
    startTransition(async () => {
      try {
        await upsertItemAction({
          id: item.id,
          roundId,
          supplierId,
          projectScope,
          projectId,
          category,
          congNo: override ? congNoInput : null,
          luyKe: override ? luyKeInput : null,
          soDeNghi,
          note: note || undefined,
          override: override ? true : undefined,
        });
        toast.success("Đã lưu");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  function remove() {
    if (!confirm("Xoá dòng này?")) return;
    startTransition(async () => {
      try {
        await deleteItemAction(item.id, roundId);
        toast.success("Đã xoá");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  function approve(useRequested: boolean) {
    startTransition(async () => {
      try {
        await approveItemAction({
          itemId: item.id,
          roundId,
          soDuyet: useRequested ? undefined : soDuyetInput,
        });
        toast.success("Đã duyệt");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  function reject() {
    if (!confirm("Từ chối dòng này (số duyệt = 0)?")) return;
    startTransition(async () => {
      try {
        await rejectItemAction({ itemId: item.id, roundId });
        toast.success("Đã từ chối");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  const approved = item.approvedAt !== null;
  const showApproveActions = canApprove && !approved;

  return (
    <tr className="border-t align-top">
      <td className="sticky left-0 bg-background px-2 py-2">
        {canEdit ? (
          <select
            className="h-8 w-28 rounded border bg-background px-1 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as PaymentCategory)}
          >
            <option value="vat_tu">Vật tư</option>
            <option value="nhan_cong">Nhân công</option>
            <option value="dich_vu">Dịch vụ</option>
            <option value="khac">Khác</option>
          </select>
        ) : (
          CATEGORY_LABEL[item.category as PaymentCategory] ?? item.category
        )}
      </td>
      <td className="px-2 py-2">{idx}</td>
      <td className="px-2 py-2">
        {canEdit ? (
          <select
            className="h-8 w-40 rounded border bg-background px-1 text-sm"
            value={supplierId}
            onChange={(e) => setSupplierId(Number(e.target.value))}
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          item.supplier.name
        )}
      </td>
      <td className="px-2 py-2">
        {canEdit ? (
          <select
            className="h-8 w-32 rounded border bg-background px-1 text-sm"
            value={projectScope}
            onChange={(e) => setProjectScope(e.target.value as ProjectScope)}
          >
            <option value="cty_ql">Cty QL</option>
            <option value="giao_khoan">Giao khoán</option>
          </select>
        ) : projectScope === "cty_ql" ? (
          "Cty QL"
        ) : (
          "Giao khoán"
        )}
      </td>
      <td className="px-2 py-2">
        {canEdit ? (
          <select
            className="h-8 w-44 rounded border bg-background px-1 text-sm"
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        ) : item.project ? (
          `${item.project.code} — ${item.project.name}`
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-2 text-right">
        {canEdit && override ? (
          <Input
            type="number"
            step="0.01"
            className="h-8 w-28 text-right"
            value={congNoInput}
            onChange={(e) => setCongNoInput(Number(e.target.value))}
          />
        ) : (
          fmt(item.congNo)
        )}
      </td>
      <td className="px-2 py-2 text-right">
        {canEdit && override ? (
          <Input
            type="number"
            step="0.01"
            className="h-8 w-28 text-right"
            value={luyKeInput}
            onChange={(e) => setLuyKeInput(Number(e.target.value))}
          />
        ) : (
          fmt(item.luyKe)
        )}
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
        {item.balancesRefreshedAt
          ? new Date(item.balancesRefreshedAt).toLocaleString("vi-VN")
          : "—"}
      </td>
      <td className="px-2 py-2 text-right">
        {canEdit ? (
          <Input
            type="number"
            step="0.01"
            className="h-8 w-28 text-right"
            value={soDeNghi}
            onChange={(e) => setSoDeNghi(Number(e.target.value))}
          />
        ) : (
          fmt(item.soDeNghi)
        )}
      </td>
      <td className="px-2 py-2 text-right">
        {showApproveActions ? (
          <Input
            type="number"
            step="0.01"
            className="h-8 w-28 text-right"
            value={soDuyetInput}
            onChange={(e) => setSoDuyetInput(Number(e.target.value))}
          />
        ) : (
          fmt(item.soDuyet)
        )}
      </td>
      <td className="px-2 py-2">
        {canEdit ? (
          <Input
            className="h-8 w-36"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        ) : (
          item.note ?? "—"
        )}
        {approved && item.approvedBy && (
          <div className="text-xs text-muted-foreground">Duyệt bởi {item.approvedBy.name}</div>
        )}
      </td>
      <td className="px-2 py-2 space-y-1 whitespace-nowrap">
        {canEdit && (
          <div className="flex flex-wrap gap-1">
            {isAdmin && (
              <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                  className="h-3 w-3"
                />
                Override
              </label>
            )}
            <Button size="sm" onClick={save} disabled={pending}>
              Lưu
            </Button>
            <Button size="sm" variant="outline" onClick={remove} disabled={pending}>
              Xoá
            </Button>
          </div>
        )}
        {showApproveActions && (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" onClick={() => approve(true)} disabled={pending}>
              Duyệt = đề xuất
            </Button>
            <Button size="sm" variant="outline" onClick={() => approve(false)} disabled={pending}>
              Duyệt
            </Button>
            <Button size="sm" variant="outline" onClick={reject} disabled={pending}>
              Từ chối
            </Button>
          </div>
        )}
        {!canEdit && approved && (
          <StatusBadge status="approved" label="Đã duyệt" />
        )}
        {!canEdit && !approved && roundStatus !== "submitted" && roundStatus !== "draft" && (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

function NewItemRow({
  roundId,
  suppliers,
  projects,
  nextIdx,
  actorRole,
}: {
  roundId: number;
  suppliers: Supplier[];
  projects: Project[];
  nextIdx: number;
  actorRole: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isAdmin = isAdminRole(actorRole);

  const [supplierId, setSupplierId] = useState<number | "">("");
  const [projectScope, setProjectScope] = useState<ProjectScope>("cty_ql");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [category, setCategory] = useState<PaymentCategory>("vat_tu");
  const [soDeNghi, setSoDeNghi] = useState(0);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [congNoInput, setCongNoInput] = useState(0);
  const [luyKeInput, setLuyKeInput] = useState(0);

  function add() {
    if (!supplierId) {
      toast.error("Chọn NCC");
      return;
    }
    startTransition(async () => {
      try {
        await upsertItemAction({
          roundId,
          supplierId: Number(supplierId),
          projectScope,
          projectId,
          category,
          congNo: override ? congNoInput : null,
          luyKe: override ? luyKeInput : null,
          soDeNghi,
          note: note || undefined,
          override: override ? true : undefined,
        });
        toast.success("Đã thêm");
        setSupplierId("");
        setProjectId(null);
        setCategory("vat_tu");
        setSoDeNghi(0);
        setNote("");
        setOverride(false);
        setCongNoInput(0);
        setLuyKeInput(0);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  return (
    <tr className="border-t bg-muted/20 align-top">
      <td className="sticky left-0 bg-muted/20 px-2 py-2">
        <select
          className="h-8 w-28 rounded border bg-background px-1 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value as PaymentCategory)}
        >
          <option value="vat_tu">Vật tư</option>
          <option value="nhan_cong">Nhân công</option>
          <option value="dich_vu">Dịch vụ</option>
          <option value="khac">Khác</option>
        </select>
      </td>
      <td className="px-2 py-2">{nextIdx}</td>
      <td className="px-2 py-2">
        <select
          className="h-8 w-40 rounded border bg-background px-1 text-sm"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">— Chọn NCC —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          className="h-8 w-32 rounded border bg-background px-1 text-sm"
          value={projectScope}
          onChange={(e) => setProjectScope(e.target.value as ProjectScope)}
        >
          <option value="cty_ql">Cty QL</option>
          <option value="giao_khoan">Giao khoán</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          className="h-8 w-44 rounded border bg-background px-1 text-sm"
          value={projectId ?? ""}
          onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">—</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2 text-right">
        {override ? (
          <Input
            type="number"
            step="0.01"
            className="h-8 w-28 text-right"
            value={congNoInput}
            onChange={(e) => setCongNoInput(Number(e.target.value))}
          />
        ) : (
          <span className="text-xs text-muted-foreground italic">Tự tính khi lưu</span>
        )}
      </td>
      <td className="px-2 py-2 text-right">
        {override ? (
          <Input
            type="number"
            step="0.01"
            className="h-8 w-28 text-right"
            value={luyKeInput}
            onChange={(e) => setLuyKeInput(Number(e.target.value))}
          />
        ) : (
          <span className="text-xs text-muted-foreground italic">Tự tính khi lưu</span>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">—</td>
      <td className="px-2 py-2 text-right">
        <Input
          type="number"
          step="0.01"
          className="h-8 w-28 text-right"
          value={soDeNghi}
          onChange={(e) => setSoDeNghi(Number(e.target.value))}
        />
      </td>
      <td className="px-2 py-2 text-right">—</td>
      <td className="px-2 py-2">
        <Input
          className="h-8 w-36"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </td>
      <td className="px-2 py-2 space-y-1">
        {isAdmin && (
          <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="h-3 w-3"
            />
            Override
          </label>
        )}
        <Button size="sm" onClick={add} disabled={pending}>
          Thêm
        </Button>
      </td>
    </tr>
  );
}
