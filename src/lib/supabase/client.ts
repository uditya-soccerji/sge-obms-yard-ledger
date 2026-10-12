import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** null when env is missing — the app then falls back to the local mock login. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

/** Users type a username; Supabase Auth needs an email, so we derive a hidden one. */
export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@obms.internal`;
}
