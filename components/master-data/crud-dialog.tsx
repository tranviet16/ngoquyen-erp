"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CrudDialogProps {
  title: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function CrudDialog({ title, trigger, open, onOpenChange, children }: CrudDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger as React.ReactElement} />}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

interface DeleteConfirmProps {
  onConfirm: () => Promise<void>;
  trigger: React.ReactNode;
  itemName: string;
}

export function DeleteConfirmDialog({ onConfirm, trigger, itemName }: DeleteConfirmProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Xác nhận xóa</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Bạn có chắc muốn xóa <strong>{itemName}</strong>? Thao tác này sẽ ẩn bản ghi (soft delete).
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Hủy
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading ? "Đang xóa..." : "Xóa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
