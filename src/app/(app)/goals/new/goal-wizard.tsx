"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { cabinLabel, monthLabel } from "@/lib/format";
import { isValidIata } from "@/lib/airports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AirportField } from "./airport-field";
import { createGoal, type CreateGoalInput } from "./actions";

type Cabin = "economy" | "premium_economy" | "business" | "first";
type Flex = "exact" | "flexible_month" | "anytime";
type TripType = "one_way" | "round_trip" | "open_jaw";

type LegState = {
  origin: string;
  destination: string;
  cabin: Cabin;
  month: string; // 'YYYY-MM' or ''
};

const CABINS: Cabin[] = ["economy", "premium_economy", "business", "first"];
const emptyLeg = (cabin: Cabin = "economy"): LegState => ({
  origin: "",
  destination: "",
  cabin,
  month: "",
});

const STEPS = ["Trip", "When & who", "Airports"] as const;

export function GoalWizard() {
  const [step, setStep] = React.useState(0);
  const [tripType, setTripType] = React.useState<TripType>("round_trip");
  const [leg1, setLeg1] = React.useState<LegState>(emptyLeg("business"));
  const [leg2, setLeg2] = React.useState<LegState>(emptyLeg("business"));
  const [travelers, setTravelers] = React.useState(1);
  const [flexibility, setFlexibility] = React.useState<Flex>("flexible_month");
  const [title, setTitle] = React.useState("");
  const [titleDirty, setTitleDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const twoLegs = tripType !== "one_way";
  const openJaw = tripType === "open_jaw";

  // Round trip mirrors leg 1's endpoints onto leg 2.
  const leg2Endpoints = openJaw
    ? { origin: leg2.origin, destination: leg2.destination }
    : { origin: leg1.destination, destination: leg1.origin };

  const autoTitle = leg1.destination
    ? `${leg1.destination} · ${cabinLabel(leg1.cabin)}`
    : "New trip";
  const effectiveTitle = titleDirty && title.trim() ? title.trim() : autoTitle;

  const airportsValid =
    isValidIata(leg1.origin) &&
    isValidIata(leg1.destination) &&
    (!openJaw || (isValidIata(leg2.origin) && isValidIata(leg2.destination)));

  const buildLegs = (): CreateGoalInput["legs"] => {
    const l1 = {
      seq: 1 as const,
      origin_airport: leg1.origin,
      destination_airport: leg1.destination,
      destination_region: null,
      cabin: leg1.cabin,
      travel_month: leg1.month || null,
    };
    if (!twoLegs) return [l1];
    const l2 = {
      seq: 2 as const,
      origin_airport: leg2Endpoints.origin,
      destination_airport: leg2Endpoints.destination,
      destination_region: null,
      cabin: leg2.cabin,
      travel_month: leg2.month || null,
    };
    return [l1, l2];
  };

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await createGoal({
        title: effectiveTitle,
        num_travelers: travelers,
        flexibility,
        legs: buildLegs(),
      });
      // createGoal redirects on success; only errors return here.
      if (res && !res.ok) setError(res.error ?? "Something went wrong.");
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start">
      <div>
        <Stepper step={step} />

        {step === 0 ? (
          <div className="mt-6">
            <Segmented
              label="Trip shape"
              value={tripType}
              onChange={(v) => setTripType(v as TripType)}
              options={[
                { value: "one_way", label: "One-way" },
                { value: "round_trip", label: "Round trip" },
                { value: "open_jaw", label: "Open-jaw" },
              ]}
            />
            {openJaw ? (
              <p className="text-wp-muted mt-3 text-[13px] leading-relaxed">
                An open-jaw — in to one city, home from another — can&rsquo;t be
                one round-trip award. We price each leg as its own one-way, so
                you set both independently.
              </p>
            ) : tripType === "round_trip" ? (
              <p className="text-wp-muted mt-3 text-[13px] leading-relaxed">
                Out and back between the same two cities. The return mirrors
                your outbound; cabin and month are set per leg.
              </p>
            ) : (
              <p className="text-wp-muted mt-3 text-[13px] leading-relaxed">
                A single one-way flight.
              </p>
            )}

            <div className="mt-6 flex flex-col gap-4">
              <LegCabinCard
                seq={1}
                title={twoLegs ? "Outbound leg" : "Your flight"}
                leg={leg1}
                onChange={setLeg1}
              />
              {twoLegs ? (
                <LegCabinCard
                  seq={2}
                  title="Return leg"
                  leg={leg2}
                  onChange={setLeg2}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mt-6 flex flex-col gap-6">
            <Segmented
              label="How flexible are your dates?"
              value={flexibility}
              onChange={(v) => setFlexibility(v as Flex)}
              options={[
                { value: "exact", label: "Exact" },
                { value: "flexible_month", label: "Flexible month" },
                { value: "anytime", label: "Anytime" },
              ]}
            />
            <div className="grid gap-1.5 sm:max-w-[200px]">
              <Label htmlFor="travelers">Travelers</Label>
              <Input
                id="travelers"
                type="number"
                min={1}
                max={20}
                value={travelers}
                onChange={(e) =>
                  setTravelers(
                    Math.max(1, Math.min(20, Number(e.target.value) || 1))
                  )
                }
                className="tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="title">Name this trip</Label>
              <Input
                id="title"
                value={titleDirty ? title : autoTitle}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleDirty(true);
                }}
                maxLength={120}
                placeholder="Tokyo, in business"
              />
              <p className="text-wp-muted text-xs">
                Just a label for your goals list — change it anytime.
              </p>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-6 flex flex-col gap-4">
            <div className="border-wp-border-2 bg-wp-panel rounded-2xl border p-5">
              <div className="wp-eyebrow mb-3">
                {twoLegs ? "Outbound leg" : "Your flight"}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <AirportField
                  id="leg1-from"
                  label="From"
                  value={leg1.origin}
                  onChange={(v) => setLeg1((s) => ({ ...s, origin: v }))}
                />
                <AirportField
                  id="leg1-to"
                  label="To"
                  value={leg1.destination}
                  onChange={(v) => setLeg1((s) => ({ ...s, destination: v }))}
                />
              </div>
            </div>

            {twoLegs ? (
              <div className="border-wp-border-2 bg-wp-panel rounded-2xl border p-5">
                <div className="wp-eyebrow mb-3">Return leg</div>
                {openJaw ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <AirportField
                      id="leg2-from"
                      label="From"
                      value={leg2.origin}
                      onChange={(v) => setLeg2((s) => ({ ...s, origin: v }))}
                    />
                    <AirportField
                      id="leg2-to"
                      label="To"
                      value={leg2.destination}
                      onChange={(v) =>
                        setLeg2((s) => ({ ...s, destination: v }))
                      }
                    />
                  </div>
                ) : (
                  <p className="text-wp-muted text-[13px]">
                    Mirrors your outbound:{" "}
                    <span className="text-wp-ink font-semibold tabular-nums">
                      {leg1.destination || "—"} → {leg1.origin || "—"}
                    </span>
                    .
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="text-destructive mt-4 text-sm">{error}</p>
        ) : null}

        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || pending}
          >
            Back
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep((s) => Math.min(2, s + 1))}>
              Continue
            </Button>
          ) : (
            <Button onClick={submit} disabled={!airportsValid || pending}>
              {pending ? "Building…" : "Build my plan"}
            </Button>
          )}
        </div>
      </div>

      <TripSummary
        title={effectiveTitle}
        tripType={tripType}
        leg1={leg1}
        leg2={{ ...leg2, ...leg2Endpoints }}
        twoLegs={twoLegs}
        travelers={travelers}
        flexibility={flexibility}
      />
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2 text-[13px]">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "font-display flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                current
                  ? "bg-wp-ink text-wp-paper"
                  : done
                    ? "bg-wp-surface-2 text-wp-ink"
                    : "bg-wp-track text-wp-muted-2"
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                current ? "text-wp-ink font-semibold" : "text-wp-muted"
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 ? (
              <span className="bg-wp-divider mx-1 h-px w-6" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <div className="text-wp-body mb-2 text-xs font-semibold">{label}</div>
      <div className="bg-wp-track inline-flex flex-wrap gap-1 rounded-full p-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={cn(
                "rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
                active
                  ? "bg-wp-panel text-wp-ink shadow-wp-sm"
                  : "text-wp-body hover:text-wp-ink"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LegCabinCard({
  seq,
  title,
  leg,
  onChange,
}: {
  seq: number;
  title: string;
  leg: LegState;
  onChange: (next: LegState) => void;
}) {
  return (
    <div className="border-wp-border-2 bg-wp-panel rounded-2xl border p-5">
      <div className="flex items-center gap-2">
        <span className="bg-wp-ink font-display text-wp-paper flex size-[18px] items-center justify-center rounded-full text-[10px]">
          {seq}
        </span>
        <span className="wp-eyebrow">{title}</span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`cabin-${seq}`}>Cabin</Label>
          <select
            id={`cabin-${seq}`}
            value={leg.cabin}
            onChange={(e) =>
              onChange({ ...leg, cabin: e.target.value as Cabin })
            }
            className="border-wp-border-2 bg-wp-panel text-wp-ink focus-visible:ring-ring h-9 rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            {CABINS.map((c) => (
              <option key={c} value={c}>
                {cabinLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`month-${seq}`}>Travel month</Label>
          <Input
            id={`month-${seq}`}
            type="month"
            value={leg.month}
            onChange={(e) => onChange({ ...leg, month: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

function TripSummary({
  title,
  leg1,
  leg2,
  twoLegs,
  travelers,
  flexibility,
  tripType,
}: {
  title: string;
  tripType: TripType;
  leg1: LegState;
  leg2: LegState;
  twoLegs: boolean;
  travelers: number;
  flexibility: Flex;
}) {
  const route = !twoLegs
    ? `${leg1.origin || "—"} → ${leg1.destination || "—"}`
    : tripType === "round_trip"
      ? `${leg1.origin || "—"} → ${leg1.destination || "—"} → ${leg1.origin || "—"}`
      : `${leg1.origin || "—"} → ${leg1.destination || "—"} · ${leg2.origin || "—"} → ${leg2.destination || "—"}`;
  const months = [leg1.month, twoLegs ? leg2.month : ""]
    .filter(Boolean)
    .map((m) => monthLabel(m))
    .filter(Boolean);
  const flexLabel =
    flexibility === "exact"
      ? "Exact dates"
      : flexibility === "anytime"
        ? "Anytime"
        : "Flexible month";

  return (
    <aside className="bg-wp-ink text-wp-paper rounded-2xl p-6 lg:sticky lg:top-20">
      <div className="wp-eyebrow" style={{ color: "var(--wp-accent)" }}>
        Your trip
      </div>
      <h2 className="font-display mt-2 text-2xl font-semibold">{title}</h2>
      <dl className="mt-5 flex flex-col gap-3 text-sm">
        <Row label="Route" value={route} mono />
        <Row
          label="Cabin"
          value={
            twoLegs && leg1.cabin !== leg2.cabin
              ? `${cabinLabel(leg1.cabin)} / ${cabinLabel(leg2.cabin)}`
              : cabinLabel(leg1.cabin)
          }
        />
        <Row
          label="When"
          value={months.length ? months.join(" · ") : flexLabel}
        />
        <Row
          label="Travelers"
          value={`${travelers} ${travelers === 1 ? "traveler" : "travelers"}`}
        />
      </dl>
      <p className="text-wp-paper/60 mt-5 text-[12.5px] leading-relaxed">
        We&rsquo;ll work backward from the miles you already hold to the
        cheapest way to book this — no card pitch until you&rsquo;ve seen the
        trip.
      </p>
    </aside>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="border-wp-paper/10 flex items-baseline justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
      <dt className="text-wp-paper/60">{label}</dt>
      <dd
        className={cn(
          "text-wp-paper text-right font-semibold",
          mono && "tabular-nums"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
