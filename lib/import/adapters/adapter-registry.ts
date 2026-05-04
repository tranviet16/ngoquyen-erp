/**
 * Registry mapping adapter name → adapter instance.
 * Add new adapters here as they are implemented.
 */

import { CongNoVatTuAdapter } from "./cong-no-vat-tu.adapter";
import { DuAnXayDungAdapter } from "./du-an-xay-dung.adapter";
import { TaiChinhNqAdapter } from "./tai-chinh-nq.adapter";
import { GachNamHuongAdapter } from "./gach-nam-huong.adapter";
import { QuangMinhAdapter } from "./quang-minh.adapter";
import { SlDtAdapter } from "./sl-dt.adapter";
import type { ImportAdapter } from "./adapter-types";

const ADAPTERS: ImportAdapter[] = [
  CongNoVatTuAdapter,
  DuAnXayDungAdapter,
  TaiChinhNqAdapter,
  GachNamHuongAdapter,
  QuangMinhAdapter,
  SlDtAdapter,
];

const REGISTRY = new Map<string, ImportAdapter>(
  ADAPTERS.map((a) => [a.name, a])
);

export function getAdapter(name: string): ImportAdapter | undefined {
  return REGISTRY.get(name);
}

export function listAdapters(): { name: string; label: string }[] {
  return ADAPTERS.map((a) => ({ name: a.name, label: a.label }));
}
