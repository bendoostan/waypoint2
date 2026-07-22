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

export function CardsFilter({ issuers }: { issuers: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const issuer = params.get("issuer") ?? ALL;
  const active = params.get("active") ?? "all";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === ALL || value === "all") next.delete(key);
    else next.set(key, value);
    router.push(`/admin/cards?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={issuer} onValueChange={(v) => setParam("issuer", v)}>
        <SelectTrigger size="sm" className="w-48">
          <SelectValue placeholder="All issuers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All issuers</SelectItem>
          {issuers.map((i) => (
            <SelectItem key={i} value={i}>
              {i}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={active} onValueChange={(v) => setParam("active", v)}>
        <SelectTrigger size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Active + inactive</SelectItem>
          <SelectItem value="active">Active only</SelectItem>
          <SelectItem value="inactive">Inactive only</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
