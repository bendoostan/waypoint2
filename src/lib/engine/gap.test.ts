import { describe, expect, it } from "vitest";

import { closeGap } from "./gap";
import { assignTier } from "./rank";
import type {
  CardCatalog,
  Currency,
  EarningRate,
  EffectiveCurrency,
  WelcomeOffer,
} from "./types";

// The target program is also the card currency, so rateInto() is 1 and no
// transfer graph is needed — this suite is entirely about spend-aware offer
// selection and the honest bonus_month it produces.
const P = "cccccccc-0000-4000-8000-0000000000f0"; // destination program

const NOW = new Date("2026-08-01T00:00:00Z");

function mkCurrency(over: Partial<Currency> = {}): Currency {
  return {
    id: P,
    name: "Program",
    kind: "airline",
    alliance: null,
    cashback_cpp: 0,
    transfer_cpp: 1.5,
    requires_unlock: false,
    is_active: true,
    notes: null,
    ...over,
  };
}

function mkCard(
  id: string,
  name: string,
  over: Partial<CardCatalog> = {}
): CardCatalog {
  return {
    id,
    name,
    issuer: "TestBank",
    currency_id: P,
    annual_fee: 0,
    unlocks_transfers: false,
    affiliate_url: null,
    application_rules: null,
    is_active: true,
    discontinued_at: null,
    notes: null,
    brand_color: null,
    logo_url: null,
    ...over,
  };
}

function mkOffer(
  id: string,
  card_id: string,
  over: Partial<WelcomeOffer> = {}
): WelcomeOffer {
  return {
    id,
    card_id,
    points: 60_000,
    min_spend_usd: 4_000,
    window_months: 6,
    ends_at: null,
    source_url: null,
    is_active: true,
    ...over,
  };
}

function mkRate(card_id: string, over: Partial<EarningRate> = {}): EarningRate {
  return {
    id: `${card_id}-rate`,
    card_id,
    category: "dining",
    rate: 2,
    cap_monthly_usd: null,
    notes: null,
    ...over,
  };
}

/** closeGap over a single program currency: card points land directly. */
function close(params: {
  cards: CardCatalog[];
  offers: WelcomeOffer[];
  earningRates?: EarningRate[];
  monthlySpend: Record<string, number>;
  gap?: number;
}) {
  return closeGap({
    gap: params.gap ?? 200_000,
    destCurrencyId: P,
    entries: [] as EffectiveCurrency[],
    wallet: [],
    currencies: [mkCurrency()],
    cards: params.cards,
    earningRates: params.earningRates ?? [],
    welcomeOffers: params.offers,
    transferPartners: [],
    transferBonuses: [],
    monthlySpend: params.monthlySpend,
    now: NOW,
  });
}

const CARD_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CARD_B = "bbbbbbbb-0000-4000-8000-000000000001";

describe("closeGap bonus_month", () => {
  it("1. known spend, minimum reachable in window -> true ceil value, <= window", () => {
    // $2,000/mo, $4,000 minimum, 6-month window -> reached in month 2.
    const closure = close({
      cards: [mkCard(CARD_A, "Reachable Card")],
      offers: [
        mkOffer("offer-a", CARD_A, { min_spend_usd: 4_000, window_months: 6 }),
      ],
      earningRates: [mkRate(CARD_A)],
      monthlySpend: { dining: 2_000 },
    });

    expect(closure.recommended_card?.card_id).toBe(CARD_A);
    expect(closure.bonus_month).toBe(2); // ceil(4000 / 2000)
    expect(closure.bonus_month!).toBeLessThanOrEqual(
      closure.recommended_card!.window_months
    );
  });

  it("2a. known, unreachable high-min offer yields to a lower-min eligible one", () => {
    // Card A scores higher (120k / $6,000 = 20) but $900/mo can't clear its
    // $6,000 minimum in 3 months. Card B (30k / $1,800 = ~16.7) is reachable.
    const closure = close({
      cards: [mkCard(CARD_A, "High Min"), mkCard(CARD_B, "Low Min")],
      offers: [
        mkOffer("offer-a", CARD_A, {
          points: 120_000,
          min_spend_usd: 6_000,
          window_months: 3,
        }),
        mkOffer("offer-b", CARD_B, {
          points: 30_000,
          min_spend_usd: 1_800,
          window_months: 3,
        }),
      ],
      earningRates: [mkRate(CARD_A), mkRate(CARD_B)],
      monthlySpend: { dining: 900 },
    });

    // The spend-blind winner (A) is skipped; the reachable offer surfaces.
    expect(closure.recommended_card?.card_id).toBe(CARD_B);
    expect(closure.bonus_month).toBe(2); // ceil(1800 / 900), not clamped to 3
  });

  it("2b. known, no eligible offer -> recommended null and tier stretch", () => {
    const gap = 200_000;
    const closure = close({
      cards: [mkCard(CARD_A, "High Min")],
      offers: [
        mkOffer("offer-a", CARD_A, {
          points: 120_000,
          min_spend_usd: 6_000,
          window_months: 3,
        }),
      ],
      earningRates: [mkRate(CARD_A)],
      monthlySpend: { dining: 900 },
      gap,
    });

    expect(closure.recommended_card).toBeNull();
    expect(closure.bonus_month).toBeNull();
    // Downstream: no recommendation + no held velocity falls to stretch.
    expect(assignTier(gap, closure)).toBe("stretch");
  });

  it("3. unknown spend keeps the best-by-score offer with null months/bonus", () => {
    const closure = close({
      cards: [mkCard(CARD_A, "High Min")],
      offers: [
        mkOffer("offer-a", CARD_A, {
          points: 120_000,
          min_spend_usd: 6_000,
          window_months: 3,
        }),
      ],
      earningRates: [mkRate(CARD_A)],
      monthlySpend: {}, // unknown — never disqualifies an offer
    });

    expect(closure.recommended_card?.card_id).toBe(CARD_A);
    expect(closure.bonus_month).toBeNull();
    expect(closure.months_with_card).toBeNull();
    expect(closure.months_held).toBeNull();
  });

  it("2c. just-barely: minimum reached in the final window month is eligible", () => {
    // $2,000/mo, $6,000 minimum, 3-month window -> ceil(6000/2000) = 3, which
    // equals the window exactly: the offer IS achievable and the bonus posts
    // in month 3 (the boundary the old clamp got right only by accident).
    const closure = close({
      cards: [mkCard(CARD_A, "Boundary Card")],
      offers: [
        mkOffer("offer-a", CARD_A, {
          points: 120_000,
          min_spend_usd: 6_000,
          window_months: 3,
        }),
      ],
      earningRates: [mkRate(CARD_A)],
      monthlySpend: { dining: 2_000 },
    });

    expect(closure.recommended_card?.card_id).toBe(CARD_A);
    expect(closure.bonus_month).toBe(3); // ceil(6000/2000) === window
  });

  it("2d. just-over: one month too slow for the same offer is ineligible", () => {
    // Same offer, same pace, one month shorter window: ceil(6000/2000) = 3 > 2,
    // so it is unachievable — recommended null, bonus_month null.
    const closure = close({
      cards: [mkCard(CARD_A, "Boundary Card")],
      offers: [
        mkOffer("offer-a", CARD_A, {
          points: 120_000,
          min_spend_usd: 6_000,
          window_months: 2,
        }),
      ],
      earningRates: [mkRate(CARD_A)],
      monthlySpend: { dining: 2_000 },
    });

    expect(closure.recommended_card).toBeNull();
    expect(closure.bonus_month).toBeNull();
  });

  it("4. regression: $6,000 / $900 / 3mo never reports bonus_month === 3", () => {
    const closure = close({
      cards: [mkCard(CARD_A, "High Min")],
      offers: [
        mkOffer("offer-a", CARD_A, {
          points: 120_000,
          min_spend_usd: 6_000,
          window_months: 3,
        }),
      ],
      earningRates: [mkRate(CARD_A)],
      monthlySpend: { dining: 900 },
    });

    expect(closure.bonus_month).not.toBe(3);
    expect(closure.bonus_month).toBeNull();
  });
});
