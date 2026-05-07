"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  createCommentAction,
  deleteCommentAction,
  editCommentAction,
  listCommentsAction,
} from "@/app/(app)/cong-viec/comments-actions";

const EDIT_WINDOW_MS = 5 * 60 * 1000;

interface CommentRow {
  id: number;
  taskId: number;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string | Date;
  editedAt: string | Date | null;
  canEdit: boolean;
  canDelete: boolean;
}

interface Props {
  taskId: number;
  currentUserId: string;
}

function fmt(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function isWithinEditWindow(createdAt: string | Date): boolean {
  const t = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  return Date.now() - t < EDIT_WINDOW_MS;
}

export function CommentSection({ taskId, currentUserId }: Props) {
  const [items, setItems] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, startPost] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const esRef = useRef<EventSource | null>(null);

  async function load() {
    try {
      const rows = await listCommentsAction(taskId);
      setItems(rows as CommentRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const es = new EventSource("/api/notifications/stream");
    esRef.current = es;
    es.addEventListener("message", (event) => {
      try {
        const p = JSON.parse((event as MessageEvent).data);
        if (p?.type !== "comment" || p.taskId !== taskId) return;
        if (p.action === "deleted") {
          setItems((cur) => cur.filter((c) => c.id !== p.commentId));
          return;
        }
        if (p.action === "edited") {
          setItems((cur) =>
            cur.map((c) =>
              c.id === p.commentId
                ? { ...c, body: p.body, editedAt: p.editedAt }
                : c,
            ),
          );
          return;
        }
        // created — skip if it's our own (already in list via optimistic) or duplicate
        if (p.authorId === currentUserId) return;
        setItems((cur) => {
          if (cur.some((c) => c.id === p.commentId)) return cur;
          return [
            ...cur,
            {
              id: p.commentId,
              taskId: p.taskId,
              authorId: p.authorId,
              authorName: p.authorName,
              body: p.body ?? "",
              createdAt: p.createdAt,
              editedAt: p.editedAt,
              canEdit: false,
              canDelete: false,
            },
          ];
        });
      } catch {
        // ignore
      }
    });
    return () => {
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  function submitNew() {
    const body = draft.trim();
    if (!body) return;
    startPost(async () => {
      try {
        const row = await createCommentAction(taskId, body);
        setItems((cur) => [...cur, row as CommentRow]);
        setDraft("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function startEdit(c: CommentRow) {
    setEditingId(c.id);
    setEditDraft(c.body);
  }

  function submitEdit() {
    if (editingId == null) return;
    const id = editingId;
    const body = editDraft.trim();
    if (!body) return;
    startPost(async () => {
      try {
        const row = await editCommentAction(id, body);
        setItems((cur) => cur.map((c) => (c.id === id ? (row as CommentRow) : c)));
        setEditingId(null);
        setEditDraft("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function doDelete(id: number) {
    if (!confirm("Xoá bình luận này?")) return;
    startPost(async () => {
      try {
        await deleteCommentAction(id);
        setItems((cur) => cur.filter((c) => c.id !== id));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="border-t pt-3">
      <h3 className="text-sm font-semibold mb-2">Bình luận ({items.length})</h3>

      {loading ? (
        <p className="text-xs text-muted-foreground">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có bình luận.</p>
      ) : (
        <ul className="space-y-2 mb-3 max-h-64 overflow-y-auto pr-1">
          {items.map((c) => {
            const mine = c.authorId === currentUserId;
            const editable = mine && isWithinEditWindow(c.createdAt);
            const isEditing = editingId === c.id;
            return (
              <li key={c.id} className="rounded border bg-slate-50 p-2 text-sm">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-medium text-xs">{c.authorName ?? "Người dùng"}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {fmt(c.createdAt)}
                    {c.editedAt ? " (đã sửa)" : ""}
                  </span>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      className="w-full min-h-16 rounded border border-input bg-white px-2 py-1 text-sm"
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      maxLength={4000}
                    />
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={posting}>
                        Hủy
                      </Button>
                      <Button size="sm" onClick={submitEdit} disabled={posting}>
                        Lưu
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="prose prose-sm max-w-none break-words">
                      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{c.body}</ReactMarkdown>
                    </div>
                    {(editable || c.canDelete) && (
                      <div className="flex justify-end gap-2 mt-1">
                        {editable && (
                          <button
                            type="button"
                            className="text-[11px] text-blue-600 hover:underline"
                            onClick={() => startEdit(c)}
                            disabled={posting}
                          >
                            Sửa
                          </button>
                        )}
                        {c.canDelete && (
                          <button
                            type="button"
                            className="text-[11px] text-red-600 hover:underline"
                            onClick={() => doDelete(c.id)}
                            disabled={posting}
                          >
                            Xoá
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        <textarea
          className="w-full min-h-16 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
          placeholder="Viết bình luận (markdown)…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
          disabled={posting}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submitNew} disabled={posting || !draft.trim()}>
            {posting ? "Đang gửi…" : "Gửi"}
          </Button>
        </div>
      </div>
    </div>
  );
}
