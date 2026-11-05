import { isR2Configured, listObjectKeys } from "@/lib/media/r2";
import { subtitleCodesFromKeys, subtitlePrefix } from "@/lib/media/subtitles";
import { isUuid } from "@/lib/media/validation";
import { isPublishedProject } from "@/lib/projects/queries";

const CACHED = { "Cache-Control": "public, max-age=60, s-maxage=60" };
const NO_STORE = { "Cache-Control": "no-store" };

// Which languages a published video has subtitles in. "None" is a normal answer, so a fault here costs a visitor the
// subtitle button and never the video.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (!isUuid(id) || !isR2Configured() || !(await isPublishedProject(id))) {
      return Response.json({ languages: [] }, { headers: NO_STORE });
    }
    return Response.json({ languages: subtitleCodesFromKeys(await listObjectKeys(subtitlePrefix(id))) }, { headers: CACHED });
  } catch (error) {
    console.error("[subtitles] could not list:", error instanceof Error ? error.message : error);
    return Response.json({ languages: [] }, { headers: NO_STORE });
  }
}
