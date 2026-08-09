import { notFound } from "next/navigation";
import { getProjectDetail } from "@/lib/data";
import { ProjectDetailView } from "@/components/projects/project-detail-view";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectDetail(id);
  if (!project) notFound();

  return <ProjectDetailView project={project} />;
}
