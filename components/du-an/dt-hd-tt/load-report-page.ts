/**
 * Đầu vào chung của ba trang báo cáo: kiểm id, tính báo cáo (service tự kiểm quyền đọc dự án theo
 * công trình) và nhãn công trình cho tiêu đề in.
 */

import { notFound } from "next/navigation";
import { getDtHdTtReports } from "@/lib/du-an/dt-hd-tt/report-service";
import { queryProjectById } from "@/lib/master-data/project-query";

export async function loadReportPage(params: Promise<{ id: string }>) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  const [reports, project] = await Promise.all([getDtHdTtReports(projectId), queryProjectById(projectId)]);
  if (!project) notFound();
  return { projectId, reports, projectLabel: `${project.code} — ${project.name}` };
}
