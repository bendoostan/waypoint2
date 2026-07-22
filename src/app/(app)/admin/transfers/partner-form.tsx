"use client";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/admin/form-dialog";
import {
  CheckboxField,
  NumberField,
  SelectField,
  TextareaField,
} from "@/components/admin/fields";
import type { Database } from "@/types/database";

import { upsertPartner } from "./actions";

type Partner = Database["public"]["Tables"]["transfer_partners"]["Row"];

export function PartnerForm({
  partner,
  currencyOptions,
  trigger,
}: {
  partner?: Partner;
  currencyOptions: { value: string; label: string }[];
  trigger: React.ReactNode;
}) {
  return (
    <FormDialog
      title={partner ? "Edit transfer edge" : "New transfer edge"}
      action={upsertPartner}
      trigger={trigger}
    >
      {partner ? <input type="hidden" name="id" value={partner.id} /> : null}
      <div className="grid grid-cols-2 gap-4">
        <SelectField
          name="from_currency_id"
          label="From"
          options={currencyOptions}
          defaultValue={partner?.from_currency_id}
          placeholder="From…"
        />
        <SelectField
          name="to_currency_id"
          label="To"
          options={currencyOptions}
          defaultValue={partner?.to_currency_id}
          placeholder="To…"
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <NumberField
          name="ratio_num"
          label="Ratio from"
          defaultValue={partner?.ratio_num ?? 1}
          step="1"
          hint="e.g. 1 in 1:1"
        />
        <NumberField
          name="ratio_den"
          label="Ratio to"
          defaultValue={partner?.ratio_den ?? 1}
          step="1"
        />
        <NumberField
          name="transfer_hours_est"
          label="Hours est."
          defaultValue={partner?.transfer_hours_est ?? 0}
          step="1"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          name="min_transfer"
          label="Min transfer"
          defaultValue={partner?.min_transfer}
          step="1"
          hint="Blank = none"
        />
        <NumberField
          name="increment"
          label="Increment"
          defaultValue={partner?.increment}
          step="1"
          hint="Blank = none"
        />
      </div>
      <CheckboxField
        name="is_active"
        label="Active"
        defaultChecked={partner?.is_active ?? true}
      />
      <TextareaField name="notes" label="Notes" defaultValue={partner?.notes} />
    </FormDialog>
  );
}

export function NewPartnerButton({
  currencyOptions,
}: {
  currencyOptions: { value: string; label: string }[];
}) {
  return (
    <PartnerForm
      currencyOptions={currencyOptions}
      trigger={<Button size="sm">New edge</Button>}
    />
  );
}
