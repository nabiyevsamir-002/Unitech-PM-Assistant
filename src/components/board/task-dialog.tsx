"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { TimeLogPanel } from "@/components/time/time-log-panel";
import { useI18n } from "@/components/providers/i18n-provider";
import { PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { createTask, updateTask, deleteTask } from "@/app/actions/tasks";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

type TeamMember = { id: string; name: string };

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function DependencyPicker({
  projectId,
  currentTaskId,
  allTasks,
  selected,
  onChange,
}: {
  projectId: string;
  currentTaskId?: string;
  allTasks: { id: string; title: string; projectId: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const candidates = allTasks.filter(
    (x) => x.projectId === projectId && x.id !== currentTaskId,
  );
  if (candidates.length === 0) return null;

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );

  return (
    <div className="space-y-1.5">
      <Label>{t.timeline.dependencies}</Label>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto thin-scrollbar rounded-lg border p-2">
        {candidates.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={
                "rounded-md border px-2 py-1 text-xs transition-colors " +
                (on
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-accent")
              }
            >
              {c.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultProjectId,
  defaultStatus,
  projects,
  team,
  allTasks = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: TaskDTO | null;
  defaultProjectId?: string;
  defaultStatus?: string;
  projects: ProjectDTO[];
  team: TeamMember[];
  allTasks?: { id: string; title: string; projectId: string }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("TODO");
  const [priority, setPriority] = useState("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("none");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [depIds, setDepIds] = useState<string[]>([]);

  // Sync form when opening / switching task.
  useEffect(() => {
    if (!open) return;
    if (task) {
      setProjectId(task.projectId);
      setTitle(task.title);
      setDescription(task.description ?? "");
      setStatus(task.status);
      setPriority(task.priority);
      setAssigneeId(task.assignee?.id ?? "none");
      setStartDate(toDateInput(task.startDate));
      setDueDate(toDateInput(task.dueDate));
      setEstimatedHours(task.estimatedHours != null ? String(task.estimatedHours) : "");
      setDepIds(task.dependsOnTaskIds ?? []);
    } else {
      setProjectId(defaultProjectId ?? projects[0]?.id ?? "");
      setTitle("");
      setDescription("");
      setStatus(defaultStatus ?? "TODO");
      setPriority("MEDIUM");
      setAssigneeId("none");
      setStartDate("");
      setDueDate("");
      setEstimatedHours("");
      setDepIds([]);
    }
  }, [open, task, defaultProjectId, defaultStatus, projects]);

  const save = () => {
    if (!title.trim()) {
      toast.error("Başlıq boş ola bilməz");
      return;
    }
    startTransition(async () => {
      const payload = {
        projectId,
        title: title.trim(),
        description: description || null,
        status: status as (typeof TASK_STATUSES)[number],
        priority: priority as (typeof PRIORITIES)[number],
        assigneeId: assigneeId === "none" ? null : assigneeId,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        estimatedHours: estimatedHours ? Number(estimatedHours) : null,
        dependsOnTaskIds: depIds,
      };
      const res = task
        ? await updateTask(task.id, payload)
        : await createTask(payload);
      if (res.ok) {
        toast.success(res.message);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const remove = () => {
    if (!task) return;
    startTransition(async () => {
      const res = await deleteTask(task.id);
      if (res.ok) {
        toast.success(res.message);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? t.board.editTask : t.board.newTask}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details">
          {task && (
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">{t.time.details}</TabsTrigger>
              <TabsTrigger value="files">{t.attachments.tab}</TabsTrigger>
              <TabsTrigger value="time">{t.time.tab}</TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="details" className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>{t.common.title}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t.common.description}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t.common.project}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t.common.assignee}</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.common.unassigned}</SelectItem>
                  {team.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t.common.status}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {(t.status as Record<string, string>)[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t.common.priority}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {(t.priority as Record<string, string>)[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t.common.startDate}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t.common.dueDate}</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                {t.reports.assignedHours} ({t.common.optional})
              </Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
              />
            </div>
          </div>

          <DependencyPicker
            projectId={projectId}
            currentTaskId={task?.id}
            allTasks={allTasks}
            selected={depIds}
            onChange={setDepIds}
          />
          </TabsContent>

          {task && (
            <>
              <TabsContent value="files" className="mt-4">
                <AttachmentsPanel taskId={task.id} />
              </TabsContent>
              <TabsContent value="time" className="mt-4">
                <TimeLogPanel
                  taskId={task.id}
                  estimatedHours={task.estimatedHours}
                />
              </TabsContent>
            </>
          )}
        </Tabs>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {task ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={remove}
              disabled={pending}
            >
              <Trash2 className="size-4" />
              {t.common.delete}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={save} disabled={pending}>
              {t.common.save}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
