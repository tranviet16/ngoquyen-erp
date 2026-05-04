import { prisma } from "@/lib/prisma";
import { listTargets } from "@/lib/sl-dt/target-service";
import { SlDtGrid } from "@/components/sl-dt/sl-dt-grid";

interface Props {
  searchParams: Promise<{ year?: string; projectId?: string }>;
}

export default async function ChiTieuPage({ searchParams }: Props) {
  const params = await searchParams;
  const year = params.year ? parseInt(params.year, 10) : new Date().getFullYear();
  const projectId = params.projectId ? parseInt(params.projectId, 10) : undefined;

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const selectedProjectId = projectId ?? (projects[0]?.id ?? null);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const targets = selectedProjectId
    ? await listTargets({ projectId: selectedProjectId, year })
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Chỉ tiêu SL/DT</h1>
        <p className="text-sm text-muted-foreground">Nhập chỉ tiêu sản lượng & doanh thu theo tháng</p>
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 items-end flex-wrap">
        <form className="flex gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Dự án</label>
            <select
              name="projectId"
              defaultValue={selectedProjectId ?? ""}
              className="border rounded px-2 py-1.5 text-sm min-w-[200px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.code}] {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Năm</label>
            <select
              name="year"
              defaultValue={year}
              className="border rounded px-2 py-1.5 text-sm"
            >
              {[-1, 0, 1].map((offset) => {
                const y = new Date().getFullYear() + offset;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
          <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded">
            Xem
          </button>
        </form>
      </div>

      {selectedProjectId && selectedProject ? (
        <SlDtGrid
          targets={targets}
          projectId={selectedProjectId}
          year={year}
          projectName={`[${selectedProject.code}] ${selectedProject.name}`}
        />
      ) : (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          Chưa có dự án. Vui lòng tạo dự án trong Dữ liệu nền tảng.
        </div>
      )}
    </div>
  );
}
