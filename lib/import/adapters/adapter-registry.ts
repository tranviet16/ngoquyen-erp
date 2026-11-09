/**
 * Registry mapping adapter name → adapter instance.
 * Add new adapters here as they are implemented.
 *
 * Đã gỡ `cong-no-vat-tu`, `gach-nam-huong`, `quang-minh`: cả ba ghi sổ/phiếu vật tư không có
 * công trình (vi phạm CHECK bắt buộc công trình) và không chống trùng. Run cũ của chúng vẫn hoàn
 * tác được vì hoàn tác không cần adapter.
 */

import { BangCanDoiVatTuAdapter } from "./bang-can-doi-vat-tu.adapter";
import { DuToanTongHopVtAdapter } from "./du-toan-tong-hop-vt.adapter";
import { CongNoNhanCongAdapter } from "./cong-no-nhan-cong.adapter";
import { DuAnXayDungAdapter } from "./du-an-xay-dung.adapter";
import { TaiChinhNqAdapter } from "./tai-chinh-nq.adapter";
import { SlDtAdapter } from "./sl-dt.adapter";
import { VatTuChuyenDoiAdapter } from "./vat-tu-chuyen-doi/vat-tu-chuyen-doi.adapter";
import type { RegisteredImportAdapter } from "./adapter-types";

const ADAPTERS: RegisteredImportAdapter[] = [
  BangCanDoiVatTuAdapter,
  DuToanTongHopVtAdapter,
  CongNoNhanCongAdapter,
  DuAnXayDungAdapter,
  TaiChinhNqAdapter,
  SlDtAdapter,
  VatTuChuyenDoiAdapter,
];

const REGISTRY = new Map<string, RegisteredImportAdapter>(
  ADAPTERS.map((a) => [a.name, a])
);

export function getAdapter(name: string): RegisteredImportAdapter | undefined {
  return REGISTRY.get(name);
}

export interface AdapterListItem {
  name: string;
  label: string;
  supportsRollback: boolean;
  acceptsBundle: boolean;
}

export function listAdapters(): AdapterListItem[] {
  return ADAPTERS.map((a) => ({
    name: a.name,
    label: a.label,
    supportsRollback: Boolean(a.supportsRollback),
    acceptsBundle: Boolean(a.acceptsBundle),
  }));
}
