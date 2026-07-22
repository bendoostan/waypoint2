"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export function TextField({
  name,
  label,
  defaultValue,
  required,
  hint,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  required?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} htmlFor={name} hint={hint}>
      <Input
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
      />
    </Field>
  );
}

export function NumberField({
  name,
  label,
  defaultValue,
  step,
  required,
  hint,
}: {
  name: string;
  label: string;
  defaultValue?: number | null;
  step?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <Field label={label} htmlFor={name} hint={hint}>
      <Input
        id={name}
        name={name}
        type="number"
        step={step ?? "any"}
        defaultValue={defaultValue ?? ""}
        required={required}
      />
    </Field>
  );
}

export function TextareaField({
  name,
  label,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  hint?: string;
}) {
  return (
    <Field label={label} htmlFor={name} hint={hint}>
      <Textarea id={name} name={name} defaultValue={defaultValue ?? ""} />
    </Field>
  );
}

export function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="border-input size-4 rounded-[4px] border"
      />
      {label}
    </label>
  );
}

/**
 * A shadcn Select that writes to a hidden input so it participates in native
 * form submission (the Radix Select itself is not a form control).
 */
export function SelectField({
  name,
  label,
  options,
  defaultValue,
  placeholder,
  hint,
  allowEmpty,
  emptyLabel = "None",
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string | null;
  placeholder?: string;
  hint?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const EMPTY = "__empty__";
  const [value, setValue] = React.useState(defaultValue ?? "");
  return (
    <Field label={label} htmlFor={name} hint={hint}>
      <input type="hidden" name={name} value={value} />
      <Select
        value={value === "" ? undefined : value}
        onValueChange={(v) => setValue(v === EMPTY ? "" : v)}
      >
        <SelectTrigger id={name} className="w-full">
          <SelectValue placeholder={placeholder ?? "Select…"} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty ? (
            <SelectItem value={EMPTY}>{emptyLabel}</SelectItem>
          ) : null}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
