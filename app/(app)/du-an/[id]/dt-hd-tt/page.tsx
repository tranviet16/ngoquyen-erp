import { redirect } from "next/navigation";

export default async function DtHdTtIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/du-an/${encodeURIComponent(id)}/dt-hd-tt/dt-hd`);
}
