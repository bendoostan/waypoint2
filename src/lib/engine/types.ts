// Engine input types, derived from generated DB row types. The engine never
// fetches: callers assemble EngineInput (see from-db.ts) and pass it in.
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];

export type Currency = Tables["currencies"]["Row"];
export type CardCatalog = Tables["card_catalog"]["Row"];
export type EarningRate = Tables["earning_rates"]["Row"];
export type WelcomeOffer = Tables["welcome_offers"]["Row"];
export type TransferPartner = Tables["transfer_partners"]["Row"];
export type TransferBonus = Tables["transfer_bonuses"]["Row"];
export type AwardRoute = Tables["award_routes"]["Row"];
export type AvailabilityRow = Tables["availability_cache"]["Row"];
export type GoalRow = Tables["goals"]["Row"];
export type GoalLegRow = Tables["goal_legs"]["Row"];
export type UserCardRow = Tables["user_cards"]["Row"];
export type ProfileRow = Tables["profiles"]["Row"];

/** A user_card joined to its catalog card. */
export type WalletCard = {
  id: string;
  card_id: string;
  points_balance: number;
  opened_at: string | null;
  card: CardCatalog;
};

export type ReferenceData = {
  currencies: Currency[];
  cards: CardCatalog[];
  earningRates: EarningRate[];
  welcomeOffers: WelcomeOffer[];
  transferPartners: TransferPartner[];
  transferBonuses: TransferBonus[];
  awardRoutes: AwardRoute[];
};

/** The slice of a goal row the engine needs. */
export type EngineGoal = Pick<
  GoalRow,
  | "origin_airport"
  | "destination_airport"
  | "destination_region"
  | "cabin"
  | "travel_month"
  | "num_travelers"
  | "flexibility"
>;

/**
 * One directional flight in a trip (leg 1 = outbound, leg 2 = return). Each
 * leg carries its own origin/destination/cabin and is route-matched
 * independently; the two legs draw from ONE shared wallet. A round trip is two
 * legs whose endpoints reverse; an open-jaw is two legs that do not.
 */
export type EngineLeg = {
  leg_index: 1 | 2;
  origin_airport: string;
  destination_airport: string | null;
  destination_region: string | null;
  cabin: string;
};

export type EngineInput = {
  wallet: WalletCard[];
  referenceData: ReferenceData;
  /** Kept for trip-wide fields the legs don't carry (num_travelers). */
  goal: EngineGoal;
  /**
   * The itinerary, ordered by leg_index. Length 1 (one-way) or 2 (round trip
   * or open-jaw); generatePlan throws on 0 or 3+. num_travelers multiplies
   * each leg's need. Replaces the old `legs: 1 | 2` multiplier: a round trip
   * is now two explicit legs, not one route priced twice.
   */
  legs: EngineLeg[];
  availability: AvailabilityRow[];
  /**
   * profiles.monthly_spend — category -> USD/month. Not listed in the
   * PROMPT's EngineInput bundle but required by gap closure (task 6);
   * empty object means "unknown spend" and yields months_to_goal: null.
   */
  monthlySpend: Record<string, number>;
  /** All time-dependent logic keys off this — never the wall clock. */
  now: Date;
};

/** One currency of the user's wallet after the unlock rule is applied. */
export type EffectiveCurrency = {
  currency_id: string;
  balance: number;
  unlocked: boolean;
  /** cents per point: transfer_cpp when unlocked, else cashback_cpp */
  cpp: number;
};
