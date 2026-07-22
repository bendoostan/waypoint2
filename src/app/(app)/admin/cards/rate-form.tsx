"use client";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/admin/form-dialog";
import { NumberField, SelectField, TextField } from "@/components/admin/fields";
import { EARNING_CATEGORIES } from "@/lib/validation";
import type { Database } from "@/types/database";

import { upsertEarningRate } from "./actions";

type EarningRate = Database["public"]["Tables"]["earning_rates"]["Row"];

const CATEGORY_OPTIONS = EARNING_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}));

export function RateForm({
  cardId,
  rate,
  trigger,
}: {
  cardId: string;
  rate?: EarningRate;
  trigger: React.ReactNode;
}) {
  return (
    <FormDialog
      title={rate ? "Edit earning rate" : "New earning rate"}
      action={upsertEarningRate}
      trigger={trigger}
    >
      <input type="hidden" name="card_id" value={cardId} />
      {rate ? <input type="hidden" name="id" value={rate.id} /> : null}
      <SelectField
        name="category"
        label="Category"
        options={CATEGORY_OPTIONS}
        defaultValue={rate?.category}
        placeholder="Select category…"
      />
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          name="rate"
          label="Rate (e.g. 3 = 3x)"
          defaultValue={rate?.rate}
          required
        />
        <NumberField
          name="cap_monthly_usd"
          label="Monthly cap (USD)"
          defaultValue={rate?.cap_monthly_usd}
          step="1"
          hint="Blank = uncapped"
        />
      </div>
      <TextField name="notes" label="Notes" defaultValue={rate?.notes} />
    </FormDialog>
  );
}

export function NewRateButton({ cardId }: { cardId: string }) {
  return (
    <RateForm
      cardId={cardId}
      trigger={
        <Button variant="outline" size="sm">
          Add rate
        </Button>
      }
    />
  );
}
