"use client";

import { useRouter } from "next/navigation";
import { ProjectEditor } from "./ProjectEditor";

// Each visit to "New project" starts empty. Next.js keeps pages it leaves, so this one would otherwise come back holding the
// last project it created. The browser's back button still returns to a half-filled form, as expected.
export function NewProjectEditor({ autoSubtitles }: { autoSubtitles: boolean }) {
  const { bfcacheId } = useRouter();
  return <ProjectEditor key={bfcacheId} project={null} autoSubtitles={autoSubtitles} />;
}
