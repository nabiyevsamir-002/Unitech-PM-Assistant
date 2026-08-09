import { auth } from "@/auth";
import { getProjectsList, getClients } from "@/lib/data";
import { canApprove } from "@/lib/constants";
import { ProjectsView } from "@/components/projects/projects-view";

export default async function ProjectsPage() {
  const [session, projects, clients] = await Promise.all([
    auth(),
    getProjectsList(),
    getClients(),
  ]);

  return (
    <ProjectsView
      projects={projects}
      clients={clients}
      canCreate={canApprove(session?.user?.role)}
    />
  );
}
