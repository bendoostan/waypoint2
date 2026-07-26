"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database";
import { CurrencyForm } from "../currencies/currency-form";
import { PartnerForm } from "../transfers/partner-form";

type Currency = Database["public"]["Tables"]["currencies"]["Row"];
type Partner = Database["public"]["Tables"]["transfer_partners"]["Row"];
export type EdgeBonus = { pct: number; live: boolean };

type Pos = { x: number; y: number };
type Selection =
  { kind: "node"; id: string } | { kind: "edge"; id: string } | null;

// Deterministic layout: banks in a left column, airline/hotel programs in a
// right column, each sorted by name and spread evenly. Positions are pure
// functions of the (sorted) inputs — no force simulation, identical on every
// reload. Coordinates are percentages (0-100) so the SVG (viewBox 0 0 100 100,
// preserveAspectRatio="none") and the absolutely-positioned node buttons align
// at any width.
function layout(currencies: Currency[]): Map<string, Pos> {
  const banks = currencies
    .filter((c) => c.kind === "bank")
    .sort((a, b) => a.name.localeCompare(b.name));
  const programs = currencies
    .filter((c) => c.kind !== "bank")
    .sort((a, b) => a.name.localeCompare(b.name));
  const pos = new Map<string, Pos>();
  const place = (list: Currency[], x: number) => {
    list.forEach((c, i) => {
      pos.set(c.id, { x, y: ((i + 1) / (list.length + 1)) * 100 });
    });
  };
  place(banks, 15);
  place(programs, 85);
  return pos;
}

export function TransferGraph({
  currencies,
  partners,
  edgeBonus,
  currencyOptions,
}: {
  currencies: Currency[];
  partners: Partner[];
  edgeBonus: Record<string, EdgeBonus>;
  currencyOptions: { value: string; label: string }[];
}) {
  const [selection, setSelection] = React.useState<Selection>(null);

  const pos = React.useMemo(() => layout(currencies), [currencies]);
  const currencyById = React.useMemo(
    () => new Map(currencies.map((c) => [c.id, c])),
    [currencies]
  );
  const drawable = partners.filter(
    (p) => pos.has(p.from_currency_id) && pos.has(p.to_currency_id)
  );
  // Nodes touched by a live bonus edge get a champagne-tinted border.
  const bonusNodes = new Set<string>();
  for (const p of drawable) {
    if (edgeBonus[p.id]?.live) {
      bonusNodes.add(p.from_currency_id);
      bonusNodes.add(p.to_currency_id);
    }
  }

  const selectedCurrency =
    selection?.kind === "node"
      ? (currencyById.get(selection.id) ?? null)
      : null;
  const selectedPartner =
    selection?.kind === "edge"
      ? (partners.find((p) => p.id === selection.id) ?? null)
      : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr] lg:items-stretch">
      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-wp-ink text-xl font-semibold">
            The transfer graph
          </h2>
          <div className="text-wp-muted flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="bg-wp-border-dashed h-0.5 w-4" />
              edge
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="bg-wp-accent h-[3px] w-4" />
              bonus
            </span>
          </div>
        </div>

        <div className="border-wp-border bg-wp-panel relative mt-3 h-[460px] overflow-hidden rounded-2xl border">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            {drawable.map((p) => {
              const a = pos.get(p.from_currency_id)!;
              const b = pos.get(p.to_currency_id)!;
              const bonus = edgeBonus[p.id];
              const stroke = bonus
                ? "var(--wp-accent)"
                : "var(--wp-border-dashed)";
              return (
                <g key={p.id}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={stroke}
                    strokeWidth={bonus?.live ? 2.6 : 1.5}
                    strokeDasharray={bonus && !bonus.live ? "5 4" : undefined}
                    vectorEffect="non-scaling-stroke"
                    opacity={bonus ? 1 : 0.75}
                  />
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="transparent"
                    strokeWidth={12}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                    onClick={() => setSelection({ kind: "edge", id: p.id })}
                  />
                </g>
              );
            })}
          </svg>

          {/* bonus tags at edge midpoints */}
          {drawable.map((p) => {
            const bonus = edgeBonus[p.id];
            if (!bonus) return null;
            const a = pos.get(p.from_currency_id)!;
            const b = pos.get(p.to_currency_id)!;
            return (
              <span
                key={`tag-${p.id}`}
                className="text-wp-accent-text pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{
                  left: `${(a.x + b.x) / 2}%`,
                  top: `${(a.y + b.y) / 2}%`,
                  backgroundColor:
                    "color-mix(in oklab, var(--wp-accent), #fff 84%)",
                  border: bonus.live
                    ? undefined
                    : "1px dashed color-mix(in oklab, var(--wp-accent), #fff 45%)",
                }}
              >
                +{bonus.pct}%{bonus.live ? "" : " pending"}
              </span>
            );
          })}

          {/* nodes */}
          {currencies.map((c) => {
            const p = pos.get(c.id);
            if (!p) return null;
            const isBank = c.kind === "bank";
            const selected =
              selection?.kind === "node" && selection.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelection({ kind: "node", id: c.id })}
                className={cn(
                  "focus-visible:ring-ring absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-shadow focus-visible:ring-2 focus-visible:outline-none",
                  isBank
                    ? "bg-wp-ink text-wp-paper"
                    : "bg-wp-panel text-wp-ink border",
                  selected && "ring-wp-accent ring-2"
                )}
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  ...(!isBank
                    ? {
                        borderColor: bonusNodes.has(c.id)
                          ? "color-mix(in oklab, var(--wp-accent), #fff 45%)"
                          : "var(--wp-border-2)",
                      }
                    : {}),
                }}
              >
                {c.name}
              </button>
            );
          })}

          <span className="text-wp-muted-2 pointer-events-none absolute top-2 left-3 text-[11px]">
            Banks
          </span>
          <span className="text-wp-muted-2 pointer-events-none absolute top-2 right-3 text-[11px]">
            Programs
          </span>
        </div>
      </div>

      <Inspector
        currency={selectedCurrency}
        partner={selectedPartner}
        currencyById={currencyById}
        edgeCount={
          selectedCurrency
            ? partners.filter(
                (p) =>
                  p.from_currency_id === selectedCurrency.id ||
                  p.to_currency_id === selectedCurrency.id
              ).length
            : 0
        }
        bonus={selectedPartner ? edgeBonus[selectedPartner.id] : undefined}
        currencyOptions={currencyOptions}
      />
    </div>
  );
}

function Inspector({
  currency,
  partner,
  currencyById,
  edgeCount,
  bonus,
  currencyOptions,
}: {
  currency: Currency | null;
  partner: Partner | null;
  currencyById: Map<string, Currency>;
  edgeCount: number;
  bonus: EdgeBonus | undefined;
  currencyOptions: { value: string; label: string }[];
}) {
  return (
    <aside className="border-wp-border-2 bg-wp-panel flex flex-col rounded-2xl border p-6">
      <div className="wp-eyebrow">Inspector</div>

      {currency ? (
        <div>
          <h3 className="font-display text-wp-ink mt-2 text-xl font-semibold">
            {currency.name}
          </h3>
          <div className="text-wp-muted mt-0.5 text-[13px]">
            {currency.kind === "bank"
              ? "Bank points"
              : "Airline / hotel program"}
            {currency.alliance ? ` · ${currency.alliance}` : ""}
          </div>
          <dl className="mt-5">
            <InspRow
              label="Cashback value"
              value={`${currency.cashback_cpp}¢/pt`}
            />
            <InspRow
              label="Transfer value"
              value={`${currency.transfer_cpp}¢/pt`}
            />
            <InspRow
              label="Unlock"
              value={currency.requires_unlock ? "Needs a card" : "Always on"}
            />
            <InspRow label="Edges" value={String(edgeCount)} last />
          </dl>
        </div>
      ) : partner ? (
        <div>
          <h3 className="font-display text-wp-ink mt-2 text-xl font-semibold">
            {currencyById.get(partner.from_currency_id)?.name ?? "?"} →{" "}
            {currencyById.get(partner.to_currency_id)?.name ?? "?"}
          </h3>
          <div className="text-wp-muted mt-0.5 text-[13px]">Transfer edge</div>
          <dl className="mt-5">
            <InspRow
              label="Ratio"
              value={`${partner.ratio_num}:${partner.ratio_den}`}
            />
            <InspRow
              label="Transfer time"
              value={
                partner.transfer_hours_est > 0
                  ? `~${partner.transfer_hours_est}h`
                  : "Instant"
              }
            />
            <InspRow
              label="Bonus"
              value={
                bonus
                  ? `+${bonus.pct}%${bonus.live ? " live" : " pending"}`
                  : "None"
              }
            />
            <InspRow
              label="Status"
              value={partner.is_active ? "Active" : "Inactive"}
              last
            />
          </dl>
        </div>
      ) : (
        <p className="text-wp-muted mt-2 text-[13px] leading-relaxed">
          Click a node or an edge to inspect it — then edit the record in place.
        </p>
      )}

      <div className="mt-auto pt-6">
        {currency ? (
          <CurrencyForm
            currency={currency}
            trigger={
              <Button variant="outline" className="w-full">
                Edit this record
              </Button>
            }
          />
        ) : partner ? (
          <PartnerForm
            partner={partner}
            currencyOptions={currencyOptions}
            trigger={
              <Button variant="outline" className="w-full">
                Edit this record
              </Button>
            }
          />
        ) : (
          <Button variant="outline" className="w-full" disabled>
            Edit this record
          </Button>
        )}
      </div>
    </aside>
  );
}

function InspRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2.5",
        !last && "border-wp-track border-b"
      )}
    >
      <dt className="text-wp-muted text-[13px]">{label}</dt>
      <dd className="text-wp-ink text-[13px] font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}
