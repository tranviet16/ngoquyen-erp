"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { SupplierForm } from "@/components/master-data/supplier-form";
import { ContractorForm } from "@/components/master-data/contractor-form";
import { EntityForm } from "@/components/master-data/entity-form";
import { ItemForm } from "@/components/master-data/item-form";
import { ProjectForm } from "@/components/master-data/project-form";
import { quickCreateRecordAction } from "@/lib/master-data/quick-create-actions";
import {
  QUICK_CREATE_LABELS,
  type ItemType,
  type QuickCreateKind,
  type QuickCreatedRecord,
} from "@/lib/master-data/quick-create-types";

export interface QuickCreateRequestOptions {
  /** Loại vật tư điền sẵn (sổ vật tư: vật liệu; sổ nhân công: nhân công). */
  itemType?: ItemType;
}

interface Props {
  kind: QuickCreateKind;
  opts: QuickCreateRequestOptions;
  /** Gọi một lần: bản ghi vừa tạo / bản ghi cũ người dùng chọn, hoặc null khi đóng hộp thoại. */
  onDone: (record: QuickCreatedRecord | null) => void;
}

type SimilarPrompt = { input: unknown; message: string; similar: QuickCreatedRecord[] };

/** Hộp thoại "Tạo mới" danh mục dùng chung cho mọi ô chọn — dùng lại đúng form của trang Danh mục. */
export function QuickCreateDialog({ kind, opts, onDone }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [prompt, setPrompt] = useState<SimilarPrompt | null>(null);
  const label = QUICK_CREATE_LABELS[kind];

  async function submit(input: unknown, allowSimilarName = false) {
    setSubmitting(true);
    try {
      const result = await quickCreateRecordAction(kind, input, { allowSimilarName });
      if (result.ok) {
        toast.success(`Đã tạo ${label} "${result.record.name}"`);
        onDone(result.record);
        return;
      }
      if (result.code === "similar_name" && result.similar?.length) {
        setPrompt({ input, message: result.message, similar: result.similar });
        return;
      }
      toast.error(result.message);
    } finally {
      setSubmitting(false);
    }
  }

  const form = (() => {
    switch (kind) {
      case "supplier":
        return <SupplierForm onSubmit={(d) => submit(d)} isSubmitting={submitting} />;
      case "contractor":
        return <ContractorForm onSubmit={(d) => submit(d)} isSubmitting={submitting} />;
      case "entity":
        return <EntityForm onSubmit={(d) => submit(d)} isSubmitting={submitting} />;
      case "item":
        return (
          <ItemForm
            defaultValues={opts.itemType ? { type: opts.itemType } : undefined}
            onSubmit={(d) => submit(d)}
            isSubmitting={submitting}
          />
        );
      case "project":
        return <ProjectForm onSubmit={(d) => submit(d)} isSubmitting={submitting} />;
    }
  })();

  return (
    <CrudDialog
      title={`Tạo ${label} mới`}
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onDone(null);
      }}
    >
      {/* Giữ form (ẩn) khi đang hỏi trùng tên để "Quay lại" còn nguyên dữ liệu đã nhập. */}
      <div hidden={prompt != null}>{form}</div>
      {prompt && (
        <div className="space-y-3">
          <p className="text-sm">{prompt.message}</p>
          <ul className="space-y-2">
            {prompt.similar.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>
                  {r.code ? <span className="text-muted-foreground">{r.code} — </span> : null}
                  {r.name}
                </span>
                <Button size="sm" variant="outline" disabled={submitting} onClick={() => onDone(r)}>
                  Dùng bản ghi này
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" disabled={submitting} onClick={() => setPrompt(null)}>
              Quay lại
            </Button>
            <Button disabled={submitting} onClick={() => submit(prompt.input, true)}>
              {submitting ? "Đang lưu..." : "Vẫn tạo mới"}
            </Button>
          </div>
        </div>
      )}
    </CrudDialog>
  );
}
