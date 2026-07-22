import { describe, expect, it } from "vitest";

import {
  currencies,
  cards,
  earningRates,
  welcomeOffers,
  transferPartners,
  awardRoutes,
} from "../../../scripts/seed/data";
import {
  awardRouteSchema,
  cardCatalogSchema,
  currencySchema,
  earningRateSchema,
  transferBonusSchema,
  transferPartnerSchema,
  validateProposed,
  welcomeOfferSchema,
} from "./index";

describe("validation schemas accept the seed rows", () => {
  it("currencies", () => {
    for (const row of currencies) {
      expect(currencySchema.safeParse(row).success).toBe(true);
    }
  });
  it("cards", () => {
    for (const row of cards) {
      expect(cardCatalogSchema.safeParse(row).success).toBe(true);
    }
  });
  it("earning rates", () => {
    for (const row of earningRates) {
      expect(earningRateSchema.safeParse(row).success).toBe(true);
    }
  });
  it("welcome offers", () => {
    for (const row of welcomeOffers) {
      expect(welcomeOfferSchema.safeParse(row).success).toBe(true);
    }
  });
  it("transfer partners", () => {
    for (const row of transferPartners) {
      expect(transferPartnerSchema.safeParse(row).success).toBe(true);
    }
  });
  it("award routes", () => {
    for (const row of awardRoutes) {
      expect(awardRouteSchema.safeParse(row).success).toBe(true);
    }
  });
});

describe("validation schemas reject bad input", () => {
  const goodCurrency = currencies[0]!;
  const goodPartner = transferPartners[0]!;

  it("rejects an unknown currency kind", () => {
    expect(
      currencySchema.safeParse({ ...goodCurrency, kind: "crypto" }).success
    ).toBe(false);
  });

  it("rejects a negative cpp", () => {
    expect(
      currencySchema.safeParse({ ...goodCurrency, transfer_cpp: -1 }).success
    ).toBe(false);
  });

  it("rejects a zero or negative ratio part", () => {
    expect(
      transferPartnerSchema.safeParse({ ...goodPartner, ratio_num: 0 }).success
    ).toBe(false);
    expect(
      transferPartnerSchema.safeParse({ ...goodPartner, ratio_den: -2 }).success
    ).toBe(false);
  });

  it("rejects a transfer edge to the same currency", () => {
    expect(
      transferPartnerSchema.safeParse({
        ...goodPartner,
        to_currency_id: goodPartner.from_currency_id,
      }).success
    ).toBe(false);
  });

  it("rejects an inverted bonus window", () => {
    const bad = {
      transfer_partner_id: "11111111-1111-4111-8111-000000000009",
      bonus_pct: 30,
      starts_at: "2026-09-01T00:00:00Z",
      ends_at: "2026-08-01T00:00:00Z",
      status: "draft",
    };
    expect(transferBonusSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-IATA airport code in a route", () => {
    const route = { ...awardRoutes[0]!, origin_airports: ["sfo", "TOOLONG"] };
    expect(awardRouteSchema.safeParse(route).success).toBe(false);
  });
});

describe("validateProposed", () => {
  it("refuses a non-whitelisted table", () => {
    const result = validateProposed("profiles", { role: "admin" });
    expect(result.ok).toBe(false);
  });

  it("validates an insert proposal in full", () => {
    const result = validateProposed("currencies", currencies[0]);
    expect(result.ok).toBe(true);
  });

  it("validates an update against the merged resulting row", () => {
    const existing = currencies[0] as Record<string, unknown>;
    // A partial proposal that is only valid because the existing row supplies
    // the rest.
    const result = validateProposed(
      "currencies",
      { transfer_cpp: 2.5 },
      existing
    );
    expect(result.ok).toBe(true);
  });

  it("catches an update that would produce an invalid row", () => {
    const existing = currencies[0] as Record<string, unknown>;
    const result = validateProposed(
      "currencies",
      { kind: "not-a-kind" },
      existing
    );
    expect(result.ok).toBe(false);
  });
});
