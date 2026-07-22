import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/admin/delete-button";

import { deleteBonus } from "./actions";
import { ApproveBonusButton } from "./approve-bonus";
import { BonusForm, NewBonusButton } from "./bonus-form";
import { NewPartnerButton, PartnerForm } from "./partner-form";
import { TransfersFilter } from "./transfers-filter";
import { windowState } from "./window-state";

const WINDOW_BADGE = {
  live: "secondary",
  upcoming: "outline",
  expired: "destructive",
} as const;

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const { currency } = await searchParams;
  const supabase = await createClient();

  const [{ data: currencies }, { data: partners }, { data: bonuses }] =
    await Promise.all([
      supabase.from("currencies").select("id, name").order("name"),
      supabase.from("transfer_partners").select("*"),
      supabase.from("transfer_bonuses").select("*"),
    ]);

  const name = new Map((currencies ?? []).map((c) => [c.id, c.name]));
  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const now = new Date();
  const bonusesByPartner = new Map<string, NonNullable<typeof bonuses>>();
  for (const b of bonuses ?? []) {
    const list = bonusesByPartner.get(b.transfer_partner_id) ?? [];
    list.push(b);
    bonusesByPartner.set(b.transfer_partner_id, list);
  }

  const edges = (partners ?? [])
    .filter(
      (p) =>
        !currency ||
        p.from_currency_id === currency ||
        p.to_currency_id === currency
    )
    .sort((a, b) =>
      `${name.get(a.from_currency_id)}→${name.get(a.to_currency_id)}`.localeCompare(
        `${name.get(b.from_currency_id)}→${name.get(b.to_currency_id)}`
      )
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Transfer partners</h2>
        <NewPartnerButton currencyOptions={currencyOptions} />
      </div>
      <TransfersFilter currencies={currencies ?? []} />

      <div className="flex flex-col gap-3">
        {edges.map((p) => {
          const edgeBonuses = bonusesByPartner.get(p.id) ?? [];
          return (
            <div key={p.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {name.get(p.from_currency_id) ?? "?"} →{" "}
                    {name.get(p.to_currency_id) ?? "?"}
                  </span>
                  <Badge variant="outline">
                    {p.ratio_num}:{p.ratio_den}
                  </Badge>
                  {p.transfer_hours_est > 0 ? (
                    <span className="text-muted-foreground text-xs">
                      ~{p.transfer_hours_est}h
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      instant
                    </span>
                  )}
                  {p.is_active ? null : (
                    <Badge variant="destructive">inactive</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <NewBonusButton partnerId={p.id} />
                  <PartnerForm
                    partner={p}
                    currencyOptions={currencyOptions}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                  />
                </div>
              </div>

              {(p.min_transfer || p.increment) && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {p.min_transfer ? `min ${p.min_transfer}` : ""}
                  {p.min_transfer && p.increment ? " · " : ""}
                  {p.increment ? `increment ${p.increment}` : ""}
                </p>
              )}

              {edgeBonuses.length > 0 ? (
                <div className="mt-3 flex flex-col gap-1">
                  {edgeBonuses.map((b) => {
                    const state = windowState(b.starts_at, b.ends_at, now);
                    return (
                      <div
                        key={b.id}
                        className="flex flex-wrap items-center gap-2 rounded border px-2 py-1 text-sm"
                      >
                        <span className="font-medium">+{b.bonus_pct}%</span>
                        <Badge
                          variant={
                            b.status === "approved" ? "default" : "secondary"
                          }
                        >
                          {b.status}
                        </Badge>
                        <Badge variant={WINDOW_BADGE[state]}>{state}</Badge>
                        <span className="text-muted-foreground text-xs">
                          {b.starts_at.slice(0, 10)} → {b.ends_at.slice(0, 10)}
                        </span>
                        <div className="ml-auto flex items-center gap-1">
                          {b.status === "draft" ? (
                            <ApproveBonusButton id={b.id} />
                          ) : null}
                          <BonusForm
                            partnerId={p.id}
                            bonus={b}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                            }
                          />
                          <DeleteButton
                            action={deleteBonus}
                            hidden={{ id: b.id }}
                            confirm="Delete this bonus?"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {edges.length === 0 ? (
          <p className="text-muted-foreground text-sm">No transfer edges.</p>
        ) : null}
      </div>
    </div>
  );
}
