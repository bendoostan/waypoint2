// Test-only helpers: materialize the seed's Insert-shaped rows into full Row
// shapes so the suite runs against the same realistic data `pnpm seed`
// writes. Deterministic fallback ids keep runs reproducible.
import {
  BONUS_EDGE,
  awardRoutes,
  cards,
  currencies,
  earningRates,
  transferBonuses,
  transferPartners,
  welcomeOffers,
} from "../../../scripts/seed/data";
import type { Database } from "@/types/database";
import type {
  AwardRoute,
  CardCatalog,
  Currency,
  ReferenceData,
  TransferBonus,
  TransferPartner,
  WalletCard,
  WelcomeOffer,
} from "./types";

type Tables = Database["public"]["Tables"];

let seq = 0;
export function fixedId(label: string): string {
  seq += 1;
  const tail = `${seq}`.padStart(12, "0");
  void label;
  return `99999999-9999-4999-8999-${tail}`;
}

export const seedCurrencies: Currency[] = currencies.map((c) => ({
  id: c.id ?? fixedId(c.name),
  name: c.name,
  kind: c.kind,
  alliance: c.alliance ?? null,
  cashback_cpp: c.cashback_cpp ?? 0,
  transfer_cpp: c.transfer_cpp ?? 0,
  requires_unlock: c.requires_unlock ?? false,
  is_active: c.is_active ?? true,
  notes: c.notes ?? null,
}));

export const seedCards: CardCatalog[] = cards.map((c) => ({
  id: c.id ?? fixedId(c.name),
  name: c.name,
  issuer: c.issuer,
  currency_id: c.currency_id,
  annual_fee: c.annual_fee ?? 0,
  unlocks_transfers: c.unlocks_transfers ?? false,
  affiliate_url: c.affiliate_url ?? null,
  application_rules: c.application_rules ?? null,
  is_active: c.is_active ?? true,
  discontinued_at: c.discontinued_at ?? null,
  notes: c.notes ?? null,
}));

export const seedEarningRates: Tables["earning_rates"]["Row"][] =
  earningRates.map((r) => ({
    id: r.id ?? fixedId(`${r.card_id}:${r.category}`),
    card_id: r.card_id,
    category: r.category,
    rate: r.rate,
    cap_monthly_usd: r.cap_monthly_usd ?? null,
    notes: r.notes ?? null,
  }));

export const seedWelcomeOffers: WelcomeOffer[] = welcomeOffers.map((o) => ({
  id: o.id ?? fixedId(`offer:${o.card_id}`),
  card_id: o.card_id,
  points: o.points,
  min_spend_usd: o.min_spend_usd,
  window_months: o.window_months,
  ends_at: o.ends_at ?? null,
  source_url: o.source_url ?? null,
  is_active: o.is_active ?? true,
}));

export const seedTransferPartners: TransferPartner[] = transferPartners.map(
  (p) => ({
    id: p.id ?? fixedId(`${p.from_currency_id}->${p.to_currency_id}`),
    from_currency_id: p.from_currency_id,
    to_currency_id: p.to_currency_id,
    ratio_num: p.ratio_num,
    ratio_den: p.ratio_den,
    transfer_hours_est: p.transfer_hours_est ?? 0,
    min_transfer: p.min_transfer ?? null,
    increment: p.increment ?? null,
    is_active: p.is_active ?? true,
    notes: p.notes ?? null,
  })
);

const bonusEdgeRow = seedTransferPartners.find(
  (p) =>
    p.from_currency_id === BONUS_EDGE.from_currency_id &&
    p.to_currency_id === BONUS_EDGE.to_currency_id
);
if (!bonusEdgeRow) throw new Error("seed bonus edge missing");
export const seedBonusEdge: TransferPartner = bonusEdgeRow;

export const seedTransferBonuses: TransferBonus[] = transferBonuses.map(
  (b) => ({
    id: b.id ?? fixedId("bonus"),
    transfer_partner_id: seedBonusEdge.id,
    bonus_pct: b.bonus_pct,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    source_url: b.source_url ?? null,
    status: b.status ?? "draft",
  })
);

export const seedAwardRoutes: AwardRoute[] = awardRoutes.map((r) => ({
  id: r.id ?? fixedId(`route:${r.name}`),
  name: r.name,
  program_currency_id: r.program_currency_id,
  origin_region: r.origin_region,
  origin_airports: r.origin_airports ?? null,
  destination_region: r.destination_region,
  destination_airports: r.destination_airports ?? null,
  cabin: r.cabin,
  points_oneway: r.points_oneway,
  taxes_fees_usd_est: r.taxes_fees_usd_est ?? 0,
  booking_url: r.booking_url ?? null,
  notes: r.notes ?? null,
  is_active: r.is_active ?? true,
  last_verified_at: r.last_verified_at ?? null,
}));

export const seedReferenceData: ReferenceData = {
  currencies: seedCurrencies,
  cards: seedCards,
  earningRates: seedEarningRates,
  welcomeOffers: seedWelcomeOffers,
  transferPartners: seedTransferPartners,
  transferBonuses: seedTransferBonuses,
  awardRoutes: seedAwardRoutes,
};

export function walletCard(
  card: CardCatalog,
  points_balance: number
): WalletCard {
  return {
    id: fixedId(`wallet:${card.id}`),
    card_id: card.id,
    points_balance,
    opened_at: null,
    card,
  };
}

export function cardByName(name: string): CardCatalog {
  const card = seedCards.find((c) => c.name === name);
  if (!card) throw new Error(`no seed card named ${name}`);
  return card;
}

export function currencyByName(name: string): Currency {
  const c = seedCurrencies.find((x) => x.name === name);
  if (!c) throw new Error(`no seed currency named ${name}`);
  return c;
}
