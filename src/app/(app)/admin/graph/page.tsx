import { createClient } from "@/lib/supabase/server";
import { windowState } from "../transfers/window-state";
import { TransferGraph, type EdgeBonus } from "./transfer-graph";

// Read-first transfer graph: active currencies as nodes (banks left, programs
// right), active transfer edges between them, bonus edges highlighted. Clicking
// a node or edge opens the existing currency/transfer-partner edit form in a
// dialog — no second edit form is built here.
export default async function AdminGraphPage() {
  const supabase = await createClient();

  const [{ data: currencies }, { data: partners }, { data: bonuses }] =
    await Promise.all([
      supabase.from("currencies").select("*").order("name"),
      supabase.from("transfer_partners").select("*"),
      supabase.from("transfer_bonuses").select("*"),
    ]);

  const activeCurrencies = (currencies ?? []).filter((c) => c.is_active);
  const activePartners = (partners ?? []).filter((p) => p.is_active);
  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));

  // Per edge, the best bonus to show: a live (approved + in-window) one wins;
  // otherwise a non-expired one reads as pending. Reuses windowState so this
  // and the transfers list can never disagree about what's live.
  const now = new Date();
  const edgeBonus: Record<string, EdgeBonus> = {};
  for (const b of bonuses ?? []) {
    const state = windowState(b.starts_at, b.ends_at, now);
    if (state === "expired") continue;
    const live = b.status === "approved" && state === "live";
    const current = edgeBonus[b.transfer_partner_id];
    if (live) {
      if (!current || !current.live || b.bonus_pct > current.pct) {
        edgeBonus[b.transfer_partner_id] = { pct: b.bonus_pct, live: true };
      }
    } else if (!current) {
      edgeBonus[b.transfer_partner_id] = { pct: b.bonus_pct, live: false };
    } else if (!current.live && b.bonus_pct > current.pct) {
      edgeBonus[b.transfer_partner_id] = { pct: b.bonus_pct, live: false };
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        The knowledge graph at a glance. Click any node or edge to inspect and
        edit it in place.
      </p>
      <TransferGraph
        currencies={activeCurrencies}
        partners={activePartners}
        edgeBonus={edgeBonus}
        currencyOptions={currencyOptions}
      />
    </div>
  );
}
