"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Building2,
  CalendarClock,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/shared/badges";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { useI18n } from "@/components/providers/i18n-provider";
import { formatDate } from "@/lib/format";
import { deleteProject, clearAllData } from "@/app/actions/projects";
import type { ClientDTO, ProjectDTO } from "@/lib/types";

export function ProjectsView({
  projects,
  clients,
  canCreate,
}: {
  projects: ProjectDTO[];
  clients: ClientDTO[];
  canCreate: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const onDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`«${name}» layihəsini və bütün tapşırıqlarını silmək istəyirsən? Bu geri qaytarıla bilməz.`)) {
      return;
    }
    setPendingId(id);
    const res = await deleteProject(id);
    setPendingId(null);
    if (res.ok) {
      toast.success(res.message);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  };

  const onClearAll = async () => {
    if (!window.confirm("BÜTÜN layihələri, tapşırıqları və təsdiqləri silmək istəyirsən? İstifadəçilər qalacaq. Bu geri qaytarıla bilməz.")) {
      return;
    }
    setClearing(true);
    const res = await clearAllData();
    setClearing(false);
    if (res.ok) {
      toast.success(res.message);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.projects.title}</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length} {t.projects.title.toLowerCase()}
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            {projects.length > 0 && (
              <Button variant="outline" onClick={onClearAll} disabled={clearing}>
                {clearing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                <span className="hidden sm:inline">{t.projects.clearAll}</span>
              </Button>
            )}
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">{t.projects.newProject}</span>
            </Button>
          </div>
        )}
      </div>

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
          {t.projects.noProjects}
          {canCreate && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t.projects.newProject}
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const pct =
              p.taskCount > 0
                ? Math.round((p.doneCount / p.taskCount) * 100)
                : 0;
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="mt-0.5 size-3 shrink-0 rounded-full"
                          style={{
                            backgroundColor: p.color ?? "var(--primary)",
                          }}
                        />
                        <h3 className="leading-tight font-semibold">{p.name}</h3>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={p.status} />
                        {canCreate && (
                          <button
                            type="button"
                            onClick={(e) => onDelete(e, p.id, p.name)}
                            disabled={pendingId === p.id}
                            title={t.common.delete}
                            aria-label={t.common.delete}
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            {pendingId === p.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {p.clientName && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="size-3.5" />
                        {p.clientName}
                      </p>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {t.projects.progress}
                        </span>
                        <span className="font-medium tabular-nums">
                          {p.doneCount}/{p.taskCount} · {pct}%
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>

                    <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarClock className="size-3.5" />
                        {formatDate(p.dueDate)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{p.currency}</span>
                        {p.excelConnected && (
                          <span
                            className="flex items-center gap-1 text-success"
                            title={t.projects.excelConnected}
                          >
                            <FileSpreadsheet className="size-3.5" />
                          </span>
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <NewProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        clients={clients}
      />
    </div>
  );
}
