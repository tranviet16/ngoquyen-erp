import { describe, it, expect } from "vitest";
import { deriveResourceSpec } from "../derive-spec";
import type { ColumnDef } from "@/components/data-table/types";
import type { ResourceSpec } from "../types";

// ---------------------------------------------------------------------------
// Shared base spec
// ---------------------------------------------------------------------------

const BASE: ResourceSpec = {
  searchableColumns: ["name"],
  sortable: {},
  filterable: {},
  defaultSort: { col: "name", dir: "asc" },
  defaultPageSize: 20,
};

// Helper: produce an empty-override spec
function derive<T extends Record<string, unknown>>(
  columns: ColumnDef<T>[],
  override?: Partial<ResourceSpec>
): ResourceSpec {
  return deriveResourceSpec(columns, BASE, override);
}

// ---------------------------------------------------------------------------
// Default-on behavior
// ---------------------------------------------------------------------------

describe("deriveResourceSpec — default-on (kind set)", () => {
  it("text column → sortable + filterable by default", () => {
    const spec = derive([{ key: "name", header: "Name", kind: "text" }]);
    expect(spec.sortable["name"]).toBe("string");
    expect(spec.filterable["name"]).toEqual({ kind: "text" });
  });

  it("number column → sortable as 'number', filterable as 'range'", () => {
    const spec = derive([{ key: "amount", header: "Amount", kind: "number" }]);
    expect(spec.sortable["amount"]).toBe("number");
    expect(spec.filterable["amount"]).toEqual({ kind: "range" });
  });

  it("currency column → sortable as 'number', filterable as 'range'", () => {
    const spec = derive([{ key: "price", header: "Price", kind: "currency" }]);
    expect(spec.sortable["price"]).toBe("number");
    expect(spec.filterable["price"]).toEqual({ kind: "range" });
  });

  it("date column → sortable as 'date', filterable as 'dateRange'", () => {
    const spec = derive([{ key: "createdAt", header: "Created", kind: "date" }]);
    expect(spec.sortable["createdAt"]).toBe("date");
    expect(spec.filterable["createdAt"]).toEqual({ kind: "dateRange" });
  });

  it("select column → sortable as 'string', filterable as 'equals'", () => {
    const opts = [{ id: "a", name: "A" }];
    const spec = derive([
      { key: "status", header: "Status", kind: "select", filterOptions: opts },
    ]);
    expect(spec.sortable["status"]).toBe("string");
    expect(spec.filterable["status"]).toEqual({ kind: "equals", options: opts });
  });

  it("boolean column → sortable as 'string', filterable as 'equals'", () => {
    const spec = derive([{ key: "active", header: "Active", kind: "boolean" }]);
    expect(spec.sortable["active"]).toBe("string");
    expect(spec.filterable["active"]).toEqual({ kind: "equals" });
  });
});

// ---------------------------------------------------------------------------
// Opt-out behavior
// ---------------------------------------------------------------------------

describe("deriveResourceSpec — opt-out with explicit false", () => {
  it("sortable:false → column absent from sortable map", () => {
    const spec = derive([
      { key: "name", header: "Name", kind: "text", sortable: false },
    ]);
    expect(spec.sortable["name"]).toBeUndefined();
    expect(spec.filterable["name"]).toEqual({ kind: "text" }); // filterable still on
  });

  it("filterable:false → column absent from filterable map", () => {
    const spec = derive([
      { key: "name", header: "Name", kind: "text", filterable: false },
    ]);
    expect(spec.sortable["name"]).toBe("string"); // sortable still on
    expect(spec.filterable["name"]).toBeUndefined();
  });

  it("both sortable:false and filterable:false → absent from both maps", () => {
    const spec = derive([
      { key: "name", header: "Name", kind: "text", sortable: false, filterable: false },
    ]);
    expect(spec.sortable["name"]).toBeUndefined();
    expect(spec.filterable["name"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Kind-less columns
// ---------------------------------------------------------------------------

describe("deriveResourceSpec — kind-less columns are skipped", () => {
  it("column without kind is not added to sortable or filterable", () => {
    const spec = derive([
      { key: "id", header: "ID" }, // no kind
      { key: "name", header: "Name", kind: "text" },
    ]);
    expect(spec.sortable["id"]).toBeUndefined();
    expect(spec.filterable["id"]).toBeUndefined();
    expect(spec.sortable["name"]).toBe("string"); // other col still included
  });

  it("render-only column with no kind produces empty maps when alone", () => {
    const spec = derive([{ key: "actions", header: "Actions" }]);
    expect(Object.keys(spec.sortable)).toHaveLength(0);
    expect(Object.keys(spec.filterable)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FK column behavior
// ---------------------------------------------------------------------------

describe("deriveResourceSpec — FK columns", () => {
  it("fk column: sort key = relation.sortField, filter key = col.key", () => {
    const spec = derive([
      {
        key: "entityId",
        header: "Entity",
        kind: "fk",
        fk: { relation: "entity", sortField: "name" },
      },
    ]);
    expect(spec.sortable["entity.name"]).toBe("string");
    expect(spec.sortable["entityId"]).toBeUndefined(); // raw key not in sortable
    expect(spec.filterable["entityId"]).toEqual({ kind: "equals" });
  });

  it("fk column with options propagates options to filterable", () => {
    const opts = [{ id: "1", name: "Acme" }];
    const spec = derive([
      {
        key: "entityId",
        header: "Entity",
        kind: "fk",
        fk: { relation: "entity", sortField: "name", options: opts },
      },
    ]);
    expect(spec.filterable["entityId"]).toEqual({ kind: "equals", options: opts });
  });

  it("fk col falls back to filterOptions if fk.options absent", () => {
    const opts = [{ id: "2", name: "Beta" }];
    const spec = derive([
      {
        key: "entityId",
        header: "Entity",
        kind: "fk",
        fk: { relation: "entity", sortField: "name" },
        filterOptions: opts,
      },
    ]);
    expect(spec.filterable["entityId"]).toEqual({ kind: "equals", options: opts });
  });

  it("fk.options takes priority over filterOptions", () => {
    const fkOpts = [{ id: "1", name: "FK" }];
    const filterOpts = [{ id: "2", name: "Filter" }];
    const spec = derive([
      {
        key: "entityId",
        header: "Entity",
        kind: "fk",
        fk: { relation: "entity", sortField: "name", options: fkOpts },
        filterOptions: filterOpts,
      },
    ]);
    expect(spec.filterable["entityId"]).toEqual({ kind: "equals", options: fkOpts });
  });
});

// ---------------------------------------------------------------------------
// Override precedence
// ---------------------------------------------------------------------------

describe("deriveResourceSpec — override map wins", () => {
  it("override.sortable fully replaces derived sortable map", () => {
    const spec = derive(
      [{ key: "name", header: "Name", kind: "text" }],
      { sortable: { customCol: "number" } }
    );
    // override entirely replaced the map — derived "name" is gone
    expect(spec.sortable).toEqual({ customCol: "number" });
  });

  it("override.filterable fully replaces derived filterable map", () => {
    const spec = derive(
      [{ key: "name", header: "Name", kind: "text" }],
      { filterable: { customCol: { kind: "range" } } }
    );
    expect(spec.filterable).toEqual({ customCol: { kind: "range" } });
  });

  it("override does not affect base fields like searchableColumns", () => {
    const spec = derive(
      [{ key: "name", header: "Name", kind: "text" }],
      { sortable: {} }
    );
    expect(spec.searchableColumns).toEqual(BASE.searchableColumns);
    expect(spec.defaultSort).toEqual(BASE.defaultSort);
    expect(spec.defaultPageSize).toBe(BASE.defaultPageSize);
  });

  it("without override, base fields are preserved and maps are derived", () => {
    const spec = derive([{ key: "name", header: "Name", kind: "text" }]);
    expect(spec.searchableColumns).toEqual(BASE.searchableColumns);
    expect(spec.defaultSort).toEqual(BASE.defaultSort);
    expect(spec.sortable["name"]).toBe("string");
    expect(spec.filterable["name"]).toEqual({ kind: "text" });
  });
});
