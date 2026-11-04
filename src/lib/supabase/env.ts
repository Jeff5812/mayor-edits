export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// The site must still render, with empty states, before a Supabase project is connected.
export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}
