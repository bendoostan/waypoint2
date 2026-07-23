// Stage 7 (PLAN.md §4.7): the precomputed time-to-earn visual. Months are
// derived from `now` only — never the wall clock. Emission caps at 24 months.
//
// One shared projection for the whole trip: the balance climbs toward the
// trip's total need, and the trip BOOKS (per-leg transfer + book events) only
// once every leg is covered. A trip that books immediately emits a single
// month.
import type { CardRecommendation, LegPlan, TimelineEntry } from "./schema";
import type { GapClosure } from "./gap";

export function monthKey(now: Date, offsetMonths: number): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + offsetMonths;
  const d = new Date(Date.UTC(year, month, 1));
  const mm = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function transferDescriptions(legs: LegPlan[]): string[] {
  const multi = legs.length > 1;
  const out: string[] = [];
  for (const leg of legs) {
    const prefix =
      multi && !leg.covers_round_trip ? `Leg ${leg.leg_index}: ` : "";
    for (const a of leg.allocations) {
      if (a.path.length === 0) continue;
      const hops = a.path
        .map((s) => {
          const bonus = s.bonus_pct !== null ? ` (+${s.bonus_pct}% bonus)` : "";
          return `${fmt(s.points_sent)} ${s.from_currency_name} → ${fmt(
            s.points_delivered
          )} ${s.to_currency_name}${bonus}`;
        })
        .join(", then ");
      out.push(`${prefix}Transfer ${hops}`);
    }
  }
  return out;
}

function bookDescriptions(legs: LegPlan[]): string[] {
  return legs.map((leg) => {
    const what = leg.covers_round_trip
      ? `${leg.route_name} (round trip, ${fmt(leg.points_needed)} points)`
      : `${leg.route_name} (${fmt(leg.points_needed)} points)`;
    return `Book ${what}`;
  });
}

export function buildTimeline(params: {
  now: Date;
  /** trip totals */
  needed: number;
  reachable: number;
  gap: number;
  legs: LegPlan[];
  closure: GapClosure;
  recommended: CardRecommendation | null;
}): TimelineEntry[] {
  const { now, needed, reachable, gap, legs, closure, recommended } = params;

  const transfers = transferDescriptions(legs).map((description) => ({
    type: "transfer" as const,
    description,
  }));
  const books = bookDescriptions(legs).map((description) => ({
    type: "book" as const,
    description,
  }));

  if (gap <= 0) {
    return [
      {
        month: monthKey(now, 0),
        projected_balance: needed,
        events: [...transfers, ...books],
      },
    ];
  }

  const velocity =
    (recommended !== null
      ? closure.earn_velocity.with_recommended
      : closure.earn_velocity.held) ?? 0;
  const bonusMonth = recommended !== null ? closure.bonus_month : null;

  // Nothing will ever change: emit the starting month only.
  if (velocity <= 0 && bonusMonth === null) {
    return [
      { month: monthKey(now, 0), projected_balance: reachable, events: [] },
    ];
  }

  const entries: TimelineEntry[] = [
    { month: monthKey(now, 0), projected_balance: reachable, events: [] },
  ];

  // 24 entries total including month 0
  for (let m = 1; m <= 23; m += 1) {
    let balance = reachable + velocity * m;
    const events: TimelineEntry["events"] = [];

    if (recommended !== null && bonusMonth !== null && m >= bonusMonth) {
      balance += recommended.delivered_points;
      if (m === bonusMonth) {
        events.push({
          type: "welcome_bonus_posts",
          description: `${recommended.issuer} ${recommended.card_name} welcome bonus posts (~${fmt(
            recommended.delivered_points
          )} points after $${fmt(recommended.min_spend_usd)} spend)`,
        });
      }
    }

    const projected = Math.floor(balance);
    if (projected >= needed) {
      entries.push({
        month: monthKey(now, m),
        projected_balance: projected,
        events: [...events, ...transfers, ...books],
      });
      break;
    }
    entries.push({
      month: monthKey(now, m),
      projected_balance: projected,
      events,
    });
  }

  return entries;
}
