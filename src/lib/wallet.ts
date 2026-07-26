// The wallet display model. The locked-vs-transferable rule is NOT re-derived
// here — it comes straight from the engine's effectiveWallet, so the wallet
// screen and the plan can never disagree about what's unlocked. Reading the
// engine is fine; we never modify it.
import { effectiveWallet } from "@/lib/engine";
import type { WalletCard } from "@/lib/engine/types";
import type { Database } from "@/types/database";

type Currency = Database["public"]["Tables"]["currencies"]["Row"];
type CardCatalog = Database["public"]["Tables"]["card_catalog"]["Row"];
type TransferPartner = Database["public"]["Tables"]["transfer_partners"]["Row"];
type UserCard = Pick<
  Database["public"]["Tables"]["user_cards"]["Row"],
  "id" | "card_id" | "points_balance" | "opened_at"
>;

export type WalletCardView = {
  id: string;
  name: string;
  issuer: string;
  brandColor: string | null;
  balance: number;
};

export type WalletUnlock = {
  valueNowUsd: number;
  valueUnlockedUsd: number;
  deltaUsd: number;
  cardName: string;
  cardIssuer: string;
};

export type WalletCurrencyGroup = {
  currencyId: string;
  name: string;
  kind: string;
  brandColor: string | null;
  balance: number;
  locked: boolean;
  /** Worth at the EFFECTIVE cpp — cashback while locked, transfer while unlocked. Never blended. */
  valueUsd: number;
  partnersInReach: number;
  cards: WalletCardView[];
  /** Present only for a locked currency that a held-able card could unlock. */
  unlock: WalletUnlock | null;
};

export type WalletView = {
  groups: WalletCurrencyGroup[];
  totalPoints: number;
  /** Value if every balance were transferable — the "once unlocked" headline. */
  totalTransferValueUsd: number;
  cardCount: number;
};

function usd(points: number, cpp: number): number {
  return Math.round(points * cpp) / 100;
}

export function buildWalletView(
  userCards: UserCard[],
  cards: CardCatalog[],
  currencies: Currency[],
  partners: TransferPartner[]
): WalletView {
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const currencyById = new Map(currencies.map((c) => [c.id, c]));

  const wallet: WalletCard[] = [];
  for (const uc of userCards) {
    const card = cardById.get(uc.card_id);
    if (!card) continue;
    wallet.push({
      id: uc.id,
      card_id: uc.card_id,
      points_balance: uc.points_balance,
      opened_at: uc.opened_at,
      card,
    });
  }

  const { entries, unlockOpportunities } = effectiveWallet(
    wallet,
    currencies,
    cards
  );
  const unlockByCurrency = new Map(
    unlockOpportunities.map((u) => [u.currency_id, u])
  );

  const partnerCount = new Map<string, number>();
  for (const p of partners) {
    if (!p.is_active) continue;
    partnerCount.set(
      p.from_currency_id,
      (partnerCount.get(p.from_currency_id) ?? 0) + 1
    );
  }

  const groups: WalletCurrencyGroup[] = [];
  for (const entry of entries) {
    const currency = currencyById.get(entry.currency_id);
    if (!currency) continue;

    const contributing = wallet
      .filter((w) => w.card.currency_id === entry.currency_id)
      .map((w) => ({
        id: w.id,
        name: w.card.name,
        issuer: w.card.issuer,
        brandColor: w.card.brand_color,
        balance: w.points_balance,
      }))
      .sort((a, b) => b.balance - a.balance);

    const locked = !entry.unlocked && currency.requires_unlock;

    let unlock: WalletUnlock | null = null;
    const opp = unlockByCurrency.get(entry.currency_id);
    if (locked && opp) {
      // Name the cheapest-annual-fee card that unlocks this currency.
      const unlockers = opp.unlocking_card_ids
        .map((id) => cardById.get(id))
        .filter((c): c is CardCatalog => !!c)
        .sort((a, b) => a.annual_fee - b.annual_fee);
      const cheapest = unlockers[0];
      if (cheapest) {
        unlock = {
          valueNowUsd: opp.value_now_usd,
          valueUnlockedUsd: opp.value_unlocked_usd,
          deltaUsd: opp.delta_usd,
          cardName: cheapest.name,
          cardIssuer: cheapest.issuer,
        };
      }
    }

    groups.push({
      currencyId: entry.currency_id,
      name: currency.name,
      kind: currency.kind,
      brandColor: currency.brand_color,
      balance: entry.balance,
      locked,
      valueUsd: usd(entry.balance, entry.cpp),
      partnersInReach: partnerCount.get(entry.currency_id) ?? 0,
      cards: contributing,
      unlock,
    });
  }

  // Locked currencies (an unlock story) first, then by balance descending.
  groups.sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;
    return b.balance - a.balance;
  });

  const totalPoints = groups.reduce((s, g) => s + g.balance, 0);
  const totalTransferValueUsd =
    Math.round(
      groups.reduce((s, g) => {
        const currency = currencyById.get(g.currencyId);
        return s + g.balance * (currency?.transfer_cpp ?? 0);
      }, 0)
    ) / 100;

  return {
    groups,
    totalPoints,
    totalTransferValueUsd,
    cardCount: wallet.length,
  };
}
