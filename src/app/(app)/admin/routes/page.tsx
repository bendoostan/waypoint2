import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { NewRouteButton, RouteForm } from "./route-form";
import { VerifyButton } from "./verify-button";

export default async function RoutesPage() {
  const supabase = await createClient();
  const [{ data: routes }, { data: currencies }] = await Promise.all([
    supabase.from("award_routes").select("*").order("name"),
    supabase.from("currencies").select("id, name").order("name"),
  ]);

  const name = new Map((currencies ?? []).map((c) => [c.id, c.name]));
  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Award routes</h2>
        <NewRouteButton currencyOptions={currencyOptions} />
      </div>

      <div className="flex flex-col gap-3">
        {(routes ?? []).map((r) => (
          <div key={r.id} className="rounded-md border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <Badge variant="secondary">{r.cabin}</Badge>
                  {r.is_active ? null : (
                    <Badge variant="destructive">inactive</Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {r.origin_region}
                  {r.origin_airports?.length
                    ? ` (${r.origin_airports.join(", ")})`
                    : ""}{" "}
                  → {r.destination_region}
                  {r.destination_airports?.length
                    ? ` (${r.destination_airports.join(", ")})`
                    : ""}
                </p>
                <p className="text-muted-foreground text-sm">
                  {r.points_oneway.toLocaleString()}{" "}
                  {name.get(r.program_currency_id)} one-way · $
                  {r.taxes_fees_usd_est} taxes ·{" "}
                  {r.last_verified_at
                    ? `verified ${r.last_verified_at.slice(0, 10)}`
                    : "never verified"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <VerifyButton id={r.id} />
                <RouteForm
                  route={r}
                  currencyOptions={currencyOptions}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
              </div>
            </div>
          </div>
        ))}
        {(routes ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">No award routes.</p>
        ) : null}
      </div>
    </div>
  );
}
