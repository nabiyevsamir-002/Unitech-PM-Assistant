"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BoardColumn } from "./board-column";
import { TaskCard } from "./task-card";
import { TaskDialog } from "./task-dialog";
import { BOARD_COLUMNS } from "@/lib/constants";
import { moveTask } from "@/app/actions/tasks";
import { useI18n } from "@/components/providers/i18n-provider";
import type { ProjectDTO, TaskDTO } from "@/lib/types";

type Columns = Record<string, TaskDTO[]>;

function groupByColumn(tasks: TaskDTO[]): Columns {
  const cols: Columns = { TODO: [], IN_PROGRESS: [], REVIEW: [], DONE: [] };
  for (const t of tasks) (cols[t.status] ??= []).push(t);
  for (const key of Object.keys(cols)) {
    cols[key].sort((a, b) => a.orderIndex - b.orderIndex);
  }
  return cols;
}

function SortableTaskCard({
  task,
  showProject,
  onClick,
}: {
  task: TaskDTO;
  showProject: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      showProject={showProject}
      dragging={isDragging}
      onClick={onClick}
      dragHandleProps={{ ...attributes, ...listeners }}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
    />
  );
}

export function KanbanBoard({
  initialTasks,
  projects,
  team,
  activeProjectId,
}: {
  initialTasks: TaskDTO[];
  projects: ProjectDTO[];
  team: { id: string; name: string }[];
  activeProjectId?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [columns, setColumns] = useState<Columns>(() => groupByColumn(initialTasks));
  const [activeTask, setActiveTask] = useState<TaskDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const [addColumn, setAddColumn] = useState<string | undefined>();
  const draggingRef = useRef(false);

  // Re-sync from server when not mid-drag (after create/edit/delete refresh).
  useEffect(() => {
    if (!draggingRef.current) setColumns(groupByColumn(initialTasks));
  }, [initialTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
  );

  const showProject = !activeProjectId;

  const findContainer = (id: string): string | undefined => {
    if (id in columns) return id;
    return Object.keys(columns).find((key) =>
      columns[key].some((task) => task.id === id),
    );
  };

  const onDragStart = (e: DragStartEvent) => {
    draggingRef.current = true;
    const id = String(e.active.id);
    const container = findContainer(id);
    const task = container?.length
      ? columns[container].find((x) => x.id === id)
      : undefined;
    setActiveTask(task ?? null);
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const from = findContainer(activeId);
    const to = findContainer(overId);
    if (!from || !to || from === to) return;

    setColumns((prev) => {
      const fromItems = [...prev[from]];
      const toItems = [...prev[to]];
      const movingIndex = fromItems.findIndex((x) => x.id === activeId);
      if (movingIndex === -1) return prev;
      const [moving] = fromItems.splice(movingIndex, 1);

      const overIndex = toItems.findIndex((x) => x.id === overId);
      const insertAt = overIndex === -1 ? toItems.length : overIndex;
      toItems.splice(insertAt, 0, { ...moving, status: to });

      return { ...prev, [from]: fromItems, [to]: toItems };
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    draggingRef.current = false;
    setActiveTask(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const to = findContainer(overId) ?? findContainer(activeId);
    if (!to) return;

    // Compute the reordered destination column from current state.
    const items = [...columns[to]];
    const oldIndex = items.findIndex((x) => x.id === activeId);
    let newIndex = items.findIndex((x) => x.id === overId);
    if (newIndex === -1) newIndex = items.length - 1;

    if (oldIndex !== -1 && oldIndex !== newIndex) {
      const [m] = items.splice(oldIndex, 1);
      items.splice(newIndex, 0, m);
    }
    const reordered = items.map((x) => ({ ...x, status: to }));
    setColumns((prev) => ({ ...prev, [to]: reordered }));

    // Persist outside the state updater: set status + re-index destination.
    const orderedIds = reordered.map((x) => x.id);
    moveTask(activeId, to, orderedIds).then((res) => {
      if (!res.ok && res.message) toast.error(res.message);
    });
  };

  const openNew = (status?: string) => {
    setEditing(null);
    setAddColumn(status);
    setDialogOpen(true);
  };
  const openEdit = (task: TaskDTO) => {
    setEditing(task);
    setDialogOpen(true);
  };

  const allTaskIds = useMemo(
    () => Object.values(columns).flat().map((x) => x.id),
    [columns],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.board.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={activeProjectId ?? "all"}
            onValueChange={(v) =>
              router.push(v === "all" ? "/board" : `/board?project=${v}`)
            }
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.board.allProjects}</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => openNew()}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t.board.addTask}</span>
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto thin-scrollbar pb-2">
          <SortableContext items={allTaskIds}>
            {BOARD_COLUMNS.map((col) => (
              <BoardColumn
                key={col}
                status={col}
                count={columns[col]?.length ?? 0}
                onAdd={() => openNew(col)}
              >
                <SortableContext
                  items={(columns[col] ?? []).map((x) => x.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {(columns[col] ?? []).map((task) => (
                    <SortableTaskCard
                      key={task.id}
                      task={task}
                      showProject={showProject}
                      onClick={() => openEdit(task)}
                    />
                  ))}
                </SortableContext>
              </BoardColumn>
            ))}
          </SortableContext>
        </div>

        <DragOverlay>
          {activeTask ? (
            <TaskCard task={activeTask} showProject={showProject} />
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        defaultProjectId={activeProjectId}
        defaultStatus={addColumn}
        projects={projects}
        team={team}
        allTasks={initialTasks.map((x) => ({
          id: x.id,
          title: x.title,
          projectId: x.projectId,
        }))}
      />
    </div>
  );
}
