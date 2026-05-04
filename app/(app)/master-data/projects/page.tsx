import { Suspense } from "react";
import { ProjectsClient } from "./projects-client";
import { listProjects } from "@/lib/master-data/project-service";

interface Props {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function ProjectsPage({ searchParams }: Props) {
  const params = await searchParams;
  const search = params.search ?? "";
  const page = Number(params.page ?? 1);

  const result = await listProjects({ search, page, pageSize: 20 });

  return (
    <Suspense>
      <ProjectsClient
        data={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        searchValue={search}
      />
    </Suspense>
  );
}
