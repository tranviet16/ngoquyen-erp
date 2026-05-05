import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/rbac";
import { getRuns, getAdapters } from "./import-actions";
import { ImportUploadForm } from "./import-upload-form";
import { DeleteRunButton } from "./delete-run-button";

export default async function AdminImportPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user || !hasRole(session.user.role, "admin")) {
    redirect("/dashboard");
  }

  const [runs, adapters] = await Promise.all([getRuns(), getAdapters()]);

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      preview: "bg-blue-100 text-blue-800",
      committed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
    };
    return colors[status] ?? "bg-gray-100 text-gray-800";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nhập dữ liệu Excel</h1>
        <p className="text-sm text-muted-foreground">
          Import dữ liệu lịch sử từ file Excel SOP. Chỉ admin mới có quyền thực hiện.
        </p>
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <h2 className="font-semibold">Tải lên file mới</h2>
        <ImportUploadForm adapters={adapters} />
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="font-semibold mb-3">Lịch sử import ({runs.length} lần)</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có lần import nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-2">#</th>
                  <th className="p-2">File</th>
                  <th className="p-2">Adapter</th>
                  <th className="p-2">Trạng thái</th>
                  <th className="p-2 text-right">Đã nhập</th>
                  <th className="p-2 text-right">Bỏ qua</th>
                  <th className="p-2">Thời gian</th>
                  <th className="p-2">Chi tiết</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/20">
                    <td className="p-2 font-mono text-xs">{r.id}</td>
                    <td className="p-2 max-w-[200px] truncate" title={r.fileName}>{r.fileName}</td>
                    <td className="p-2 font-mono text-xs">{r.adapter}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-2 text-right">{r.rowsImported}</td>
                    <td className="p-2 text-right">{r.rowsSkipped}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="p-2">
                      <a href={`/admin/import/${r.id}`} className="text-blue-600 hover:underline text-xs">
                        Xem
                      </a>
                    </td>
                    <td className="p-2">
                      <DeleteRunButton id={r.id} status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
