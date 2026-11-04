import type { Metadata } from "next";
import Link from "next/link";
import { ProjectEditor } from "@/components/admin/ProjectEditor";
import { requireAdmin } from "@/lib/auth/admin";

export const metadata: Metadata = { title: "New project", robots: { index: false, follow: false } };

export default async function NewProjectPage() {
  await requireAdmin();
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="text-sm text-ash underline underline-offset-4 hover:text-bone">
        All projects
      </Link>
      <h1 className="mt-3 text-3xl font-medium tracking-tight text-bone sm:text-4xl">New project</h1>
      <p className="mt-2 text-sm text-ash">It stays a private draft until you publish it.</p>
      <ProjectEditor project={null} />
    </main>
  );
}
