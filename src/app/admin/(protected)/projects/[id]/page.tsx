import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/admin/PageHead";
import { ProjectEditor } from "@/components/admin/ProjectEditor";
import { alertClass, pageClass } from "@/components/admin/styles";
import { requireAdmin } from "@/lib/auth/admin";
import { getProjectForAdmin } from "@/lib/projects/admin-queries";

export const metadata: Metadata = { title: "Edit project", robots: { index: false, follow: false } };

// Reads the URL and the session, so it cannot render ahead of the request.
export const instant = false;

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  let project;
  try {
    project = await getProjectForAdmin(id);
  } catch (error) {
    console.error("[admin] could not load project:", error instanceof Error ? error.message : error);
    return (
      <main id="main" className={pageClass}>
        <p role="alert" className={alertClass}>
          This project could not be loaded. The database may be paused or unreachable. Please try again shortly.
        </p>
      </main>
    );
  }
  if (!project) notFound();

  return (
    <main id="main" className={pageClass}>
      <PageHead back title={project.title} />
      <ProjectEditor project={project} />
    </main>
  );
}
