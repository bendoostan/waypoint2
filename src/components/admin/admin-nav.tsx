"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/graph", label: "Graph" },
  { href: "/admin/cards", label: "Cards" },
  { href: "/admin/currencies", label: "Currencies" },
  { href: "/admin/transfers", label: "Transfers" },
  { href: "/admin/routes", label: "Routes" },
  { href: "/admin/queue", label: "Review queue" },
  { href: "/admin/runs", label: "Ingest runs" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
