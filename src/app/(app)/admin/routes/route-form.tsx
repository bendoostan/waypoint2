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
import { CABINS } from "@/lib/validation";
import type { Database } from "@/types/database";

import { upsertRoute } from "./actions";

type Route = Database["public"]["Tables"]["award_routes"]["Row"];

const CABIN_OPTIONS = CABINS.map((c) => ({ value: c, label: c }));

export function RouteForm({
  route,
  currencyOptions,
  trigger,
}: {
  route?: Route;
  currencyOptions: { value: string; label: string }[];
  trigger: React.ReactNode;
}) {
  return (
    <FormDialog
      title={route ? `Edit ${route.name}` : "New award route"}
      action={upsertRoute}
      trigger={trigger}
    >
      {route ? <input type="hidden" name="id" value={route.id} /> : null}
      <TextField name="name" label="Name" defaultValue={route?.name} required />
      <div className="grid grid-cols-2 gap-4">
        <SelectField
          name="program_currency_id"
          label="Program currency"
          options={currencyOptions}
          defaultValue={route?.program_currency_id}
          placeholder="Program…"
        />
        <SelectField
          name="cabin"
          label="Cabin"
          options={CABIN_OPTIONS}
          defaultValue={route?.cabin}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          name="origin_region"
          label="Origin region"
          defaultValue={route?.origin_region}
          required
        />
        <TextField
          name="origin_airports"
          label="Origin airports"
          defaultValue={route?.origin_airports?.join(", ") ?? ""}
          hint="Comma-separated IATA; blank = region-level"
          placeholder="JFK, EWR"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          name="destination_region"
          label="Destination region"
          defaultValue={route?.destination_region}
          required
        />
        <TextField
          name="destination_airports"
          label="Destination airports"
          defaultValue={route?.destination_airports?.join(", ") ?? ""}
          hint="Comma-separated IATA; blank = region-level"
          placeholder="NRT, HND"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          name="points_oneway"
          label="Points (one-way)"
          defaultValue={route?.points_oneway}
          step="1"
          required
        />
        <NumberField
          name="taxes_fees_usd_est"
          label="Taxes/fees (USD)"
          defaultValue={route?.taxes_fees_usd_est ?? 0}
          step="1"
        />
      </div>
      <TextField
        name="booking_url"
        label="Booking URL"
        defaultValue={route?.booking_url}
        placeholder="https://…"
      />
      <TextareaField name="notes" label="Notes" defaultValue={route?.notes} />
      <CheckboxField
        name="is_active"
        label="Active"
        defaultChecked={route?.is_active ?? true}
      />
    </FormDialog>
  );
}

export function NewRouteButton({
  currencyOptions,
}: {
  currencyOptions: { value: string; label: string }[];
}) {
  return (
    <RouteForm
      currencyOptions={currencyOptions}
      trigger={<Button size="sm">New route</Button>}
    />
  );
}
