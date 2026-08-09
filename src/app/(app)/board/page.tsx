import { getBoardTasks, getProjectsList, getTeam } from "@/lib/data";
import { KanbanBoard } from "@/components/board/kanban-board";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;

  const [tasks, projects, team] = await Promise.all([
    getBoardTasks(project),
    getProjectsList(),
    getTeam(),
  ]);

  return (
    <div className="h-[calc(100vh-8rem)]">
      <KanbanBoard
        initialTasks={tasks}
        projects={projects}
        team={team.map((m) => ({ id: m.id, name: m.name }))}
        activeProjectId={project}
      />
    </div>
  );
}
