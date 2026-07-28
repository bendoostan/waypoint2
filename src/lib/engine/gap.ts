// Stage 5 (PLAN.md §4.5): close the gap with (a) the best welcome offer
// whose currency can actually reach the target program, crediting BOTH its
// welcome bonus and any already-held balance it releases, and (b) earn
// velocity from stated monthly spend. Estimates here use pure ratios —
// min_transfer/increment rounding applies when transfers actually happen.
import { effectiveWallet } from "./effective-wallet";
import { bonusPctForEdge, expandReachability } from "./reachability";
import type { Reachability } from "./reachability";
import { solveCandidate } from "./solve";
import { solveSplit } from "./trip";
import type { CardRecommendation } from "./schema";
import type {
  CardCatalog,
  Currency,
  EarningRate,
  EffectiveCurrency,
  TransferBonus,
  TransferPartner,
  WalletCard,
  WelcomeOffer,
} from "./types";

export type GapClosure = {
  recommended_card: CardRecommendation | null;
  earn_velocity: { held: number | null; with_recommended: number | null };
  /** months to close the gap on held-card velocity alone */
  months_held: number | null;
  /** months to close the gap with the recommended card (offer + velocity) */
  months_with_card: number | null;
  /** month index (1-based) when the welcome bonus posts; null if unknowable */
  bonus_month: number | null;
  /**
   * THIS leg's share of recommended_card.unlocked_points — not invented, but
   * read straight off the same joint re-solve that produced the trip-wide
   * total, so a released balance that could cover either leg of an open-jaw
   * is attributed to at most one of them. 0 when there's no recommended card
   * or its unlock releases nothing toward this leg specifically.
   */
  unlock_points_this_leg: number;
};

/** One leg's need, for the joint re-solve `unlockBenefit` runs per candidate. */
export type LegNeed = {
  seq: 1 | 2;
  points_needed: number;
  dest_currency_id: string;
  /** This leg's reachable_points from the REAL (non-hypothetical) solve. */
  reachable_points: number;
};

/**
 * Best multiplicative conversion rate from one currency into another over
 * ≤ 2 active edges, bonuses included. 1 for same-currency, null when no
 * path exists.
 */
export function bestConversionRate(
  from: string,
  to: string,
  partners: TransferPartner[],
  bonuses: TransferBonus[],
  now: Date
): number | null {
  if (from === to) return 1;
  const active = partners.filter((p) => p.is_active);
  const edgeRate = (e: TransferPartner) =>
    (e.ratio_den / e.ratio_num) *
    (1 + (bonusPctForEdge(e, bonuses, now) ?? 0) / 100);

  let best: number | null = null;
  for (const e1 of active) {
    if (e1.from_currency_id !== from) continue;
    if (e1.to_currency_id === to) {
      const r = edgeRate(e1);
      if (best === null || r > best) best = r;
      continue;
    }
    for (const e2 of active) {
      if (e2.from_currency_id !== e1.to_currency_id) continue;
      if (e2.to_currency_id !== to) continue;
      const r = edgeRate(e1) * edgeRate(e2);
      if (best === null || r > best) best = r;
    }
  }
  return best;
}

function totalSpend(monthlySpend: Record<string, number>): number {
  return Object.values(monthlySpend).reduce(
    (s, v) => s + (Number.isFinite(v) && v > 0 ? v : 0),
    0
  );
}

/**
 * Points per month delivered INTO the target program from stated spend,
 * using each category's best card. Capped categories earn the card's
 * everything_else rate on spend beyond the cap.
 */
export function earnVelocity(
  cards: CardCatalog[],
  rates: EarningRate[],
  monthlySpend: Record<string, number>,
  convert: (currencyId: string) => number
): number | null {
  if (totalSpend(monthlySpend) <= 0) return null;

  let total = 0;
  for (const [category, spendRaw] of Object.entries(monthlySpend).sort()) {
    const spend = Number.isFinite(spendRaw) ? spendRaw : 0;
    if (spend <= 0) continue;
    let best = 0;
    for (const card of cards) {
      if (!card.is_active) continue;
      const conv = convert(card.currency_id);
      if (conv <= 0) continue;
      const rate = rates.find(
        (r) => r.card_id === card.id && r.category === category
      );
      if (!rate) continue;
      const capped =
        rate.cap_monthly_usd !== null
          ? Math.min(spend, rate.cap_monthly_usd)
          : spend;
      let points = rate.rate * capped;
      const excess = spend - capped;
      if (excess > 0) {
        const base = rates.find(
          (r) => r.card_id === card.id && r.category === "everything_else"
        );
        points += (base?.rate ?? 0) * excess;
      }
      best = Math.max(best, points * conv);
    }
    total += best;
  }
  return Math.round(total);
}

/**
 * Re-solve the trip's legs (jointly, when there are two — same solver the
 * real plan uses) against a given reachability/wallet snapshot. Returns each
 * leg's reachable_points under that snapshot.
 */
function jointReachable(
  legs: LegNeed[],
  reach: Reachability,
  entries: EffectiveCurrency[],
  currencies: Currency[]
): Map<number, number> {
  if (legs.length === 1) {
    const l = legs[0]!;
    const r = solveCandidate(
      l.points_needed,
      l.dest_currency_id,
      reach,
      entries,
      currencies
    );
    return new Map([[l.seq, r.reachable_points]]);
  }
  const [l1, l2] = legs as [LegNeed, LegNeed];
  const split = solveSplit(
    l1.points_needed,
    l1.dest_currency_id,
    l2.points_needed,
    l2.dest_currency_id,
    reach,
    entries,
    currencies
  );
  return new Map([
    [l1.seq, split.leg1.reachable_points],
    [l2.seq, split.leg2.reachable_points],
  ]);
}

export function closeGap(params: {
  gap: number;
  destCurrencyId: string;
  /** Which leg this closure is FOR — attributes unlock_points_this_leg. */
  legSeq: 1 | 2;
  /** The trip's full leg set — needed to jointly re-solve unlock candidates. */
  allLegs: LegNeed[];
  entries: EffectiveCurrency[];
  wallet: WalletCard[];
  currencies: Currency[];
  cards: CardCatalog[];
  earningRates: EarningRate[];
  welcomeOffers: WelcomeOffer[];
  transferPartners: TransferPartner[];
  transferBonuses: TransferBonus[];
  monthlySpend: Record<string, number>;
  now: Date;
}): GapClosure {
  const {
    gap,
    destCurrencyId,
    legSeq,
    allLegs,
    entries,
    wallet,
    currencies,
    cards,
    earningRates: rates,
    welcomeOffers: offers,
    transferPartners: partners,
    transferBonuses: bonuses,
    monthlySpend,
    now,
  } = params;

  const currencyById = new Map(currencies.map((c) => [c.id, c]));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const unlockedHeld = new Set(
    entries.filter((e) => e.unlocked).map((e) => e.currency_id)
  );

  const transferableFrom = (currencyId: string, viaCard?: CardCatalog) => {
    const currency = currencyById.get(currencyId);
    if (!currency || !currency.is_active) return false;
    if (!currency.requires_unlock) return true;
    if (viaCard?.unlocks_transfers) return true;
    return unlockedHeld.has(currencyId);
  };

  const rateInto = (currencyId: string, viaCard?: CardCatalog) => {
    if (currencyId === destCurrencyId) return 1;
    if (!transferableFrom(currencyId, viaCard)) return 0;
    return (
      bestConversionRate(currencyId, destCurrencyId, partners, bonuses, now) ??
      0
    );
  };

  // --- unlock credit ---------------------------------------------------------
  // For a card that would unlock a currency the wallet already holds a
  // locked, nonzero balance in: how much of the TRIP's shortfall does that
  // released balance close? Measured by re-solving jointly (effectiveWallet
  // -> reachability -> the same solver used for the real plan) with a
  // hypothetical wallet of held cards + this one, at 0 points of its own —
  // the card's own welcome bonus is delivered_points, kept separate. Routing
  // through the joint solver (not an additive conversion) is what makes the
  // double-count across an open-jaw's two legs structurally impossible: a
  // shared source can't be spent on both legs at once, the same as it can't
  // for money already in the wallet. Memoized per card since candidates are
  // few (only cards that unlock a currency actually held locked qualify) and
  // multiple offers can share a card.
  const unlockCache = new Map<string, { total: number; thisLeg: number }>();
  function unlockBenefit(card: CardCatalog): {
    total: number;
    thisLeg: number;
  } {
    const cached = unlockCache.get(card.id);
    if (cached) return cached;

    const zero = { total: 0, thisLeg: 0 };
    const result = (() => {
      if (!card.unlocks_transfers) return zero;
      const heldEntry = entries.find((e) => e.currency_id === card.currency_id);
      if (!heldEntry || heldEntry.unlocked || heldEntry.balance <= 0)
        return zero;

      const hypotheticalWallet: WalletCard[] = [
        ...wallet,
        {
          id: "__unlock-candidate__",
          card_id: card.id,
          points_balance: 0,
          opened_at: null,
          card,
        },
      ];
      const hypWallet = effectiveWallet(hypotheticalWallet, currencies, cards);
      const hypReach = expandReachability(
        hypWallet.entries,
        partners,
        bonuses,
        currencies,
        now
      );
      const hypReachable = jointReachable(
        allLegs,
        hypReach,
        hypWallet.entries,
        currencies
      );

      let total = 0;
      let thisLeg = 0;
      for (const leg of allLegs) {
        const delta = Math.max(
          0,
          (hypReachable.get(leg.seq) ?? 0) - leg.reachable_points
        );
        total += delta;
        if (leg.seq === legSeq) thisLeg = delta;
      }
      return { total, thisLeg };
    })();

    unlockCache.set(card.id, result);
    return result;
  }

  // --- (a) welcome offer ranking -------------------------------------------
  // Selection is spend-aware: when monthly spend is KNOWN (> 0), an offer
  // whose min_spend_usd cannot be met within its own window at that pace is
  // ineligible, so the best *reachable* offer surfaces instead. Unknown spend
  // (0) disqualifies nothing — we can't prove the minimum is out of reach.
  // Ranking scores total delivery toward the trip (bonus + unlock) against
  // the cost of getting it, so a card that unlocks a large held balance can
  // outrank a bigger raw welcome offer that unlocks nothing.
  const spendPerMonth = totalSpend(monthlySpend);
  let recommended: CardRecommendation | null = null;
  let recommendedUnlock = { total: 0, thisLeg: 0 };
  if (gap > 0) {
    for (const offer of offers) {
      if (!offer.is_active) continue;
      if (offer.ends_at !== null && new Date(offer.ends_at) <= now) continue;
      const card = cardById.get(offer.card_id);
      if (!card || !card.is_active) continue;
      const conversion = rateInto(card.currency_id, card);
      if (conversion <= 0) continue;
      const eligibleAtStatedSpend =
        spendPerMonth <= 0 ||
        Math.ceil(offer.min_spend_usd / spendPerMonth) <= offer.window_months;
      if (!eligibleAtStatedSpend) continue;

      const delivered = Math.floor(offer.points * conversion);
      const unlock = unlockBenefit(card);
      const denominator = Math.max(1, offer.min_spend_usd + card.annual_fee);
      const totalDelivery = delivered + unlock.total;
      const score = Math.round((totalDelivery / denominator) * 1000) / 1000;
      const candidate: CardRecommendation = {
        card_id: card.id,
        card_name: card.name,
        issuer: card.issuer,
        offer_id: offer.id,
        offer_points: offer.points,
        delivered_points: delivered,
        unlocked_points: unlock.total,
        min_spend_usd: offer.min_spend_usd,
        window_months: offer.window_months,
        annual_fee: card.annual_fee,
        score,
      };
      const recommendedTotal =
        recommended !== null
          ? recommended.delivered_points + recommended.unlocked_points
          : -1;
      if (
        recommended === null ||
        candidate.score > recommended.score ||
        (candidate.score === recommended.score &&
          totalDelivery > recommendedTotal)
      ) {
        recommended = candidate;
        recommendedUnlock = unlock;
      }
    }
  }

  // --- (b) earn velocity ----------------------------------------------------
  const heldCards = wallet.map((w) => w.card);
  const held = earnVelocity(heldCards, rates, monthlySpend, (id) =>
    rateInto(id)
  );

  let withRecommended: number | null = null;
  if (recommended !== null) {
    const recCard = cardById.get(recommended.card_id);
    if (recCard) {
      withRecommended = earnVelocity(
        [...heldCards, recCard],
        rates,
        monthlySpend,
        (id) => rateInto(id, recCard)
      );
    }
  }

  // --- months_to_goal & bonus month ----------------------------------------
  let bonusMonth: number | null = null;
  if (recommended !== null && spendPerMonth > 0) {
    // The bonus posts the month spend first reaches the minimum at the stated
    // pace — never clamped down to the window. If that month falls outside the
    // window the bonus never posts, so bonus_month is null (not a false date).
    // Selection above already guarantees this lands within the window; the
    // null branch keeps the number honest even so.
    const month = Math.max(
      1,
      Math.ceil(recommended.min_spend_usd / spendPerMonth)
    );
    bonusMonth = month <= recommended.window_months ? month : null;
  }

  const monthsHeld =
    gap <= 0 ? 0 : held !== null && held > 0 ? Math.ceil(gap / held) : null;

  // The released balance needs no spend and no window — it lands the month
  // the card is approved (modeled as month 1, same floor as bonus_month).
  // So months_with_card is computable purely off the unlock even when spend
  // (and therefore bonus_month) is unknown.
  let monthsWithCard: number | null = gap <= 0 ? 0 : null;
  if (gap > 0 && recommended !== null) {
    const velocity = withRecommended ?? 0;
    for (let m = 1; m <= 120; m += 1) {
      const earned =
        velocity * m +
        recommendedUnlock.thisLeg +
        (bonusMonth !== null && m >= bonusMonth
          ? recommended.delivered_points
          : 0);
      if (earned >= gap) {
        monthsWithCard = m;
        break;
      }
    }
  }

  return {
    recommended_card: recommended,
    earn_velocity: { held, with_recommended: withRecommended },
    months_held: monthsHeld,
    months_with_card: monthsWithCard,
    bonus_month: bonusMonth,
    unlock_points_this_leg: recommendedUnlock.thisLeg,
  };
}
