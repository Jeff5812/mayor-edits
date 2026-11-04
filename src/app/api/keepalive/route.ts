import { createSupabasePublicClient } from "@/lib/supabase/server";

// Supabase's free plan pauses a project after a week of low database activity, and the public page is
// cached, so visitors do not count. A daily scheduled call (vercel.json) makes a few small reads instead.
// It reveals nothing and changes nothing, so it needs no secret.
const READS = 3;

export async function GET() {
  try {
    const client = createSupabasePublicClient();
    for (let read = 0; read < READS; read += 1) {
      const { error } = await client.from("projects").select("id", { head: true, count: "exact" }).eq("status", "published");
      if (error) throw new Error(error.message);
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[keepalive] failed:", error instanceof Error ? error.message : error);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
