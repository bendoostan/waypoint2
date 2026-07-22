import { createClient } from "./server";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type SessionContext = {
  user: { id: string; email: string | null };
  profile: Profile | null;
  isAdmin: boolean;
};

/**
 * Load the current user and their profile row in one place. Returns null
 * when unauthenticated. Reads through the authenticated client, so RLS
 * applies — `profile` is the user's own row only.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user: { id: user.id, email: user.email ?? null },
    profile: profile ?? null,
    isAdmin: profile?.role === "admin",
  };
}
