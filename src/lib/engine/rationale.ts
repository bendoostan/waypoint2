// Rationale text is template strings over computed numbers — v1 by design
// (PLAN.md §4): fast, honest, testable. No AI anywhere near these numbers.
// The trip is narrated leg by leg: each leg names its route, program, and gap,
// then the shared-wallet allocations that feed it.
import type { Allocation, LegPlan, Strategy } from "./schema";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function usdFmt(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function isRoundTrip(legs: LegPlan[]): boolean {
  return legs.length === 2 && legs[0]!.route_id === legs[1]!.route_id;
}

function legLabel(leg: LegPlan, roundTrip: boolean, multi: boolean): string {
  if (roundTrip) return `Round trip on ${leg.route_name}`;
  return multi ? `Leg ${leg.seq} — ${leg.route_name}` : leg.route_name;
}

function allocationParts(allocations: Allocation[]): string[] {
  const parts: string[] = [];
  for (const a of allocations) {
    if (a.path.length === 0) {
      parts.push(
        `Use ${fmt(a.points_used)} ${a.currency_name} directly (worth ${usdFmt(
          a.opportunity_cost_usd
        )}).`
      );
    } else {
      const hops = a.path
        .map((s) => {
          const bonus =
            s.bonus_pct !== null
              ? ` with the ${s.bonus_pct}% transfer bonus`
              : "";
          return `${fmt(s.points_sent)} ${s.from_currency_name} into ${fmt(
            s.points_delivered
          )} ${s.to_currency_name}${bonus}`;
        })
        .join(", then ");
      parts.push(`Transfer ${hops}.`);
    }
  }
  return parts;
}

export function rationale(
  strategy: Omit<Strategy, "rationale" | "timeline">
): string {
  const parts: string[] = [];
  const totalNeeded = fmt(strategy.points_needed_total);
  const roundTrip = isRoundTrip(strategy.legs);
  const multi = strategy.legs.length > 1;

  if (strategy.tier === "bookable_now") {
    const bookLabel = roundTrip
      ? " in one round-trip booking"
      : multi
        ? " across both legs"
        : "";
    parts.push(
      `Bookable now: your wallet covers all ${totalNeeded} points for this trip${bookLabel}.`
    );
  } else {
    parts.push(
      `This trip needs ${totalNeeded} points; you have a ${fmt(
        strategy.gap_total
      )}-point gap.`
    );
  }

  for (const leg of strategy.legs) {
    const needed = fmt(leg.points_needed);
    if (leg.gap <= 0) {
      parts.push(
        `${legLabel(leg, roundTrip, multi)}: your wallet covers all ${needed} ${leg.program_currency_name} points.`
      );
    } else {
      parts.push(
        `${legLabel(leg, roundTrip, multi)}: needs ${needed} ${leg.program_currency_name} points; you can reach ${fmt(
          leg.reachable_points
        )} today, leaving a ${fmt(leg.gap)}-point gap.`
      );
    }
    // The shared-wallet moves that feed this leg (trip-level, tagged by seq).
    const legAllocs = strategy.allocations.filter((a) => a.leg_seq === leg.seq);
    parts.push(...allocationParts(legAllocs));
    if (roundTrip) break; // both legs share one booking; narrate it once
  }

  const card = strategy.recommended_card;
  if (card !== null && strategy.gap_total > 0) {
    parts.push(
      `Open the ${card.issuer} ${card.card_name}: its ${fmt(
        card.offer_points
      )}-point welcome offer (after $${fmt(card.min_spend_usd)} spend in ${
        card.window_months
      } months, $${fmt(card.annual_fee)} annual fee) is worth ~${fmt(
        card.delivered_points
      )} points toward this trip.`
    );
  }

  for (const opp of strategy.unlock_opportunities) {
    parts.push(
      `Your ${fmt(opp.balance)} ${opp.currency_name} points are worth ${usdFmt(
        opp.value_now_usd
      )} today; a card that unlocks transfers makes them ${usdFmt(
        opp.value_unlocked_usd
      )} toward award flights (+${usdFmt(opp.delta_usd)}).`
    );
  }

  if (strategy.months_to_goal !== null && strategy.months_to_goal > 0) {
    parts.push(
      `At your stated spend, you reach the goal in about ${strategy.months_to_goal} month${
        strategy.months_to_goal === 1 ? "" : "s"
      }.`
    );
  }

  return parts.join(" ");
}
