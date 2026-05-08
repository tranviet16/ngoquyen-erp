import type { GridCell } from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import type { DropdownCellType } from "@glideapps/glide-data-grid-cells";
import type { DataGridColumn, SelectOption } from "./types";

const vndFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function isoToDmy(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso ?? "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function dmyToIso(s: string): string | null {
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s.trim());
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = (Number(y) >= 70 ? "19" : "20") + y;
  const dd = d.padStart(2, "0");
  const mm = mo.padStart(2, "0");
  const dt = new Date(`${y}-${mm}-${dd}`);
  if (!Number.isFinite(dt.getTime())) return null;
  return `${y}-${mm}-${dd}`;
}

function findOptionName(options: SelectOption[] | undefined, value: unknown): string {
  if (!options || value == null) return "";
  const v = String(value);
  return options.find((o) => String(o.id) === v)?.name ?? "";
}

export function buildCell<T>(
  row: T,
  col: DataGridColumn<T>,
  role?: string,
): GridCell {
  const raw = row[col.id];
  const readonly =
    typeof col.readonly === "function" ? col.readonly(row, role) : !!col.readonly;
  const allowOverlay = !readonly;

  const fmt = col.format;
  switch (col.kind) {
    case "text": {
      const s = raw == null ? "" : String(raw);
      const display = fmt ? fmt(raw, row) : s;
      return {
        kind: GridCellKind.Text,
        data: s,
        displayData: display,
        allowOverlay,
        readonly,
      };
    }
    case "number": {
      const n = raw == null || raw === "" ? undefined : Number(raw);
      const display = fmt
        ? fmt(raw, row)
        : Number.isFinite(n) ? String(n) : "";
      return {
        kind: GridCellKind.Number,
        data: Number.isFinite(n) ? n : undefined,
        displayData: display,
        allowOverlay,
        readonly,
        contentAlign: "right",
      };
    }
    case "currency": {
      const n = raw == null || raw === "" ? undefined : Number(raw);
      const display = fmt
        ? fmt(raw, row)
        : Number.isFinite(n) ? vndFmt.format(n!) : "";
      return {
        kind: GridCellKind.Number,
        data: Number.isFinite(n) ? n : undefined,
        displayData: display,
        allowOverlay,
        readonly,
        contentAlign: "right",
      };
    }
    case "date": {
      const iso = raw instanceof Date
        ? raw.toISOString().slice(0, 10)
        : raw == null ? "" : String(raw).slice(0, 10);
      const display = fmt ? fmt(raw, row) : isoToDmy(iso);
      // Plain Text cell — overlay editor lets user type dd/mm/yyyy (or dd-mm-yyyy / dd.mm.yyyy).
      // Avoids native <input type="date"> overlay which renders in OS locale (mm/dd/yyyy on English systems).
      return {
        kind: GridCellKind.Text,
        data: display,
        displayData: display,
        allowOverlay,
        readonly,
      };
    }
    case "select": {
      const value = raw == null ? "" : String(raw);
      const allowedValues = (col.options ?? []).map((o) => ({
        value: String(o.id),
        label: o.name,
      }));
      const display = findOptionName(col.options, raw);
      const cell: DropdownCellType = {
        kind: GridCellKind.Custom,
        allowOverlay,
        readonly,
        copyData: display,
        data: {
          kind: "dropdown-cell",
          value,
          allowedValues,
        },
      };
      return cell as unknown as GridCell;
    }
    case "boolean": {
      return {
        kind: GridCellKind.Boolean,
        data: !!raw,
        allowOverlay: false,
        readonly,
      };
    }
    default:
      return { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: false };
  }
}

export function parseCellValue<T>(col: DataGridColumn<T>, raw: unknown): unknown {
  switch (col.kind) {
    case "number":
    case "currency": {
      if (raw == null || raw === "") return null;
      const n = Number(String(raw).replace(/[,\s]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    case "boolean":
      return Boolean(raw);
    case "select": {
      if (raw == null || raw === "") return null;
      // raw may be the dropdown's `{ value, allowedValues }` payload, a plain value, or a label.
      const candidate =
        typeof raw === "object" && raw !== null && "value" in (raw as Record<string, unknown>)
          ? (raw as { value: unknown }).value
          : raw;
      if (candidate == null || candidate === "") return null;
      const opt = col.options?.find(
        (o) => String(o.id) === String(candidate) || o.name === String(candidate),
      );
      if (opt) return opt.id;
      // Numeric coercion if options use number ids
      const asNum = Number(candidate);
      return Number.isFinite(asNum) ? asNum : candidate;
    }
    case "date": {
      // DatePickerCell emits a `{ date, displayDate, format }` payload via newCell.data
      if (raw && typeof raw === "object" && "date" in (raw as Record<string, unknown>)) {
        const d = (raw as { date: Date | undefined | null }).date;
        if (d instanceof Date && Number.isFinite(d.getTime())) {
          // Use local components so timezone offset doesn't shift the day
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}`;
        }
        return null;
      }
      if (raw instanceof Date) return raw.toISOString().slice(0, 10);
      if (typeof raw === "string" && raw) {
        const iso = dmyToIso(raw) ?? (/^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null);
        return iso;
      }
      return null;
    }
    default:
      return raw == null ? null : String(raw);
  }
}
