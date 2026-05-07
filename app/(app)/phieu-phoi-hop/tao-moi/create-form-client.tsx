"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDraftAction } from "../actions";

interface DeptOption {
  id: number;
  code: string;
  name: string;
}

interface Props {
  departments: DeptOption[];
  currentDeptId: number | null;
}

export function CreateFormClient({ departments, currentDeptId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [executorDeptId, setExecutorDeptId] = useState<number | "">("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<"cao" | "trung_binh" | "thap">("trung_binh");
  const [deadline, setDeadline] = useState("");

  const noDept = currentDeptId === null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (executorDeptId === "") {
      toast.error("Vui lòng chọn phòng thực hiện");
      return;
    }
    if (content.trim().length < 10) {
      toast.error("Nội dung tối thiểu 10 ký tự");
      return;
    }
    startTransition(async () => {
      try {
        const form = await createDraftAction({
          executorDeptId: Number(executorDeptId),
          content: content.trim(),
          priority,
          deadline: deadline || null,
        });
        toast.success(`Đã tạo nháp ${form.code}`);
        router.push(`/phieu-phoi-hop/${form.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Link href="/phieu-phoi-hop" className="text-sm text-muted-foreground hover:underline">
          ← Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold mt-2">Tạo phiếu phối hợp mới</h1>
        <p className="text-sm text-muted-foreground">
          Phiếu sẽ được lưu nháp. Bấm &quot;Gửi duyệt&quot; trong trang chi tiết để bắt đầu quy trình.
        </p>
      </div>

      {noDept && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Bạn chưa thuộc phòng ban nào. Liên hệ admin để được gán phòng trước khi tạo phiếu.
        </div>
      )}

      <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
        <div>
          <Label>Phòng thực hiện *</Label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={executorDeptId}
            onChange={(e) =>
              setExecutorDeptId(e.target.value === "" ? "" : Number(e.target.value))
            }
            required
            disabled={noDept || pending}
          >
            <option value="">— Chọn phòng —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} - {d.name}
                {d.id === currentDeptId ? " (phòng của bạn)" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Có thể gửi cho phòng của chính bạn (ví dụ leader giao việc cho member).
          </p>
        </div>

        <div>
          <Label>
            Nội dung công việc * <span className="text-xs text-muted-foreground">({content.length}/2000)</span>
          </Label>
          <textarea
            className="mt-1 w-full min-h-32 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            rows={6}
            required
            disabled={noDept || pending}
            placeholder="Mô tả chi tiết công việc cần phối hợp (tối thiểu 10 ký tự)"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Mức ưu tiên *</Label>
            <div className="mt-2 flex gap-2">
              {(["cao", "trung_binh", "thap"] as const).map((p) => (
                <label
                  key={p}
                  className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-center text-sm ${
                    priority === p
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input"
                  }`}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={p}
                    checked={priority === p}
                    onChange={() => setPriority(p)}
                    className="sr-only"
                  />
                  {p === "cao" ? "Cao" : p === "trung_binh" ? "Trung bình" : "Thấp"}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Hạn chót (tùy chọn)</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={noDept || pending}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Link href="/phieu-phoi-hop">
            <Button type="button" variant="outline" disabled={pending}>
              Hủy
            </Button>
          </Link>
          <Button type="submit" disabled={pending || noDept}>
            {pending ? "Đang tạo..." : "Tạo nháp"}
          </Button>
        </div>
      </form>
    </div>
  );
}
