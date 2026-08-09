import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOverdue } from "@/lib/format";
import { notifyApprovalCreated } from "@/lib/notify";
import type { AiContext } from "./context";

// ---- Ollama tool (function-calling) definitions. English on purpose. ----
export const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "get_overdue_tasks",
      description:
        "List tasks that are past their due date and not done. Use for risk/monitoring questions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_workload",
      description:
        "Get each active team member's assigned open-task hours vs weekly capacity. Use for balancing / who is overloaded.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project_status",
      description: "Get status and task breakdown for one project (or all).",
      parameters: {
        type: "object",
        properties: {
          projectName: { type: "string", description: "Project name, optional." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_reassign_task",
      description:
        "Propose reassigning a task to a different team member. This is a CRITICAL action: it is NOT executed, it is sent to a human for approval.",
      parameters: {
        type: "object",
        properties: {
          taskTitle: { type: "string" },
          newAssigneeName: { type: "string" },
          reason: { type: "string" },
        },
        required: ["taskTitle", "newAssigneeName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_change_deadline",
      description:
        "Propose changing a task's deadline. CRITICAL action: sent to a human for approval, not executed.",
      parameters: {
        type: "object",
        properties: {
          taskTitle: { type: "string" },
          newDueDate: { type: "string", description: "YYYY-MM-DD" },
          reason: { type: "string" },
        },
        required: ["taskTitle", "newDueDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_create_task",
      description:
        "Propose creating a new task in a project. CRITICAL action: sent for approval.",
      parameters: {
        type: "object",
        properties: {
          projectName: { type: "string" },
          title: { type: "string" },
          priority: { type: "string", description: "LOW|MEDIUM|HIGH|URGENT" },
          assigneeName: { type: "string" },
        },
        required: ["projectName", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_send_message",
      description:
        "Draft a message/email to a client or teammate. CRITICAL action: sent for approval, never sent automatically.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "body"],
      },
    },
  },
] as const;

// JSON schema for constrained decision output — far more reliable on a local
// model than native function-calling. Ollama enforces this via `format`.
export const DECISION_SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "none",
        "reassign_task",
        "change_deadline",
        "create_task",
        "send_message",
      ],
    },
    taskTitle: { type: "string" },
    assigneeName: { type: "string" },
    newDueDate: { type: "string" },
    projectName: { type: "string" },
    title: { type: "string" },
    priority: { type: "string" },
    to: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" },
    reason: { type: "string" },
  },
  required: ["action"],
} as const;

type Decision = Record<string, unknown>;

/** Maps a structured decision to the matching proposal + creates an approval. */
export async function applyDecision(
  d: Decision,
  ctx: AiContext,
): Promise<{ approvalsCreated: number; note: string }> {
  const action = String(d.action ?? "none");
  const map: Record<string, [string, Record<string, unknown>]> = {
    reassign_task: [
      "propose_reassign_task",
      { taskTitle: d.taskTitle, newAssigneeName: d.assigneeName, reason: d.reason },
    ],
    change_deadline: [
      "propose_change_deadline",
      { taskTitle: d.taskTitle, newDueDate: d.newDueDate, reason: d.reason },
    ],
    create_task: [
      "propose_create_task",
      {
        projectName: d.projectName,
        title: d.title,
        priority: d.priority,
        assigneeName: d.assigneeName,
      },
    ],
    send_message: [
      "propose_send_message",
      { to: d.to, subject: d.subject, body: d.body },
    ],
  };
  const entry = map[action];
  if (!entry) return { approvalsCreated: 0, note: "" };
  const [name, args] = entry;
  const outcome = await handleToolCall(name, args, ctx);
  return { approvalsCreated: outcome.approvalCreated ? 1 : 0, note: outcome.content };
}

// ---- Helpers ----
function bestTask(ctx: AiContext, title: string) {
  const q = title.toLowerCase();
  return (
    ctx.tasks.find((t) => t.title.toLowerCase() === q) ??
    ctx.tasks.find((t) => t.title.toLowerCase().includes(q)) ??
    ctx.tasks.find((t) => q.includes(t.title.toLowerCase()))
  );
}
function bestUser(ctx: AiContext, name: string) {
  const q = name.toLowerCase();
  return (
    ctx.users.find((u) => u.name.toLowerCase() === q) ??
    ctx.users.find((u) => u.name.toLowerCase().includes(q)) ??
    ctx.users.find((u) => u.name.toLowerCase().split(" ")[0] === q.split(" ")[0])
  );
}
function bestProject(ctx: AiContext, name: string) {
  const q = name.toLowerCase();
  return (
    ctx.projects.find((p) => p.name.toLowerCase() === q) ??
    ctx.projects.find((p) => p.name.toLowerCase().includes(q))
  );
}

export type ToolOutcome = {
  content: string; // fed back to the model (English)
  approvalCreated: boolean;
};

async function createApproval(input: {
  type: string;
  agent: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
}) {
  await prisma.approval.create({
    data: {
      type: input.type,
      proposedByAgent: input.agent,
      title: input.title,
      summary: input.summary,
      payload: JSON.stringify(input.payload),
      status: "PENDING",
    },
  });
  // Best-effort push notification (no-op unless Telegram is configured).
  void notifyApprovalCreated({
    title: input.title,
    agent: input.agent,
    type: input.type,
  });
}

/** Executes a tool call. Read tools return data; propose_* tools create a PENDING approval. */
export async function handleToolCall(
  name: string,
  rawArgs: unknown,
  ctx: AiContext,
): Promise<ToolOutcome> {
  const args = (typeof rawArgs === "string" ? safeJson(rawArgs) : rawArgs) as Record<
    string,
    unknown
  >;

  switch (name) {
    case "get_overdue_tasks": {
      const tasks = await prisma.task.findMany({
        include: { assignee: true, project: true },
      });
      const overdue = tasks
        .filter((t) => t.status !== "DONE" && isOverdue(t.dueDate))
        .map((t) => ({
          title: t.title,
          project: t.project.name,
          assignee: t.assignee?.name ?? "unassigned",
          priority: t.priority,
          due: t.dueDate?.toISOString().slice(0, 10),
        }));
      return { content: JSON.stringify({ overdue }), approvalCreated: false };
    }

    case "get_team_workload": {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        include: {
          assignedTasks: {
            where: { status: { not: "DONE" } },
            select: { estimatedHours: true },
          },
        },
      });
      const workload = users.map((u) => ({
        name: u.name,
        assignedHours: u.assignedTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0),
        capacity: u.weeklyCapacityHours,
        openTasks: u.assignedTasks.length,
      }));
      return { content: JSON.stringify({ workload }), approvalCreated: false };
    }

    case "get_project_status": {
      const pname = String(args.projectName ?? "");
      const projects = await prisma.project.findMany({
        include: { tasks: { select: { status: true } }, client: true },
      });
      const filtered = pname
        ? projects.filter((p) => p.name.toLowerCase().includes(pname.toLowerCase()))
        : projects;
      const status = filtered.map((p) => ({
        name: p.name,
        status: p.status,
        total: p.tasks.length,
        done: p.tasks.filter((t) => t.status === "DONE").length,
      }));
      return { content: JSON.stringify({ status }), approvalCreated: false };
    }

    case "propose_reassign_task": {
      const parsed = z
        .object({ taskTitle: z.string(), newAssigneeName: z.string(), reason: z.string().optional() })
        .safeParse(args);
      if (!parsed.success) return fail("invalid arguments");
      const task = bestTask(ctx, parsed.data.taskTitle);
      const user = bestUser(ctx, parsed.data.newAssigneeName);
      if (!task) return fail(`no task matching "${parsed.data.taskTitle}"`);
      if (!user) return fail(`no team member matching "${parsed.data.newAssigneeName}"`);
      await createApproval({
        type: "ASSIGN_TASK",
        agent: "Planning",
        title: `«${task.title}» tapşırığını ${user.name}-a təyin etmək`,
        summary: parsed.data.reason ?? "AI planlama agentinin təklifi.",
        payload: { entity: "task", taskId: task.id, title: task.title, field: "assignee", to: user.name },
      });
      return ok(`Approval created to reassign "${task.title}" to ${user.name}.`);
    }

    case "propose_change_deadline": {
      const parsed = z
        .object({ taskTitle: z.string(), newDueDate: z.string(), reason: z.string().optional() })
        .safeParse(args);
      if (!parsed.success) return fail("invalid arguments");
      const task = bestTask(ctx, parsed.data.taskTitle);
      if (!task) return fail(`no task matching "${parsed.data.taskTitle}"`);
      const d = new Date(parsed.data.newDueDate);
      if (Number.isNaN(d.getTime())) return fail("invalid date");
      await createApproval({
        type: "CHANGE_DEADLINE",
        agent: "Monitoring",
        title: `«${task.title}» tapşırığının bitmə tarixini dəyişmək`,
        summary: parsed.data.reason ?? "AI monitorinq agentinin təklifi.",
        payload: { entity: "task", taskId: task.id, title: task.title, field: "dueDate", to: d.toISOString() },
      });
      return ok(`Approval created to change deadline of "${task.title}" to ${parsed.data.newDueDate}.`);
    }

    case "propose_create_task": {
      const parsed = z
        .object({
          projectName: z.string(),
          title: z.string(),
          priority: z.string().optional(),
          assigneeName: z.string().optional(),
        })
        .safeParse(args);
      if (!parsed.success) return fail("invalid arguments");
      const project = bestProject(ctx, parsed.data.projectName);
      if (!project) return fail(`no project matching "${parsed.data.projectName}"`);
      const assignee = parsed.data.assigneeName ? bestUser(ctx, parsed.data.assigneeName) : null;
      await createApproval({
        type: "CREATE_TASK",
        agent: "Planning",
        title: `Yeni tapşırıq: «${parsed.data.title}» (${project.name})`,
        summary: "AI planlama agenti yeni tapşırıq yaradılmasını təklif edir.",
        payload: {
          projectId: project.id,
          projectName: project.name,
          title: parsed.data.title,
          priority: (parsed.data.priority ?? "MEDIUM").toUpperCase(),
          assignee: assignee?.name,
        },
      });
      return ok(`Approval created to add task "${parsed.data.title}" to ${project.name}.`);
    }

    case "propose_send_message": {
      const parsed = z
        .object({ to: z.string(), subject: z.string().optional(), body: z.string() })
        .safeParse(args);
      if (!parsed.success) return fail("invalid arguments");
      await createApproval({
        type: "SEND_MESSAGE",
        agent: "Communication",
        title: `Mesaj: ${parsed.data.subject ?? parsed.data.to}`,
        summary: "AI kommunikasiya agenti mesaj hazırlayıb. Göndərmək üçün təsdiq lazımdır.",
        payload: {
          channel: "email",
          to: parsed.data.to,
          subject: parsed.data.subject ?? "",
          body: parsed.data.body,
        },
      });
      return ok(`Approval created to send a message to ${parsed.data.to}.`);
    }

    default:
      return fail(`unknown tool ${name}`);
  }
}

function ok(content: string): ToolOutcome {
  return { content, approvalCreated: true };
}
function fail(msg: string): ToolOutcome {
  return { content: JSON.stringify({ error: msg }), approvalCreated: false };
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
