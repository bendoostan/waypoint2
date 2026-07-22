import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { isWhitelistedTable, type WhitelistedTable } from "@/lib/validation";

export const TABLE_LABELS: Record<WhitelistedTable, string> = {
  currencies: "Currency",
  card_catalog: "Card",
  earning_rates: "Earning rate",
  welcome_offers: "Welcome offer",
  transfer_partners: "Transfer partner",
  transfer_bonuses: "Transfer bonus",
  award_routes: "Award route",
};

/**
 * Fetch a single reference row by id, guarded by the whitelist so the table
 * name never reaches the query builder unchecked. Used to build the update
 * diff and to validate the resulting row before apply.
 */
export async function fetchReferenceRow(
  supabase: SupabaseClient<Database>,
  table: string,
  id: string
): Promise<Record<string, unknown> | null> {
  if (!isWhitelistedTable(table)) return null;
  const { data } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}
