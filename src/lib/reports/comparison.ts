// Project comparison data — every project's key PM metrics in one shape, so the
// /compare view can line them up side by side. Reuses the health score and adds
// budget totals + team size. All computed in code (no LLM).

import { prisma } from "@/lib/prisma";
import { getProjectHealth, type ProjectHealth } from "@/lib/reports/health";

type Extras = { actualHours?: number | null; hourlyRate?: number | null; budget?: number | null };
function parseExtras(s: unknown): Extras {
  if (typeof s !== "string" || !s) return {};
  try {
    return JSON.parse(s) as Extras;
  } catch {
    return {};
  }
}

export type ProjectComparison = ProjectHealth & {
  budgetTotal: number; // AZN
  budgetSpent: number; // AZN (started tasks = in-progress + done)
  teamSize: number;
  currency: string;
  dueDate: string | null;
};

export async function getProjectComparison(): Promise<ProjectComparison[]> {
  const [health, projects] = await Promise.all([
    getProjectHealth(),
    prisma.project.findMany({
      include: {
        tasks: { select: { customFields: true, assigneeId: true, status: true } },
      },
    }),
  ]);

  const byId = new Map(projects.map((p) => [p.id, p]));

  return health.map((h) => {
    const p = byId.get(h.projectId);
    let budgetTotal = 0;
    let budgetSpent = 0;
    const team = new Set<string>();
    for (const t of p?.tasks ?? []) {
      const x = parseExtras(t.customFields);
      if (typeof x.budget === "number") budgetTotal += x.budget;
      const started = t.status === "IN_PROGRESS" || t.status === "DONE";
      if (started && typeof x.actualHours === "number" && typeof x.hourlyRate === "number") {
        budgetSpent += x.actualHours * x.hourlyRate;
      }
      if (t.assigneeId) team.add(t.assigneeId);
    }
    return {
      ...h,
      budgetTotal: Math.round(budgetTotal),
      budgetSpent: Math.round(budgetSpent),
      teamSize: team.size,
      currency: p?.currency ?? "AZN",
      dueDate: p?.dueDate?.toISOString() ?? null,
    };
  });
}
