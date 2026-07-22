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
import { ALLIANCES, CURRENCY_KINDS } from "@/lib/validation";
import type { Database } from "@/types/database";

import { upsertCurrency } from "./actions";

type Currency = Database["public"]["Tables"]["currencies"]["Row"];

const KIND_OPTIONS = CURRENCY_KINDS.map((k) => ({ value: k, label: k }));
const ALLIANCE_OPTIONS = ALLIANCES.map((a) => ({ value: a, label: a }));

export function CurrencyForm({
  currency,
  trigger,
}: {
  currency?: Currency;
  trigger: React.ReactNode;
}) {
  return (
    <FormDialog
      title={currency ? `Edit ${currency.name}` : "New currency"}
      action={upsertCurrency}
      trigger={trigger}
    >
      {currency ? <input type="hidden" name="id" value={currency.id} /> : null}
      <TextField
        name="name"
        label="Name"
        defaultValue={currency?.name}
        required
      />
      <div className="grid grid-cols-2 gap-4">
        <SelectField
          name="kind"
          label="Kind"
          options={KIND_OPTIONS}
          defaultValue={currency?.kind}
        />
        <SelectField
          name="alliance"
          label="Alliance"
          options={ALLIANCE_OPTIONS}
          defaultValue={currency?.alliance}
          allowEmpty
          emptyLabel="None"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          name="cashback_cpp"
          label="Cashback cpp"
          defaultValue={currency?.cashback_cpp}
          hint="Value when NOT unlocked"
        />
        <NumberField
          name="transfer_cpp"
          label="Transfer cpp"
          defaultValue={currency?.transfer_cpp}
          hint="Value when transferable"
        />
      </div>
      <div className="flex gap-6">
        <CheckboxField
          name="requires_unlock"
          label="Requires unlock"
          defaultChecked={currency?.requires_unlock ?? false}
        />
        <CheckboxField
          name="is_active"
          label="Active"
          defaultChecked={currency?.is_active ?? true}
        />
      </div>
      <TextareaField
        name="notes"
        label="Notes"
        defaultValue={currency?.notes}
      />
    </FormDialog>
  );
}

export function NewCurrencyButton() {
  return <CurrencyForm trigger={<Button size="sm">New currency</Button>} />;
}
