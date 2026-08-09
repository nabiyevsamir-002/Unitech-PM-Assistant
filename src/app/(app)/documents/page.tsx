import { auth } from "@/auth";
import { getDocuments } from "@/lib/data";
import { canApprove } from "@/lib/constants";
import { DocumentsView } from "@/components/documents/documents-view";

export default async function DocumentsPage() {
  const [session, documents] = await Promise.all([auth(), getDocuments()]);

  return (
    <DocumentsView
      documents={documents}
      canManage={canApprove(session?.user?.role)}
    />
  );
}
