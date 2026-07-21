// Stage 1 (PLAN.md §4.1): group balances by currency, apply the unlock rule,
// price each balance. The Freedom→Sapphire mechanic lives here: holding one
// unlocks_transfers card flips the whole balance of that currency from
// cashback_cpp to transfer_cpp.
import type { UnlockOpportunity } from "./schema";
import type {
  CardCatalog,
  Currency,
  EffectiveCurrency,
  WalletCard,
} from "./types";

export type EffectiveWallet = {
  entries: EffectiveCurrency[];
  unlockOpportunities: UnlockOpportunity[];
};

export function usd(points: number, cpp: number): number {
  return Math.round(points * cpp) / 100;
}

export function effectiveWallet(
  wallet: WalletCard[],
  currencies: Currency[],
  catalog: CardCatalog[]
): EffectiveWallet {
  const byId = new Map(currencies.map((c) => [c.id, c]));

  const balances = new Map<string, number>();
  const unlockedBy = new Set<string>();
  for (const wc of wallet) {
    const currencyId = wc.card.currency_id;
    balances.set(
      currencyId,
      (balances.get(currencyId) ?? 0) + wc.points_balance
    );
    if (wc.card.unlocks_transfers) unlockedBy.add(currencyId);
  }

  const entries: EffectiveCurrency[] = [];
  const unlockOpportunities: UnlockOpportunity[] = [];

  for (const [currencyId, balance] of [...balances.entries()].sort()) {
    const currency = byId.get(currencyId);
    if (!currency || !currency.is_active) continue;

    const unlocked = !currency.requires_unlock || unlockedBy.has(currencyId);
    entries.push({
      currency_id: currencyId,
      balance,
      unlocked,
      cpp: unlocked ? currency.transfer_cpp : currency.cashback_cpp,
    });

    if (!unlocked && balance > 0) {
      const unlockingCards = catalog.filter(
        (c) =>
          c.is_active && c.currency_id === currencyId && c.unlocks_transfers
      );
      if (unlockingCards.length > 0) {
        const valueNow = usd(balance, currency.cashback_cpp);
        const valueUnlocked = usd(balance, currency.transfer_cpp);
        unlockOpportunities.push({
          currency_id: currencyId,
          currency_name: currency.name,
          balance,
          cashback_cpp: currency.cashback_cpp,
          transfer_cpp: currency.transfer_cpp,
          value_now_usd: valueNow,
          value_unlocked_usd: valueUnlocked,
          delta_usd: Math.round((valueUnlocked - valueNow) * 100) / 100,
          unlocking_card_ids: unlockingCards.map((c) => c.id).sort(),
        });
      }
    }
  }

  return { entries, unlockOpportunities };
}
