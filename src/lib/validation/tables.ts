// Per-table zod schemas for the whitelisted reference tables. These mirror
// the CHECK constraints and enums in migrations 0001/0003 and are shared by
// the admin forms (client-side) and the review queue (before it calls
// apply_staging_change). The DB function is the last line of defense — this
// is the first.
import { z } from "zod";

export const CURRENCY_KINDS = ["bank", "airline", "hotel", "cashback"] as const;
export const ALLIANCES = ["star", "oneworld", "skyteam"] as const;
export const EARNING_CATEGORIES = [
  "dining",
  "travel",
  "groceries",
  "gas",
  "transit",
  "streaming",
  "drugstore",
  "online_retail",
  "everything_else",
] as const;
export const CABINS = [
  "economy",
  "premium_economy",
  "business",
  "first",
] as const;
export const BONUS_STATUSES = ["draft", "approved", "expired"] as const;
export const BOOKING_UNITS = ["one_way", "round_trip"] as const;

const uuid = z.string().uuid();
const iata = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be a 3-letter uppercase IATA code");
// Accept a real URL or an empty string (treated as null by the form layer).
const optionalUrl = z
  .string()
  .url("must be a valid URL")
  .nullish()
  .or(z.literal(""));
const optionalText = z.string().nullish();

export const currencySchema = z.object({
  id: uuid.optional(),
  name: z.string().min(1),
  kind: z.enum(CURRENCY_KINDS),
  alliance: z.enum(ALLIANCES).nullish(),
  cashback_cpp: z.number().nonnegative(),
  transfer_cpp: z.number().nonnegative(),
  requires_unlock: z.boolean(),
  is_active: z.boolean(),
  notes: optionalText,
});

export const cardCatalogSchema = z.object({
  id: uuid.optional(),
  name: z.string().min(1),
  issuer: z.string().min(1),
  currency_id: uuid,
  annual_fee: z.number().int().nonnegative(),
  unlocks_transfers: z.boolean(),
  affiliate_url: optionalUrl,
  application_rules: z.unknown().nullish(),
  is_active: z.boolean(),
  discontinued_at: z.string().nullish(),
  notes: optionalText,
  // Design-system fields (migration 0005); nullable, engine ignores them.
  brand_color: optionalText,
  logo_url: optionalUrl,
});

export const earningRateSchema = z.object({
  id: uuid.optional(),
  card_id: uuid,
  category: z.enum(EARNING_CATEGORIES),
  rate: z.number().positive(),
  cap_monthly_usd: z.number().int().positive().nullish(),
  notes: optionalText,
});

export const welcomeOfferSchema = z.object({
  id: uuid.optional(),
  card_id: uuid,
  points: z.number().int().positive(),
  min_spend_usd: z.number().int().nonnegative(),
  window_months: z.number().int().positive(),
  ends_at: z.string().nullish(),
  // provenance/citation — a URL in production, a marker like "seed" in dev
  source_url: optionalText,
  is_active: z.boolean(),
});

export const transferPartnerSchema = z
  .object({
    id: uuid.optional(),
    from_currency_id: uuid,
    to_currency_id: uuid,
    ratio_num: z.number().int().positive(),
    ratio_den: z.number().int().positive(),
    transfer_hours_est: z.number().int().nonnegative(),
    min_transfer: z.number().int().positive().nullish(),
    increment: z.number().int().positive().nullish(),
    is_active: z.boolean(),
    notes: optionalText,
  })
  .refine((v) => v.from_currency_id !== v.to_currency_id, {
    message: "from and to currency must differ",
    path: ["to_currency_id"],
  });

export const transferBonusSchema = z
  .object({
    id: uuid.optional(),
    transfer_partner_id: uuid,
    bonus_pct: z.number().int().positive(),
    starts_at: z.string().min(1),
    ends_at: z.string().min(1),
    // provenance/citation — a URL in production, a marker like "seed" in dev
    source_url: optionalText,
    status: z.enum(BONUS_STATUSES),
  })
  .refine(
    (v) => new Date(v.ends_at).getTime() > new Date(v.starts_at).getTime(),
    {
      message: "ends_at must be after starts_at",
      path: ["ends_at"],
    }
  );

export const awardRouteSchema = z.object({
  id: uuid.optional(),
  name: z.string().min(1),
  program_currency_id: uuid,
  origin_region: z.string().min(1),
  origin_airports: z.array(iata).nullish(),
  destination_region: z.string().min(1),
  destination_airports: z.array(iata).nullish(),
  cabin: z.enum(CABINS),
  points_oneway: z.number().int().positive(),
  taxes_fees_usd_est: z.number().int().nonnegative(),
  booking_url: optionalUrl,
  notes: optionalText,
  is_active: z.boolean(),
  last_verified_at: z.string().nullish(),
  // migration 0005: 'round_trip' routes are priced per direction but booked
  // as one atomic round trip. Omitted proposals default to 'one_way' in the DB.
  booking_unit: z.enum(BOOKING_UNITS).optional(),
});

// The whitelist — identical to apply_staging_change's, and the only tables
// the review queue will attempt to write.
export const TABLE_SCHEMAS = {
  currencies: currencySchema,
  card_catalog: cardCatalogSchema,
  earning_rates: earningRateSchema,
  welcome_offers: welcomeOfferSchema,
  transfer_partners: transferPartnerSchema,
  transfer_bonuses: transferBonusSchema,
  award_routes: awardRouteSchema,
} as const;

export type WhitelistedTable = keyof typeof TABLE_SCHEMAS;

export const WHITELISTED_TABLES = Object.keys(
  TABLE_SCHEMAS
) as WhitelistedTable[];

export function isWhitelistedTable(table: string): table is WhitelistedTable {
  return table in TABLE_SCHEMAS;
}
