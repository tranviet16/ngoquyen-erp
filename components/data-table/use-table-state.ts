"use client";

import { useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { FilterValue, ResourceSpec, SortDir } from "@/lib/table/types";
import { buildQueryString, parseTableQuery } from "@/lib/table/query-params";

/**
 * URL-driven table state hook.
 * Parses current URL → TableQueryState.
 * Exposes typed setters that push new URL via router.
 */
export function useTableState(spec: ResourceSpec) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const state = parseTableQuery(
    new URLSearchParams(searchParams.toString()),
    spec
  );

  const push = useCallback(
    (updates: Partial<Parameters<typeof buildQueryString>[0]>) => {
      const next = { ...state, ...updates };
      const qs = buildQueryString(next, spec);
      startTransition(() => {
        router.push(pathname + (qs ? "?" + qs : ""));
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams, pathname, spec]
  );

  const setSort = useCallback(
    (col: string, dir: SortDir | null) => {
      push({ sort: dir ? { col, dir } : undefined, page: 1 });
    },
    [push]
  );

  const setFilter = useCallback(
    (col: string, val: FilterValue | null) => {
      const filters = { ...state.filters };
      if (val === null) {
        delete filters[col];
      } else {
        filters[col] = val;
      }
      push({ filters, page: 1 });
    },
    [push, state.filters]
  );

  const setSearch = useCallback(
    (search: string) => {
      push({ search: search || undefined, page: 1 });
    },
    [push]
  );

  const setPage = useCallback(
    (page: number) => {
      push({ page });
    },
    [push]
  );

  return { state, isPending, setSort, setFilter, setSearch, setPage };
}
