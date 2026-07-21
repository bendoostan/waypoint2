import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

// For client components. One instance per browser tab is fine — the library
// dedupes internally.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
