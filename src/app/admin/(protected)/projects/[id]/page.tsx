import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectEditor } from "@/components/admin/ProjectEditor";
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
      <main id="main" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p role="alert" className="border border-danger bg-graphite p-4 text-bone">
          This project could not be loaded. The database may be paused or unreachable. Please try again shortly.
        </p>
      </main>
    );
  }
  if (!project) notFound();

  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="text-sm text-ash underline underline-offset-4 hover:text-bone">
        All projects
      </Link>
      <h1 dir="auto" className="mt-3 break-words text-3xl font-medium tracking-tight text-bone sm:text-4xl">
        {project.title}
      </h1>
      <ProjectEditor project={project} />
    </main>
  );
}
