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
  currencies: Currency[];
  cards: CardCatalog[];
  earningRates: EarningRate[];
  welcomeOffers: WelcomeOffer[];
  transferPartners: TransferPartner[];
  transferBonuses: TransferBonus[];
  awardRoutes: AwardRoute[];
  availability: AvailabilityRow[];
  /** defaults to 2 (round trip) — goals carry no legs column yet */
  legs?: 1 | 2;
  now: Date;
};

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
    origin_airport: rows.goal.origin_airport,
    destination_airport: rows.goal.destination_airport,
    destination_region: rows.goal.destination_region,
    cabin: rows.goal.cabin,
    travel_month: rows.goal.travel_month,
    num_travelers: rows.goal.num_travelers,
    flexibility: rows.goal.flexibility,
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
    legs: rows.legs ?? 2,
    now: rows.now,
  };
}
