import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { TierBadge, tierFromPlan } from "@/components/tier-badge";
import { CardMark } from "@/components/card-mark";
import {
  cabinLabel,
  describeMonth,
  fmtInt,
  fmtUsd,
  issuerWordmark,
  programWordmark,
} from "@/lib/format";
import type { CabinAlternative, Strategy } from "@/lib/engine/schema";
import { getOrCreatePlan } from "./get-or-create-plan";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: goal }, { data: goalLegs }] = await Promise.all([
    supabase.from("goals").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("goal_legs")
      .select("*")
      .eq("goal_id", id)
      .order("seq", { ascending: true }),
  ]);
  if (!goal) notFound();

  const plan = await getOrCreatePlan(supabase, user.id, goal, goalLegs ?? []);
  const top = plan.strategies[0] ?? null;
  const month = describeMonth(goalLegs ?? []);

  const brandColor = top?.recommended_card
    ? ((
        await supabase
          .from("card_catalog")
          .select("brand_color")
          .eq("id", top.recommended_card.card_id)
          .maybeSingle()
      ).data?.brand_color ?? null)
    : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="text-wp-muted hover:text-wp-ink text-[13px] font-medium"
      >
        ← My goals
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="wp-eyebrow">Your plan</div>
          <h1 className="font-display text-wp-ink mt-1 text-3xl font-semibold sm:text-4xl">
            {goal.title}
          </h1>
          <p className="text-wp-muted mt-2 text-[15px]">
            {goal.num_travelers}{" "}
            {goal.num_travelers === 1 ? "traveler" : "travelers"}
            {month ? ` · ${month}` : ""}
          </p>
        </div>
        <TierBadge tier={tierFromPlan(top?.tier)} className="flex-none" />
      </div>

      <div className="mt-8">
        {!top ? (
          <NoRouteEmptyState />
        ) : (
          <>
            <p className="text-wp-body border-wp-border-2 bg-wp-panel shadow-wp-sm rounded-2xl border p-6 text-[15px] leading-relaxed italic">
              {top.rationale}
            </p>

            {plan.cabin_alternative ? (
              <CabinAlternativeNote alt={plan.cabin_alternative} />
            ) : null}

            <TargetSection strategy={top} />

            {top.recommended_card ? (
              <CardSection
                card={top.recommended_card}
                brandColor={brandColor}
              />
            ) : null}

            <EarnSection strategy={top} />

            <RedeemSection strategy={top} />

            {plan.strategies.length > 1 ? (
              <OtherOptions strategies={plan.strategies.slice(1)} />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function NoRouteEmptyState() {
  return (
    <div className="border-wp-border-2 bg-wp-panel shadow-wp-sm flex flex-col items-center rounded-2xl border px-8 py-16 text-center">
      <h2 className="font-display text-wp-ink max-w-md text-2xl font-semibold">
        No award route for this trip yet
      </h2>
      <p className="text-wp-muted mt-3 max-w-md text-[15px] leading-relaxed">
        Routes are hand-curated and reviewed by an admin. If this
        origin/destination/cabin combination should exist, check back soon — we
        haven&apos;t approximated an answer rather than guess at one.
      </p>
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-wp-ink mt-8 text-lg font-semibold first:mt-0">
      {children}
    </h2>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-wp-border-2 bg-wp-panel shadow-wp-sm mt-3 rounded-2xl border p-6">
      {children}
    </div>
  );
}

function CabinAlternativeNote({ alt }: { alt: CabinAlternative }) {
  const when =
    alt.months_to_goal === null
      ? "timing unclear"
      : alt.months_to_goal === 0
        ? "ready now"
        : `~${alt.months_to_goal} ${alt.months_to_goal === 1 ? "month" : "months"} away`;
  return (
    <p className="bg-wp-track/60 text-wp-body mt-4 rounded-xl px-4 py-3 text-[13px] leading-relaxed">
      Flying{" "}
      <span className="text-wp-ink font-semibold">{cabinLabel(alt.cabin)}</span>{" "}
      instead needs{" "}
      <span className="text-wp-ink font-semibold tabular-nums">
        {fmtInt(alt.points_needed_total)}
      </span>{" "}
      points ({when}
      {alt.requires_card ? ", would need a new card" : ""}).
    </p>
  );
}

function TargetSection({ strategy }: { strategy: Strategy }) {
  return (
    <>
      <SectionHead>Target</SectionHead>
      <Panel>
        <div className="grid gap-5 sm:grid-cols-2">
          {strategy.legs.map((leg) => (
            <div key={leg.seq}>
              <div className="text-wp-muted-2 text-[11px] tracking-wide uppercase">
                {strategy.legs.length > 1
                  ? leg.seq === 1
                    ? "Outbound"
                    : "Return"
                  : "Flight"}
              </div>
              <div className="text-wp-ink mt-1 text-base font-semibold">
                {leg.route_name}
              </div>
              <p className="text-wp-muted mt-1 text-[13px]">
                {cabinLabel(leg.cabin)} · {leg.program_currency_name}
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-wp-ink text-xl font-semibold tabular-nums">
                  {fmtInt(leg.points_needed)}
                </span>
                <span className="text-wp-muted text-[13px]">
                  points needed
                  {leg.gap > 0 ? (
                    <>
                      {" "}
                      ·{" "}
                      <span className="text-wp-ink font-semibold tabular-nums">
                        {fmtInt(leg.gap)}
                      </span>{" "}
                      short
                    </>
                  ) : (
                    " · fully covered"
                  )}
                </span>
              </div>
              {leg.taxes_fees_usd_est > 0 ? (
                <p className="text-wp-muted-2 mt-1 text-[12.5px]">
                  + {fmtUsd(leg.taxes_fees_usd_est)} taxes/fees est.
                </p>
              ) : null}
              <p className="text-wp-muted-2 mt-1 text-[12.5px]">
                {leg.availability.verified
                  ? `${leg.availability.entries.length} verified date${
                      leg.availability.entries.length === 1 ? "" : "s"
                    } with seats`
                  : "Availability not yet checked"}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function CardSection({
  card,
  brandColor,
}: {
  card: NonNullable<Strategy["recommended_card"]>;
  brandColor: string | null;
}) {
  return (
    <>
      <SectionHead>Card to open</SectionHead>
      <Panel>
        <div className="flex items-start gap-4">
          <CardMark
            brandColor={brandColor}
            wordmark={issuerWordmark(card.issuer)}
          />
          <div className="min-w-0 flex-1">
            <div className="text-wp-ink text-base font-semibold">
              {card.card_name}
            </div>
            <p className="text-wp-body mt-1 text-[13px] leading-relaxed">
              Get about{" "}
              <span className="text-wp-ink font-semibold tabular-nums">
                {fmtInt(card.delivered_points)}
              </span>{" "}
              points after{" "}
              <span className="text-wp-ink font-semibold tabular-nums">
                {fmtUsd(card.min_spend_usd)}
              </span>{" "}
              spend within {card.window_months}{" "}
              {card.window_months === 1 ? "month" : "months"}.
            </p>
            <p className="text-wp-muted-2 mt-1 text-[12.5px]">
              {card.annual_fee > 0
                ? `${fmtUsd(card.annual_fee)} annual fee`
                : "No annual fee"}
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}

function EarnSection({ strategy }: { strategy: Strategy }) {
  const { held, with_recommended } = strategy.earn_velocity;
  const velocity = with_recommended ?? held;
  return (
    <>
      <SectionHead>Earn</SectionHead>
      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-wp-body text-[13px]">
            {velocity !== null
              ? `Earning ~${fmtInt(Math.round(velocity))} points/month`
              : "Monthly spend not set — add it in your wallet for a timeline"}
          </p>
          <p className="text-wp-ink text-[13px] font-semibold">
            {strategy.months_to_goal === null
              ? "Timing unclear"
              : strategy.months_to_goal === 0
                ? "Ready now"
                : `~${strategy.months_to_goal} ${
                    strategy.months_to_goal === 1 ? "month" : "months"
                  } to goal`}
          </p>
        </div>

        {strategy.timeline.length > 0 ? (
          <ol className="divide-wp-track border-wp-track mt-4 divide-y border-t">
            {strategy.timeline.map((entry) => (
              <li key={entry.month} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-wp-body text-[13px] font-medium tabular-nums">
                    {entry.month}
                  </span>
                  <span className="text-wp-muted text-[12.5px] tabular-nums">
                    {entry.projected_pct}%
                  </span>
                </div>
                {entry.events.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {entry.events.map((e, i) => (
                      <li key={i} className="text-wp-muted text-[12.5px]">
                        {e.description}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </Panel>
    </>
  );
}

function RedeemSection({ strategy }: { strategy: Strategy }) {
  const byLeg = new Map<number, typeof strategy.allocations>();
  for (const a of strategy.allocations) {
    byLeg.set(a.leg_seq, [...(byLeg.get(a.leg_seq) ?? []), a]);
  }

  return (
    <>
      <SectionHead>Redeem</SectionHead>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-wp-muted text-[13px]">
            {strategy.transfer_hops} transfer
            {strategy.transfer_hops === 1 ? "" : "s"}
            {strategy.max_transfer_hours > 0
              ? ` · up to ${strategy.max_transfer_hours}h to land`
              : ""}
          </p>
          <p className="text-wp-ink text-[13px] font-semibold tabular-nums">
            {fmtUsd(strategy.total_opportunity_cost_usd)} opportunity cost
          </p>
        </div>

        <div className="mt-4 space-y-4">
          {[...byLeg.entries()].map(([seq, allocations]) => (
            <div key={seq}>
              {byLeg.size > 1 ? (
                <div className="text-wp-muted-2 mb-2 text-[11px] tracking-wide uppercase">
                  {seq === 1 ? "Outbound" : "Return"}
                </div>
              ) : null}
              <ul className="space-y-2">
                {allocations.map((a, i) => (
                  <li
                    key={i}
                    className="text-wp-body flex items-baseline justify-between gap-3 text-[13px]"
                  >
                    <span>
                      {programWordmark(a.currency_name)}
                      {a.path.length > 0 ? (
                        <span className="text-wp-muted-2">
                          {" "}
                          (
                          {a.path
                            .map(
                              (p) =>
                                `${programWordmark(p.from_currency_name)}→${programWordmark(
                                  p.to_currency_name
                                )}${p.bonus_pct ? ` +${p.bonus_pct}%` : ""}`
                            )
                            .join(", ")}
                          )
                        </span>
                      ) : null}
                    </span>
                    <span className="text-wp-ink flex-none font-medium tabular-nums">
                      {fmtInt(a.points_used)} pts
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function OtherOptions({ strategies }: { strategies: Strategy[] }) {
  return (
    <>
      <SectionHead>Other options</SectionHead>
      <Panel>
        <ul className="divide-wp-track -my-2 divide-y">
          {strategies.map((s, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center justify-between gap-3 py-2.5"
            >
              <span className="text-wp-body text-[13px]">
                {s.legs.map((l) => l.route_name).join(" · ")}
              </span>
              <span className="flex items-center gap-3">
                <TierBadge tier={tierFromPlan(s.tier)} />
                <span className="text-wp-muted text-[12.5px] tabular-nums">
                  {fmtUsd(s.total_opportunity_cost_usd)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
