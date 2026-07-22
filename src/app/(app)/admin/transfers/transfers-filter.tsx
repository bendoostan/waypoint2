"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

export function TransfersFilter({
  currencies,
}: {
  currencies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const currency = params.get("currency") ?? ALL;

  return (
    <Select
      value={currency}
      onValueChange={(v) => {
        const next = new URLSearchParams(params.toString());
        if (v === ALL) next.delete("currency");
        else next.set("currency", v);
        router.push(`/admin/transfers?${next.toString()}`);
      }}
    >
      <SelectTrigger size="sm" className="w-64">
        <SelectValue placeholder="All currencies" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All currencies</SelectItem>
        {currencies.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
