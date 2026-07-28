// Stage 7 (PLAN.md §4.7): the precomputed time-to-earn visual. Months are
// derived from `now` only — never the wall clock. Emission caps at 24 months.
//
// A single trip-wide balance is meaningless once the legs target different
// programs, so each leg is projected on its OWN program: it starts at that
// leg's reachable balance and climbs on that leg's velocity (and welcome bonus,
// if that leg's gap needs a card). The trip BOOKS only in the month EVERY leg
// is covered; projected_pct is the trip's overall progress toward
// points_needed_total, so one leg's surplus can't mask another's shortfall.
import type { Allocation, LegPlan, TimelineEntry } from "./schema";

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

/** Per-leg projection inputs, resolved from each leg's gap closure. */
export type LegProjection = {
  seq: 1 | 2;
  reachable: number;
  needed: number;
  /** points/month delivered into this leg's program */
  velocity: number;
  /** 1-based month the welcome bonus posts for this leg, or null */
  bonus_month: number | null;
  /** points the bonus delivers into this leg's program */
  bonus_delivered: number;
  /** welcome_bonus_posts event text for this leg, or null when no card */
  bonus_event: string | null;
  /**
   * 1-based month the recommended card's unlock takes effect, or null. Never
   * bonus_month — approval needs no spend, so it's available earlier.
   */
  unlock_month: number | null;
  /** already-held points this leg receives once the card is approved */
  unlock_delivered: number;
  /** unlock event text for this leg, or null when there's nothing to unlock */
  unlock_event: string | null;
};

function transferDescriptions(
  allocations: Allocation[],
  multiLeg: boolean
): string[] {
  const out: string[] = [];
  for (const a of allocations) {
    if (a.path.length === 0) continue;
    const prefix = multiLeg ? `Leg ${a.leg_seq}: ` : "";
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
  return out;
}

function bookDescriptions(legs: LegPlan[]): string[] {
  const isRoundTrip =
    legs.length === 2 && legs[0]!.route_id === legs[1]!.route_id;
  if (isRoundTrip) {
    const total = legs.reduce((s, l) => s + l.points_needed, 0);
    return [`Book ${legs[0]!.route_name} (round trip, ${fmt(total)} points)`];
  }
  return legs.map((l) => {
    const label = legs.length > 1 ? `Leg ${l.seq}: ` : "";
    return `${label}Book ${l.route_name} (${fmt(l.points_needed)} points)`;
  });
}

/** Capped-at-need progress toward the trip's total requirement, 0-100. */
function pct(
  balances: { seq: 1 | 2; balance: number }[],
  legs: LegProjection[]
) {
  const total = legs.reduce((s, l) => s + l.needed, 0);
  if (total <= 0) return 100;
  const covered = balances.reduce((s, b) => {
    const need = legs.find((l) => l.seq === b.seq)?.needed ?? 0;
    return s + Math.min(b.balance, need);
  }, 0);
  return Math.max(0, Math.min(100, Math.round((covered / total) * 100)));
}

export function buildTimeline(params: {
  now: Date;
  legs: LegProjection[];
  legPlans: LegPlan[];
  allocations: Allocation[];
  gapTotal: number;
}): TimelineEntry[] {
  const { now, legs, legPlans, allocations, gapTotal } = params;
  const multiLeg = legPlans.length > 1;

  const transfers = transferDescriptions(allocations, multiLeg).map(
    (description) => ({ type: "transfer" as const, description })
  );
  const books = bookDescriptions(legPlans).map((description) => ({
    type: "book" as const,
    description,
  }));

  const balanceAt = (leg: LegProjection, m: number): number => {
    if (leg.needed - leg.reachable <= 0) return leg.needed; // covered now
    const bonus =
      leg.bonus_month !== null && m >= leg.bonus_month
        ? leg.bonus_delivered
        : 0;
    const unlock =
      leg.unlock_month !== null && m >= leg.unlock_month
        ? leg.unlock_delivered
        : 0;
    return Math.floor(leg.reachable + leg.velocity * m + bonus + unlock);
  };
  const legCovered = (leg: LegProjection, m: number): boolean =>
    Math.min(balanceAt(leg, m), leg.needed) >= leg.needed;

  const balancesAt = (m: number) =>
    legs.map((l) => ({ seq: l.seq, projected_balance: balanceAt(l, m) }));

  // Bookable now: one month, everything happens today.
  if (gapTotal <= 0) {
    return [
      {
        month: monthKey(now, 0),
        projected_balances: balancesAt(0),
        projected_pct: 100,
        events: [...transfers, ...books],
      },
    ];
  }

  // Will any gapped leg ever move? If none does, nothing changes — one month.
  const canProgress = legs.some(
    (l) =>
      l.needed - l.reachable > 0 &&
      (l.velocity > 0 || l.bonus_month !== null || l.unlock_month !== null)
  );
  if (!canProgress) {
    return [
      {
        month: monthKey(now, 0),
        projected_balances: balancesAt(0),
        projected_pct: pct(
          balancesAt(0).map((b) => ({
            seq: b.seq,
            balance: b.projected_balance,
          })),
          legs
        ),
        events: [],
      },
    ];
  }

  const entries: TimelineEntry[] = [];
  for (let m = 0; m <= 23; m += 1) {
    const raw = balancesAt(m);
    const events: TimelineEntry["events"] = [];

    // Unlocks land on approval, bonuses need spend to post — skip month 0 for
    // both (neither happens with zero action taken), and emit unlocks before
    // bonuses so a month that has both reads in the right order.
    if (m > 0) {
      for (const l of legs) {
        if (
          l.unlock_month !== null &&
          m === l.unlock_month &&
          l.unlock_event !== null
        ) {
          events.push({ type: "unlock", description: l.unlock_event });
        }
      }
      for (const l of legs) {
        if (
          l.bonus_month !== null &&
          m === l.bonus_month &&
          l.bonus_event !== null
        ) {
          events.push({
            type: "welcome_bonus_posts",
            description: l.bonus_event,
          });
        }
      }
    }

    const allCovered = legs.every((l) => legCovered(l, m));
    if (allCovered && m > 0) {
      entries.push({
        month: monthKey(now, m),
        projected_balances: raw,
        projected_pct: 100,
        events: [...events, ...transfers, ...books],
      });
      break;
    }

    entries.push({
      month: monthKey(now, m),
      projected_balances: raw,
      projected_pct: pct(
        raw.map((b) => ({ seq: b.seq, balance: b.projected_balance })),
        legs
      ),
      events,
    });
  }

  return entries;
}
