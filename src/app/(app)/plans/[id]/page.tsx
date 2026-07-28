import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { TierBadge, tierFromPlan } from "@/components/tier-badge";
import { CardMark } from "@/components/card-mark";
import { Button } from "@/components/ui/button";
import {
  cabinLabel,
  describeMonth,
  fmtDateTime,
  fmtInt,
  fmtUsd,
  issuerApplyUrl,
  issuerWordmark,
  monthLabel,
  programWordmark,
} from "@/lib/format";
import type {
  Allocation,
  CabinAlternative,
  Strategy,
  TimelineEntry,
  UnlockOpportunity,
} from "@/lib/engine/schema";
import { getOrCreatePlan } from "./get-or-create-plan";
import { legRedeemViews, redeemFutureSources } from "./redeem-view";
import { UpdatePlanButton } from "./update-plan-button";

type CardCatalogLite = {
  id: string;
  name: string;
  issuer: string;
  brand_color: string | null;
  affiliate_url: string | null;
  annual_fee: number;
};

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
  const top = plan.result.strategies[0] ?? null;
  const month = describeMonth(goalLegs ?? []);

  const regionByLeg = new Map<number, string | null>(
    (goalLegs ?? []).map((l) => [l.seq, l.destination_region])
  );

  // Card art (brand color) and CTA links for every card this render can
  // mention: the recommended card and any card that would unlock a locked
  // currency. Fetched once, up front, so the render below stays pure lookups.
  const cardIds = new Set<string>();
  if (top?.recommended_card) cardIds.add(top.recommended_card.card_id);
  for (const u of top?.unlock_opportunities ?? []) {
    for (const cardId of u.unlocking_card_ids) cardIds.add(cardId);
  }
  const cardCatalogRows: CardCatalogLite[] =
    cardIds.size > 0
      ? ((
          await supabase
            .from("card_catalog")
            .select("id, name, issuer, brand_color, affiliate_url, annual_fee")
            .in("id", [...cardIds])
        ).data ?? [])
      : [];
  const cardCatalog = new Map(cardCatalogRows.map((r) => [r.id, r]));

  const allStretch =
    plan.result.strategies.length > 0 &&
    plan.result.strategies.every((s) => s.tier === "stretch");

  const bookable = top?.tier === "bookable_now";

  // Acts 1 (open a card) and 2 (earn) only apply when there's a gap to close;
  // Act 1 specifically only when there's a card worth mentioning — either a
  // welcome-bonus recommendation for the trip, or a currency already held
  // that's locked behind a card the person could open today.
  const showAct1 =
    !bookable &&
    !!top &&
    (top.recommended_card !== null || top.unlock_opportunities.length > 0);
  const actKeys: Array<"open" | "earn" | "redeem"> = [];
  if (showAct1) actKeys.push("open");
  if (!bookable) actKeys.push("earn");
  actKeys.push("redeem");
  const actNumberOf = (k: (typeof actKeys)[number]) => actKeys.indexOf(k) + 1;

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
          {top ? (
            <p className="text-wp-muted mt-3 max-w-2xl text-[13px] leading-relaxed">
              {top.rationale}
            </p>
          ) : null}
        </div>
        <TierBadge tier={tierFromPlan(top?.tier)} className="flex-none" />
      </div>

      <div className="text-wp-muted-2 mt-4 flex flex-wrap items-center gap-3 text-[12.5px]">
        <span>Generated {fmtDateTime(plan.generatedAt)}</span>
        <UpdatePlanButton goalId={goal.id} />
      </div>

      <div className="mt-8">
        {!top ? (
          <NoRouteEmptyState />
        ) : (
          <>
            <ProgressHero strategy={top} />

            {plan.result.cabin_alternative ? (
              <CabinAlternativeNote alt={plan.result.cabin_alternative} />
            ) : null}

            <TripSection strategy={top} regionByLeg={regionByLeg} />

            {allStretch ? <AllStretchNote /> : null}

            {bookable ? (
              <BookableNowSection strategy={top} cardCatalog={cardCatalog} />
            ) : (
              <>
                <p className="text-wp-muted mt-8 text-[13px] leading-relaxed">
                  How you get there — three moves, in order. We did the math,
                  you just follow the steps.
                </p>

                {showAct1 ? (
                  <OpenCardSection
                    n={actNumberOf("open")}
                    strategy={top}
                    cardCatalog={cardCatalog}
                  />
                ) : null}

                <EarnSection n={actNumberOf("earn")} strategy={top} />

                <RedeemSection
                  n={actNumberOf("redeem")}
                  strategy={top}
                  cardCatalog={cardCatalog}
                />
              </>
            )}

            {plan.result.strategies.length > 1 ? (
              <OtherOptions strategies={plan.result.strategies.slice(1)} />
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

function SectionHead({
  n,
  children,
}: {
  n?: number;
  children: React.ReactNode;
}) {
  return (
    <h2 className="text-wp-ink mt-8 flex items-baseline gap-2 text-lg font-semibold first:mt-0">
      {n !== undefined ? (
        <span className="text-wp-accent-text font-display text-base">{n}.</span>
      ) : null}
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

function AllStretchNote() {
  return (
    <p className="bg-wp-track/60 text-wp-body mt-4 rounded-xl px-4 py-3 text-[13px] leading-relaxed">
      Every route we found for this trip is a stretch from where your wallet
      stands today — that&rsquo;s an honest answer, not a dead end. Add a card
      or raise your monthly spend in the{" "}
      <Link
        href="/wallet"
        className="text-wp-accent-text underline underline-offset-2"
      >
        wallet
      </Link>{" "}
      and this plan updates.
    </p>
  );
}

// Ring status word — a plain-language read of the tier, distinct from the
// TierBadge label (which stays as-is elsewhere in the app).
function tierStatusWord(tier: Strategy["tier"]): string {
  switch (tier) {
    case "bookable_now":
      return "Ready to book";
    case "reachable":
      return "On track";
    case "needs_card":
      return "Needs a card";
    case "stretch":
      return "Just started";
  }
}

function ProgressMeter({ pct }: { pct: number }) {
  return (
    <div
      className="bg-wp-track h-2 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progress toward your points target"
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          background:
            "linear-gradient(90deg, var(--wp-accent), color-mix(in oklab, var(--wp-accent), #fff 25%))",
        }}
      />
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);
  return (
    <svg
      width="104"
      height="104"
      viewBox="0 0 104 104"
      className="-rotate-90"
      aria-hidden
    >
      <circle
        cx="52"
        cy="52"
        r={r}
        fill="none"
        stroke="var(--wp-track)"
        strokeWidth="10"
      />
      <circle
        cx="52"
        cy="52"
        r={r}
        fill="none"
        stroke="var(--wp-accent)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

function ProgressHero({ strategy }: { strategy: Strategy }) {
  // timeline always has >=1 entry (buildTimeline never emits empty); its
  // first entry is the trip's progress toward points_needed_total right now.
  const pct = strategy.timeline[0]!.projected_pct;

  // Display convenience only: reachable_points is per-leg because summing
  // points across two different currencies mixes units (see the comment on
  // strategySchema in schema.ts). This total is never fed into a calculation
  // — it only ever reaches the screen as a headline figure.
  const transferableToday = strategy.legs.reduce(
    (sum, leg) => sum + leg.reachable_points,
    0
  );

  return (
    <Panel>
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="wp-eyebrow">Your target</div>
          <div className="font-display text-wp-ink mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">
              {fmtInt(strategy.points_needed_total)}
            </span>
            <span className="text-wp-muted text-base font-normal">
              points needed
            </span>
          </div>
          <p className="text-wp-body mt-2 text-[13px]">
            <span className="text-wp-ink font-semibold tabular-nums">
              {fmtInt(transferableToday)}
            </span>{" "}
            transferable today with the cards you hold.
          </p>
          <div className="mt-4 max-w-xs">
            <ProgressMeter pct={pct} />
          </div>
        </div>
        <div className="relative flex-none">
          <ProgressRing pct={pct} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-wp-ink text-xl font-semibold tabular-nums">
              {pct}%
            </span>
            <span className="text-wp-muted-2 text-center text-[10px] leading-tight font-semibold tracking-wide uppercase">
              {tierStatusWord(strategy.tier)}
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TripSection({
  strategy,
  regionByLeg,
}: {
  strategy: Strategy;
  regionByLeg: Map<number, string | null>;
}) {
  return (
    <>
      <SectionHead>Your trip</SectionHead>
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
              {leg.match_type === "region" ? (
                <p className="text-wp-muted-2 mt-1 text-[12.5px]">
                  Priced for {regionByLeg.get(leg.seq) ?? "the general region"}{" "}
                  generally — your exact airports may differ.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function cheapestUnlockingCard(
  u: UnlockOpportunity,
  cardCatalog: Map<string, CardCatalogLite>
): CardCatalogLite | null {
  const candidates = u.unlocking_card_ids
    .map((cardId) => cardCatalog.get(cardId))
    .filter((c): c is CardCatalogLite => !!c)
    .sort((a, b) => a.annual_fee - b.annual_fee);
  return candidates[0] ?? null;
}

// The revaluation of points already owned — the single most persuasive,
// numerically-free thing the product can say. Rendered once per page: the
// engine attaches an identical copy of unlock_opportunities to every
// strategy, so callers only ever pass the top strategy's list.
function UnlockMoment({
  opportunities,
  cardCatalog,
}: {
  opportunities: UnlockOpportunity[];
  cardCatalog: Map<string, CardCatalogLite>;
}) {
  return (
    <div className="space-y-3">
      {opportunities.map((u) => {
        const card = cheapestUnlockingCard(u, cardCatalog);
        return (
          <p
            key={u.currency_id}
            className="bg-wp-track/60 text-wp-body rounded-xl px-4 py-3 text-[13px] leading-relaxed"
          >
            Your{" "}
            <span className="text-wp-ink font-semibold tabular-nums">
              {fmtInt(u.balance)}
            </span>{" "}
            {u.currency_name} points are worth about{" "}
            <b className="text-wp-ink tabular-nums">
              {fmtUsd(u.value_now_usd)}
            </b>{" "}
            today.{" "}
            {card ? (
              <>
                Opening a{" "}
                <span className="text-wp-ink font-semibold">{card.name}</span>{" "}
                makes
              </>
            ) : (
              "Opening the right card makes"
            )}{" "}
            them worth about{" "}
            <b className="text-wp-accent-text tabular-nums">
              {fmtUsd(u.value_unlocked_usd)}
            </b>{" "}
            toward award flights.
          </p>
        );
      })}
    </div>
  );
}

function CardRecommendation({
  card,
  brandColor,
  affiliateUrl,
}: {
  card: NonNullable<Strategy["recommended_card"]>;
  brandColor: string | null;
  affiliateUrl: string | null;
}) {
  // affiliate_url is null for most cards at launch — the plain issuer link is
  // the common case, not a downgrade, so it gets the identical button.
  const applyUrl = affiliateUrl ?? issuerApplyUrl(card.issuer);
  return (
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
        {applyUrl ? (
          <Button asChild size="sm" className="mt-3">
            <a href={applyUrl} target="_blank" rel="noopener noreferrer">
              Open {card.card_name} →
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function OpenCardSection({
  n,
  strategy,
  cardCatalog,
}: {
  n: number;
  strategy: Strategy;
  cardCatalog: Map<string, CardCatalogLite>;
}) {
  const hasUnlock = strategy.unlock_opportunities.length > 0;
  return (
    <>
      <SectionHead n={n}>Open a card</SectionHead>
      <Panel>
        {hasUnlock ? (
          <UnlockMoment
            opportunities={strategy.unlock_opportunities}
            cardCatalog={cardCatalog}
          />
        ) : null}
        {strategy.recommended_card ? (
          <div
            className={
              hasUnlock ? "border-wp-track mt-4 border-t pt-4" : undefined
            }
          >
            <CardRecommendation
              card={strategy.recommended_card}
              brandColor={
                cardCatalog.get(strategy.recommended_card.card_id)
                  ?.brand_color ?? null
              }
              affiliateUrl={
                cardCatalog.get(strategy.recommended_card.card_id)
                  ?.affiliate_url ?? null
              }
            />
          </div>
        ) : null}
      </Panel>
    </>
  );
}

function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="wp-eyebrow">Your months, in order</div>
      <ol className="divide-wp-track border-wp-track mt-2 divide-y border-t">
        {entries.map((entry) => (
          <li key={entry.month} className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-wp-body text-[13px] font-medium">
                {monthLabel(entry.month) ?? entry.month}
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
    </div>
  );
}

function EarnPanel({ strategy }: { strategy: Strategy }) {
  const { held, with_recommended } = strategy.earn_velocity;
  const velocity = with_recommended ?? held;
  return (
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-wp-body text-[13px]">
          {velocity !== null
            ? `Earning ~${fmtInt(Math.round(velocity))} points/month`
            : "Monthly spend not set — add it in your wallet for a timeline"}
        </p>
        <p className="text-wp-ink text-[13px] font-semibold">
          {strategy.months_to_goal === null ? (
            <>
              Add your{" "}
              <Link
                href="/wallet"
                className="text-wp-accent-text underline underline-offset-2"
              >
                monthly spend
              </Link>{" "}
              to see when
            </>
          ) : strategy.months_to_goal === 0 ? (
            "Ready now"
          ) : (
            `~${strategy.months_to_goal} ${
              strategy.months_to_goal === 1 ? "month" : "months"
            } to goal`
          )}
        </p>
      </div>

      <Timeline entries={strategy.timeline} />
    </Panel>
  );
}

function EarnSection({ n, strategy }: { n: number; strategy: Strategy }) {
  return (
    <>
      <SectionHead n={n}>Earn the rest</SectionHead>
      <EarnPanel strategy={strategy} />
    </>
  );
}

// An allocation's currency is either unlocked (a live transfer source — the
// engine never lets a locked currency become one, see reachability.ts) or it
// isn't. Derived from strategy.unlock_opportunities, never invented, so this
// stays correct even though today's engine makes "locked" unreachable here:
// no allocation currency can also be an unlock_opportunities currency, since
// those two lists partition the wallet by the same unlocked/locked flag.
function AllocationTag({
  allocation,
  unlockByCurrency,
  cardCatalog,
}: {
  allocation: Allocation;
  unlockByCurrency: Map<string, UnlockOpportunity>;
  cardCatalog: Map<string, CardCatalogLite>;
}) {
  const unlock = unlockByCurrency.get(allocation.currency_id);
  if (!unlock) {
    return (
      <div className="text-wp-muted-2 mt-0.5 text-[11px]">
        transferable today
      </div>
    );
  }
  const card = cheapestUnlockingCard(unlock, cardCatalog);
  return (
    <div className="text-wp-muted-2 mt-0.5 text-[11px]">
      locked today{card ? ` · released by the ${card.name}` : ""}
    </div>
  );
}

function RedeemPanel({
  strategy,
  cardCatalog,
}: {
  strategy: Strategy;
  cardCatalog: Map<string, CardCatalogLite>;
}) {
  const legViews = legRedeemViews(strategy);
  const unlockByCurrency = new Map(
    strategy.unlock_opportunities.map((u) => [u.currency_id, u])
  );
  const { velocity, hasFutureSource } = redeemFutureSources(strategy);

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-wp-muted text-[13px]">
          {strategy.transfer_hops} transfer
          {strategy.transfer_hops === 1 ? "" : "s"}
          {strategy.max_transfer_hours > 0
            ? ` · up to ${strategy.max_transfer_hours}h to land`
            : ""}
        </p>
        <p className="text-wp-ink text-[13px] font-semibold">
          you&rsquo;d be spending points worth about{" "}
          <span className="tabular-nums">
            {fmtUsd(strategy.total_opportunity_cost_usd)}
          </span>
        </p>
      </div>

      <div className="mt-4 space-y-4">
        {legViews.map(({ seq, allocations, gap }) => {
          return (
            <div key={seq}>
              {legViews.length > 1 ? (
                <div className="text-wp-muted-2 mb-2 text-[11px] tracking-wide uppercase">
                  {seq === 1 ? "Outbound" : "Return"}
                </div>
              ) : null}
              {allocations.length > 0 ? (
                <ul className="space-y-2">
                  {allocations.map((a, i) => (
                    <li key={i} className="text-wp-body text-[13px]">
                      <div className="flex items-baseline justify-between gap-3">
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
                      </div>
                      <AllocationTag
                        allocation={a}
                        unlockByCurrency={unlockByCurrency}
                        cardCatalog={cardCatalog}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-wp-muted text-[13px] leading-relaxed">
                  Nothing you hold today reaches this leg
                  {hasFutureSource ? " — see below for what closes it." : "."}
                </p>
              )}
              {gap > 0 ? (
                <p className="text-wp-muted-2 mt-1.5 text-[12.5px]">
                  <span className="text-wp-ink font-semibold tabular-nums">
                    {fmtInt(gap)}
                  </span>{" "}
                  points short
                  {allocations.length > 0
                    ? " — see below for what closes it."
                    : "."}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {strategy.gap_total > 0 ? (
        <div className="border-wp-track mt-4 border-t pt-4">
          <div className="text-wp-muted-2 mb-2 text-[11px] tracking-wide uppercase">
            Closes the remaining {fmtInt(strategy.gap_total)} points
          </div>
          {hasFutureSource ? (
            <ul className="space-y-2">
              {strategy.recommended_card ? (
                <li className="text-wp-body flex items-baseline justify-between gap-3 text-[13px]">
                  <span>
                    {strategy.recommended_card.card_name} welcome bonus{" "}
                    <span className="text-wp-muted-2">· future</span>
                  </span>
                  <span className="text-wp-ink flex-none font-medium tabular-nums">
                    {fmtInt(strategy.recommended_card.delivered_points)} pts
                  </span>
                </li>
              ) : null}
              {velocity !== null && velocity > 0 ? (
                <li className="text-wp-body flex items-baseline justify-between gap-3 text-[13px]">
                  <span>
                    Points earned from spend{" "}
                    <span className="text-wp-muted-2">· future</span>
                  </span>
                  <span className="text-wp-ink flex-none font-medium tabular-nums">
                    ~{fmtInt(velocity)} pts/mo
                  </span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-wp-muted text-[13px] leading-relaxed">
              No card or spend identified yet to close this gap — add one in
              your wallet.
            </p>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

function RedeemSection({
  n,
  strategy,
  cardCatalog,
}: {
  n: number;
  strategy: Strategy;
  cardCatalog: Map<string, CardCatalogLite>;
}) {
  return (
    <>
      <SectionHead n={n}>Redeem</SectionHead>
      <RedeemPanel strategy={strategy} cardCatalog={cardCatalog} />
    </>
  );
}

function BookableNowSection({
  strategy,
  cardCatalog,
}: {
  strategy: Strategy;
  cardCatalog: Map<string, CardCatalogLite>;
}) {
  return (
    <>
      <SectionHead>How to book it</SectionHead>
      <p className="text-wp-muted mt-1 text-[13px] leading-relaxed">
        You already have enough — no new card, no more spend. Here&rsquo;s
        exactly how to redeem.
      </p>
      <RedeemPanel strategy={strategy} cardCatalog={cardCatalog} />
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
