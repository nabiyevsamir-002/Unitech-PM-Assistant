// Serializable DTOs passed from Server Components to Client Components.

export type UserDTO = {
  id: string;
  name: string;
  email: string;
  role: string;
  position: string | null;
  avatar: string | null;
  weeklyCapacityHours: number;
  skills: string[];
  isActive: boolean;
  totpEnabled: boolean;
  // Leave / unavailability window (yyyy-mm-dd strings, or null). Serializable.
  unavailableFrom: string | null;
  unavailableTo: string | null;
};

export type TaskDTO = {
  id: string;
  projectId: string;
  projectName?: string;
  projectColor?: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  orderIndex: number;
  estimatedHours: number | null;
  loggedHours: number | null;
  assignee: { id: string; name: string; avatar: string | null } | null;
  parentTaskId: string | null;
  dependsOnTaskIds: string[];
  createdAt: string;
};

export type ProjectDTO = {
  id: string;
  name: string;
  status: string;
  clientName: string | null;
  startDate: string | null;
  dueDate: string | null;
  currency: string;
  color: string | null;
  taskCount: number;
  doneCount: number;
  excelConnected: boolean;
};

export type ClientDTO = {
  id: string;
  name: string;
};

export type OnboardingProject = {
  id: string;
  name: string;
  excelConnected: boolean;
  excelConfirmed: boolean;
};

export type ApprovalDTO = {
  id: string;
  type: string;
  proposedByAgent: string;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
  status: string;
  requestedAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  reason: string | null;
};

export type AuditLogDTO = {
  id: string;
  action: string;
  actorKind: "user" | "agent" | "system";
  actorLabel: string; // user name, agent code (e.g. "Planning"), or raw actor
  entityType: string; // "task" | "project" | "message" | ...
  entityId: string;
  entityTitle: string | null; // current title if the entity still exists
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  timestamp: string;
  revertible: boolean;
};

export type DocumentDTO = {
  id: string;
  title: string;
  chunkCount: number;
  createdAt: string;
};

export type DigestDTO = {
  overdue: number;
  dueToday: number;
  pendingApprovals: number;
  overCapacity: { name: string; assigned: number; capacity: number }[];
};

export type AttachmentDTO = {
  id: string;
  fileName: string;
  fileType: string | null;
  createdAt: string;
};

export type TimeLogDTO = {
  id: string;
  hours: number;
  date: string;
  note: string | null;
  userName: string;
};

export type WorkloadDTO = {
  userId: string;
  name: string;
  avatar: string | null;
  capacity: number;
  assignedHours: number;
  openTasks: number;
};
