"use client";

import { useCallback, useMemo } from "react";
import type { SelectOption } from "@/components/data-grid";
import {
  toNamedOption,
  useOptionsWithCreated,
  useQuickCreate,
} from "@/components/master-data/quick-create/quick-create-provider";
import type { ItemType, QuickCreateKind, QuickCreatedRecord } from "@/lib/master-data/quick-create-types";

/** Đối tác của sổ: NCC (sổ vật tư) hay đội thi công (sổ nhân công). */
export type LedgerPartyKind = "supplier" | "contractor";

const EMPTY: SelectOption[] = [];

interface Input {
  entities: SelectOption[];
  partyOptions: SelectOption[];
  projects: SelectOption[];
  items?: SelectOption[];
  partyKind: LedgerPartyKind;
  /** Loại vật tư hiện ở cột Hạng mục; loại đầu tiên là loại điền sẵn khi tạo mới. */
  itemTypes?: readonly ItemType[];
}

type CreateOption = (() => Promise<SelectOption | null>) | undefined;

/**
 * Lựa chọn của các cột Chủ thể / đối tác / Dự án / Hạng mục trong lưới sổ, cộng bản ghi vừa tạo
 * tại chỗ, và hàm `onCreateOption` cho từng cột (undefined khi người dùng không được tạo danh mục).
 */
export function useLedgerSelectOptions({ entities, partyOptions, projects, items, partyKind, itemTypes }: Input) {
  const { enabled, request } = useQuickCreate();
  const itemTypesKey = (itemTypes ?? []).join(",");

  const toItemOption = useCallback(
    (r: QuickCreatedRecord) => (r.itemType && itemTypesKey.split(",").includes(r.itemType) ? toNamedOption(r) : null),
    [itemTypesKey],
  );

  const creator = useCallback(
    (kind: QuickCreateKind, itemType?: ItemType): CreateOption =>
      enabled ? () => request(kind, { itemType }).then((r) => (r ? toNamedOption(r) : null)) : undefined,
    [enabled, request],
  );

  const defaultItemType = itemTypes?.[0];
  const create = useMemo(
    () => ({
      entity: creator("entity"),
      party: creator(partyKind),
      project: creator("project"),
      item: creator("item", defaultItemType),
    }),
    [creator, partyKind, defaultItemType],
  );

  return {
    entities: useOptionsWithCreated("entity", entities, toNamedOption),
    partyOptions: useOptionsWithCreated(partyKind, partyOptions, toNamedOption),
    projects: useOptionsWithCreated("project", projects, toNamedOption),
    items: useOptionsWithCreated("item", items ?? EMPTY, toItemOption),
    create,
  };
}
