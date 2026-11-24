# Phase 2 implementation report — pure contract figures

Status: DONE. 45/45 unit tests pass; `npx tsc --noEmit` reports 0 errors (whole repo); `npx eslint lib/du-an/contract-detail` clean. Every file is under 200 lines; no `@/lib/prisma` import; money only via `Prisma.Decimal`; outputs are decimal strings (exact, `toFixed()`), dates are `YYYY-MM-DD` strings.

## Files

`lib/du-an/contract-detail/`: `types.ts` (197), `ledger-figures.ts` (195), `invoice-grouping.ts` (94), `cdt-figures.ts` (158), `unfulfilled.ts` (33), `contract-group.ts` (119), `list-figures.ts` (155).
`__tests__/`: `ledger-figures`, `invoice-grouping`, `cdt-figures`, `unfulfilled`, `contract-group`, `list-figures` (`.test.ts`).

## Exported API

```ts
// types.ts
type DecimalLike = Prisma.Decimal | string;        // number deliberately not accepted
type DateLike = Date | string;
const PARTY_KINDS = ["ncc", "doi_thi_cong", "cdt"]; type PartyKind; type LedgerPartyKind;
const ECONOMIC_CONTRACT_DOC_TYPE = "contract";
function parsePartyKind(raw: string | null): PartyKind | null;
interface LedgerRowInput { id; entityId; date: DateLike; transactionType: TransactionType; invoiceNo; invoiceDate;
  content; qty: DecimalLike | null; itemName; incTt; incHd; decTt; decHd: DecimalLike }
interface OpeningInput { entityId; openingTt; openingHd }
interface ContractRef { id; projectId; docType; partyKind: string | null; supplierId; contractorId;
  valueVnd: DecimalLike | null; valueTtVnd: DecimalLike | null; deletedAt: Date | null }
interface CdtAcceptanceInput / CdtInvoiceInput / CdtCashflowInput   // optional deletedAt, filtered defensively
interface CdtInputs { acceptances; invoices; cashflows; projectContractValue; cdtContractsValueDt }
interface PerformedTotals { layHang; hoaDon; chuyenTien }
interface GroupValue { sum; have; total }  interface ContractGroup { partyKind; contractIds; valueDt; valueTt }
type UnfulfilledCell = { kind: "amount"; value: string } | { kind: "missing"; have: number; total: number };
interface UnfulfilledTable { layHang; hoaDon; chuyenTien: { dt; tt: UnfulfilledCell } }
type ContractFigures = { partyKind: "ncc"|"doi_thi_cong"; ledger: LedgerFigures; group; unfulfilled; openingNote }
                     | { partyKind: "cdt"; cdt: CdtFigures; group; unfulfilled; openingNote: false };
interface ListFigure { debtTt: string | null }
toDec, decStr, isoDate, isoDateOrNull, ZERO

// ledger-figures.ts
buildLedgerFigures(rows: readonly LedgerRowInput[], openings: readonly OpeningInput[]): LedgerFigures
// LedgerFigures = { lists: { layHang, hoaDon: InvoiceGroup[], hoaDonMissingNoCount, chuyenTien } | null,
//   totals: { layHang(ΣA), thueHd(T), hoaDon(ΣB), chuyenTienTt, chuyenTienHd },
//   debt: { dauKyTt, dauKyHd, conPhaiTraTt, conPhaiTraHd, hoaDonConPhaiLay(G), openingNote },
//   performed: { layHang: ΣA−T, hoaDon: ΣB, chuyenTien: ΣC_hd }, byEntity: { entityId, conPhaiTraTt, conPhaiTraHd }[] }
INVOICE_TAX_TYPE = "thue_hd" satisfies TransactionType

// invoice-grouping.ts
groupInvoiceRows<T extends { invoiceNo; invoiceDate; amount }>(rows): { groups: InvoiceGroup<T>[]; missingNoCount }
MISSING_INVOICE_NO_LABEL = "Chưa ghi số HĐ"

// cdt-figures.ts
buildCdtFigures(inputs: CdtInputs): CdtFigures
// { lists: { nghiemThu, hoaDonXuat, daNhan }, nghiemThu(A'), hoaDonXuat(B'), daNhan(C'),
//   conPhaiThuTheoNghiemThu, conPhaiThuTheoHoaDon, hoaDonConPhaiXuat,
//   projectContractValue, cdtContractsValueDt, projectValueMismatch, performed }
CDT_CASH_IN_DIRECTION = "cdt_to_cty", CDT_CASH_OUT_DIRECTION = "cty_to_cdt"

// unfulfilled.ts
buildUnfulfilled(groupValues: Pick<ContractGroup, "valueDt"|"valueTt">, performed: PerformedTotals): UnfulfilledTable

// contract-group.ts
resolveGroup(contract: ContractRef, siblings: readonly ContractRef[]): ContractGroup | null
buildContractFigures(contract, siblings, source: ContractFigureSource): ContractFigures | null
type ContractFigureSource = { kind: "ledger"; rows; openings } | { kind: "cdt"; inputs: Omit<CdtInputs, "cdtContractsValueDt"> }

// list-figures.ts
buildListFigure(contract: ContractRef, canonical: { material; labor: readonly ReportPairRow[] },
                cdtTotals: { nghiemThu; daNhan: DecimalLike }): ListFigure
sumByEntityRounded(rows: readonly EntityAmountInput[]): PairTotals
sumReportRows(rows: readonly PairTotals[]): PairTotals
sumComponentsByEntity(rows): Map<entityId, EntityComponents>
// PairTotals = the 8 numeric fields of DetailRow (openingTt, phatSinhTt, daTraTt, cuoiKyTt, …Hd)
// ReportPairRow = PairTotals + entityId, partyId, projectId — DetailRow satisfies it structurally
```

## Test mapping (spec table → test)

| Spec | Test file → case |
|---|---|
| U1 | ledger-figures: "tính ΣA, T, ΣB, ΣC…", "dòng điều chỉnh TT dương / HĐ âm…" |
| U2 | invoice-grouping: `" HD1" và "HD1" gộp một nhóm…`; ledger-figures: "danh sách Lấy hóa đơn gom theo số HĐ…" |
| U3 | list-figures: "làm tròn theo từng Chủ thể rồi mới cộng: 0,50 + 0,50…" |
| U4 | ledger-figures: "V_dt 2000, V_tt 1800…" (1010/810, 1280/1080, 1330/1130) |
| U5 | unfulfilled: "V_tt chưa nhập… V_dt = 0…" |
| U6 | contract-group: "nhóm 3 hợp đồng… TT 2/3, DT cộng đủ 3"; unfulfilled: "missing 2/3 ở cả ba dòng" |
| U7 | contract-group: "không phải hợp đồng kinh tế hoặc chưa gắn đối tác: không có khối số" (+ resolveGroup null cases) |
| U8 | cdt-figures: "A', B', C' gồm VAT…" (100 / 55 / 80, 20 / −25, 45) |
| U9 | ledger-figures: "cặp chỉ có số dư đầu kỳ…", "cặp không có gì…" |
| U10 | cdt-figures: "5000 lệch 4800 thì bật cờ…", "null thì không bật cờ" |
| U11 | list-figures: "NCC: cuối kỳ TT = Σ qua các Chủ thể…", "CĐT: A' − C'" |

Test names describe behaviour (no U-codes), per the repo rule on stable artifacts.

## Ambiguities resolved

1. **`sumByEntityRounded` input.** The brief suggested it accept `queryDetailReport` rows, but those are already rounded per entity, so U3 (0.50 + 0.50) could not be expressed. It instead takes the unrounded ledger side (`LedgerRowInput` and `OpeningInput` both fit `EntityAmountInput` structurally): `sumByEntityRounded([...openings, ...rows])`. It sums exactly per entity, rounds `toFixed(0)` per entity (cuối kỳ rounded from the exact value, the way the report does it), then adds the entities. It returns the 8 fields under `DetailRow` names. For the report side, `sumReportRows(detailRows)` gives the same shape, so the Phase 4 tie-out compares field by field.
2. **`buildListFigure` signature.** The spec lists `(canonicalPairRows, cdtTotals)`. The function also needs the contract to know `partyKind` and which party to pick, so it is `(contract, { material, labor }, cdtTotals)`. It filters the rows by `partyId` and `projectId` itself, so the loader passes the two report results unchanged.
3. **Rows with no invoice number in list B.** Each one stands alone ("đứng riêng"), with its own key `none:<n>`. `hoaDonMissingNoCount` feeds the line "N dòng chưa ghi số HĐ". Numbers are trimmed with JS `trim()` (a superset of `btrim`).
4. **Composition.** I added `buildContractFigures` to `contract-group.ts` so that the U7 gate, the group, the figures and the unfulfilled table come from one tested function. For CĐT, `cdtContractsValueDt` comes from the group (the sum of the entered `valueVnd`, or null when no CĐT contract has a value), so the loader does not compute it a second time.
5. **Hiding the ledger lists.** `LedgerFigures.lists` is typed `| null`. The builder always fills it, and the Phase 4 loader sets it to null when the user lacks `cong-no-vt`/`cong-no-nc`.
6. **CĐT lists.** `CdtFigures.lists` carries the acceptance, invoice and cash-flow rows that count toward A', B' and C', for the source lists in Phase 5. The deleted, zero-acceptance and `cty_to_doi` rows are excluded. The input types carry only the display fields those lists need.
7. **Extras for later banners.** `LedgerFigures.byEntity` gives the debt per Chủ thể, for the banner when a pair has 2 or more Chủ thể. `parsePartyKind` treats an unknown `partyKind` string as unbound.

## Unresolved questions

None blocking. Phase 4 should confirm it wants `buildListFigure(contract, {material, labor}, cdtTotals)`, which differs from the two-argument form in the spec.
