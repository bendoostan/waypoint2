"use client";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/admin/form-dialog";
import {
  CheckboxField,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/admin/fields";
import type { Database } from "@/types/database";

import { upsertCard } from "./actions";

type Card = Database["public"]["Tables"]["card_catalog"]["Row"];

export function CardForm({
  card,
  currencyOptions,
  trigger,
}: {
  card?: Card;
  currencyOptions: { value: string; label: string }[];
  trigger: React.ReactNode;
}) {
  return (
    <FormDialog
      title={card ? `Edit ${card.name}` : "New card"}
      action={upsertCard}
      trigger={trigger}
    >
      {card ? <input type="hidden" name="id" value={card.id} /> : null}
      <div className="grid grid-cols-2 gap-4">
        <TextField
          name="name"
          label="Name"
          defaultValue={card?.name}
          required
        />
        <TextField
          name="issuer"
          label="Issuer"
          defaultValue={card?.issuer}
          required
        />
      </div>
      <SelectField
        name="currency_id"
        label="Currency"
        options={currencyOptions}
        defaultValue={card?.currency_id}
        placeholder="Select currency…"
      />
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          name="annual_fee"
          label="Annual fee (USD)"
          defaultValue={card?.annual_fee ?? 0}
          step="1"
        />
        <TextField
          name="affiliate_url"
          label="Affiliate URL"
          defaultValue={card?.affiliate_url}
          placeholder="https://…"
        />
      </div>
      <div className="flex gap-6">
        <CheckboxField
          name="unlocks_transfers"
          label="Unlocks transfers"
          defaultChecked={card?.unlocks_transfers ?? false}
        />
        <CheckboxField
          name="is_active"
          label="Active"
          defaultChecked={card?.is_active ?? true}
        />
      </div>
      <TextareaField name="notes" label="Notes" defaultValue={card?.notes} />
    </FormDialog>
  );
}

export function NewCardButton({
  currencyOptions,
}: {
  currencyOptions: { value: string; label: string }[];
}) {
  return (
    <CardForm
      currencyOptions={currencyOptions}
      trigger={<Button size="sm">New card</Button>}
    />
  );
}
