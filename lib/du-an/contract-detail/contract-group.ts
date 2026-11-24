/**
 * Nhóm gộp hợp đồng và ghép toàn bộ khối số của màn chi tiết. Module thuần.
 *
 * Nhóm gộp = các hợp đồng kinh tế chưa xóa, cùng công trình, cùng `partyKind` và cùng
 * NCC (`supplierId`) hoặc cùng đội (`contractorId`); với CĐT là mọi hợp đồng CĐT của
 * công trình. Hợp đồng hết hạn hoặc chấm dứt vẫn nằm trong nhóm (không lọc `status`),
 * vì số từ sổ gốc không tách được theo từng hợp đồng.
 * Loại không phải hợp đồng kinh tế, hoặc chưa gắn đối tác: không có nhóm, không có số.
 */

import { buildCdtFigures } from "./cdt-figures";
import { buildLedgerFigures } from "./ledger-figures";
import { buildUnfulfilled } from "./unfulfilled";
import {
  decStr,
  parsePartyKind,
  toDec,
  ZERO,
  ECONOMIC_CONTRACT_DOC_TYPE,
  type CdtInputs,
  type ContractFigures,
  type ContractGroup,
  type ContractRef,
  type DecimalLike,
  type GroupValue,
  type LedgerRowInput,
  type OpeningInput,
  type PartyKind,
} from "./types";

function partyKey(contract: ContractRef, kind: PartyKind): number | null | "all" {
  if (kind === "ncc") return contract.supplierId;
  if (kind === "doi_thi_cong") return contract.contractorId;
  return "all";
}

function groupValue(values: readonly (DecimalLike | null)[]): GroupValue {
  let sum = ZERO;
  let have = 0;
  for (const v of values) {
    if (v == null) continue;
    sum = sum.plus(toDec(v));
    have += 1;
  }
  return { sum: decStr(sum), have, total: values.length };
}

/** Nhóm gộp của `contract`; `siblings` có thể chứa cả chính nó (được khử trùng theo id). */
export function resolveGroup(contract: ContractRef, siblings: readonly ContractRef[]): ContractGroup | null {
  const kind = parsePartyKind(contract.partyKind);
  if (contract.deletedAt != null || contract.docType !== ECONOMIC_CONTRACT_DOC_TYPE || kind == null) return null;
  const key = partyKey(contract, kind);
  if (key == null) return null;

  const members = [
    contract,
    ...siblings.filter(
      (s) =>
        s.id !== contract.id &&
        s.deletedAt == null &&
        s.projectId === contract.projectId &&
        s.docType === ECONOMIC_CONTRACT_DOC_TYPE &&
        parsePartyKind(s.partyKind) === kind &&
        partyKey(s, kind) === key,
    ),
  ];
  const unique = [...new Map(members.map((m) => [m.id, m])).values()].sort((a, b) => a.id - b.id);

  return {
    partyKind: kind,
    contractIds: unique.map((m) => m.id),
    valueDt: groupValue(unique.map((m) => m.valueVnd)),
    valueTt: groupValue(unique.map((m) => m.valueTtVnd)),
  };
}

/** Nguồn số của hợp đồng: sổ công nợ (NCC/đội) hoặc ba sổ CĐT. */
export type ContractFigureSource =
  | { kind: "ledger"; rows: readonly LedgerRowInput[]; openings: readonly OpeningInput[] }
  /** `cdtContractsValueDt` lấy từ nhóm gộp (mọi hợp đồng CĐT), không nhận từ ngoài. */
  | { kind: "cdt"; inputs: Omit<CdtInputs, "cdtContractsValueDt"> };

/**
 * Ghép khối số của màn chi tiết. Trả null khi hợp đồng không có số (loại không phải
 * hợp đồng kinh tế, hoặc chưa gắn đối tác). Nguồn sai loại so với đối tác là lỗi lập trình.
 */
export function buildContractFigures(
  contract: ContractRef,
  siblings: readonly ContractRef[],
  source: ContractFigureSource,
): ContractFigures | null {
  const group = resolveGroup(contract, siblings);
  if (!group) return null;

  if (group.partyKind === "cdt") {
    if (source.kind !== "cdt") throw new Error("Hợp đồng CĐT cần nguồn số CĐT");
    const cdt = buildCdtFigures({
      ...source.inputs,
      cdtContractsValueDt: group.valueDt.have > 0 ? group.valueDt.sum : null,
    });
    return {
      partyKind: "cdt",
      group,
      cdt,
      unfulfilled: buildUnfulfilled(group, cdt.performed),
      openingNote: false,
    };
  }

  if (source.kind !== "ledger") throw new Error("Hợp đồng NCC/đội thi công cần nguồn số từ sổ công nợ");
  const ledger = buildLedgerFigures(source.rows, source.openings);
  return {
    partyKind: group.partyKind,
    group,
    ledger,
    unfulfilled: buildUnfulfilled(group, ledger.performed),
    openingNote: ledger.debt.openingNote,
  };
}
