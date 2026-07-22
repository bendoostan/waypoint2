import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/admin/delete-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { deleteEarningRate, deleteWelcomeOffer } from "../actions";
import { CardForm } from "../card-form";
import { NewRateButton, RateForm } from "../rate-form";
import { NewOfferButton, OfferForm } from "../offer-form";

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: card } = await supabase
    .from("card_catalog")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!card) notFound();

  const [{ data: rates }, { data: offers }, { data: currencies }] =
    await Promise.all([
      supabase
        .from("earning_rates")
        .select("*")
        .eq("card_id", id)
        .order("category"),
      supabase
        .from("welcome_offers")
        .select("*")
        .eq("card_id", id)
        .order("points", { ascending: false }),
      supabase.from("currencies").select("id, name").order("name"),
    ]);

  const currencyName =
    (currencies ?? []).find((c) => c.id === card.currency_id)?.name ?? "—";
  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const rateList = rates ?? [];
  const offerList = offers ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/cards"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← Cards
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{card.name}</h2>
          <p className="text-muted-foreground text-sm">
            {card.issuer} · {currencyName} · ${card.annual_fee} annual fee
            {card.unlocks_transfers ? " · unlocks transfers" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {card.is_active ? (
            <Badge variant="secondary">active</Badge>
          ) : (
            <Badge variant="destructive">inactive</Badge>
          )}
          <CardForm
            card={card}
            currencyOptions={currencyOptions}
            trigger={
              <Button variant="outline" size="sm">
                Edit card
              </Button>
            }
          />
        </div>
      </div>

      {rateList.length === 0 ? (
        <div className="border-destructive/40 bg-destructive/5 rounded-md border border-dashed p-3 text-sm">
          This card has no earning rates yet — add at least one so the engine
          can compute earn velocity.
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Earning rates</h3>
          <NewRateButton cardId={card.id} />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Monthly cap</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rateList.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant="secondary">{r.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.rate}x
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.cap_monthly_usd ? `$${r.cap_monthly_usd}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[16rem] truncate">
                    {r.notes ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <RateForm
                        cardId={card.id}
                        rate={r}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteButton
                        action={deleteEarningRate}
                        hidden={{ id: r.id, card_id: card.id }}
                        confirm={`Delete the ${r.category} rate?`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rateList.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground text-center"
                  >
                    No earning rates.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Welcome offers</h3>
          <NewOfferButton cardId={card.id} />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right">Min spend</TableHead>
                <TableHead className="text-right">Window</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead>Active</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {offerList.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-right tabular-nums">
                    {o.points.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${o.min_spend_usd.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o.window_months} mo
                  </TableCell>
                  <TableCell>
                    {o.ends_at ? o.ends_at.slice(0, 10) : "—"}
                  </TableCell>
                  <TableCell>
                    {o.is_active ? (
                      <Badge variant="secondary">active</Badge>
                    ) : (
                      <Badge variant="outline">inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <OfferForm
                        cardId={card.id}
                        offer={o}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteButton
                        action={deleteWelcomeOffer}
                        hidden={{ id: o.id, card_id: card.id }}
                        confirm="Delete this welcome offer?"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {offerList.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground text-center"
                  >
                    No welcome offers.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
