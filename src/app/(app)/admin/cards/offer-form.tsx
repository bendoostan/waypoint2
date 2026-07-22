"use client";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/admin/form-dialog";
import {
  CheckboxField,
  NumberField,
  TextField,
} from "@/components/admin/fields";
import type { Database } from "@/types/database";

import { upsertWelcomeOffer } from "./actions";

type WelcomeOffer = Database["public"]["Tables"]["welcome_offers"]["Row"];

export function OfferForm({
  cardId,
  offer,
  trigger,
}: {
  cardId: string;
  offer?: WelcomeOffer;
  trigger: React.ReactNode;
}) {
  return (
    <FormDialog
      title={offer ? "Edit welcome offer" : "New welcome offer"}
      action={upsertWelcomeOffer}
      trigger={trigger}
    >
      <input type="hidden" name="card_id" value={cardId} />
      {offer ? <input type="hidden" name="id" value={offer.id} /> : null}
      <div className="grid grid-cols-3 gap-4">
        <NumberField
          name="points"
          label="Points"
          defaultValue={offer?.points}
          step="1"
          required
        />
        <NumberField
          name="min_spend_usd"
          label="Min spend"
          defaultValue={offer?.min_spend_usd}
          step="1"
          required
        />
        <NumberField
          name="window_months"
          label="Window (mo)"
          defaultValue={offer?.window_months}
          step="1"
          required
        />
      </div>
      <TextField
        name="ends_at"
        label="Ends at (ISO date, optional)"
        defaultValue={offer?.ends_at ?? ""}
        placeholder="2026-12-31"
      />
      <TextField
        name="source_url"
        label="Source"
        defaultValue={offer?.source_url}
      />
      <CheckboxField
        name="is_active"
        label="Active"
        defaultChecked={offer?.is_active ?? true}
      />
    </FormDialog>
  );
}

export function NewOfferButton({ cardId }: { cardId: string }) {
  return (
    <OfferForm
      cardId={cardId}
      trigger={
        <Button variant="outline" size="sm">
          Add offer
        </Button>
      }
    />
  );
}
