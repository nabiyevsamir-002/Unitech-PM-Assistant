"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Upload, Download, Trash2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";
import { listAttachments } from "@/app/actions/attachments";
import { formatDate } from "@/lib/format";
import type { AttachmentDTO } from "@/lib/types";

export function AttachmentsPanel({
  taskId,
  projectId,
}: {
  taskId?: string;
  projectId?: string;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<AttachmentDTO[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    listAttachments({ taskId, projectId }).then((a) => {
      if (active) {
        setItems(a);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [taskId, projectId]);

  const onPick = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (taskId) fd.append("taskId", taskId);
      if (projectId) fd.append("projectId", projectId);
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({ ok: false }));
      if (res.ok && data.ok) {
        setItems((prev) => [data.attachment, ...prev]);
        toast.success(t.attachments.uploaded);
      } else {
        toast.error(data.message ?? t.common.somethingWrong);
      }
    } catch {
      toast.error(t.common.somethingWrong);
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((x) => x.id !== id));
      toast.success(t.attachments.deleted);
    } else {
      toast.error(t.common.somethingWrong);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="size-4" />
          {t.attachments.title}
        </span>
        <Button size="sm" variant="outline" onClick={onPick} disabled={uploading}>
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {t.attachments.upload}
        </Button>
        <input ref={inputRef} type="file" className="hidden" onChange={onFile} />
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t.common.loading}
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          {t.attachments.empty}
        </p>
      ) : (
        <div className="divide-y overflow-hidden rounded-lg border">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(a.createdAt)}
                </p>
              </div>
              <a
                href={`/api/attachments/${a.id}`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title={t.attachments.download}
              >
                <Download className="size-4" />
              </a>
              <button
                onClick={() => onDelete(a.id)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title={t.common.delete}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
