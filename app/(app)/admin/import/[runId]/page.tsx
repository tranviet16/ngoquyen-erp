import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/rbac";
import { getRun } from "../import-actions";
import { CommitPanel } from "./commit-panel";

interface Props {
  params: Promise<{ runId: string }>;
}

export default async function ImportRunDetailPage({ params }: Props) {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user || !hasRole(session.user.role, "admin")) {
    redirect("/dashboard");
  }

  const { runId } = await params;
  const run = await getRun(parseInt(runId, 10));
  if (!run) notFound();

  const errors = Array.isArray(run.errors) ? (run.errors as { rowIndex: number; message: string }[]) : [];

  function statusColor(s: string) {
    if (s === "committed") return "text-green-700";
    if (s === "failed") return "text-red-600";
    if (s === "preview") return "text-blue-600";
    return "text-yellow-600";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import Run #{run.id}</h1>
        <p className="text-sm text-muted-foreground">{run.fileName}</p>
      </div>

      <div className="border rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground text-xs">Adapter</div>
          <div className="font-mono">{run.adapter}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Trạng thái</div>
          <div className={`font-semibold ${statusColor(run.status)}`}>{run.status}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Tổng dòng</div>
          <div>{run.rowsTotal}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Đã nhập / Bỏ qua</div>
          <div>{run.rowsImported} / {run.rowsSkipped}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Tạo lúc</div>
          <div>{new Date(run.createdAt).toLocaleString("vi-VN")}</div>
        </div>
        {run.committedAt && (
          <div>
            <div className="text-muted-foreground text-xs">Commit lúc</div>
            <div>{new Date(run.committedAt).toLocaleString("vi-VN")}</div>
          </div>
        )}
        <div className="col-span-2">
          <div className="text-muted-foreground text-xs">File hash (SHA-256)</div>
          <div className="font-mono text-xs break-all">{run.fileHash}</div>
        </div>
      </div>

      {run.status === "preview" && (
        <CommitPanel runId={run.id} />
      )}

      {errors.length > 0 && (
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold mb-2 text-red-600">Lỗi ({errors.length})</h2>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Dòng</th>
                  <th className="p-2">Thông báo</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 font-mono">{e.rowIndex >= 0 ? e.rowIndex + 1 : "—"}</td>
                    <td className="p-2 text-red-700">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-sm">
        <a href="/admin/import" className="text-blue-600 hover:underline">&larr; Quay lại danh sách import</a>
      </div>
    </div>
  );
}
