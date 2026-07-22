import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Counts give the admin an at-a-glance sense of the graph's size and the
// review backlog. All reads go through the authenticated (RLS-gated) client.
async function counts() {
  const supabase = await createClient();
  const tables = [
    "currencies",
    "card_catalog",
    "transfer_partners",
    "award_routes",
  ] as const;
  const entries = await Promise.all(
    tables.map(async (t) => {
      const { count } = await supabase
        .from(t)
        .select("*", { count: "exact", head: true });
      return [t, count ?? 0] as const;
    })
  );
  const { count: pending } = await supabase
    .from("staging_changes")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  return {
    map: Object.fromEntries(entries) as Record<(typeof tables)[number], number>,
    pending: pending ?? 0,
  };
}

const SECTIONS = [
  { href: "/admin/cards", title: "Cards", key: "card_catalog" as const },
  {
    href: "/admin/currencies",
    title: "Currencies",
    key: "currencies" as const,
  },
  {
    href: "/admin/transfers",
    title: "Transfer partners",
    key: "transfer_partners" as const,
  },
  {
    href: "/admin/routes",
    title: "Award routes",
    key: "award_routes" as const,
  },
];

export default async function AdminHome() {
  const { map, pending } = await counts();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SECTIONS.map((s) => (
        <Link key={s.href} href={s.href}>
          <Card className="hover:border-foreground/20 transition-colors">
            <CardHeader>
              <CardTitle>{s.title}</CardTitle>
              <CardDescription>{map[s.key]} rows</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
      <Link href="/admin/queue">
        <Card className="hover:border-foreground/20 transition-colors">
          <CardHeader>
            <CardTitle>Review queue</CardTitle>
            <CardDescription>
              {pending} pending change{pending === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
}
