import { createClient } from "@/lib/supabase/server";
import { buildWalletView } from "@/lib/wallet";
import { fmtInt, fmtUsd, issuerWordmark } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { AddCardDialog, type CatalogCard } from "./add-card-dialog";
import { CurrencyGroupCard } from "./currency-group-card";
import { MonthlySpend } from "./monthly-spend";

function toSpendRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

export default async function WalletPage() {
  const supabase = await createClient();

  const [
    { data: userCards },
    { data: cards },
    { data: currencies },
    { data: partners },
    { data: profile },
    { data: rateCategories },
    { data: userRes },
  ] = await Promise.all([
    supabase
      .from("user_cards")
      .select("id, card_id, points_balance, opened_at"),
    supabase.from("card_catalog").select("*").eq("is_active", true),
    supabase.from("currencies").select("*"),
    supabase.from("transfer_partners").select("*"),
    supabase
      .from("profiles")
      .select("home_airport, monthly_spend")
      .maybeSingle(),
    supabase.from("earning_rates").select("category"),
    supabase.auth.getUser(),
  ]);

  const view = buildWalletView(
    userCards ?? [],
    cards ?? [],
    currencies ?? [],
    partners ?? []
  );

  const currencyName = new Map((currencies ?? []).map((c) => [c.id, c.name]));
  const catalog: CatalogCard[] = (cards ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      brandColor: c.brand_color,
      wordmark: issuerWordmark(c.issuer),
      currencyName: currencyName.get(c.currency_id) ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const categories = [...new Set((rateCategories ?? []).map((r) => r.category))]
    .sort()
    // everything_else is a fallback rate, not a spend bucket you'd fill.
    .filter((c) => c !== "everything_else");

  const spend = toSpendRecord(profile?.monthly_spend);
  const homeAirport = profile?.home_airport ?? null;
  const hasProfile = !!userRes.user;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-wp-ink text-3xl font-semibold sm:text-4xl">
            My wallet
          </h1>
          {view.cardCount > 0 ? (
            <p className="text-wp-muted mt-2 text-[15px]">
              <span className="tabular-nums">{fmtInt(view.totalPoints)}</span>{" "}
              points across {view.cardCount}{" "}
              {view.cardCount === 1 ? "card" : "cards"}.{" "}
              <b className="text-wp-ink tabular-nums">
                {fmtUsd(view.totalTransferValueUsd)}
              </b>{" "}
              in transfer value once everything&rsquo;s unlocked.
            </p>
          ) : (
            <p className="text-wp-muted mt-2 text-[15px]">
              Add the cards you hold to see what they&rsquo;re really worth.
            </p>
          )}
        </div>
        <div className="flex items-end gap-5">
          {homeAirport ? (
            <div className="text-right">
              <div className="wp-eyebrow !text-wp-muted-2">Home</div>
              <div className="font-display text-wp-ink text-xl font-semibold">
                {homeAirport}
              </div>
            </div>
          ) : null}
          <AddCardDialog cards={catalog} />
        </div>
      </div>

      {view.groups.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            eyebrow="Empty wallet"
            title="Add your first card"
            description="Tell us the cards and balances you hold. Waypoint groups them by program and shows what each is worth — and what one unlock is really worth."
          />
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          {view.groups.map((g) => (
            <CurrencyGroupCard key={g.currencyId} group={g} />
          ))}
        </div>
      )}

      {hasProfile ? (
        <section className="border-wp-border-2 bg-wp-panel shadow-wp-sm mt-10 rounded-2xl border p-6">
          <MonthlySpend categories={categories} initial={spend} />
        </section>
      ) : null}
    </main>
  );
}
