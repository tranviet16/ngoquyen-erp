import { listObligationTypes } from "@/lib/tai-chinh/state-obligation-service";
import { ObligationTypeGridClient } from "@/components/tai-chinh/obligation-type-grid-client";

export const dynamic = "force-dynamic";

export default async function DanhMucNghiaVuPage() {
  const types = await listObligationTypes();

  const rows = types.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    category: t.category,
    openingBalance: Number(t.openingBalance),
    openingDate: t.openingDate.toISOString().slice(0, 10),
    sortOrder: t.sortOrder,
  }));

  return <ObligationTypeGridClient rows={rows} />;
}
