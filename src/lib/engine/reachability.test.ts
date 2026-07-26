import { describe, expect, it } from "vitest";

import { effectiveWallet } from "./effective-wallet";
import {
  deliverThrough,
  expandReachability,
  minimalSentFor,
  type EdgeUse,
} from "./reachability";
import {
  cardByName,
  currencyByName,
  seedBonusEdge,
  seedCards,
  seedCurrencies,
  seedTransferBonuses,
  seedTransferPartners,
  walletCard,
} from "./test-fixtures";
import type { Currency, TransferPartner } from "./types";

const IN_WINDOW = new Date("2026-08-01T00:00:00Z"); // seeded bonus: Jul 1–Sep 15
const OUT_OF_WINDOW = new Date("2026-10-01T00:00:00Z");

function mkCurrency(id: string, name: string): Currency {
  return {
    id,
    name,
    kind: "bank",
    alliance: null,
    cashback_cpp: 1,
    transfer_cpp: 1,
    requires_unlock: false,
    is_active: true,
    notes: null,
    brand_color: null,
    logo_url: null,
  };
}

function mkEdge(
  id: string,
  from: string,
  to: string,
  overrides: Partial<TransferPartner> = {}
): TransferPartner {
  return {
    id,
    from_currency_id: from,
    to_currency_id: to,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: null,
    increment: null,
    is_active: true,
    notes: null,
    ...overrides,
  };
}

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "aaaaaaaa-0000-4000-8000-00000000000b";
const C = "aaaaaaaa-0000-4000-8000-00000000000c";
const D = "aaaaaaaa-0000-4000-8000-00000000000d";
const E1 = "eeeeeeee-0000-4000-8000-000000000001";
const E2 = "eeeeeeee-0000-4000-8000-000000000002";
const E3 = "eeeeeeee-0000-4000-8000-000000000003";

describe("bonus window math (seeded Amex→Flying Blue 25%)", () => {
  const mr = currencyByName("Amex Membership Rewards");
  const fb = currencyByName("Air France-KLM Flying Blue");
  const wallet = effectiveWallet(
    [walletCard(cardByName("Gold Card"), 40_000)],
    seedCurrencies,
    seedCards
  );

  function deliveredToFB(now: Date, bonuses = seedTransferBonuses): number {
    const reach = expandReachability(
      wallet.entries,
      seedTransferPartners,
      bonuses,
      seedCurrencies,
      now
    );
    return reach.get(fb.id)?.get(mr.id)?.max_deliverable ?? 0;
  }

  it("delivers 50,000 FB from 40,000 MR inside the window", () => {
    expect(deliveredToFB(IN_WINDOW)).toBe(50_000);
  });

  it("delivers 40,000 outside the window", () => {
    expect(deliveredToFB(OUT_OF_WINDOW)).toBe(40_000);
  });

  it("never counts a draft bonus", () => {
    const draft = seedTransferBonuses.map((b) => ({
      ...b,
      status: "draft",
    }));
    expect(deliveredToFB(IN_WINDOW, draft)).toBe(40_000);
  });
});

describe("two-hop expansion, depth capped at 2", () => {
  const currencies = [
    mkCurrency(A, "A"),
    mkCurrency(B, "B"),
    mkCurrency(C, "C"),
    mkCurrency(D, "D"),
  ];
  // A→B at 2:1, B→C at 1:1, C→D at 1:1 — no direct A→C or A→D
  const edges = [
    mkEdge(E1, A, B, { ratio_num: 2, ratio_den: 1 }),
    mkEdge(E2, B, C),
    mkEdge(E3, C, D),
  ];
  const entries = [{ currency_id: A, balance: 10_000, unlocked: true, cpp: 1 }];

  const reach = expandReachability(entries, edges, [], currencies, IN_WINDOW);

  it("compounds ratios across two hops", () => {
    // 10,000 A → 5,000 B → 5,000 C
    expect(reach.get(C)?.get(A)?.max_deliverable).toBe(5_000);
    expect(reach.get(C)?.get(A)?.hops).toBe(2);
  });

  it("does not explore depth-3 paths", () => {
    expect(reach.get(D)).toBeUndefined();
  });

  it("never uses a locked currency as a source", () => {
    const locked = [
      { currency_id: A, balance: 10_000, unlocked: false, cpp: 1 },
    ];
    const r = expandReachability(locked, edges, [], currencies, IN_WINDOW);
    expect(r.size).toBe(0);
  });
});

describe("min_transfer and increment rounding", () => {
  const edge = mkEdge(E1, A, B, { min_transfer: 1000, increment: 1000 });
  const use: EdgeUse[] = [{ edge, bonus_pct: null }];

  it("rounds 1,499 down to a 1,000-point transfer", () => {
    const r = deliverThrough(use, 1_499);
    expect(r.sent).toBe(1_000);
    expect(r.delivered).toBe(1_000);
  });

  it("delivers 0 below min_transfer", () => {
    expect(deliverThrough(use, 900).delivered).toBe(0);
  });

  it("finds the minimal sent amount on the increment grid", () => {
    expect(minimalSentFor(use, 1, 5_000)).toBe(1_000);
    expect(minimalSentFor(use, 1_001, 5_000)).toBe(2_000);
    expect(minimalSentFor(use, 6_000, 5_000)).toBeNull();
  });

  it("delivers the seeded bonus only on top of increment-rounded amounts", () => {
    const bonusUse: EdgeUse[] = [{ edge: seedBonusEdge, bonus_pct: 25 }];
    // 41,300 MR rounds down to 41,000 sent, ×1.25 = 51,250 delivered
    const r = deliverThrough(bonusUse, 41_300);
    expect(r.sent).toBe(41_000);
    expect(r.delivered).toBe(51_250);
  });
});
