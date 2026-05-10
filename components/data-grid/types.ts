import type { ZodTypeAny } from "zod";

export type CellKind = "text" | "number" | "currency" | "date" | "select" | "boolean";

export type SelectOption = { id: number | string; name: string };

export interface DataGridColumn<T> {
  id: keyof T & string;
  title: string;
  width?: number;
  kind: CellKind;
  readonly?: boolean | ((row: T, role?: string) => boolean);
  options?: SelectOption[];
  validator?: ZodTypeAny;
  format?: (value: unknown, row: T) => string;
}

export interface DataGridHandlers<T> {
  onCellEdit?: (rowId: number, col: keyof T & string, value: unknown) => Promise<T | void>;
  onBulkPaste?: (rows: Partial<T>[]) => Promise<T[] | void>;
  onAddRow?: (template: Partial<T>) => Promise<T | void>;
  onDeleteRows?: (ids: number[]) => Promise<void>;
}

export interface RowWithId {
  id: number;
}
