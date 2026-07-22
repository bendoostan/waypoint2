import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";

import { CardsFilter } from "./cards-filter";
import { NewCardButton } from "./card-form";

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ issuer?: string; active?: string }>;
}) {
  const { issuer, active } = await searchParams;
  const supabase = await createClient();

  const [{ data: allCards }, { data: currencies }] = await Promise.all([
    supabase.from("card_catalog").select("*").order("issuer").order("name"),
    supabase.from("currencies").select("id, name").order("name"),
  ]);

  const cards = (allCards ?? []).filter((c) => {
    if (issuer && c.issuer !== issuer) return false;
    if (active === "active" && !c.is_active) return false;
    if (active === "inactive" && c.is_active) return false;
    return true;
  });

  const issuers = [...new Set((allCards ?? []).map((c) => c.issuer))].sort();
  const currencyName = new Map((currencies ?? []).map((c) => [c.id, c.name]));
  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const byIssuer = new Map<string, typeof cards>();
  for (const c of cards) {
    const list = byIssuer.get(c.issuer) ?? [];
    list.push(c);
    byIssuer.set(c.issuer, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Cards</h2>
        <NewCardButton currencyOptions={currencyOptions} />
      </div>
      <CardsFilter issuers={issuers} />

      {byIssuer.size === 0 ? (
        <p className="text-muted-foreground text-sm">No cards match.</p>
      ) : (
        [...byIssuer.entries()].map(([iss, list]) => (
          <section key={iss} className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-sm font-semibold">
              {iss}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/cards/${c.id}`}
                  className="hover:border-foreground/30 flex flex-col gap-1 rounded-md border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.is_active ? null : (
                      <Badge variant="destructive">inactive</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {currencyName.get(c.currency_id) ?? "—"} · ${c.annual_fee}{" "}
                    AF
                  </span>
                  {c.unlocks_transfers ? (
                    <Badge variant="secondary" className="w-fit">
                      unlocks transfers
                    </Badge>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
