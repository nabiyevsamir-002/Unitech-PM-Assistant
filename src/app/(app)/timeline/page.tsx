import { getBoardTasks, getProjectsList } from "@/lib/data";
import { TimelineView } from "@/components/timeline/timeline-view";

export default async function TimelinePage() {
  const [tasks, projects] = await Promise.all([
    getBoardTasks(),
    getProjectsList(),
  ]);

  return <TimelineView tasks={tasks} projects={projects} />;
}
