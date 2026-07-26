// DB rows -> EngineInput. Mapping only: this file imports types, never
// clients, and never fetches. Wiring to routes/server actions is Phase 3.
import type {
  AvailabilityRow,
  AwardRoute,
  CardCatalog,
  Currency,
  EarningRate,
  EngineGoal,
  EngineInput,
  EngineLeg,
  GoalLegRow,
  GoalRow,
  ProfileRow,
  TransferBonus,
  TransferPartner,
  UserCardRow,
  WalletCard,
  WelcomeOffer,
} from "./types";

export type EngineInputRows = {
  userCards: UserCardRow[];
  profile: Pick<ProfileRow, "monthly_spend"> | null;
  goal: GoalRow;
  /**
   * goal_legs rows for this goal (any order). When present they define the
   * itinerary; when absent the engine synthesizes a single leg from the goals
   * columns. No backfill exists, so absence is the common case for now.
   */
  goalLegs?: GoalLegRow[];
  currencies: Currency[];
  cards: CardCatalog[];
  earningRates: EarningRate[];
  welcomeOffers: WelcomeOffer[];
  transferPartners: TransferPartner[];
  transferBonuses: TransferBonus[];
  awardRoutes: AwardRoute[];
  availability: AvailabilityRow[];
  now: Date;
};

function buildLegs(goal: GoalRow, goalLegs: GoalLegRow[]): EngineLeg[] {
  if (goalLegs.length > 0) {
    return [...goalLegs]
      .sort((a, b) => a.seq - b.seq)
      .map((l) => ({
        seq: l.seq === 2 ? 2 : 1,
        origin_airport: l.origin_airport,
        destination_airport: l.destination_airport,
        destination_region: l.destination_region,
        cabin: l.cabin,
        travel_month: l.travel_month,
      }));
  }
  // Fallback: synthesize a single (seq 1) leg from the goal's deprecated
  // columns, for any goal that predates its goal_legs backfill.
  return [
    {
      seq: 1,
      origin_airport: goal.origin_airport,
      destination_airport: goal.destination_airport,
      destination_region: goal.destination_region,
      cabin: goal.cabin,
      travel_month: goal.travel_month,
    },
  ];
}

function toMonthlySpend(
  value: ProfileRow["monthly_spend"]
): Record<string, number> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const spend: Record<string, number> = {};
  for (const [category, raw] of Object.entries(value)) {
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      spend[category] = raw;
    }
  }
  return spend;
}

export function buildEngineInput(rows: EngineInputRows): EngineInput {
  const cardById = new Map(rows.cards.map((c) => [c.id, c]));

  const wallet: WalletCard[] = [];
  for (const uc of rows.userCards) {
    const card = cardById.get(uc.card_id);
    // A user_card pointing at a card missing from the catalog snapshot is
    // dropped rather than guessed at — traceability beats completeness.
    if (!card) continue;
    wallet.push({
      id: uc.id,
      card_id: uc.card_id,
      points_balance: uc.points_balance,
      opened_at: uc.opened_at,
      card,
    });
  }

  const goal: EngineGoal = {
    num_travelers: rows.goal.num_travelers,
    flexibility: rows.goal.flexibility,
    legs: buildLegs(rows.goal, rows.goalLegs ?? []),
  };

  return {
    wallet,
    referenceData: {
      currencies: rows.currencies,
      cards: rows.cards,
      earningRates: rows.earningRates,
      welcomeOffers: rows.welcomeOffers,
      transferPartners: rows.transferPartners,
      transferBonuses: rows.transferBonuses,
      awardRoutes: rows.awardRoutes,
    },
    goal,
    availability: rows.availability,
    monthlySpend: toMonthlySpend(rows.profile?.monthly_spend ?? null),
    now: rows.now,
  };
}
