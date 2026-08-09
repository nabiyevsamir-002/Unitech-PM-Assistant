"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2, Plus, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/providers/i18n-provider";
import { formatDate } from "@/lib/format";
import { ingestDocument, deleteDocument } from "@/app/actions/documents";
import type { DocumentDTO } from "@/lib/types";

export function DocumentsView({
  documents,
  canManage,
}: {
  documents: DocumentDTO[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const add = () =>
    startTransition(async () => {
      const res = await ingestDocument({ title: title.trim(), content });
      if (res.ok) {
        toast.success(res.message);
        setTitle("");
        setContent("");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  const remove = (id: string) => {
    setDeletingId(id);
    startTransition(async () => {
      const res = await deleteDocument(id);
      setDeletingId(null);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.documents.title}</h1>
        <p className="text-sm text-muted-foreground">{t.documents.subtitle}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Add form (PM+ only) */}
        {canManage && (
          <Card className="lg:order-2 h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="size-4.5 text-primary" />
                {t.documents.add}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t.documents.docTitle}</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t.documents.content}</Label>
                <Textarea
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t.documents.contentPlaceholder}
                />
              </div>
              <Button
                onClick={add}
                disabled={pending || !title.trim() || !content.trim()}
                className="w-full"
              >
                {pending && !deletingId ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {pending && !deletingId ? t.documents.adding : t.documents.add}
              </Button>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {t.documents.ragTip}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Document list */}
        <div className="space-y-3 lg:order-1">
          {documents.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              {t.documents.empty}
            </Card>
          ) : (
            documents.map((d) => (
              <Card key={d.id}>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.chunkCount} {t.documents.chunks} · {formatDate(d.createdAt)}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => remove(d.id)}
                      disabled={pending}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      title={t.common.delete}
                    >
                      {deletingId === d.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
