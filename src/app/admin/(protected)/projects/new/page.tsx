import type { Metadata } from "next";
import { NewProjectEditor } from "@/components/admin/NewProjectEditor";
import { PageHead } from "@/components/admin/PageHead";
import { pageClass } from "@/components/admin/styles";
import { isAiConfigured } from "@/lib/ai/workers-ai";
import { requireAdmin } from "@/lib/auth/admin";

export const metadata: Metadata = { title: "New project", robots: { index: false, follow: false } };

// Reads the session, so it cannot render ahead of the request.
export const instant = false;

export default async function NewProjectPage() {
  await requireAdmin();
  return (
    <main id="main" className={pageClass}>
      <PageHead back title="New project" />
      <NewProjectEditor autoSubtitles={isAiConfigured()} />
    </main>
  );
}
