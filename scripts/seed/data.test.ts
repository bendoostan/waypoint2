// Referential integrity of the seed graph, checked in-memory against the
// same typed rows `pnpm seed` writes. The DB enforces most of this with FKs
// and unique constraints; this proves the dataset satisfies them before it
// ever touches Postgres (and runs in CI without one).
import { describe, expect, it } from "vitest";

import {
  BONUS_EDGE,
  awardRoutes,
  cards,
  currencies,
  earningRates,
  transferBonuses,
  transferPartners,
  welcomeOffers,
} from "./data";

const currencyIds = new Set(currencies.map((c) => c.id));
const cardIds = new Set(cards.map((c) => c.id));

describe("seed data referential integrity", () => {
  it("gives every card an existing, active currency", () => {
    const activeCurrencyIds = new Set(
      currencies.filter((c) => c.is_active).map((c) => c.id)
    );
    for (const card of cards) {
      expect(activeCurrencyIds, `currency of ${card.name}`).toContain(
        card.currency_id
      );
    }
  });

  it("maps every earning rate to a seeded card, uniquely per category", () => {
    const seen = new Set<string>();
    for (const rate of earningRates) {
      expect(cardIds).toContain(rate.card_id);
      expect(rate.rate).toBeGreaterThan(0);
      const key = `${rate.card_id}:${rate.category}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("gives every card at least one earning rate and exactly one welcome offer", () => {
    for (const card of cards) {
      expect(
        earningRates.filter((r) => r.card_id === card.id).length,
        `earning rates of ${card.name}`
      ).toBeGreaterThan(0);
      expect(
        welcomeOffers.filter((o) => o.card_id === card.id).length,
        `welcome offers of ${card.name}`
      ).toBe(1);
    }
  });

  it("connects every transfer edge to two distinct existing currencies", () => {
    const seenPairs = new Set<string>();
    for (const edge of transferPartners) {
      expect(currencyIds).toContain(edge.from_currency_id);
      expect(currencyIds).toContain(edge.to_currency_id);
      expect(edge.from_currency_id).not.toBe(edge.to_currency_id);
      const pair = `${edge.from_currency_id}->${edge.to_currency_id}`;
      expect(seenPairs.has(pair), `duplicate edge ${pair}`).toBe(false);
      seenPairs.add(pair);
      expect(edge.ratio_num).toBeGreaterThan(0);
      expect(edge.ratio_den).toBeGreaterThan(0);
    }
  });

  it("maps every transfer bonus to an active partner edge with a valid window", () => {
    const bonusEdge = transferPartners.find(
      (e) =>
        e.from_currency_id === BONUS_EDGE.from_currency_id &&
        e.to_currency_id === BONUS_EDGE.to_currency_id
    );
    expect(bonusEdge).toBeDefined();
    expect(bonusEdge?.is_active).toBe(true);
    for (const bonus of transferBonuses) {
      expect(bonus.bonus_pct).toBeGreaterThan(0);
      expect(new Date(bonus.ends_at).getTime()).toBeGreaterThan(
        new Date(bonus.starts_at).getTime()
      );
    }
  });

  it("points every award route at an existing program currency", () => {
    for (const route of awardRoutes) {
      expect(currencyIds).toContain(route.program_currency_id);
      expect(route.points_oneway).toBeGreaterThan(0);
      for (const iata of [
        ...(route.origin_airports ?? []),
        ...(route.destination_airports ?? []),
      ]) {
        expect(iata).toMatch(/^[A-Z]{3}$/);
      }
    }
  });

  it("supports the unlock mechanic: a requires_unlock currency with both an unlocking and a non-unlocking card", () => {
    const unlockable = currencies.filter((c) => c.requires_unlock);
    expect(unlockable.length).toBeGreaterThan(0);
    const hasBoth = unlockable.some((currency) => {
      const holders = cards.filter((c) => c.currency_id === currency.id);
      return (
        holders.some((c) => c.unlocks_transfers) &&
        holders.some((c) => !c.unlocks_transfers)
      );
    });
    expect(hasBoth).toBe(true);
  });

  it("marks provenance 'seed' on every row", () => {
    const all: { field: string | null | undefined }[] = [
      ...currencies.map((r) => ({ field: r.notes })),
      ...cards.map((r) => ({ field: r.notes })),
      ...earningRates.map((r) => ({ field: r.notes })),
      ...welcomeOffers.map((r) => ({ field: r.source_url })),
      ...transferPartners.map((r) => ({ field: r.notes })),
      ...transferBonuses.map((r) => ({ field: r.source_url })),
      ...awardRoutes.map((r) => ({ field: r.notes })),
    ];
    for (const row of all) {
      expect(row.field ?? "").toContain("seed");
    }
  });
});
