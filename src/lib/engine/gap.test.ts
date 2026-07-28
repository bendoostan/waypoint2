import { describe, expect, it } from "vitest";

import { closeGap } from "./gap";
import type { LegNeed } from "./gap";
import { assignTier } from "./rank";
import type {
  CardCatalog,
  Currency,
  EarningRate,
  EffectiveCurrency,
  TransferPartner,
  WalletCard,
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
    brand_color: null,
    logo_url: null,
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
  entries?: EffectiveCurrency[];
  wallet?: WalletCard[];
}) {
  const gap = params.gap ?? 200_000;
  return closeGap({
    gap,
    destCurrencyId: P,
    legSeq: 1,
    allLegs: [
      { seq: 1, points_needed: gap, dest_currency_id: P, reachable_points: 0 },
    ],
    entries: params.entries ?? ([] as EffectiveCurrency[]),
    wallet: params.wallet ?? [],
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

// A second currency (BANK, requires_unlock) with a direct 1:1 edge to the
// destination program P — separate from the bonus_month suite's single-
// currency setup, since these tests are specifically about a card that
// unlocks an ALREADY-HELD locked balance, not about the welcome offer alone.
describe("closeGap unlock credit", () => {
  const BANK = "dddddddd-0000-4000-8000-000000000001";
  const bankCurrency: Currency = {
    id: BANK,
    name: "Bank",
    kind: "bank",
    alliance: null,
    cashback_cpp: 1,
    transfer_cpp: 2,
    requires_unlock: true,
    is_active: true,
    notes: null,
    brand_color: null,
    logo_url: null,
  };
  const programCurrency: Currency = {
    id: P,
    name: "Program",
    kind: "airline",
    alliance: null,
    cashback_cpp: 0,
    transfer_cpp: 1.5,
    requires_unlock: false,
    is_active: true,
    notes: null,
    brand_color: null,
    logo_url: null,
  };
  const bankToProgram: TransferPartner = {
    id: "dddddddd-0000-4000-8000-000000000002",
    from_currency_id: BANK,
    to_currency_id: P,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: null,
    increment: null,
    is_active: true,
    notes: null,
  };

  const CARD_BONUS = "dddddddd-0000-4000-8000-000000000003";
  const CARD_UNLOCK = "dddddddd-0000-4000-8000-000000000004";
  const HELD_CARD = "dddddddd-0000-4000-8000-000000000005";

  const cardBonus = mkCard(CARD_BONUS, "Big Bonus Card"); // currency_id: P (default)
  const cardUnlock = mkCard(CARD_UNLOCK, "Unlock Card", {
    currency_id: BANK,
    unlocks_transfers: true,
  });
  const heldCard = mkCard(HELD_CARD, "Held Card", { currency_id: BANK });

  it("a card that unlocks a large held balance outranks a bigger raw welcome bonus", () => {
    // Big Bonus Card: 100,000-point offer, no unlock — score 100,000/5,000 = 20.
    // Unlock Card: a modest 10,000-point offer, but it releases the 90,000
    // BANK points already held — score (10,000+90,000)/1,000 = 100. The
    // smaller headline offer wins because it delivers more toward the trip.
    const closure = closeGap({
      gap: 200_000,
      destCurrencyId: P,
      legSeq: 1,
      allLegs: [
        {
          seq: 1,
          points_needed: 200_000,
          dest_currency_id: P,
          reachable_points: 0,
        },
      ],
      entries: [
        { currency_id: BANK, balance: 90_000, unlocked: false, cpp: 1 },
      ],
      wallet: [
        {
          id: "w1",
          card_id: HELD_CARD,
          points_balance: 90_000,
          opened_at: null,
          card: heldCard,
        },
      ],
      currencies: [programCurrency, bankCurrency],
      cards: [cardBonus, cardUnlock, heldCard],
      earningRates: [],
      welcomeOffers: [
        mkOffer("offer-bonus", CARD_BONUS, {
          points: 100_000,
          min_spend_usd: 5_000,
        }),
        mkOffer("offer-unlock", CARD_UNLOCK, {
          points: 10_000,
          min_spend_usd: 1_000,
        }),
      ],
      transferPartners: [bankToProgram],
      transferBonuses: [],
      monthlySpend: {},
      now: NOW,
    });

    expect(closure.recommended_card?.card_id).toBe(CARD_UNLOCK);
    expect(closure.recommended_card?.delivered_points).toBe(10_000);
    expect(closure.recommended_card?.unlocked_points).toBe(90_000);
    expect(closure.unlock_points_this_leg).toBe(90_000);
  });

  it("unlocked_points is zero for a card that unlocks nothing", () => {
    const closure = closeGap({
      gap: 200_000,
      destCurrencyId: P,
      legSeq: 1,
      allLegs: [
        {
          seq: 1,
          points_needed: 200_000,
          dest_currency_id: P,
          reachable_points: 0,
        },
      ],
      entries: [
        { currency_id: BANK, balance: 90_000, unlocked: false, cpp: 1 },
      ],
      wallet: [
        {
          id: "w1",
          card_id: HELD_CARD,
          points_balance: 90_000,
          opened_at: null,
          card: heldCard,
        },
      ],
      currencies: [programCurrency, bankCurrency],
      cards: [cardBonus, heldCard], // no unlocking candidate offered
      earningRates: [],
      welcomeOffers: [
        mkOffer("offer-bonus", CARD_BONUS, {
          points: 100_000,
          min_spend_usd: 5_000,
        }),
      ],
      transferPartners: [bankToProgram],
      transferBonuses: [],
      monthlySpend: {},
      now: NOW,
    });

    expect(closure.recommended_card?.card_id).toBe(CARD_BONUS);
    expect(closure.recommended_card?.unlocked_points).toBe(0);
    expect(closure.unlock_points_this_leg).toBe(0);
  });

  it("unlocked_points is zero for a currency the person holds no balance in", () => {
    const closure = closeGap({
      gap: 200_000,
      destCurrencyId: P,
      legSeq: 1,
      allLegs: [
        {
          seq: 1,
          points_needed: 200_000,
          dest_currency_id: P,
          reachable_points: 0,
        },
      ],
      entries: [], // no BANK balance held at all
      wallet: [],
      currencies: [programCurrency, bankCurrency],
      cards: [cardBonus, cardUnlock],
      earningRates: [],
      welcomeOffers: [
        mkOffer("offer-bonus", CARD_BONUS, {
          points: 100_000,
          min_spend_usd: 5_000,
        }),
        mkOffer("offer-unlock", CARD_UNLOCK, {
          points: 10_000,
          min_spend_usd: 1_000,
        }),
      ],
      transferPartners: [bankToProgram],
      transferBonuses: [],
      monthlySpend: {},
      now: NOW,
    });

    // Big Bonus wins on raw score now that Unlock Card has nothing to unlock.
    expect(closure.recommended_card?.card_id).toBe(CARD_BONUS);
    expect(closure.recommended_card?.unlocked_points).toBe(0);
  });

  it("no double-count across an open-jaw's two legs sharing one released balance", () => {
    // Two destination programs (both reachable from BANK), 40,000 needed each
    // (80,000 total) — the held BANK balance is only 50,000, so the joint
    // solver cannot fully cover both legs from it alone; whatever it credits
    // to leg 1 it must NOT also credit to leg 2.
    const PB = "dddddddd-0000-4000-8000-000000000006";
    const programB: Currency = {
      ...programCurrency,
      id: PB,
      name: "Program B",
    };
    const bankToProgramB: TransferPartner = {
      ...bankToProgram,
      id: "dddddddd-0000-4000-8000-000000000007",
      to_currency_id: PB,
    };
    const entries: EffectiveCurrency[] = [
      { currency_id: BANK, balance: 50_000, unlocked: false, cpp: 1 },
    ];
    const wallet: WalletCard[] = [
      {
        id: "w1",
        card_id: HELD_CARD,
        points_balance: 50_000,
        opened_at: null,
        card: heldCard,
      },
    ];
    const allLegs: LegNeed[] = [
      {
        seq: 1,
        points_needed: 40_000,
        dest_currency_id: P,
        reachable_points: 0,
      },
      {
        seq: 2,
        points_needed: 40_000,
        dest_currency_id: PB,
        reachable_points: 0,
      },
    ];
    const shared = {
      entries,
      wallet,
      currencies: [programCurrency, programB, bankCurrency],
      cards: [cardUnlock, heldCard],
      earningRates: [],
      welcomeOffers: [
        mkOffer("offer-unlock", CARD_UNLOCK, {
          points: 1_000,
          min_spend_usd: 100,
        }),
      ],
      transferPartners: [bankToProgram, bankToProgramB],
      transferBonuses: [],
      monthlySpend: {},
      now: NOW,
    };

    const leg1 = closeGap({
      gap: 40_000,
      destCurrencyId: P,
      legSeq: 1,
      allLegs,
      ...shared,
    });
    const leg2 = closeGap({
      gap: 40_000,
      destCurrencyId: PB,
      legSeq: 2,
      allLegs,
      ...shared,
    });

    // The trip-wide total the schema exposes is the SAME fact from either
    // leg's perspective, and it never exceeds the actual balance held.
    expect(leg1.recommended_card?.unlocked_points).toBe(50_000);
    expect(leg2.recommended_card?.unlocked_points).toBe(50_000);

    // Each leg's own attributed share never exceeds what it needed, and the
    // two shares sum to EXACTLY the trip total — nothing lost, nothing
    // double-booked. (A naive per-leg conversion would instead credit up to
    // 40,000 to each leg independently, summing to 80,000 — more than the
    // 50,000 that's actually in the wallet.)
    expect(leg1.unlock_points_this_leg).toBeLessThanOrEqual(40_000);
    expect(leg2.unlock_points_this_leg).toBeLessThanOrEqual(40_000);
    expect(leg1.unlock_points_this_leg + leg2.unlock_points_this_leg).toBe(
      50_000
    );

    // months_with_card must not assume both legs got the full balance: only
    // the leg attributed enough (leg 1, given 40,000 of the 50,000) can be
    // ready quickly; the other stays unresolved rather than falsely "ready".
    expect(leg1.unlock_points_this_leg).toBe(40_000);
    expect(leg1.months_with_card).toBe(1);
    expect(leg2.unlock_points_this_leg).toBe(10_000);
    expect(leg2.months_with_card).toBeNull();
  });
});
