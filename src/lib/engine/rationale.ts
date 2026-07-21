// Rationale text is template strings over computed numbers — v1 by design
// (PLAN.md §4): fast, honest, testable. No AI anywhere near these numbers.
import type { Strategy } from "./schema";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function usdFmt(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function rationale(
  strategy: Omit<Strategy, "rationale" | "timeline">
): string {
  const parts: string[] = [];
  const needed = fmt(strategy.points_needed);

  if (strategy.tier === "bookable_now") {
    parts.push(
      `Bookable now: your wallet covers all ${needed} ${strategy.program_currency_name} points for ${strategy.route_name}.`
    );
  } else {
    parts.push(
      `${strategy.route_name} needs ${needed} ${strategy.program_currency_name} points; you can reach ${fmt(
        strategy.reachable_points
      )} today, leaving a ${fmt(strategy.gap)}-point gap.`
    );
  }

  for (const a of strategy.allocations) {
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
