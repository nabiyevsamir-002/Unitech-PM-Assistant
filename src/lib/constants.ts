// Domain enums (stored as String in SQLite, enforced here).

export const ROLES = ["OWNER", "DEPUTY_OWNER", "PM", "MEMBER"] as const;
export type Role = (typeof ROLES)[number];

/** Roles allowed to approve items in the human-in-the-loop gate. */
export const APPROVER_ROLES: Role[] = ["OWNER", "DEPUTY_OWNER", "PM"];
export function canApprove(role: string | undefined | null): boolean {
  return !!role && (APPROVER_ROLES as string[]).includes(role);
}

/** Roles allowed to manage team members (add / deactivate / change roles). */
export const USER_ADMIN_ROLES: Role[] = ["OWNER", "DEPUTY_OWNER"];
export function canManageUsers(role: string | undefined | null): boolean {
  return !!role && (USER_ADMIN_ROLES as string[]).includes(role);
}

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PROJECT_STATUSES = [
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_TYPES = [
  "CREATE_TASK",
  "ASSIGN_TASK",
  "CHANGE_DEADLINE",
  "CHANGE_STATUS",
  "SEND_MESSAGE",
  "EXCEL_WRITE",
  "APPROVE_USER",
] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const AGENTS = [
  "Supervisor",
  "Planning",
  "Monitoring",
  "Reporting",
  "Communication",
  "Data",
  "Assignment",
] as const;
export type AgentName = (typeof AGENTS)[number];

export const CURRENCIES = ["AZN", "USD", "EUR", "TRY", "RUB"] as const;
export type Currency = (typeof CURRENCIES)[number];

// Column ordering for the Kanban board.
export const BOARD_COLUMNS: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
];
