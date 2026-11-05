import { getTextObject, isR2Configured } from "@/lib/media/r2";
import { isSubtitleCode, subtitleKey } from "@/lib/media/subtitles";
import { isUuid } from "@/lib/media/validation";
import { isPublishedProject } from "@/lib/projects/queries";

const NO_STORE = { "Cache-Control": "no-store" };

function notFound() {
  return new Response("Not found", { status: 404, headers: NO_STORE });
}

// One subtitle file for a published video. It comes from the site's own address, because a browser will only load a
// subtitle track from elsewhere if the video itself also asks for permission, and the private bucket answers neither.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; lang: string }> }) {
  const { id, lang } = await params;
  if (!isUuid(id) || !isSubtitleCode(lang) || !isR2Configured()) return notFound();
  try {
    if (!(await isPublishedProject(id))) return notFound();
    const text = await getTextObject(subtitleKey(id, lang));
    if (text === null) return notFound();
    return new Response(text, {
      headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" },
    });
  } catch (error) {
    console.error("[subtitles] could not read:", error instanceof Error ? error.message : error);
    return new Response("Unavailable", { status: 503, headers: NO_STORE });
  }
}
