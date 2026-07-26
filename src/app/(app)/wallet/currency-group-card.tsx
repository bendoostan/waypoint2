import { CardMark } from "@/components/card-mark";
import { fmtInt, fmtUsd, issuerWordmark, programWordmark } from "@/lib/format";
import type { WalletCurrencyGroup } from "@/lib/wallet";
import { RemoveCardButton } from "./remove-card-button";

// One currency group: the program, its summed balance, the locked/transferable
// state, the unlock story (for a locked balance), and the contributing cards.
// Locked worth is the cashback value; the unlocked value lives only in the
// callout — the two figures are never blended into one.
export function CurrencyGroupCard({ group }: { group: WalletCurrencyGroup }) {
  return (
    <section
      className="bg-wp-panel shadow-wp-sm rounded-2xl border p-6"
      style={
        group.locked
          ? { borderColor: "color-mix(in oklab, var(--wp-accent), #fff 55%)" }
          : { borderColor: "var(--wp-border-2)" }
      }
    >
      <div className="flex items-start gap-4">
        <CardMark
          brandColor={group.brandColor}
          wordmark={programWordmark(group.name)}
          iata={null}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-wp-ink text-base font-semibold">
                {group.name}
              </h2>
              {group.locked ? <LockedBadge /> : <TransferableBadge />}
            </div>
            <p className="text-wp-muted mt-1 text-[13px]">
              {group.kind === "bank" ? "Bank points" : "Airline program"}
              {!group.locked && group.partnersInReach > 0
                ? ` · ${group.partnersInReach} ${group.partnersInReach === 1 ? "partner" : "partners"} in reach`
                : group.locked
                  ? " · earning cashback value only"
                  : ""}
            </p>
          </div>
          <div className="flex-none text-left sm:text-right">
            <div className="font-display text-wp-ink text-2xl font-semibold tabular-nums">
              {fmtInt(group.balance)}
            </div>
            <div className="text-wp-muted-2 text-[11px] tracking-wide uppercase">
              points · worth {fmtUsd(group.valueUsd)}
            </div>
          </div>
        </div>
      </div>

      {group.unlock ? (
        <p className="bg-wp-track/60 text-wp-body mt-4 rounded-xl px-4 py-3 text-[13px] leading-relaxed">
          Your{" "}
          <span className="text-wp-ink font-semibold tabular-nums">
            {fmtInt(group.balance)}
          </span>{" "}
          {group.name} points are worth about{" "}
          <b className="text-wp-ink tabular-nums">
            {fmtUsd(group.unlock.valueNowUsd)}
          </b>{" "}
          today. Opening a{" "}
          <span className="text-wp-ink font-semibold">
            {group.unlock.cardName}
          </span>{" "}
          makes them worth about{" "}
          <b className="text-wp-accent-text tabular-nums">
            {fmtUsd(group.unlock.valueUnlockedUsd)}
          </b>{" "}
          toward award flights.
        </p>
      ) : null}

      <ul className="divide-wp-track border-wp-track mt-4 divide-y border-t">
        {group.cards.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <span className="text-wp-body flex items-center gap-2 text-sm">
              <CardMark
                brandColor={c.brandColor}
                wordmark={issuerWordmark(c.issuer)}
                size="sm"
              />
              {c.name}
            </span>
            <span className="flex items-center gap-3">
              <span className="text-wp-muted text-sm tabular-nums">
                {fmtInt(c.balance)}
              </span>
              <RemoveCardButton id={c.id} label={c.name} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LockedBadge() {
  return (
    <span
      className="text-wp-accent-text inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        backgroundColor: "color-mix(in oklab, var(--wp-accent), #fff 84%)",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </svg>
      Locked
    </span>
  );
}

function TransferableBadge() {
  return (
    <span className="bg-wp-success-bg text-wp-success inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold">
      <span className="bg-wp-success size-1.5 rounded-full" />
      Transferable
    </span>
  );
}
