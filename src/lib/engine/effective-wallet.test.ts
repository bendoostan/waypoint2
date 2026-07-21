import { describe, expect, it } from "vitest";

import { effectiveWallet } from "./effective-wallet";
import {
  cardByName,
  currencyByName,
  seedCards,
  seedCurrencies,
  walletCard,
} from "./test-fixtures";

const ur = currencyByName("Chase Ultimate Rewards");
const freedom = cardByName("Freedom Unlimited");
const sapphire = cardByName("Sapphire Preferred");

describe("effectiveWallet — the Freedom unlock golden case", () => {
  it("keeps 80k UR locked at cashback cpp with Freedom Unlimited only", () => {
    const { entries, unlockOpportunities } = effectiveWallet(
      [walletCard(freedom, 80_000)],
      seedCurrencies,
      seedCards
    );

    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.currency_id).toBe(ur.id);
    expect(entry.unlocked).toBe(false);
    expect(entry.cpp).toBe(ur.cashback_cpp); // 1.0
    expect(entry.balance).toBe(80_000);

    // The Freedom→Sapphire recommendation falls out of the data model:
    expect(unlockOpportunities).toHaveLength(1);
    const opp = unlockOpportunities[0]!;
    expect(opp.currency_id).toBe(ur.id);
    expect(opp.value_now_usd).toBe(800); // 80k × 1.0cpp
    expect(opp.value_unlocked_usd).toBe(1600); // 80k × 2.0cpp
    expect(opp.delta_usd).toBe(800);
    expect(opp.unlocking_card_ids).toContain(sapphire.id);
  });

  it("unlocks the same 80k UR when a Sapphire Preferred joins the wallet", () => {
    const { entries, unlockOpportunities } = effectiveWallet(
      [walletCard(freedom, 80_000), walletCard(sapphire, 0)],
      seedCurrencies,
      seedCards
    );

    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.balance).toBe(80_000); // balances pool per currency
    expect(entry.unlocked).toBe(true);
    expect(entry.cpp).toBe(ur.transfer_cpp); // 2.0
    expect(unlockOpportunities).toHaveLength(0);
  });

  it("treats non-tiered currencies as unlocked without any special card", () => {
    const explorer = cardByName("United Explorer");
    const { entries } = effectiveWallet(
      [walletCard(explorer, 10_000)],
      seedCurrencies,
      seedCards
    );
    expect(entries[0]!.unlocked).toBe(true);
  });
});
