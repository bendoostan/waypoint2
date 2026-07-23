// Seed data for local development. Every row carries provenance 'seed' in
// its notes/source/source_url field. Values are realistic placeholders —
// real data arrives through the ingestion pipeline (PLAN.md section 6).
//
// PLAN.md asks for 4 currencies, but ~10 transfer edges need airline
// programs on the receiving end, so the 4 headline currencies are joined
// by 5 airline programs as transfer destinations.

import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];

export const SEED_NOTE = "seed";

// Fixed UUIDs make every upsert idempotent.
export const CURRENCY_IDS = {
  chaseUR: "11111111-1111-4111-8111-000000000001",
  amexMR: "11111111-1111-4111-8111-000000000002",
  capitalOne: "11111111-1111-4111-8111-000000000003",
  united: "11111111-1111-4111-8111-000000000004",
  aeroplan: "11111111-1111-4111-8111-000000000005",
  flyingBlue: "11111111-1111-4111-8111-000000000006",
  ana: "11111111-1111-4111-8111-000000000007",
  krisflyer: "11111111-1111-4111-8111-000000000008",
  baAvios: "11111111-1111-4111-8111-000000000009",
} as const;

export const CARD_IDS = {
  sapphirePreferred: "22222222-2222-4222-8222-000000000001",
  freedomUnlimited: "22222222-2222-4222-8222-000000000002",
  amexGold: "22222222-2222-4222-8222-000000000003",
  ventureX: "22222222-2222-4222-8222-000000000004",
  unitedExplorer: "22222222-2222-4222-8222-000000000005",
} as const;

export const currencies: Tables["currencies"]["Insert"][] = [
  {
    id: CURRENCY_IDS.chaseUR,
    name: "Chase Ultimate Rewards",
    kind: "bank",
    alliance: null,
    cashback_cpp: 1.0,
    transfer_cpp: 2.0,
    requires_unlock: true, // the Freedom->Sapphire mechanic
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CURRENCY_IDS.amexMR,
    name: "Amex Membership Rewards",
    kind: "bank",
    alliance: null,
    cashback_cpp: 0.6,
    transfer_cpp: 2.0,
    requires_unlock: true,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CURRENCY_IDS.capitalOne,
    name: "Capital One Miles",
    kind: "bank",
    alliance: null,
    cashback_cpp: 0.5,
    transfer_cpp: 1.7,
    requires_unlock: false,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CURRENCY_IDS.united,
    name: "United MileagePlus",
    kind: "airline",
    alliance: "star",
    cashback_cpp: 0,
    transfer_cpp: 1.3,
    requires_unlock: false,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CURRENCY_IDS.aeroplan,
    name: "Air Canada Aeroplan",
    kind: "airline",
    alliance: "star",
    cashback_cpp: 0,
    transfer_cpp: 1.5,
    requires_unlock: false,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CURRENCY_IDS.flyingBlue,
    name: "Air France-KLM Flying Blue",
    kind: "airline",
    alliance: "skyteam",
    cashback_cpp: 0,
    transfer_cpp: 1.3,
    requires_unlock: false,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CURRENCY_IDS.ana,
    name: "ANA Mileage Club",
    kind: "airline",
    alliance: "star",
    cashback_cpp: 0,
    transfer_cpp: 1.8,
    requires_unlock: false,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CURRENCY_IDS.krisflyer,
    name: "Singapore KrisFlyer",
    kind: "airline",
    alliance: "star",
    cashback_cpp: 0,
    transfer_cpp: 1.4,
    requires_unlock: false,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CURRENCY_IDS.baAvios,
    name: "British Airways Avios",
    kind: "airline",
    alliance: "oneworld",
    cashback_cpp: 0,
    transfer_cpp: 1.4,
    requires_unlock: false,
    is_active: true,
    notes: SEED_NOTE,
  },
];

export const cards: Tables["card_catalog"]["Insert"][] = [
  {
    id: CARD_IDS.sapphirePreferred,
    name: "Sapphire Preferred",
    issuer: "Chase",
    currency_id: CURRENCY_IDS.chaseUR,
    annual_fee: 95,
    unlocks_transfers: true,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CARD_IDS.freedomUnlimited,
    name: "Freedom Unlimited",
    issuer: "Chase",
    currency_id: CURRENCY_IDS.chaseUR,
    annual_fee: 0,
    unlocks_transfers: false,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CARD_IDS.amexGold,
    name: "Gold Card",
    issuer: "American Express",
    currency_id: CURRENCY_IDS.amexMR,
    annual_fee: 325,
    unlocks_transfers: true,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CARD_IDS.ventureX,
    name: "Venture X",
    issuer: "Capital One",
    currency_id: CURRENCY_IDS.capitalOne,
    annual_fee: 395,
    unlocks_transfers: true,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    id: CARD_IDS.unitedExplorer,
    name: "United Explorer",
    issuer: "Chase",
    currency_id: CURRENCY_IDS.united,
    annual_fee: 95,
    unlocks_transfers: false,
    is_active: true,
    notes: SEED_NOTE,
  },
];

// Upserted on the (card_id, category) natural key.
export const earningRates: Tables["earning_rates"]["Insert"][] = [
  {
    card_id: CARD_IDS.sapphirePreferred,
    category: "dining",
    rate: 3,
    notes: SEED_NOTE,
  },
  {
    card_id: CARD_IDS.sapphirePreferred,
    category: "travel",
    rate: 2,
    notes: SEED_NOTE,
  },
  {
    card_id: CARD_IDS.sapphirePreferred,
    category: "streaming",
    rate: 3,
    notes: SEED_NOTE,
  },
  {
    card_id: CARD_IDS.sapphirePreferred,
    category: "online_retail",
    rate: 3,
    notes: SEED_NOTE,
  },
  {
    card_id: CARD_IDS.sapphirePreferred,
    category: "everything_else",
    rate: 1,
    notes: SEED_NOTE,
  },
  {
    card_id: CARD_IDS.freedomUnlimited,
    category: "dining",
    rate: 3,
    notes: SEED_NOTE,
  },
  {
    card_id: CARD_IDS.freedomUnlimited,
    category: "drugstore",
    rate: 3,
    notes: SEED_NOTE,
  },
  {
    card_id: CARD_IDS.freedomUnlimited,
    category: "travel",
    rate: 5,
    notes: "seed; Chase Travel portal only",
  },
  {
    card_id: CARD_IDS.freedomUnlimited,
    category: "everything_else",
    rate: 1.5,
    notes: SEED_NOTE,
  },
  {
    card_id: CARD_IDS.amexGold,
    category: "dining",
    rate: 4,
    cap_monthly_usd: 4166,
    notes: "seed; $50k/yr cap approximated monthly",
  },
  {
    card_id: CARD_IDS.amexGold,
    category: "groceries",
    rate: 4,
    cap_monthly_usd: 2083,
    notes: "seed; $25k/yr cap approximated monthly",
  },
  {
    card_id: CARD_IDS.amexGold,
    category: "travel",
    rate: 3,
    notes: "seed; flights booked direct",
  },
  {
    card_id: CARD_IDS.amexGold,
    category: "everything_else",
    rate: 1,
    notes: SEED_NOTE,
  },
  {
    card_id: CARD_IDS.ventureX,
    category: "travel",
    rate: 5,
    notes: "seed; Capital One Travel portal",
  },
  {
    card_id: CARD_IDS.ventureX,
    category: "everything_else",
    rate: 2,
    notes: SEED_NOTE,
  },
  {
    card_id: CARD_IDS.unitedExplorer,
    category: "dining",
    rate: 2,
    notes: SEED_NOTE,
  },
  {
    card_id: CARD_IDS.unitedExplorer,
    category: "travel",
    rate: 2,
    notes: "seed; United purchases",
  },
  {
    card_id: CARD_IDS.unitedExplorer,
    category: "everything_else",
    rate: 1,
    notes: SEED_NOTE,
  },
];

export const welcomeOffers: Tables["welcome_offers"]["Insert"][] = [
  {
    id: "33333333-3333-4333-8333-000000000001",
    card_id: CARD_IDS.sapphirePreferred,
    points: 60000,
    min_spend_usd: 4000,
    window_months: 3,
    source_url: SEED_NOTE,
    is_active: true,
  },
  {
    id: "33333333-3333-4333-8333-000000000002",
    card_id: CARD_IDS.freedomUnlimited,
    points: 20000,
    min_spend_usd: 500,
    window_months: 3,
    source_url: SEED_NOTE,
    is_active: true,
  },
  {
    id: "33333333-3333-4333-8333-000000000003",
    card_id: CARD_IDS.amexGold,
    points: 60000,
    min_spend_usd: 6000,
    window_months: 6,
    source_url: SEED_NOTE,
    is_active: true,
  },
  {
    id: "33333333-3333-4333-8333-000000000004",
    card_id: CARD_IDS.ventureX,
    points: 75000,
    min_spend_usd: 4000,
    window_months: 3,
    source_url: SEED_NOTE,
    is_active: true,
  },
  {
    id: "33333333-3333-4333-8333-000000000005",
    card_id: CARD_IDS.unitedExplorer,
    points: 50000,
    min_spend_usd: 3000,
    window_months: 3,
    source_url: SEED_NOTE,
    is_active: true,
  },
];

// Upserted on the (from_currency_id, to_currency_id) natural key.
export const transferPartners: Tables["transfer_partners"]["Insert"][] = [
  {
    from_currency_id: CURRENCY_IDS.chaseUR,
    to_currency_id: CURRENCY_IDS.united,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: 1000,
    increment: 1000,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    from_currency_id: CURRENCY_IDS.chaseUR,
    to_currency_id: CURRENCY_IDS.aeroplan,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: 1000,
    increment: 1000,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    from_currency_id: CURRENCY_IDS.chaseUR,
    to_currency_id: CURRENCY_IDS.flyingBlue,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: 1000,
    increment: 1000,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    from_currency_id: CURRENCY_IDS.chaseUR,
    to_currency_id: CURRENCY_IDS.krisflyer,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 24,
    min_transfer: 1000,
    increment: 1000,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    from_currency_id: CURRENCY_IDS.chaseUR,
    to_currency_id: CURRENCY_IDS.baAvios,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: 1000,
    increment: 1000,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    from_currency_id: CURRENCY_IDS.amexMR,
    to_currency_id: CURRENCY_IDS.ana,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 48,
    min_transfer: 1000,
    increment: 1000,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    from_currency_id: CURRENCY_IDS.amexMR,
    to_currency_id: CURRENCY_IDS.aeroplan,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: 1000,
    increment: 1000,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    from_currency_id: CURRENCY_IDS.amexMR,
    to_currency_id: CURRENCY_IDS.flyingBlue,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: 1000,
    increment: 1000,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    from_currency_id: CURRENCY_IDS.amexMR,
    to_currency_id: CURRENCY_IDS.baAvios,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: 1000,
    increment: 1000,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    from_currency_id: CURRENCY_IDS.capitalOne,
    to_currency_id: CURRENCY_IDS.aeroplan,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: 1000,
    increment: 100,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    from_currency_id: CURRENCY_IDS.capitalOne,
    to_currency_id: CURRENCY_IDS.flyingBlue,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 0,
    min_transfer: 1000,
    increment: 100,
    is_active: true,
    notes: SEED_NOTE,
  },
  {
    from_currency_id: CURRENCY_IDS.capitalOne,
    to_currency_id: CURRENCY_IDS.krisflyer,
    ratio_num: 1,
    ratio_den: 1,
    transfer_hours_est: 24,
    min_transfer: 1000,
    increment: 100,
    is_active: true,
    notes: SEED_NOTE,
  },
];

// One active bonus: MR -> Flying Blue 25%, in-window today, approved.
export const transferBonuses: Tables["transfer_bonuses"]["Insert"][] = [
  {
    id: "44444444-4444-4444-8444-000000000001",
    // resolved to the MR -> Flying Blue edge id by the seed runner
    transfer_partner_id: "",
    bonus_pct: 25,
    starts_at: "2026-07-01T00:00:00Z",
    ends_at: "2026-09-15T23:59:59Z",
    source_url: SEED_NOTE,
    status: "approved",
  },
];

// Which edge the bonus above attaches to, by natural key.
export const BONUS_EDGE = {
  from_currency_id: CURRENCY_IDS.amexMR,
  to_currency_id: CURRENCY_IDS.flyingBlue,
} as const;

export const awardRoutes: Tables["award_routes"]["Insert"][] = [
  {
    name: "ANA business class to Japan (round-trip)",
    program_currency_id: CURRENCY_IDS.ana,
    origin_region: "US West Coast",
    origin_airports: ["LAX", "SFO", "SEA"],
    destination_region: "Japan",
    destination_airports: ["NRT", "HND"],
    cabin: "business",
    points_oneway: 42500,
    taxes_fees_usd_est: 250,
    booking_url: "https://www.ana.co.jp/en/us/amc/",
    // booking_unit encodes "round trip only"; points_oneway is per direction.
    booking_unit: "round_trip",
    notes: "seed; points_oneway is half the round-trip price",
    is_active: true,
  },
  {
    name: "Flying Blue economy to Europe",
    program_currency_id: CURRENCY_IDS.flyingBlue,
    origin_region: "US East Coast",
    origin_airports: ["JFK", "BOS", "IAD"],
    destination_region: "Europe",
    destination_airports: ["CDG", "AMS"],
    cabin: "economy",
    points_oneway: 20000,
    taxes_fees_usd_est: 120,
    booking_url: "https://www.flyingblue.com/",
    notes: SEED_NOTE,
    is_active: true,
  },
  {
    name: "United economy to Hawaii",
    program_currency_id: CURRENCY_IDS.united,
    origin_region: "US West Coast",
    origin_airports: ["LAX", "SFO", "SAN"],
    destination_region: "Hawaii",
    destination_airports: ["HNL", "OGG"],
    cabin: "economy",
    points_oneway: 22500,
    taxes_fees_usd_est: 6,
    booking_url: "https://www.united.com/",
    notes: SEED_NOTE,
    is_active: true,
  },
];

// Example pending review-queue items so /admin/queue is demonstrable in dev.
// The transfer-bonus insert's partner id is resolved by the seed runner
// (STAGING_BONUS_EDGE), like the active bonus above. Idempotent on id.
export const STAGING_BONUS_EDGE = {
  from_currency_id: CURRENCY_IDS.amexMR,
  to_currency_id: CURRENCY_IDS.ana,
} as const;

export function stagingChanges(
  mrToAnaPartnerId: string
): Tables["staging_changes"]["Insert"][] {
  return [
    {
      // proposed INSERT: a new limited-time transfer bonus (draft)
      id: "55555555-5555-4555-8555-000000000001",
      target_table: "transfer_bonuses",
      target_id: null,
      proposed: {
        transfer_partner_id: mrToAnaPartnerId,
        bonus_pct: 40,
        starts_at: "2026-08-15T00:00:00Z",
        ends_at: "2026-10-15T23:59:59Z",
        source_url: "https://www.americanexpress.com/transfer-bonus",
        status: "draft",
      },
      diff: null,
      source: "claude_research",
      confidence: 0.86,
      source_urls: [
        "https://www.americanexpress.com/transfer-bonus",
        "https://frequentmiler.com/amex-transfer-bonuses/",
      ],
      status: "pending",
    },
    {
      // proposed UPDATE: revalue Capital One Miles slightly upward
      id: "55555555-5555-4555-8555-000000000002",
      target_table: "currencies",
      target_id: CURRENCY_IDS.capitalOne,
      proposed: { transfer_cpp: 1.85 },
      diff: { transfer_cpp: { from: 1.7, to: 1.85 } },
      source: "claude_research",
      confidence: 0.7,
      source_urls: [
        "https://thepointsguy.com/loyalty-programs/points-valuations/",
      ],
      status: "pending",
    },
    {
      // proposed UPDATE: a limited-time increase to the Sapphire welcome offer
      id: "55555555-5555-4555-8555-000000000003",
      target_table: "welcome_offers",
      target_id: "33333333-3333-4333-8333-000000000001",
      proposed: { points: 75000, min_spend_usd: 5000 },
      diff: {
        points: { from: 60000, to: 75000 },
        min_spend_usd: { from: 4000, to: 5000 },
      },
      source: "manual",
      confidence: 0.95,
      source_urls: ["https://www.chase.com/sapphire-preferred"],
      status: "pending",
    },
  ];
}
