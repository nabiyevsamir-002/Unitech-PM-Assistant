// Shared helpers for the audit log + undo/rollback feature.
// AuditLog stores before/after as JSON strings; a reliable revert needs a
// complete, consistently-shaped snapshot of the revertible task fields.

import type { Task } from "@prisma/client";

/** Full revertible field set for a Task, in serializable form. */
export type TaskSnapshot = {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  startDate: string | null; // ISO
  dueDate: string | null; // ISO
  estimatedHours: number | null;
  dependsOnTaskIds: string[];
};

export function taskSnapshot(task: Task): TaskSnapshot {
  let deps: string[] = [];
  try {
    deps = JSON.parse(task.dependsOnTaskIds) as string[];
  } catch {
    deps = [];
  }
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId,
    startDate: task.startDate ? task.startDate.toISOString() : null,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    estimatedHours: task.estimatedHours,
    dependsOnTaskIds: deps,
  };
}

// Audit actions whose effect can be undone.
//  - CREATE actions revert by deleting what was created.
//  - Task update-family actions revert by restoring the `before` fields.
export const CREATE_ACTIONS = ["TASK_CREATED", "PROJECT_CREATED"] as const;

export const TASK_UPDATE_ACTIONS = [
  "TASK_UPDATED",
  "TASK_ASSIGNED",
  "TASK_STATUS_CHANGED",
  "TASK_DEADLINE_CHANGED",
] as const;

export const REVERTIBLE_ACTIONS: string[] = [
  ...CREATE_ACTIONS,
  ...TASK_UPDATE_ACTIONS,
];

/** Parses "task:<id>" → { type: "task", id: "<id>" }. */
export function parseEntity(entity: string): { type: string; id: string } {
  const idx = entity.indexOf(":");
  if (idx === -1) return { type: entity, id: "" };
  return { type: entity.slice(0, idx), id: entity.slice(idx + 1) };
}
