"use client";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/admin/form-dialog";
import { NumberField, SelectField, TextField } from "@/components/admin/fields";
import { BONUS_STATUSES } from "@/lib/validation";
import type { Database } from "@/types/database";

import { upsertBonus } from "./actions";

type Bonus = Database["public"]["Tables"]["transfer_bonuses"]["Row"];

const STATUS_OPTIONS = BONUS_STATUSES.map((s) => ({ value: s, label: s }));

export function BonusForm({
  partnerId,
  bonus,
  trigger,
}: {
  partnerId: string;
  bonus?: Bonus;
  trigger: React.ReactNode;
}) {
  return (
    <FormDialog
      title={bonus ? "Edit bonus" : "New transfer bonus"}
      description="New bonuses default to draft — approve them to make the engine count them."
      action={upsertBonus}
      trigger={trigger}
    >
      <input type="hidden" name="transfer_partner_id" value={partnerId} />
      {bonus ? <input type="hidden" name="id" value={bonus.id} /> : null}
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          name="bonus_pct"
          label="Bonus %"
          defaultValue={bonus?.bonus_pct}
          step="1"
          required
        />
        <SelectField
          name="status"
          label="Status"
          options={STATUS_OPTIONS}
          defaultValue={bonus?.status ?? "draft"}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          name="starts_at"
          label="Starts at (ISO)"
          defaultValue={bonus?.starts_at ?? ""}
          placeholder="2026-08-01"
          required
        />
        <TextField
          name="ends_at"
          label="Ends at (ISO)"
          defaultValue={bonus?.ends_at ?? ""}
          placeholder="2026-09-30"
          required
        />
      </div>
      <TextField
        name="source_url"
        label="Source"
        defaultValue={bonus?.source_url}
      />
    </FormDialog>
  );
}

export function NewBonusButton({ partnerId }: { partnerId: string }) {
  return (
    <BonusForm
      partnerId={partnerId}
      trigger={
        <Button variant="outline" size="sm">
          Add bonus
        </Button>
      }
    />
  );
}
