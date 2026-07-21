// Stage 7 (PLAN.md §4.7): the precomputed time-to-earn visual. Months are
// derived from `now` only — never the wall clock. Emission caps at 24
// months; a plan that books immediately emits a single month.
import type { Allocation, CardRecommendation, TimelineEntry } from "./schema";
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

function transferDescriptions(allocations: Allocation[]): string[] {
  return allocations
    .filter((a) => a.path.length > 0)
    .map((a) => {
      const hops = a.path
        .map((s) => {
          const bonus = s.bonus_pct !== null ? ` (+${s.bonus_pct}% bonus)` : "";
          return `${fmt(s.points_sent)} ${s.from_currency_name} → ${fmt(
            s.points_delivered
          )} ${s.to_currency_name}${bonus}`;
        })
        .join(", then ");
      return `Transfer ${hops}`;
    });
}

export function buildTimeline(params: {
  now: Date;
  needed: number;
  reachable: number;
  gap: number;
  allocations: Allocation[];
  closure: GapClosure;
  routeName: string;
  recommended: CardRecommendation | null;
}): TimelineEntry[] {
  const { now, needed, reachable, gap, allocations, closure, routeName } =
    params;
  const recommended = params.recommended;

  if (gap <= 0) {
    return [
      {
        month: monthKey(now, 0),
        projected_balance: needed,
        events: [
          ...transferDescriptions(allocations).map((description) => ({
            type: "transfer" as const,
            description,
          })),
          {
            type: "book" as const,
            description: `Book ${routeName} (${fmt(needed)} points)`,
          },
        ],
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
      for (const description of transferDescriptions(allocations)) {
        events.push({ type: "transfer", description });
      }
      events.push({
        type: "book",
        description: `Book ${routeName} (${fmt(needed)} points)`,
      });
      entries.push({
        month: monthKey(now, m),
        projected_balance: projected,
        events,
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
