import type { Metadata } from "next";
import { ProjectsDashboard } from "@/components/admin/ProjectsDashboard";
import { requireAdmin } from "@/lib/auth/admin";
import { listAllProjects } from "@/lib/projects/admin-queries";

export const metadata: Metadata = { title: "Projects", robots: { index: false, follow: false } };

// Reads the session, so it cannot render ahead of the request.
export const instant = false;

async function loadProjects() {
  try {
    return await listAllProjects();
  } catch (error) {
    console.error("[admin] could not list projects:", error instanceof Error ? error.message : error);
    return null;
  }
}

export default async function ProjectsDashboardPage() {
  await requireAdmin();
  return <ProjectsDashboard projects={await loadProjects()} />;
}
