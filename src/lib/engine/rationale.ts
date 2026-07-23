// Rationale text is template strings over computed numbers — v1 by design
// (PLAN.md §4): fast, honest, testable. No AI anywhere near these numbers.
// The trip is narrated leg by leg: each leg names its route, program, and gap.
import type { LegPlan, Strategy } from "./schema";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function usdFmt(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function legLabel(leg: LegPlan): string {
  if (leg.covers_round_trip) return `Round trip on ${leg.route_name}`;
  return `Leg ${leg.leg_index} — ${leg.route_name}`;
}

function legParts(leg: LegPlan): string[] {
  const parts: string[] = [];
  const needed = fmt(leg.points_needed);
  if (leg.gap <= 0) {
    parts.push(
      `${legLabel(leg)}: your wallet covers all ${needed} ${leg.program_currency_name} points.`
    );
  } else {
    parts.push(
      `${legLabel(leg)}: needs ${needed} ${leg.program_currency_name} points; you can reach ${fmt(
        leg.reachable_points
      )} today, leaving a ${fmt(leg.gap)}-point gap.`
    );
  }

  for (const a of leg.allocations) {
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
  const totalNeeded = fmt(strategy.points_needed);

  if (strategy.tier === "bookable_now") {
    const bookLabel =
      strategy.booking === "round_trip_unit"
        ? "in one round-trip booking"
        : strategy.legs.length > 1
          ? "across both legs"
          : "";
    parts.push(
      `Bookable now: your wallet covers all ${totalNeeded} points for this trip${
        bookLabel ? ` ${bookLabel}` : ""
      }.`
    );
  } else {
    parts.push(
      `This trip needs ${totalNeeded} points; you can reach ${fmt(
        strategy.reachable_points
      )} today, leaving a ${fmt(strategy.gap)}-point gap.`
    );
  }

  for (const leg of strategy.legs) {
    parts.push(...legParts(leg));
  }

  const card = strategy.recommended_card;
  if (card !== null && strategy.gap > 0) {
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
